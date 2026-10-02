#!/usr/bin/env python3
"""Tests for bin/devkit-clip, bin/devkit-regex, bin/devkit-hash and bin/devkit-helper.

devkit-clip is exercised against fake `wl-paste` programs placed first on
PATH: one that streams forever, one that never answers, one that fails, and
one that behaves. devkit-regex runs the real `qml` worker; its deadline path
is tested by loading the module with a tiny DEADLINE_S.
"""

import importlib.machinery
import importlib.util
import io
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
BIN = os.path.join(ROOT, "bin")


def fake_wl_paste(directory, script):
    path = os.path.join(directory, "wl-paste")
    with open(path, "w") as handle:
        handle.write("#!/bin/sh\n" + script + "\n")
    os.chmod(path, os.stat(path).st_mode | stat.S_IXUSR)


def clip(script):
    with tempfile.TemporaryDirectory() as fake:
        fake_wl_paste(fake, script)
        env = dict(os.environ, PATH=fake + ":" + os.environ["PATH"])
        start = time.monotonic()
        out = subprocess.run([os.path.join(BIN, "devkit-clip")], env=env, capture_output=True, timeout=10).stdout
        return out, time.monotonic() - start


def no_stray(pattern):
    time.sleep(0.2)
    ps = subprocess.run(["ps", "-eo", "args"], capture_output=True, text=True).stdout
    # Ignore shells whose command text merely mentions the pattern (an editor
    # or agent running `bash -c "…devkit-regex-worker…"`); only real leftovers count.
    strays = [line for line in ps.splitlines()
              if pattern in line and "helpers.test" not in line
              and not re.match(r"^\S*/?(ba|z|da)?sh -c ", line)]
    assert not strays, strays


# ---- devkit-clip
out, _ = clip("printf 'héllo\\nworld'")
assert out == "ok\nhéllo\nworld".encode(), out

out, _ = clip("exit 1")
assert out == b"empty\n", out

out, elapsed = clip("exec yes devkit-endless-stream")
assert out == b"too-large\n", out[:40]
assert elapsed < 2.5, elapsed
no_stray("yes devkit-endless-stream")

out, elapsed = clip("exec sleep 30")
assert out == b"timeout\n", out
assert 1.8 < elapsed < 3.0, elapsed
no_stray("sleep 30")

out, elapsed = clip("printf start; exec sleep 30")  # partial data, then stall
assert out == b"timeout\n", out
no_stray("sleep 30")

# An image and no text: say so, so the window can offer its image tools.
out, _ = clip('if [ "$1" = --list-types ]; then printf "image/png\\nimage/jpeg\\n"; else exit 1; fi')
assert out == b"image\nimage/png", out
# Text alongside an image: the text wins.
out, _ = clip('if [ "$1" = --list-types ]; then printf "image/png\\ntext/plain\\n"; else printf hi; fi')
assert out == b"ok\nhi", out

exact = 1 << 20
out, _ = clip("head -c %d /dev/zero | tr '\\0' a" % exact)
assert out == b"ok\n" + b"a" * exact, len(out)
out, _ = clip("head -c %d /dev/zero | tr '\\0' a" % (exact + 1))
assert out == b"too-large\n", out[:20]


# ---- devkit-regex (real qml worker)
def regex(request, module=None):
    if module is None:
        out = subprocess.run([os.path.join(BIN, "devkit-regex")], input=json.dumps(request).encode(),
                             capture_output=True, timeout=10).stdout
        return json.loads(out)
    stdin, stdout = sys.stdin, sys.stdout
    sys.stdin = io.TextIOWrapper(io.BytesIO(json.dumps(request).encode()))
    sys.stdout = io.StringIO()
    try:
        module.main()
        return json.loads(sys.stdout.getvalue())
    finally:
        sys.stdin, sys.stdout = stdin, stdout


r = regex({"pattern": "(?<k>\\w+) id=(?<id>\\d+)", "flags": "g", "input": "order id=1042\nrefund id=77"})
assert r["info"] == "2 matches", r
assert '$2 <id> = "77"' in r["output"], r

r = regex({"pattern": "é+", "flags": "g", "input": "caféé 日本", "replacement": "[$&]", "useReplace": True})
assert r["output"] == "caf[éé] 日本", r

r = regex({"pattern": "a", "flags": "g", "input": "a" * 199999})  # larger than a pipe buffer
assert r["info"] == "10000 matches", r["info"]

r = regex({"pattern": "(", "flags": "g", "input": "x"})
assert r["error"], r

r = regex({"pattern": "(.*a){20}", "flags": "", "input": "a" * 5000})
assert "possible false negative" in r["info"], r

out = subprocess.run([os.path.join(BIN, "devkit-regex")], input=b"not json", capture_output=True, timeout=10).stdout
assert json.loads(out)["error"] == "Invalid regex request", out

# Deadline: with a 1 ms budget the worker cannot answer, so it must be killed.
loader = importlib.machinery.SourceFileLoader("devkit_regex", os.path.join(BIN, "devkit-regex"))
spec = importlib.util.spec_from_loader("devkit_regex", loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
module.DEADLINE_S = 0.001
start = time.monotonic()
r = regex({"pattern": "a", "flags": "g", "input": "aaa"}, module)
assert r.get("timeout") is True and "Stopped after" in r["error"], r
assert time.monotonic() - start < 1.5
no_stray("devkit-regex-worker")
runtime = os.environ.get("XDG_RUNTIME_DIR", tempfile.gettempdir())
assert not [d for d in os.listdir(runtime) if d.startswith("devkit-regex-")], "temp dir left behind"


# ---- devkit-hash random
r = json.loads(subprocess.run([os.path.join(BIN, "devkit-hash"), "random", "8000"], capture_output=True).stdout)
assert len(r["random"]) == 16000 and all(c in "0123456789abcdef" for c in r["random"])


# ---- devkit-regex: chains with regex steps run in the worker
r = regex({"chain": [{"tool": "regex", "mode": "matches", "opts": {"pattern": "\\d+", "flags": "g"}},
                     {"tool": "lines", "mode": "unique", "opts": {}}], "input": "a1 b22 c1", "nowMs": 0})
assert r["output"] == "1\n22", r
assert [s["tool"] for s in r["steps"]] == ["regex", "lines"], r


# ---- devkit-helper
import base64
import hashlib
import hmac as hmac_mod
import shutil as sh


def helper(command, request, raw=None):
    data = raw if raw is not None else json.dumps(request).encode()
    out = subprocess.run([os.path.join(BIN, "devkit-helper"), command], input=data, capture_output=True, timeout=30).stdout
    return json.loads(out)


text = "The quick brown fox jumps over the lazy dog ✓"
r = helper("hash", {"text": text})
for name in ("md5", "sha1", "sha224", "sha256", "sha384", "sha512", "sha3_256", "sha3_512", "blake2b", "blake2s"):
    assert r["digests"][name] == hashlib.new(name, text.encode()).hexdigest(), name
assert r["digests"]["crc32"] == "%08x" % (__import__("zlib").crc32(text.encode()) & 0xFFFFFFFF)
assert r["bytes"] == len(text.encode()) and r["hmac"] is False
r = helper("hash", {"text": text, "key": "k3y"})
assert r["hmac"] is True and "crc32" not in r["digests"]
assert r["digests"]["sha256"] == hmac_mod.new(b"k3y", text.encode(), "sha256").hexdigest()
with tempfile.NamedTemporaryFile(delete=False) as handle:
    handle.write(os.urandom(3 * 1024 * 1024 + 7))
    big = handle.name
r = helper("hash", {"path": big})
assert r["digests"]["sha256"] == hashlib.sha256(open(big, "rb").read()).hexdigest() and r["path"] == os.path.realpath(big)
os.unlink(big)
assert "No such file" in helper("hash", {"path": "/nonexistent/x"})["error"]

# JWT: HMAC verify and sign
signing_input = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiJ9"
sig = base64.urlsafe_b64encode(hmac_mod.new(b"s3cret", signing_input.encode(), "sha256").digest()).decode().rstrip("=")
assert helper("jwt-verify", {"signingInput": signing_input, "signature": sig, "alg": "HS256", "key": "s3cret"}) == {"valid": True}
assert helper("jwt-verify", {"signingInput": signing_input, "signature": sig, "alg": "HS256", "key": "nope"}) == {"valid": False}
b64key = base64.b64encode(b"s3cret").decode()
assert helper("jwt-verify", {"signingInput": signing_input, "signature": sig, "alg": "HS256", "key": b64key, "keyBase64": True}) == {"valid": True}
assert helper("jwt-sign", {"signingInput": signing_input, "alg": "HS256", "key": "s3cret"}) == {"signature": sig}
assert "PEM" in helper("jwt-verify", {"signingInput": signing_input, "signature": sig, "alg": "RS256", "key": "not a key"})["error"]
if sh.which("openssl"):
    with tempfile.TemporaryDirectory() as work:
        key = os.path.join(work, "k.pem")
        subprocess.run(["openssl", "genpkey", "-algorithm", "ed25519", "-out", key], check=True, capture_output=True)
        pub = subprocess.run(["openssl", "pkey", "-in", key, "-pubout"], check=True, capture_output=True).stdout.decode()
        data = os.path.join(work, "d")
        open(data, "wb").write(signing_input.encode())
        raw = subprocess.run(["openssl", "pkeyutl", "-sign", "-inkey", key, "-rawin", "-in", data], check=True, capture_output=True).stdout
        esig = base64.urlsafe_b64encode(raw).decode().rstrip("=")
        assert helper("jwt-verify", {"signingInput": signing_input, "signature": esig, "alg": "EdDSA", "key": pub}) == {"valid": True}
        # A PEM pasted into a one-line field loses its line breaks; it still reads.
        assert helper("jwt-verify", {"signingInput": signing_input, "signature": esig, "alg": "EdDSA", "key": pub.replace("\n", " ")}) == {"valid": True}
        assert helper("jwt-verify", {"signingInput": signing_input + "x", "signature": esig, "alg": "EdDSA", "key": pub}) == {"valid": False}

# Images: decode a PNG, refuse files DevKit did not write
png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR42mP4z8DAAMIM/4EAAB/uBfvxq7p3AAAAAElFTkSuQmCC")
r = helper("image-decode", {"base64": base64.b64encode(png).decode()})
assert (r["mime"], r["width"], r["height"], r["bytes"]) == ("image/png", 2, 2, len(png)), r
assert open(r["path"], "rb").read() == png
assert stat.S_IMODE(os.stat(r["path"]).st_mode) == 0o600
assert stat.S_IMODE(os.stat(os.path.dirname(r["path"])).st_mode) == 0o700
decoded = r["path"]
assert "not an image" in helper("image-decode", {"base64": base64.b64encode(b"hello world, plain text").decode()})["error"]
assert helper("image-copy", {"path": "/etc/passwd"})["error"] == "Not an image DevKit made"
assert helper("image-save", {"path": "/etc/passwd"})["error"] == "Not an image DevKit made"
r = helper("image-encode", {"path": decoded})
assert base64.b64decode(r["base64"]) == png and r["width"] == 2
assert "not an image" in helper("image-encode", {"path": os.path.join(ROOT, "LICENSE")})["error"]

# QR round trip, when qrencode and zbarimg are installed
if sh.which("qrencode") and sh.which("zbarimg"):
    message = "https://example.com/?q=✓ 日本\nsecond line"
    r = helper("qr", {"text": message, "level": "Q"})
    assert r["version"] >= 1 and r["modules"] == 17 + 4 * r["version"], r
    back = helper("qr-read", {"path": r["path"]})
    assert back["codes"] == [{"type": "QR-Code", "data": message}], back
    assert "No QR code" in helper("qr-read", {"path": decoded})["error"]

# Bad requests come back as errors, never tracebacks
assert helper("hash", None, raw=b"not json")["error"] == "Invalid request"
assert helper("hash", None, raw=b"[1]")["error"] == "Invalid request"
out = subprocess.run([os.path.join(BIN, "devkit-helper"), "bogus"], input=b"{}", capture_output=True).stdout
assert json.loads(out)["error"].startswith("usage:")

print("helpers.test.py: ok")

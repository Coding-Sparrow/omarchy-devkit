#!/usr/bin/env python3
"""Tests for bin/devkit-clip, bin/devkit-regex and bin/devkit-hash.

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

print("helpers.test.py: ok")

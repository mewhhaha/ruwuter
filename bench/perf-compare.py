"""Head-to-head benchmark comparing base vs head on server hot paths, streaming controller
activation, and post-load DOM mutation overhead."""
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from contextlib import ExitStack
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def run(*cmd, cwd=ROOT):
    return subprocess.check_output(cmd, cwd=cwd)


def prepare(ref, checkout):
    sha = run("git", "rev-parse", "--verify", ref + "^{commit}").decode().strip()
    archive = run("git", "archive", sha)
    with tarfile.open(fileobj=BytesIO(archive)) as tree:
        tree.extractall(checkout, filter="data")
    run("deno", "ci", cwd=checkout)
    fixture_dir = checkout / "bench"
    fixture_dir.mkdir(exist_ok=True)
    shutil.copyfile(ROOT / "bench/perf-fixture.tsx", fixture_dir / "perf-fixture.tsx")
    client_js = run(
        "deno", "bundle", "--quiet", "--platform=browser", "--minify", "src/runtime/client.ts",
        cwd=checkout,
    )
    (fixture_dir / "client.js").write_bytes(client_js)
    runtime = {}
    for name in ("client", "resolve", "swap"):
        js = run(
            "deno", "bundle", "--quiet", "--platform=browser", "--minify",
            f"src/runtime/{name}.ts", cwd=checkout,
        )
        gzip_count = subprocess.check_output(
            [
                "deno", "eval",
                "const gzip = Deno.stdin.readable.pipeThrough(new CompressionStream('gzip'));"
                " console.log((await new Response(gzip).arrayBuffer()).byteLength);",
            ],
            input=js, cwd=checkout,
        )
        runtime[name] = dict(minified=len(js), gzip=int(gzip_count))
    return dict(commit=sha, runtime=runtime)


def stop(server):
    server.terminate()
    server.wait(timeout=10)


def compare(base, head, engines=None):
    with tempfile.TemporaryDirectory() as tmp, ExitStack() as processes:
        revisions, urls = {}, {}
        for version, ref in (("base", base), ("head", head)):
            checkout = Path(tmp) / version
            revisions[version] = prepare(ref, checkout)
            cmd = ["deno", "run", "--frozen", "-A", "bench/perf-fixture.tsx"]
            if version == "head":
                cmd.append("--async-client")
            server = subprocess.Popen(cmd, cwd=checkout, stdout=subprocess.PIPE, text=True)
            processes.callback(stop, server)
            port = int(server.stdout.readline())
            urls[version] = f"http://127.0.0.1:{port}"

        server_hello = []
        server_static = []
        for pair in range(-4, 16):
            order = list(urls)
            if pair % 2:
                order.reverse()
            for version in order:
                with urlopen(urls[version] + "/batch/hello", timeout=30) as r:
                    ms_hello = json.load(r)
                with urlopen(urls[version] + "/batch/static", timeout=30) as r:
                    ms_static = json.load(r)
                if pair >= 0:
                    server_hello.append(dict(pair=pair, version=version, ms=ms_hello))
                    server_static.append(dict(pair=pair, version=version, ms=ms_static))

        browser_cmd = ["deno", "run", "--frozen", "-A", "bench/perf-browser.ts"]
        if engines:
            browser_cmd.append(f"--engines={engines}")
        browser_cmd.extend(urls.values())
        browser = json.loads(run(*browser_cmd))

        cpu = platform.processor()
        cpuinfo = Path("/proc/cpuinfo")
        if cpuinfo.exists():
            match = re.search(r"^model name\s+: (.+)$", cpuinfo.read_text(), re.M)
            if match:
                cpu = match[1]

        return dict(
            deno=run("deno", "--version").decode().splitlines(),
            python=platform.python_version(),
            os=platform.platform(),
            cpu=cpu,
            revisions=revisions,
            requestsPerBatch=1000,
            serverHello=server_hello,
            serverStatic=server_static,
            controllerStartup=browser["controllerStartup"],
            domMutations=browser["domMutations"],
        )


if __name__ == "__main__":
    args = sys.argv[1:]
    engines = None
    if args and args[0].startswith("--engines="):
        engines = args.pop(0).split("=", 1)[1]
    if len(args) != 3:
        sys.exit("Usage: python3 bench/perf-compare.py [--engines=chromium,firefox] BASE HEAD OUT.json")
    result = compare(args[0], args[1], engines=engines)
    Path(args[2]).write_text(json.dumps(result, indent=2) + "\n")

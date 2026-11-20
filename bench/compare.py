"""Measure two immutable revisions from the repository root. See docs/benchmarks/README.md."""
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
from urllib.parse import unquote, urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def run(*cmd, cwd=ROOT):
    return subprocess.check_output(cmd, cwd=cwd)


def prepare(ref, checkout):
    sha = run("git", "rev-parse", "--verify", ref + "^{commit}").decode().strip()
    archive = run("git", "archive", sha)
    with tarfile.open(fileobj=BytesIO(archive)) as tree:
        tree.extractall(checkout, filter="data")
    # Deno resolves each implementation with that implementation's own lockfile.
    run("deno", "ci", cwd=checkout)
    deno_env = {**os.environ, "NO_COLOR": "1"}
    dry_run = subprocess.run(["deno", "publish", "--dry-run", "--log-level=debug"], cwd=checkout,
                             env=deno_env, capture_output=True, text=True, check=True)
    log = dry_run.stdout + dry_run.stderr
    tar_bytes = re.search(r"Tarball size \(@mewhhaha/ruwuter\): (\d+)", log)
    files = re.findall(r"^\s+(file://\S+) \([^)]+\)$", log, re.M)
    if not tar_bytes or not files:
        raise ValueError("Could not read Deno's publish dry-run manifest")
    source_sizes = [Path(unquote(urlparse(url).path)).stat().st_size for url in files]

    bundle = checkout.parent / (checkout.name + ".tgz")
    packed = subprocess.run(["deno", "pack", "-o", bundle], cwd=checkout, env=deno_env,
                            capture_output=True, text=True, check=True)
    with tarfile.open(bundle) as package:
        unpacked = sum(f.size for f in package if f.isfile())
    sizes = dict(jsrUpload=int(tar_bytes[1]), publishSource=sum(source_sizes), files=len(files),
                 npmPack=bundle.stat().st_size, npmUnpacked=unpacked,
                 packTypeWarnings=(packed.stdout + packed.stderr).count("Could not generate types"))
    subprocess.run(["deno", "pack", "--no-source-maps", "-o", bundle], cwd=checkout,
                   env=deno_env, capture_output=True, check=True)
    sizes["npmPackNoMaps"] = bundle.stat().st_size
    fixture = checkout / "bench"
    fixture.mkdir(exist_ok=True)
    shutil.copyfile(ROOT / "bench/fixture.tsx", fixture / "fixture.tsx")
    runtime = {}
    for name in ("client", "resolve", "swap", "navigate"):
        source = f"src/runtime/{name}.ts"
        if (checkout / source).is_file():
            js = run("deno", "bundle", "--quiet", "--platform=browser", "--minify", source, cwd=checkout)
            gzip_count = subprocess.check_output([
                "deno", "eval", "const gzip = Deno.stdin.readable.pipeThrough(new CompressionStream('gzip'));"
                " console.log((await new Response(gzip).arrayBuffer()).byteLength);",
            ], input=js, cwd=checkout)
            runtime[name] = dict(minified=len(js), gzip=int(gzip_count))
            if name == "resolve":
                (fixture / "resolve.js").write_bytes(js)
    return dict(commit=sha, package=sizes, runtime=runtime)


def stop(server):
    server.terminate()
    server.wait(timeout=10)


def compare(base, head):
    with tempfile.TemporaryDirectory() as tmp, ExitStack() as processes:
        revisions, urls = {}, {}
        for version, ref in (("base", base), ("head", head)):
            checkout = Path(tmp) / version
            revisions[version] = prepare(ref, checkout)
            server = subprocess.Popen(["deno", "run", "--frozen", "-A", "bench/fixture.tsx"],
                                      cwd=checkout, stdout=subprocess.PIPE, text=True)
            processes.callback(stop, server)
            port = int(server.stdout.readline())
            urls[version] = f"http://127.0.0.1:{port}"

        batches = []
        for pair in range(-4, 16):
            order = list(urls)
            if pair % 2:
                order.reverse()
            for version in order:
                with urlopen(urls[version] + "/batch", timeout=30) as response:
                    ms = json.load(response)
                if pair >= 0:
                    batches.append(dict(pair=pair, version=version, ms=ms))
        browser = json.loads(run("deno", "run", "--frozen", "-A", "bench/browser.ts", *urls.values()))
        cpu = platform.processor()
        cpuinfo = Path("/proc/cpuinfo")
        if cpuinfo.exists():
            match = re.search(r"^model name\s+: (.+)$", cpuinfo.read_text(), re.M)
            if match:
                cpu = match[1]
        return dict(deno=run("deno", "--version").decode().splitlines(), python=platform.python_version(),
                    os=platform.platform(), cpu=cpu, revisions=revisions, requestsPerBatch=1000,
                    server=batches, browser=browser)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("Usage: python3 bench/compare.py BASE HEAD OUTPUT.json")
    result = compare(*sys.argv[1:3])
    Path(sys.argv[3]).write_text(json.dumps(result, indent=2) + "\n")

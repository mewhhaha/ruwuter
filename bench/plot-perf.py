"""Render SVG performance comparison charts from perf-compare.py results. Requires Matplotlib."""
import json
import subprocess
import sys
from io import StringIO
from pathlib import Path
from statistics import median

import matplotlib
matplotlib.use("svg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

source = Path(sys.argv[1])
data = json.loads(source.read_text())
colors = {"base": "#52657d", "head": "#007c69"}
ink = "#172c3c"
muted = "#475d6c"
plt.rcParams.update({
    "font.size": 10,
    "font.family": "DejaVu Sans",
    "text.color": ink,
    "axes.labelcolor": ink,
    "xtick.color": ink,
    "ytick.color": ink,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.spines.left": False,
    "axes.edgecolor": "#cbd4db",
    "savefig.facecolor": "white",
    "svg.fonttype": "none",
    "svg.hashsalt": "ruwuter-perf",
})

ENGINE_LABELS = {"chromium": "Chromium", "firefox": "Firefox", "webkit": "WebKit"}


def heading(fig, title, subtitle, base_label="Before (main)", head_label="After (PR)"):
    fig.set_label(title)
    fig.text(.04, .96, title, fontsize=17, fontweight="bold", va="top")
    fig.text(.04, .89, subtitle, fontsize=10, va="top", color=muted)
    handles = [
        Line2D([], [], marker="o", linestyle="", markersize=8, color=color)
        for color in colors.values()
    ]
    base_sha = data["revisions"]["base"]["commit"][:7]
    head_sha = data["revisions"]["head"]["commit"][:7]
    fig.legend(
        handles,
        [f"{base_label}  ·  {base_sha}", f"{head_label}  ·  {head_sha}"],
        loc="upper left",
        bbox_to_anchor=(.035, .845),
        ncol=2,
        frameon=False,
        handlelength=1,
        columnspacing=1.8,
    )


def style_x(ax):
    ax.set_axisbelow(True)
    ax.grid(axis="x", color="#e0e6ea", linewidth=.7)
    ax.tick_params(length=0, pad=7)


def save(fig, name):
    svg = StringIO()
    fig.savefig(svg, format="svg", metadata={"Title": fig.get_label(), "Date": None})
    path = source.parent / name
    path.write_text("\n".join(line.rstrip() for line in svg.getvalue().splitlines()) + "\n")
    subprocess.run(
        ["deno", "fmt", "--config", Path(__file__).resolve().parents[1] / "deno.json", path],
        check=True,
    )
    plt.close(fig)


# 1. Server hot-path comparison (sync HTML + 100-route static lookup)
fig, axes = plt.subplots(1, 2, figsize=(9.4, 4.6))
fig.subplots_adjust(left=.09, right=.96, top=.69, bottom=.18, wspace=.28)
heading(
    fig,
    "Server request latency: sync HTML & static route lookup",
    "16 alternating batches of 1,000 serial GET requests each (lower is faster).",
)

workloads = [
    (axes[0], "GET /hello/:name (sync HTML)", data["serverHello"]),
    (axes[1], "GET /page-99 (100-route table)", data["serverStatic"]),
]
for ax, title, rows in workloads:
    ax.set_title(title, loc="left", size=11, fontweight="bold", pad=10)
    meds = {}
    for version, color in colors.items():
        batches = sorted((r for r in rows if r["version"] == version), key=lambda r: r["pair"])
        ys = [r["ms"] * 1000 / data["requestsPerBatch"] for r in batches]
        meds[version] = median(ys)
        ax.plot(
            [r["pair"] + 1 for r in batches],
            ys,
            marker="o",
            markersize=4,
            linewidth=1.5,
            color=color,
        )
    speedup = meds["base"] / meds["head"]
    ax.text(
        .98,
        .94,
        f"Median: {meds['base']:.1f} → {meds['head']:.1f} µs ({speedup:.2f}× faster)",
        transform=ax.transAxes,
        ha="right",
        va="top",
        fontsize=9,
        fontweight="bold",
        color=colors["head"],
        bbox=dict(boxstyle="round,pad=0.3", facecolor="#eef7f5", edgecolor="none"),
    )
    ax.set_xlim(.5, 16.5)
    ax.set_ylim(bottom=0, top=max(r["ms"] * 1000 / data["requestsPerBatch"] for r in rows) * 1.22)
    ax.set_xticks([1, 4, 8, 12, 16])
    ax.set_xlabel("Measured pair")
    ax.grid(axis="y", color="#e0e6ea", linewidth=.7)
    ax.tick_params(length=0, pad=6)
axes[0].set_ylabel("µs per request")
fig.text(
    .04,
    .03,
    "Includes Request dispatch, route matching, HTML rendering, and reading the full response body.",
    color=muted,
    fontsize=9,
)
save(fig, "perf-server.svg")


# 2. Streaming controller activation latency
engines = sorted(
    {r["engine"] for r in data["controllerStartup"]},
    key=lambda e: ["chromium", "firefox", "webkit"].index(e),
)
fig, ax = plt.subplots(figsize=(9.0, 2.5 + 0.95 * len(engines)))
fig.subplots_adjust(left=.17, right=.93, top=.66, bottom=.21)
heading(
    fig,
    "When an above-the-fold controller activates on a streamed page",
    "Page streams a 600 ms Deferred panel below the widget. Median of 10 fresh navigations.",
    base_label="Deferred module script",
    head_label="Async module script",
)
for y, engine in enumerate(engines):
    samples = {
        v: [r["mounted"] for r in data["controllerStartup"] if r["engine"] == engine and r["version"] == v]
        for v in colors
    }
    ax.plot([median(s) for s in samples.values()], [y, y], color="#c3cfd5", lw=2, zorder=1)
    for version, times in samples.items():
        val = median(times)
        ax.plot([min(times), max(times)], [y, y], color=colors[version], lw=4, alpha=.5, solid_capstyle="round")
        ax.scatter(val, y, color=colors[version], s=68, zorder=3)
        ax.annotate(
            f"{val:.0f} ms",
            (val, y),
            xytext=(0, 10),
            textcoords="offset points",
            ha="center",
            fontsize=10,
            color=colors[version],
            fontweight="bold",
        )
ax.set_yticks(range(len(engines)), [ENGINE_LABELS.get(e, e) for e in engines])
ax.set_ylim(len(engines) - .55, -.58)
upper = max(r["mounted"] for r in data["controllerStartup"])
ax.set_xlim(0, ((int(upper) // 100) + 1) * 100)
ax.set_xlabel("Time from navigation start to controller mount (ms)")
style_x(ax)
fig.text(
    .04,
    .035,
    "Short horizontal bars show min–max observed latency across all 10 runs (empty HTTP cache).",
    color=muted,
    fontsize=9,
)
save(fig, "perf-controller-startup.svg")


# 3. Post-load DOM mutation overhead + wasted querySelectorAll scans
fig, axes = plt.subplots(1, 2, figsize=(9.4, 2.8 + 0.95 * len(engines)))
fig.subplots_adjust(left=.14, right=.94, top=.66, bottom=.20, wspace=.38)
heading(
    fig,
    "Post-load DOM mutation cost after Deferred + client.js",
    "400 text updates + leaf element insert/remove cycles on a 400-row page (median of 10 runs).",
)

# Left panel: elapsed time (ms)
ax = axes[0]
ax.set_title("Main-thread time (ms)", loc="left", size=11, fontweight="bold", pad=8)
max_ms = max(r["ms"] for r in data["domMutations"])
for y, engine in enumerate(engines):
    for (version, color), dy in zip(colors.items(), [-.18, .18]):
        vals = [r["ms"] for r in data["domMutations"] if r["engine"] == engine and r["version"] == version]
        med = median(vals)
        ax.barh(y + dy, med, height=.30, color=color)
        ax.annotate(
            f"{med:.1f} ms",
            (med, y + dy),
            xytext=(5, 0),
            textcoords="offset points",
            va="center",
            color=color,
            fontsize=9,
            fontweight="bold",
        )
ax.set_yticks(range(len(engines)), [ENGINE_LABELS.get(e, e) for e in engines])
ax.set_ylim(len(engines) - .48, -.48)
ax.set_xlim(0, max_ms * 1.28)
ax.set_xlabel("Elapsed time (ms, lower is faster)")
style_x(ax)

# Right panel: total wasted querySelectorAll scans triggered by observers
ax2 = axes[1]
ax2.set_title("Observer DOM scans triggered", loc="left", size=11, fontweight="bold", pad=8)
max_scans = max(r["templateScans"] + r["controllerScans"] for r in data["domMutations"])
for y, engine in enumerate(engines):
    for (version, color), dy in zip(colors.items(), [-.18, .18]):
        vals = [
            r["templateScans"] + r["controllerScans"]
            for r in data["domMutations"]
            if r["engine"] == engine and r["version"] == version
        ]
        med = int(round(median(vals)))
        ax2.barh(y + dy, med, height=.30, color=color)
        ax2.annotate(
            f"{med:,}",
            (med, y + dy),
            xytext=(5, 0),
            textcoords="offset points",
            va="center",
            color=color,
            fontsize=9,
            fontweight="bold",
        )
ax2.set_yticks(range(len(engines)), [ENGINE_LABELS.get(e, e) for e in engines])
ax2.set_ylim(len(engines) - .48, -.48)
ax2.set_xlim(0, max(max_scans, 10) * 1.25)
ax2.set_xlabel("querySelectorAll calls (resolve + client)")
style_x(ax2)

fig.text(
    .04,
    .035,
    "Disconnecting resolve.js on DOMContentLoaded and skipping leaf-node disposal scans eliminates post-load observer churn.",
    color=muted,
    fontsize=9,
)
save(fig, "perf-dom-mutations.svg")

"""Render the published figures from the recorded samples. Requires Matplotlib."""
import json
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
plt.rcParams.update({"font.size": 10, "font.family": "DejaVu Sans", "text.color": ink,
                     "axes.labelcolor": ink, "xtick.color": ink, "ytick.color": ink,
                     "axes.spines.top": False, "axes.spines.right": False,
                     "axes.spines.left": False, "axes.edgecolor": "#cbd4db",
                     "savefig.facecolor": "white", "svg.fonttype": "none", "svg.hashsalt": "ruwuter"})


def heading(fig, title, subtitle):
    fig.set_label(title)
    fig.text(.04, .96, title, fontsize=18, fontweight="bold", va="top")
    fig.text(.04, .885, subtitle, fontsize=10, va="top")
    handles = [Line2D([], [], marker="o", linestyle="", markersize=8, color=color)
               for color in colors.values()]
    fig.legend(handles, ["0.6  ·  " + data["revisions"]["base"]["commit"][:7],
                         "0.7  ·  " + data["revisions"]["head"]["commit"][:7]],
               loc="upper left", bbox_to_anchor=(.035, .84), ncol=2,
               frameon=False, handlelength=1, columnspacing=1.8)


def style(ax):
    ax.set_axisbelow(True)
    ax.grid(axis="x", color="#e0e6ea", linewidth=.7)
    ax.tick_params(length=0, pad=7)


def save(fig, name):
    svg = StringIO()
    fig.savefig(svg, format="svg", metadata={"Title": fig.get_label(), "Date": None})
    (source.parent / name).write_text("\n".join(line.rstrip() for line in svg.getvalue().splitlines()) + "\n")
    plt.close(fig)


fig, ax = plt.subplots(figsize=(8.8, 4.5))
fig.subplots_adjust(left=.18, right=.93, top=.69, bottom=.18)
heading(fig, "When the fast panel reached the page",
        "Two panels were ready after 100 ms and 600 ms. Each dot is the median of ten navigations.")
engines = ["chromium", "firefox", "webkit"]
for y, engine in enumerate(engines):
    samples = {}
    for version in colors:
        samples[version] = [r["fast"] for r in data["browser"]
                            if r["engine"] == engine and r["version"] == version]
    ax.plot([median(s) for s in samples.values()], [y, y], color="#c3cfd5", lw=2, zorder=1)
    for version, times in samples.items():
        value = median(times)
        ax.plot([min(times), max(times)], [y, y], color=colors[version], lw=4,
                alpha=.5, solid_capstyle="round")
        ax.scatter(value, y, color=colors[version], s=62, zorder=3)
        ax.annotate(f"{value:.0f} ms", (value, y), xytext=(0, 9), textcoords="offset points",
                    ha="center", fontsize=10, color=colors[version], fontweight="bold")
ax.set_yticks(range(3), ["Chromium", "Firefox", "WebKit"])
ax.set_ylim(2.42, -.55)
upper = max(r["fast"] for r in data["browser"])
ax.set_xlim(0, ((int(upper) // 100) + 1) * 100)
ax.set_xlabel("Time from navigation start (ms)")
style(ax)
fig.text(.04, .035, "Short horizontal ranges show the fastest and slowest observed runs.",
         color="#475d6c", fontsize=9)
save(fig, "streaming.svg")

fig, axes = plt.subplots(2, 1, figsize=(8.8, 6.7), gridspec_kw={"height_ratios": [2, 4]})
fig.subplots_adjust(left=.27, right=.90, top=.71, bottom=.09, hspace=.82)
heading(fig, "Package and browser payloads",
        "Each package bar is one compressed archive. Each browser bar is one optional module.")
rev = data["revisions"]
panels = [
    (axes[0], "Package archives  ·  KiB", ["JSR publish upload", "Deno pack (.tgz)"],
     [[rev[v]["package"][key] / 1024 for v in colors] for key in ("jsrUpload", "npmPack")]),
    (axes[1], "Browser bundles  ·  gzip bytes", ["Panel resolver", "Controllers", "Fragment swap", "Page navigation"],
     [[rev[v]["runtime"].get(key, {}).get("gzip") for v in colors] for key in ("resolve", "client", "swap", "navigate")])
]
for ax, title, labels, rows in panels:
    ax.set_title(title, loc="left", size=11, fontweight="bold", pad=7)
    for y, values in enumerate(rows):
        for (version, color), dy, value in zip(colors.items(), [-.18, .18], values):
            if value is None:
                ax.annotate("removed", (0, y+dy), xytext=(4, 0), textcoords="offset points",
                            va="center", color=color, fontsize=9)
                continue
            ax.barh(y + dy, value, height=.29, color=color)
            label = f"{value:.1f}" if ax is axes[0] else f"{value:,}"
            ax.annotate(label, (value, y+dy), xytext=(4, 0), textcoords="offset points",
                        va="center", color=color, fontsize=9)
    ax.set_yticks(range(len(labels)), labels)
    ax.set_ylim(len(labels) - .49, -.49)
    ax.set_xlim(0, max(v for row in rows for v in row if v is not None) * 1.14)
    style(ax)
save(fig, "payload.svg")

fig, ax = plt.subplots(figsize=(8.8, 4.5))
fig.subplots_adjust(left=.12, right=.95, top=.68, bottom=.18)
heading(fig, "Cost of serving a small HTML document",
        "Each point is the mean time per request in a batch of 1,000 serial GETs.")
for version, color in colors.items():
    batches = sorted((r for r in data["server"] if r["version"] == version),
                     key=lambda r: r["pair"])
    ax.plot([r["pair"] + 1 for r in batches],
            [r["ms"] * 1000 / data["requestsPerBatch"] for r in batches],
            marker="o", markersize=4, linewidth=1.5, color=color)
ax.set_xlim(.7, len(batches) + .3)
ax.set_ylim(bottom=0)
ax.set_xticks(range(1, len(batches) + 1))
ax.set_ylabel("µs per request")
ax.set_xlabel("Measured pair")
ax.grid(axis="y", color="#e0e6ea", linewidth=.7)
ax.tick_params(length=0, pad=6)
fig.text(.04, .035, "Each revision returned the same HTML. The timed loop includes reading the response body.",
         color="#475d6c", fontsize=9)
save(fig, "server.svg")

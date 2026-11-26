import { chromium, firefox, webkit } from "playwright-core";

const args = [...Deno.args];
let engineFilter: string[] | undefined;
if (args[0]?.startsWith("--engines=")) {
  engineFilter = args.shift()!.slice("--engines=".length).split(",").filter(Boolean);
}
const [base, head] = args;
const allEngines = [chromium, firefox, webkit];
const engines = engineFilter
  ? allEngines.filter((e) => engineFilter!.includes(e.name()))
  : allEngines;

const controllerStartup = [];
const domMutations = [];

for (const engine of engines) {
  const browser = await engine.launch({
    executablePath: Deno.env.get("RUWUTER_" + engine.name().toUpperCase() + "_EXECUTABLE"),
  });
  try {
    // 1. Streaming controller activation latency (2 warmups + 10 alternating pairs).
    for (let pair = -2; pair < 10; pair++) {
      const order: Array<["base" | "head", string]> = [["base", base], ["head", head]];
      if (pair % 2) order.reverse();
      for (const [version, origin] of order) {
        const page = await browser.newPage();
        try {
          await page.addInitScript(() => {
            const observer = new MutationObserver(() => {
              for (const id of ["shell", "slow"]) {
                if (performance.getEntriesByName(id).length) continue;
                if (document.getElementById(id)?.getClientRects().length) performance.mark(id);
              }
              if (performance.getEntriesByName("slow").length) observer.disconnect();
            });
            observer.observe(document, { childList: true, subtree: true });
          });
          const res = await page.goto(origin + "/stream-controller");
          if (res?.status() !== 200) throw new Error("stream-controller failed");
          await page.waitForFunction(() =>
            performance.getEntriesByName("controller-mounted").length > 0 &&
            performance.getEntriesByName("slow").length > 0
          );
          const sample = await page.evaluate(() => ({
            shell: performance.getEntriesByName("shell")[0].startTime,
            mounted: performance.getEntriesByName("controller-mounted")[0].startTime,
            slow: performance.getEntriesByName("slow")[0].startTime,
          }));
          if (pair >= 0) {
            controllerStartup.push({
              engine: engine.name(),
              browser: browser.version(),
              pair,
              version,
              ...sample,
            });
          }
        } finally {
          await page.close();
        }
      }
    }

    // 2. Post-load DOM mutation overhead on a page with Deferred + client.js (2 warmups + 10 pairs).
    for (let pair = -2; pair < 10; pair++) {
      const order: Array<["base" | "head", string]> = [["base", base], ["head", head]];
      if (pair % 2) order.reverse();
      for (const [version, origin] of order) {
        const page = await browser.newPage();
        try {
          const res = await page.goto(origin + "/mutations");
          if (res?.status() !== 200) throw new Error("mutations route failed");
          await page.waitForFunction(() =>
            !!document.getElementById("panel-ready") &&
            document.getElementById("widget")?.dataset.mounted === "1"
          );
          // Perform 400 rounds of realistic post-load DOM writes & leaf removals, yielding to
          // microtasks so MutationObservers fire after each batch just like real user events.
          const sample = await page.evaluate(async () => {
            const stage = document.getElementById("stage")!;
            const counter = document.getElementById("counter")!;
            let templateScans = 0;
            let controllerScans = 0;
            const origDocQsa = document.querySelectorAll.bind(document);
            document.querySelectorAll = ((selector: string) => {
              if (selector.includes("data-rw-target")) templateScans += 1;
              return origDocQsa(selector);
            }) as typeof document.querySelectorAll;
            const origElQsa = Element.prototype.querySelectorAll;
            Element.prototype.querySelectorAll = function (selector: string) {
              if (selector.includes("data-rw-controller")) controllerScans += 1;
              return origElQsa.call(this, selector);
            };
            const start = performance.now();
            try {
              for (let i = 0; i < 400; i++) {
                counter.textContent = String(i);
                const chip = document.createElement("span");
                chip.textContent = `item-${i}`;
                stage.appendChild(chip);
                await Promise.resolve();
                chip.remove();
                await Promise.resolve();
              }
              // Flush any queued microtasks.
              await new Promise((r) => setTimeout(r, 0));
              return {
                ms: performance.now() - start,
                templateScans,
                controllerScans,
              };
            } finally {
              document.querySelectorAll = origDocQsa;
              Element.prototype.querySelectorAll = origElQsa;
            }
          });
          if (pair >= 0) {
            domMutations.push({
              engine: engine.name(),
              browser: browser.version(),
              pair,
              version,
              ...sample,
            });
          }
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}

console.log(JSON.stringify({ controllerStartup, domMutations }));

import { chromium, firefox, webkit } from "playwright-core";

const [base, head] = Deno.args;
const results = [];
for (const engine of [chromium, firefox, webkit]) {
  const browser = await engine.launch({
    executablePath: Deno.env.get("RUWUTER_" + engine.name().toUpperCase() + "_EXECUTABLE"),
  });
  try {
    for (let pair = -2; pair < 10; pair++) {
      const order = [base, head];
      if (pair % 2) order.reverse();
      for (const origin of order) {
        // Each page gets a fresh context and empty HTTP cache.
        const page = await browser.newPage();
        try {
          await page.addInitScript(() => {
            const observer = new MutationObserver(() => {
              for (const id of ["shell", "fast", "slow"]) {
                if (performance.getEntriesByName(id).length) continue;
                if (document.getElementById(id)?.getClientRects().length) performance.mark(id);
              }
              if (
                performance.getEntriesByName("slow").length &&
                performance.getEntriesByName("fast").length
              )
                observer.disconnect();
            });
            observer.observe(document, { childList: true, subtree: true });
          });
          const response = await page.goto(origin + "/panels");
          if (response?.status() !== 200) throw new Error("Panel route failed");
          await page.waitForFunction(
            () =>
              performance.getEntriesByName("slow").length &&
              performance.getEntriesByName("fast").length,
          );
          const sample = await page.evaluate(() => {
            const mark = (id: string) => performance.getEntriesByName(id)[0].startTime;
            const nav = performance.getEntriesByType(
              "navigation",
            )[0] as PerformanceNavigationTiming;
            const scripts = [...document.querySelectorAll<HTMLScriptElement>("script[src]")];
            if (scripts.length !== 1) throw new Error("Expected one resolver per document");
            const asset = performance.getEntriesByName(
              scripts[0].src,
            )[0] as PerformanceResourceTiming;
            return {
              shell: mark("shell"),
              fast: mark("fast"),
              slow: mark("slow"),
              responseEnd: nav.responseEnd,
              htmlEncoded: nav.encodedBodySize,
              htmlDecoded: nav.decodedBodySize,
              resolverEncoded: asset.encodedBodySize,
              resolverDecoded: asset.decodedBodySize,
            };
          });
          if (pair >= 0) {
            let version = "base";
            if (origin === head) version = "head";
            results.push({
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
console.log(JSON.stringify(results));

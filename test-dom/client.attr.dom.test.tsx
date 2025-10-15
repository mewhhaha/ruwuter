import { describe, it, expect } from "../test-support/deno_vitest_shim.ts";
import "./setup.ts";
import { DOMParser } from "@b-fuze/deno-dom";
import { Router, type Env, type fragment } from "../src/router.mts";
import { Client, ref } from "../src/components/client.mts";

const makeCtx = () => {
  const pending: Promise<any>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (p: Promise<any>) => pending.push(p),
    passThroughOnException: () => {},
  } as any;
  return { ctx, pending } as const;
};

function extractClientScript(html: string): string {
  const m = html.match(/<script type="module"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Client script not found");
  return m[1];
}

async function waitFor(check: () => boolean, timeoutMs = 700) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("waitFor timeout");
}

describe("Attribute binding (DOM)", () => {
  it("updates hidden attribute when ref changes", async () => {
    const show = ref(false);

    function toggle(this: any, _ev: Event, _signal: AbortSignal) {
      // handled via bound state
      (this as any).show.set((v: boolean) => !v);
    }

    function hiddenFor(this: any, _ev: Event, _signal: AbortSignal) {
      return !this.show.get();
    }
    (hiddenFor as any).show = show;
    // Simulate static route export hrefs assigned by generator
    (toggle as any).href = "/_client/r/root/toggle.js";
    (hiddenFor as any).href = "/_client/r/root/hiddenFor.js";

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <button id="t" bind={{ show }} on={toggle}>
                  Toggle
                </button>
                <div id="p" hidden={hiddenFor}>
                  Panel
                </div>
                <Client />
              </body>
            </html>
          ),
        },
      },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/"),
      {} as Env,
      ctx,
    );
    const html = await res.text();

    // Build a DOM and inject HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(
      "<!doctype html><html><head></head><body></body></html>",
      "text/html",
    )!;
    const window: any = { document: doc, Event, AbortController };
    // Minimal MutationObserver polyfill (may be unused in this test but provided for parity)
    (globalThis as any).MutationObserver = (window.MutationObserver = class {
      cb: (m: any[]) => void;
      constructor(cb: (m: any[]) => void) { this.cb = cb; }
      observe() {}
      disconnect() {}
    } as any);
    doc.body.innerHTML = html.replace(/^<!doctype html>/i, "");
    (globalThis as any).Comment = (doc.createComment as any)
      ? (doc.createComment("x") as any).constructor
      : (globalThis as any).Comment || (class {} as any);
    (globalThis as any).Node = (globalThis as any).Node || ({ ELEMENT_NODE: 1 } as any);
    (globalThis as any).Element = (doc.createElement("div") as any).constructor;
    (globalThis as any).HTMLElement = (doc.createElement("div") as any).constructor;

    // Stub dynamic import used by client runtime to load function modules
    (window as any).__import = async (spec: string) => {
      if (!spec.startsWith("/_client/r/")) throw new Error("Unexpected spec: " + spec);
      if (spec.endsWith("/toggle.js")) return { default: toggle };
      if (spec.endsWith("/hiddenFor.js")) return { default: hiddenFor };
      throw new Error("Unknown spec: " + spec);
    };

    // Execute the client script, replacing import() with window.__import
    const script = extractClientScript(html).replaceAll(
      /\bimport\s*\(/g,
      "window.__import(",
    );
    new Function("window", "document", script)(window, doc as any);

    // Fire DOMContentLoaded to trigger seed + mounts + attr binding
    doc.dispatchEvent(new Event("DOMContentLoaded"));

    const panel = doc.getElementById("p")!;
    // Initially hidden should be true (show=false)
    await waitFor(() => panel.hasAttribute("hidden") === true, 1000);
    expect(panel.hasAttribute("hidden")).toBe(true);

    // Toggle by driving the client state directly (deno-dom click events can be flaky)
    const scripts = Array.from(
      doc.querySelectorAll('script[type="application/json"][data-hydrate]'),
    );
    let bindId: string | undefined;
    for (const s of scripts) {
      try {
        const payload = JSON.parse(s.textContent || "{}");
        if (payload && payload.bind && payload.bind.show && payload.bind.show.i) {
          bindId = payload.bind.show.i as string;
          break;
        }
      } catch {}
    }
    if (!bindId) throw new Error("bind id for show not found");
    (window as any).__client.set(bindId, true);
    await waitFor(() => panel.hasAttribute("hidden") === false, 1000);
    expect(panel.hasAttribute("hidden")).toBe(false);
  });
});

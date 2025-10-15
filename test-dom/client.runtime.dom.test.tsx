import { describe, it, expect } from "../test-support/deno_vitest_shim.ts";
import "./setup.ts";
import { DOMParser } from "@b-fuze/deno-dom";
import { Router, type Env, type fragment } from "../src/router.mts";
import { Client } from "../src/components/client.mts";

const makeCtx = () => {
  const pending: Promise<any>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (p: Promise<any>) => pending.push(p),
    passThroughOnException: () => {},
  } as any;
  return { ctx, pending } as const;
};

// Utility to extract inline module script from HTML
function extractClientScript(html: string): string {
  const m = html.match(/<script type="module"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Client script not found");
  return m[1];
}

async function waitFor(check: () => boolean, timeoutMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("waitFor timeout");
}

describe("Client runtime DOM behaviour", () => {
  it("calls mount and unmount handlers and maintains per-element context", async () => {
    // Create handlers whose code increments globals; attach properties for context
    function mount(this: any, _ev: Event, _signal: AbortSignal) {
      (window as any).__mounted = ((window as any).__mounted || 0) + 1;
      this.touched = true;
    }

    function unmount(this: any, _ev: Event, _signal: AbortSignal) {
      (window as any).__unmounted = ((window as any).__unmounted || 0) + 1;
    }
    // Simulate static route export hrefs assigned by generator
    (mount as any).href = "/_client/r/root/mount.js";
    (unmount as any).href = "/_client/r/root/unmount.js";

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <div id="m" bind={{ touched: false }} on={[mount]}></div>
                <div id="u" on={[unmount]}></div>
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
    // Minimal MutationObserver polyfill to support unmount detection
    const observers: Set<(m: any[]) => void> = new Set();
    class MO {
      cb: (m: any[]) => void;
      constructor(cb: (m: any[]) => void) { this.cb = cb; }
      observe(_target: any, _opts: any) { observers.add(this.cb); }
      disconnect() { observers.delete(this.cb); }
    }
    (globalThis as any).MutationObserver = (window.MutationObserver = MO as any);
    // Patch element remove to notify observers
    const anyEl = doc.createElement("div") as any;
    const proto: any = Object.getPrototypeOf(anyEl);
    const origRemove = proto.remove;
    proto.remove = function () {
      const el = this as any;
      const parent = el.parentNode;
      if (parent) parent.removeChild(el);
      observers.forEach((cb) => cb([{ removedNodes: [el] }]));
    };
    doc.body.innerHTML = html.replace(/^<!doctype html>/i, "");
    // Polyfill global Comment and Node for the client runtime checks
    (globalThis as any).Comment = (doc.createComment as any)
      ? (doc.createComment("x") as any).constructor
      : (globalThis as any).Comment || (class {} as any);
    (globalThis as any).Node = (globalThis as any).Node || ({ ELEMENT_NODE: 1 } as any);
    (globalThis as any).Element = (doc.createElement("div") as any).constructor;
    (globalThis as any).HTMLElement = (doc.createElement("div") as any).constructor;

    // Stub dynamic import used by client runtime to load function modules
    (window as any).__import = async (spec: string) => {
      if (!spec.startsWith("/_client/r/")) throw new Error("Unexpected spec: " + spec);
      if (spec.endsWith("/mount.js")) return { default: mount };
      if (spec.endsWith("/unmount.js")) return { default: unmount };
      throw new Error("Unknown spec: " + spec);
    };

    // Execute the client script, replacing import() with window.__import
    const script = extractClientScript(html).replaceAll(
      /\bimport\s*\(/g,
      "window.__import(",
    );
    // Execute the client script in our window/document context
    new Function("window", "document", script)(window, doc as any);

    // Fire DOMContentLoaded to trigger seed + runMounts
    doc.dispatchEvent(new Event("DOMContentLoaded"));

    // Wait for mount async load + handler execution
    await waitFor(() => (window as any).__mounted >= 1, 1000);
    expect((window as any).__mounted).toBeGreaterThanOrEqual(1);

    // Remove unmount node to trigger unmount observer
    const un = doc.getElementById("u")! as any;
    un.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect((window as any).__unmounted).toBeGreaterThanOrEqual(1);
  });
});

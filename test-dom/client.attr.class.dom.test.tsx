import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import "./setup.ts";
import { DOMParser } from "@b-fuze/deno-dom";
import { type Env, type fragment, Router } from "../src/router.mts";
import { Client, ref } from "../src/components/client.mts";
import * as events from "../src/events.mts";
import { nextClientRuntimeUrl } from "../test-support/client-runtime.inline.ts";

const makeCtx = () => {
  const pending: Promise<any>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (p: Promise<any>) => pending.push(p),
    passThroughOnException: () => {},
  } as any;
  return { ctx, pending } as const;
};

const runtimeUrl = () => nextClientRuntimeUrl();

async function waitFor(check: () => boolean, timeoutMs = 700) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("waitFor timeout");
}

function setupDomEnvironment(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    "<!doctype html><html><head></head><body></body></html>",
    "text/html",
  )!;

  const window: any = {
    document: doc,
    Event,
    AbortController,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    console,
  };
  window.location = new URL("https://example.com/");
  window.window = window;

  const observers: Set<(m: MutationRecord[]) => void> = new Set();
  class PolyfillMutationObserver {
    cb: (m: MutationRecord[]) => void;
    constructor(cb: (m: MutationRecord[]) => void) {
      this.cb = cb;
    }
    observe() {
      observers.add(this.cb);
    }
    disconnect() {
      observers.delete(this.cb);
    }
  }

  const saved = {
    window: (globalThis as any).window,
    document: (globalThis as any).document,
    Comment: (globalThis as any).Comment,
    Node: (globalThis as any).Node,
    Element: (globalThis as any).Element,
    HTMLElement: (globalThis as any).HTMLElement,
    HTMLScriptElement: (globalThis as any).HTMLScriptElement,
    MutationObserver: (globalThis as any).MutationObserver,
  };

  (globalThis as any).window = window;
  (globalThis as any).document = doc;
  (globalThis as any).MutationObserver = window.MutationObserver = PolyfillMutationObserver as any;
  (globalThis as any).Comment = (doc.createComment as any)
    ? (doc.createComment("x") as any).constructor
    : saved.Comment || (class {} as any);
  (globalThis as any).Node = saved.Node || ({ ELEMENT_NODE: 1, COMMENT_NODE: 8 } as any);
  (globalThis as any).Element = (doc.createElement("div") as any).constructor;
  (globalThis as any).HTMLElement = (doc.createElement("div") as any).constructor;
  (globalThis as any).HTMLScriptElement = (doc.createElement("script") as any).constructor;

  doc.body.innerHTML = html.replace(/^<!doctype html>/i, "");

  return {
    window,
    doc,
    cleanup() {
      (globalThis as any).window = saved.window;
      if (typeof saved.document === "undefined") delete (globalThis as any).document;
      else (globalThis as any).document = saved.document;

      if (typeof saved.Comment === "undefined") delete (globalThis as any).Comment;
      else (globalThis as any).Comment = saved.Comment;

      if (typeof saved.Node === "undefined") delete (globalThis as any).Node;
      else (globalThis as any).Node = saved.Node;

      if (typeof saved.Element === "undefined") delete (globalThis as any).Element;
      else (globalThis as any).Element = saved.Element;

      if (typeof saved.HTMLElement === "undefined") delete (globalThis as any).HTMLElement;
      else (globalThis as any).HTMLElement = saved.HTMLElement;

      if (typeof saved.HTMLScriptElement === "undefined") {
        delete (globalThis as any).HTMLScriptElement;
      } else (globalThis as any).HTMLScriptElement = saved.HTMLScriptElement;

      if (typeof saved.MutationObserver === "undefined") {
        delete (globalThis as any).MutationObserver;
      } else (globalThis as any).MutationObserver = saved.MutationObserver;
    },
  };
}

describe("Attribute binding (class)", () => {
  it("updates class attribute when ref changes", async () => {
    const active = ref(false);

    function toggle(this: any, _ev: Event, _signal: AbortSignal) {
      (this as any).active.set((v: boolean) => !v);
    }

    function classFor(this: any, _ev: Event, _signal: AbortSignal) {
      return this.active.get() ? "is-active" : "";
    }
    const toggleHref = "./handlers/toggle.client.js";
    const classHref = "./handlers/classFor.client.js";

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <button id="t" bind={{ active }} on={events.click(toggleHref)}>
                  Toggle
                </button>
                <div id="p" class={events.attribute(classHref, { active })}>
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

    const { window, doc, cleanup } = setupDomEnvironment(html);
    try {
      const resolveHref = (href: string) => new URL(href, window.location.href).href;
      window.__ruwuter = {
        loadModule: async (spec: string) => {
          if (spec === resolveHref(toggleHref)) return { default: toggle };
          if (spec === resolveHref(classHref)) {
            (classFor as any).active = active;
            return { default: classFor };
          }
          throw new Error("Unknown module: " + spec);
        },
      };

      await import(runtimeUrl());

      doc.dispatchEvent(new Event("DOMContentLoaded"));

      const panel = doc.getElementById("p")! as any;
      const classOf = () => ("className" in panel
        ? String(panel.className || "")
        : String(panel.getAttribute("class") || ""));
      await waitFor(() =>
        classOf() === "", 1000);
      expect(classOf()).toBe("");

      const scripts = Array.from(
        doc.querySelectorAll('script[type="application/json"][data-hydrate]'),
      );
      let bindId: string | undefined;
      for (const s of scripts) {
        try {
          const payload = JSON.parse(s.textContent || "{}");
          if (payload && payload.bind && payload.bind.active && payload.bind.active.i) {
            bindId = payload.bind.active.i as string;
            break;
          }
        } catch {}
      }
      if (!bindId) throw new Error("bind id for active not found");

      await new Promise((r) => setTimeout(r, 10));
      const store = (window.__ruwuter as any)?.store;
      if (!store) throw new Error("client store not available");
      store.set(bindId, true);

      await waitFor(() => /\bis-active\b/.test(classOf()), 1000);
      expect(classOf()).toMatch(/\bis-active\b/);
    } finally {
      cleanup();
    }
  });
});

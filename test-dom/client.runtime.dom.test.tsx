import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import "./setup.ts";
import { DOMParser } from "@b-fuze/deno-dom";
import { type Env, type fragment, Router } from "../src/router.ts";
import { Client } from "../src/components/client.ts";
import { events } from "../src/events.ts";
import { nextClientRuntimeUrl } from "../test-support/client-runtime.inline.ts";

const makeCtx = () => {
  const pending: Promise<any>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (p: Promise<any>) => pending.push(p),
    passThroughOnException: () => {},
  } as any;
  return { ctx, pending } as const;
};

const nextRuntimeUrl = () => nextClientRuntimeUrl();

async function waitFor(check: () => boolean, timeoutMs = 500) {
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

  const observers: Set<(mutations: MutationRecord[]) => void> = new Set();
  class TestMutationObserver {
    cb: (mutations: MutationRecord[]) => void;
    constructor(cb: (mutations: MutationRecord[]) => void) {
      this.cb = cb;
    }
    observe() {
      observers.add(this.cb);
    }
    disconnect() {
      observers.delete(this.cb);
    }
  }

  const removePatchTargets: { proto: any; orig: any }[] = [];
  const patchRemove = (el: any) => {
    const proto: any = Object.getPrototypeOf(el);
    if (removePatchTargets.some((entry) => entry.proto === proto)) return;
    const orig = proto.remove;
    proto.remove = function () {
      const element = this as Element;
      if (orig) orig.call(element);
      else if (element.parentNode) element.parentNode.removeChild(element);
      observers.forEach((cb) => cb([{ removedNodes: [element] } as unknown as MutationRecord]));
    };
    removePatchTargets.push({ proto, orig });
  };

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
  (globalThis as any).MutationObserver = window.MutationObserver = TestMutationObserver as any;
  (globalThis as any).Comment = (doc.createComment as any)
    ? (doc.createComment("x") as any).constructor
    : saved.Comment || (class {} as any);
  (globalThis as any).Node = saved.Node || ({ ELEMENT_NODE: 1, COMMENT_NODE: 8 } as any);
  (globalThis as any).Element = (doc.createElement("div") as any).constructor;
  (globalThis as any).HTMLElement = (doc.createElement("div") as any).constructor;
  (globalThis as any).HTMLScriptElement = (doc.createElement("script") as any).constructor;

  doc.body.innerHTML = html.replace(/^<!doctype html>/i, "");
  doc.querySelectorAll("*").forEach((el) => patchRemove(el as any));

  return {
    window,
    doc,
    patchRemove,
    cleanup() {
      removePatchTargets.forEach(({ proto, orig }) => {
        proto.remove = orig;
      });

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

describe("Client runtime DOM behaviour", () => {
  it(
    "calls mount and unmount handlers and maintains per-element context",
    async () => {
      function mount(this: any, _ev: Event, _signal: AbortSignal) {
        (window as any).__mounted = ((window as any).__mounted || 0) + 1;
        this.touched = true;
      }

      function unmount(this: any, _ev: Event, _signal: AbortSignal) {
        (window as any).__unmounted = ((window as any).__unmounted || 0) + 1;
      }
      const mountHref = "./handlers/mount.client.js";
      const unmountHref = "./handlers/unmount.client.js";

      const pattern = new URLPattern({ pathname: "/" });
      const fragments: fragment[] = [
        {
          id: "root",
          mod: {
            default: () => (
              <html>
                <body>
                  <div id="m" bind={{ touched: false }} on={[events.mount(mountHref)]}></div>
                  <div id="u" on={[events.unmount(unmountHref)]}></div>
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

      const { window, doc, patchRemove, cleanup } = setupDomEnvironment(html);
      try {
        const resolveHref = (href: string) => new URL(href, window.location.href).href;
        window.__ruwuter = {
          loadModule: async (spec: string) => {
            if (spec === resolveHref(mountHref)) return { default: mount };
            if (spec === resolveHref(unmountHref)) return { default: unmount };
            throw new Error("Unknown module: " + spec);
          },
        };

        await import(nextRuntimeUrl());

        doc.dispatchEvent(new Event("DOMContentLoaded"));

        await waitFor(() => (window as any).__mounted >= 1, 1000);
        expect((window as any).__mounted).toBeGreaterThanOrEqual(1);

        const un = doc.getElementById("u")!;
        patchRemove(un as any);
        un.remove();
        await new Promise((r) => setTimeout(r, 0));
        expect((window as any).__unmounted).toBeGreaterThanOrEqual(1);
      } finally {
        cleanup();
      }
    },
  );
});

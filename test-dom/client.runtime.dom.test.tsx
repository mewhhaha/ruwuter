// deno-lint-ignore-file no-explicit-any
import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { makeCtx } from "../test-support/ctx.ts";
import "./setup.ts";
import { DOMParser } from "linkedom";
import { controller } from "../src/components/client.ts";
import { type Env, type fragment, Router } from "../src/router.ts";
import { nextClientRuntimeUrl } from "../test-support/client-runtime.inline.ts";
import type { JsonValue } from "../src/browser.ts";
import { enhanceNavigation } from "../src/runtime/navigate.ts";

const nextRuntimeUrl = () => nextClientRuntimeUrl();
const controllerModules = new Map<string, { default?: unknown }>();
let controllerId = 0;

function registerController(defaultExport: unknown): string {
  const href = `https://example.com/controllers/${controllerId++}.js`;
  controllerModules.set(href, { default: defaultExport });
  return href;
}

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
  )! as unknown as Document;

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
    DOMParser: (globalThis as any).DOMParser,
    document: (globalThis as any).document,
    Comment: (globalThis as any).Comment,
    Node: (globalThis as any).Node,
    Element: (globalThis as any).Element,
    HTMLElement: (globalThis as any).HTMLElement,
    location: (globalThis as any).location,
    MutationObserver: (globalThis as any).MutationObserver,
    navigation: (globalThis as any).navigation,
    controllerModuleLoader: (globalThis as any).__ruwuterControllerModuleLoader,
  };

  (globalThis as any).window = window;
  (globalThis as any).DOMParser = DOMParser;
  (globalThis as any).document = doc;
  (globalThis as any).location = window.location;
  (globalThis as any).MutationObserver = window.MutationObserver = TestMutationObserver as any;
  (globalThis as any).Comment = (doc.createComment as any)
    ? (doc.createComment("x") as any).constructor
    : saved.Comment || (class {} as any);
  (globalThis as any).Node = saved.Node || ({ ELEMENT_NODE: 1, COMMENT_NODE: 8 } as any);
  (globalThis as any).Element = (doc.createElement("div") as any).constructor;
  (globalThis as any).HTMLElement = (doc.createElement("div") as any).constructor;
  (globalThis as any).__ruwuterControllerModuleLoader = async (url: URL) => {
    const mod = controllerModules.get(url.href);
    if (!mod) throw new Error(`missing controller module: ${url.href}`);
    return await Promise.resolve(mod);
  };

  doc.body.innerHTML = html.replace(/^<!doctype html>/i, "");
  doc.querySelectorAll("*").forEach((el) => patchRemove(el as any));

  return {
    doc,
    patchRemove,
    notify(mutations: MutationRecord[]) {
      observers.forEach((cb) => cb(mutations));
    },
    cleanup() {
      removePatchTargets.forEach(({ proto, orig }) => {
        proto.remove = orig;
      });

      (globalThis as any).window = saved.window;
      if (typeof saved.DOMParser === "undefined") delete (globalThis as any).DOMParser;
      else (globalThis as any).DOMParser = saved.DOMParser;
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

      if (typeof saved.location === "undefined") delete (globalThis as any).location;
      else (globalThis as any).location = saved.location;

      if (typeof saved.MutationObserver === "undefined") {
        delete (globalThis as any).MutationObserver;
      } else (globalThis as any).MutationObserver = saved.MutationObserver;

      if (typeof saved.navigation === "undefined") delete (globalThis as any).navigation;
      else (globalThis as any).navigation = saved.navigation;

      if (typeof saved.controllerModuleLoader === "undefined") {
        delete (globalThis as any).__ruwuterControllerModuleLoader;
      } else {
        (globalThis as any).__ruwuterControllerModuleLoader = saved.controllerModuleLoader;
      }
      controllerModules.clear();
    },
  };
}

async function render(htmlHref: string, props: JsonValue = {}) {
  const mounted = controller(htmlHref, props);
  const fragments: fragment[] = [{
    id: "root",
    mod: {
      default: () => (
        <html>
          <body>
            <main id="mount-target">
              <section id="controller-root" {...mounted.root()}>
                <button ref={mounted.refs.button} type="button">Run</button>
              </section>
            </main>
          </body>
        </html>
      ),
    },
  }];
  const router = Router([[new URLPattern({ pathname: "/" }), fragments]]);
  const { ctx } = makeCtx();
  const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
  return await res.text();
}

describe("Activation runtime DOM behaviour", () => {
  it("mounts explicit controller roots and passes props", async () => {
    const href = registerController(({ root, props, refs }: any) => {
      root.setAttribute("data-mounted", String(props.label));
      refs.button.setAttribute("data-ref-mounted", "yes");
      document.body.setAttribute("data-mounted", "1");
    });

    const html = await render(href, { label: "ready" });
    const { doc, cleanup } = setupDomEnvironment(html);
    try {
      await import(nextRuntimeUrl());

      const root = doc.getElementById("controller-root");
      await waitFor(() => root?.getAttribute("data-mounted") === "ready", 1000);
      expect(doc.body.getAttribute("data-mounted")).toBe("1");
      expect(root?.getAttribute("data-mounted")).toBe("ready");
      expect(doc.querySelector("[data-rw-ref='button']")?.getAttribute("data-ref-mounted")).toBe(
        "yes",
      );
    } finally {
      cleanup();
    }
  });

  it("reports controller activation failures", async () => {
    const href = registerController(() => {
      throw new Error("controller failed");
    });

    const html = await render(href);
    const { cleanup } = setupDomEnvironment(html);
    const originalError = console.error;
    const errors: unknown[] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args[0]);
    };
    try {
      await import(nextRuntimeUrl());

      await waitFor(() => errors.length === 1, 1000);
      expect((errors[0] as Error).message).toBe("controller failed");
    } finally {
      console.error = originalError;
      cleanup();
    }
  });

  it("reports modules without a default controller", async () => {
    const href = "https://example.com/controllers/missing-default.js";
    controllerModules.set(href, {});

    const html = await render(href);
    const { cleanup } = setupDomEnvironment(html);
    const originalError = console.error;
    const errors: unknown[] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args[0]);
    };
    try {
      await import(nextRuntimeUrl());

      await waitFor(() => errors.length === 1, 1000);
      expect((errors[0] as Error).message).toContain("must default export a function");
    } finally {
      console.error = originalError;
      cleanup();
    }
  });

  it("rejects controller URLs outside the current origin", async () => {
    const html = await render("https://evil.example/controller.js");
    const { cleanup } = setupDomEnvironment(html);
    const originalError = console.error;
    const errors: unknown[] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args[0]);
    };
    try {
      await import(nextRuntimeUrl());

      await waitFor(() => errors.length === 1, 1000);
      expect((errors[0] as Error).message).toContain("not allowed");
    } finally {
      console.error = originalError;
      cleanup();
    }
  });

  it("aborts the controller signal and runs returned cleanup on removal", async () => {
    const href = registerController(({ root, signal }: any) => {
      root.setAttribute("data-ready", "yes");
      signal.addEventListener(
        "abort",
        () => document.body.setAttribute("data-aborted", "yes"),
        { once: true },
      );
      return () => document.body.setAttribute("data-cleaned", "yes");
    });

    const html = await render(href);
    const { doc, patchRemove, cleanup } = setupDomEnvironment(html);
    try {
      await import(nextRuntimeUrl());

      const root = doc.getElementById("controller-root");
      if (!root) throw new Error("expected controller root");
      await waitFor(() => root.getAttribute("data-ready") === "yes", 1000);
      patchRemove(root as any);
      root.remove();

      await waitFor(() => doc.body.getAttribute("data-cleaned") === "yes", 1000);
      expect(doc.body.getAttribute("data-aborted")).toBe("yes");
      expect(doc.body.getAttribute("data-cleaned")).toBe("yes");
    } finally {
      cleanup();
    }
  });

  it("does not mount after a root is removed before the module resolves", async () => {
    const href = registerController(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      document.body.setAttribute("data-stale-mounted", "yes");
    });

    const html = await render(href);
    const { doc, patchRemove, cleanup } = setupDomEnvironment(html);
    try {
      await import(nextRuntimeUrl());

      const root = doc.getElementById("controller-root");
      if (!root) throw new Error("expected controller root");
      patchRemove(root as any);
      root.remove();

      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(doc.body.getAttribute("data-stale-mounted") ?? "").toBe("");
    } finally {
      cleanup();
    }
  });

  it("does not dispose a controller root moved within the document", async () => {
    const href = registerController(() => {
      return () => document.body.setAttribute("data-disposed-after-move", "yes");
    });

    const html = await render(href);
    const { doc, notify, cleanup } = setupDomEnvironment(html);
    try {
      await import(nextRuntimeUrl());

      const root = doc.getElementById("controller-root");
      const target = doc.createElement("aside");
      doc.body.appendChild(target);
      if (!root) throw new Error("expected controller root");

      target.appendChild(root);
      notify([{ removedNodes: [root], addedNodes: [root] } as unknown as MutationRecord]);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(doc.body.getAttribute("data-disposed-after-move") ?? "").toBe("");
    } finally {
      cleanup();
    }
  });

  it("mounts controller roots inserted after runtime startup", async () => {
    const href = registerController(({ root }: any) => {
      root.setAttribute("data-streamed-mounted", "yes");
    });

    const { doc, notify, cleanup } = setupDomEnvironment("<main id='mount-target'></main>");
    try {
      await import(nextRuntimeUrl());

      const root = doc.createElement("section");
      root.setAttribute("id", "streamed-root");
      root.setAttribute("data-rw-controller", href);

      const target = doc.getElementById("mount-target");
      if (!target) throw new Error("expected mount target");
      target.appendChild(root);
      notify([{ addedNodes: [root], removedNodes: [] } as unknown as MutationRecord]);

      await waitFor(() => root.getAttribute("data-streamed-mounted") === "yes", 1000);
      expect(root.getAttribute("data-streamed-mounted")).toBe("yes");
    } finally {
      cleanup();
    }
  });

  it("cleans up old controllers and mounts new ones after enhanced navigation", async () => {
    const href = registerController(({ root }: any) => {
      root.setAttribute("data-mounted", "yes");
      return () => document.body.setAttribute("data-old-cleaned", "yes");
    });
    const html = await render(href);
    const { doc, notify, cleanup } = setupDomEnvironment(html);

    class Navigation extends EventTarget {}
    class Navigate extends Event {
      canIntercept = true;
      destination = { url: "https://example.com/next" };
      downloadRequest = null;
      formData = null;
      hashChange = false;
      navigationType = "push" as const;
      signal = new AbortController().signal;
      sourceElement = null;
      handler?: () => Promise<void>;

      constructor() {
        super("navigate");
      }

      intercept({ handler }: { handler: () => Promise<void> }) {
        this.handler = handler;
      }
    }

    try {
      await import(nextRuntimeUrl());
      const oldRoot = doc.getElementById("controller-root");
      if (!oldRoot) throw new Error("expected old controller root");
      await waitFor(() => oldRoot.getAttribute("data-mounted") === "yes", 1000);

      const navigation = new Navigation();
      (globalThis as any).navigation = navigation;
      const stop = enhanceNavigation({
        fetch: (() =>
          Promise.resolve(
            new Response(
              `<html><head><title>Next</title></head><body>` +
                `<section id="next-controller" data-rw-controller="${href}"></section>` +
                `</body></html>`,
              { headers: { "Content-Type": "text/html" } },
            ),
          )) as typeof fetch,
      });
      const event = new Navigate();
      navigation.dispatchEvent(event);
      await event.handler?.();

      const nextRoot = doc.getElementById("next-controller");
      if (!nextRoot) throw new Error("expected new controller root");
      notify([{
        addedNodes: [nextRoot],
        removedNodes: [oldRoot],
      } as unknown as MutationRecord]);

      await waitFor(() => nextRoot.getAttribute("data-mounted") === "yes", 1000);
      await waitFor(() => doc.body.getAttribute("data-old-cleaned") === "yes", 1000);
      expect(nextRoot.getAttribute("data-mounted")).toBe("yes");
      expect(doc.body.getAttribute("data-old-cleaned")).toBe("yes");
      stop();
    } finally {
      cleanup();
    }
  });
});

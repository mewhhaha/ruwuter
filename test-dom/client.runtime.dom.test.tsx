// deno-lint-ignore-file no-explicit-any
import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { makeCtx } from "../test-support/ctx.ts";
import "./setup.ts";
import { DOMParser } from "@b-fuze/deno-dom";
import { controller } from "../src/components/client.ts";
import { type Env, type fragment, Router } from "../src/router.ts";
import { nextClientRuntimeUrl } from "../test-support/client-runtime.inline.ts";

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

      if (typeof saved.MutationObserver === "undefined") {
        delete (globalThis as any).MutationObserver;
      } else (globalThis as any).MutationObserver = saved.MutationObserver;
    },
  };
}

async function render(htmlHref: string, props: Record<string, unknown> = {}) {
  const fragments: fragment[] = [{
    id: "root",
    mod: {
      default: () => (
        <html>
          <body>
            <main id="mount-target">
              <section id="controller-root" {...controller(htmlHref, props)}>
                <button data-ref="button" type="button">Run</button>
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
    const href = `data:text/javascript,${
      encodeURIComponent(
        'export default function({ root, props }) { root.setAttribute("data-mounted", String(props.label)); document.body.setAttribute("data-mounted", "1"); }',
      )
    }`;

    const html = await render(href, { label: "ready" });
    const { doc, cleanup } = setupDomEnvironment(html);
    try {
      await import(nextRuntimeUrl());

      const root = doc.getElementById("controller-root");
      await waitFor(() => root?.getAttribute("data-mounted") === "ready", 1000);
      expect(doc.body.getAttribute("data-mounted")).toBe("1");
      expect(root?.getAttribute("data-mounted")).toBe("ready");
    } finally {
      cleanup();
    }
  });

  it("aborts the controller signal and runs returned cleanup on removal", async () => {
    const href = `data:text/javascript,${
      encodeURIComponent(
        'export default function({ root, signal }) { root.setAttribute("data-ready", "yes"); signal.addEventListener("abort", () => document.body.setAttribute("data-aborted", "yes"), { once: true }); return () => document.body.setAttribute("data-cleaned", "yes"); }',
      )
    }`;

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
    const href = `data:text/javascript,${
      encodeURIComponent(
        'await new Promise((r)=>setTimeout(r,25)); export default function(){ document.body.setAttribute("data-stale-mounted", "yes"); }',
      )
    }`;

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
    const href = `data:text/javascript,${
      encodeURIComponent(
        'export default function(){ return () => document.body.setAttribute("data-disposed-after-move", "yes"); }',
      )
    }`;

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
    const href = `data:text/javascript,${
      encodeURIComponent(
        'export default function({ root }) { root.setAttribute("data-streamed-mounted", "yes"); }',
      )
    }`;

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
});

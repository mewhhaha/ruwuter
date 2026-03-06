// deno-lint-ignore-file no-explicit-any
import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { makeCtx } from "../test-support/ctx.ts";
import "./setup.ts";
import { DOMParser } from "@b-fuze/deno-dom";
import { type Env, type fragment, Router } from "../src/router.ts";
import { Client, client } from "../src/components/client.ts";
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
  it("runs scope mount and unmount handlers", async () => {
    const mountHref = `data:text/javascript,${
      encodeURIComponent(
        'export default function(){ const b=document.body; const n=Number(b.getAttribute("data-mounted")||"0"); b.setAttribute("data-mounted", String(n+1)); }',
      )
    }`;
    const unmountHref = `data:text/javascript,${
      encodeURIComponent(
        'export default function(){ const b=document.body; const n=Number(b.getAttribute("data-unmounted")||"0"); b.setAttribute("data-unmounted", String(n+1)); }',
      )
    }`;

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [{
      id: "root",
      mod: {
        default: () => {
          const scope = client.scope();
          scope.mount(mountHref);
          scope.unmount(unmountHref);
          return (
            <html>
              <body>
                <section id="scope-root"></section>
                <Client />
              </body>
            </html>
          );
        },
      },
    }];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
    const html = await res.text();

    const { doc, patchRemove, cleanup } = setupDomEnvironment(html);
    try {
      await import(nextRuntimeUrl());
      doc.dispatchEvent(new Event("DOMContentLoaded"));

      await waitFor(() => doc.body.getAttribute("data-mounted") === "1", 1000);
      const section = doc.getElementById("scope-root");
      if (!section) throw new Error("expected scope root");
      patchRemove(section as any);
      section.remove();
      await waitFor(() => doc.body.getAttribute("data-unmounted") === "1", 1000);
      expect(doc.body.getAttribute("data-unmounted")).toBe("1");
    } finally {
      cleanup();
    }
  });

  it("runs sibling scope unmount handlers without cross-aborting their signals", async () => {
    const slowUnmountHref = `data:text/javascript,${
      encodeURIComponent(
        'export default async function(_ev, signal){ await new Promise((r)=>setTimeout(r,20)); const b=document.body; b.setAttribute("data-unmount-slow-aborted", String(signal.aborted)); if (signal.aborted) return; const n=Number(b.getAttribute("data-unmount-slow")||"0"); b.setAttribute("data-unmount-slow", String(n+1)); }',
      )
    }`;
    const fastUnmountHref = `data:text/javascript,${
      encodeURIComponent(
        'export default function(){ const b=document.body; const n=Number(b.getAttribute("data-unmount-fast")||"0"); b.setAttribute("data-unmount-fast", String(n+1)); }',
      )
    }`;

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [{
      id: "root",
      mod: {
        default: () => {
          const scope = client.scope();
          scope.unmount(slowUnmountHref);
          scope.unmount(fastUnmountHref);
          return (
            <html>
              <body>
                <section id="scope-root"></section>
                <Client />
              </body>
            </html>
          );
        },
      },
    }];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
    const html = await res.text();

    const { doc, patchRemove, cleanup } = setupDomEnvironment(html);
    try {
      await import(nextRuntimeUrl());
      doc.dispatchEvent(new Event("DOMContentLoaded"));

      const section = doc.getElementById("scope-root");
      if (!section) throw new Error("expected scope root");
      patchRemove(section as any);
      section.remove();

      await waitFor(() => doc.body.getAttribute("data-unmount-fast") === "1", 1000);
      await waitFor(() => doc.body.getAttribute("data-unmount-slow") === "1", 1000);
      expect(doc.body.getAttribute("data-unmount-fast")).toBe("1");
      expect(doc.body.getAttribute("data-unmount-slow")).toBe("1");
      expect(doc.body.getAttribute("data-unmount-slow-aborted")).toBe("false");
    } finally {
      cleanup();
    }
  });

  it("updates ref-bound text and data/aria attrs when scope listeners mutate refs", async () => {
    const clientModuleUrl = `file://${Deno.cwd()}/src/components/client.ts`;
    const mountHref = `data:text/javascript,${
      encodeURIComponent(
        `import { on } from ${JSON.stringify(clientModuleUrl)};\n` +
          `export default function(ev, signal){\n` +
          `  const root = ev.currentTarget;\n` +
          `  if (root && root.setAttribute) root.setAttribute("data-scope-ready", "yes");\n` +
          `  on(this.button).click(() => {\n` +
          `    this.label.set("running");\n` +
          `    this.state.set("active");\n` +
          `    this.aria.set("live");\n` +
          `  }, { signal });\n` +
          `}`,
      )
    }`;

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [{
      id: "root",
      mod: {
        default: () => {
          const scope = client.scope();
          const label = scope.ref("label", "idle");
          const state = scope.ref("state", "initial-state");
          const aria = scope.ref("aria", "off");
          const button = scope.ref("button", null as HTMLButtonElement | null);
          scope.mount(mountHref);
          return (
            <html>
              <body>
                <section>
                  <div
                    id="bound"
                    data-state={state as unknown as string}
                    aria-label={aria as unknown as string}
                  >
                    {label}
                  </div>
                  <button id="mutator" type="button" ref={button}>update</button>
                </section>
                <Client />
              </body>
            </html>
          );
        },
      },
    }];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
    const html = await res.text();

    const { doc, cleanup } = setupDomEnvironment(html);
    try {
      await import(nextRuntimeUrl());
      doc.dispatchEvent(new Event("DOMContentLoaded"));

      const bound = doc.getElementById("bound") as HTMLDivElement | null;
      const button = doc.getElementById("mutator") as HTMLButtonElement | null;
      const section = button?.parentElement;
      if (!bound || !button) throw new Error("expected runtime test elements");
      await waitFor(() => section?.getAttribute("data-scope-ready") === "yes", 1000);

      button.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));

      await waitFor(() => bound.textContent === "running", 1000);
      expect(bound.textContent).toBe("running");
      expect(bound.getAttribute("data-state")).toBe("active");
      expect(bound.getAttribute("aria-label")).toBe("live");
    } finally {
      cleanup();
    }
  });

  it("does not mutate detached bound nodes after removal and does not crash on later ref.set", async () => {
    const clientModuleUrl = `file://${Deno.cwd()}/src/components/client.ts`;
    const mountHref = `data:text/javascript,${
      encodeURIComponent(
        `import { on } from ${JSON.stringify(clientModuleUrl)};\n` +
          `export default function(ev, signal){\n` +
          `  const root = ev.currentTarget;\n` +
          `  if (root && root.setAttribute) root.setAttribute("data-scope-ready", "yes");\n` +
          `  on(this.button).click(() => {\n` +
          `    this.label.set("changed");\n` +
          `    this.state.set("running");\n` +
          `    this.aria.set("yes");\n` +
          `    const body = document.body;\n` +
          `    const next = Number(body.getAttribute("data-updated") || "0") + 1;\n` +
          `    body.setAttribute("data-updated", String(next));\n` +
          `  }, { signal });\n` +
          `}`,
      )
    }`;

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [{
      id: "root",
      mod: {
        default: () => {
          const scope = client.scope();
          const label = scope.ref("label", "initial");
          const state = scope.ref("state", "paused");
          const aria = scope.ref("aria", "no");
          const button = scope.ref("button", null as HTMLButtonElement | null);
          scope.mount(mountHref);
          return (
            <html>
              <body>
                <section id="scope-root">
                  <div
                    id="bound"
                    data-state={state as unknown as string}
                    aria-label={aria as unknown as string}
                  >
                    {label}
                  </div>
                  <button id="mutator" type="button" ref={button}>mutate</button>
                </section>
                <Client />
              </body>
            </html>
          );
        },
      },
    }];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
    const html = await res.text();

    const { doc, patchRemove, cleanup } = setupDomEnvironment(html);
    try {
      await import(nextRuntimeUrl());
      doc.dispatchEvent(new Event("DOMContentLoaded"));

      const bound = doc.getElementById("bound") as HTMLDivElement | null;
      const button = doc.getElementById("mutator") as HTMLButtonElement | null;
      const section = button?.parentElement;
      if (!bound || !button) throw new Error("expected runtime test elements");
      await waitFor(() => section?.getAttribute("data-scope-ready") === "yes", 1000);

      patchRemove(bound as any);
      bound.remove();

      const initialText = bound.textContent;
      const initialState = bound.getAttribute("data-state");
      const initialAria = bound.getAttribute("aria-label");

      button.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
      await waitFor(() => doc.body.getAttribute("data-updated") === "1", 1000);

      expect(doc.body.getAttribute("data-updated")).toBe("1");
      expect(bound.textContent).toBe(initialText);
      expect(bound.getAttribute("data-state")).toBe(initialState);
      expect(bound.getAttribute("aria-label")).toBe(initialAria);
    } finally {
      cleanup();
    }
  });

  it("auto-anchors client.scope runs and supports on(ref) listener wiring", async () => {
    const clientModuleUrl = `file://${Deno.cwd()}/src/components/client.ts`;
    const mountHref = `data:text/javascript,${
      encodeURIComponent(
        `import { on } from ${JSON.stringify(clientModuleUrl)};\n` +
          `export default function(ev, signal){\n` +
          `  const root = ev.currentTarget;\n` +
          `  if (root && root.setAttribute) root.setAttribute("data-scope-ready", "yes");\n` +
          `  on(this.button).click(() => {\n` +
          `    const field = this.input.get();\n` +
          `    if (field) field.setAttribute("data-focused", "yes");\n` +
          `  }, { signal });\n` +
          `}`,
      )
    }`;

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [{
      id: "root",
      mod: {
        default: () => {
          const scope = client.scope();
          const input = scope.ref("input", null as HTMLInputElement | null);
          const button = scope.ref("button", null as HTMLButtonElement | null);
          scope.mount(mountHref);
          return (
            <html>
              <body>
                <section>
                  <input id="focus-input" ref={input} />
                  <button id="focus-button" type="button" ref={button}>Focus</button>
                </section>
                <Client />
              </body>
            </html>
          );
        },
      },
    }];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
    const html = await res.text();

    const { doc, cleanup } = setupDomEnvironment(html);
    try {
      await import(nextRuntimeUrl());
      doc.dispatchEvent(new Event("DOMContentLoaded"));

      const inputEl = doc.getElementById("focus-input") as HTMLInputElement | null;
      const button = doc.getElementById("focus-button") as HTMLButtonElement | null;
      const section = button?.parentElement;
      if (!inputEl || !button) throw new Error("expected scope test elements");
      await waitFor(() => section?.getAttribute("data-scope-ready") === "yes", 1000);

      button.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
      await waitFor(() => inputEl.getAttribute("data-focused") === "yes", 1000);
      expect(inputEl.getAttribute("data-focused")).toBe("yes");
    } finally {
      cleanup();
    }
  });
});

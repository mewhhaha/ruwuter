// deno-lint-ignore-file no-explicit-any
import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import "./setup.ts";
import { DOMParser } from "linkedom";
import { nextResolveRuntimeUrl } from "../test-support/client-runtime.inline.ts";

function setupDomEnvironment(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    "<!doctype html><html><head></head><body></body></html>",
    "text/html",
  )! as unknown as Document;

  const observers: Array<(mutations: MutationRecord[]) => void> = [];

  class TestMutationObserver {
    constructor(cb: (mutations: MutationRecord[]) => void) {
      observers.push(cb);
    }
    observe() {}
    disconnect() {}
  }

  const window: any = {
    document: doc,
    Event,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    MutationObserver: TestMutationObserver,
    console,
  };
  window.location = new URL("https://example.com/");
  window.window = window;

  const saved = {
    window: (globalThis as any).window,
    document: (globalThis as any).document,
    Node: (globalThis as any).Node,
    Element: (globalThis as any).Element,
    HTMLTemplateElement: (globalThis as any).HTMLTemplateElement,
    MutationObserver: (globalThis as any).MutationObserver,
  };

  (globalThis as any).window = window;
  (globalThis as any).document = doc;
  (globalThis as any).Node = (doc.createElement("div") as any).constructor;
  (globalThis as any).Element = (doc.createElement("div") as any).constructor;
  (globalThis as any).HTMLTemplateElement = (doc.createElement("template") as any).constructor;
  (globalThis as any).MutationObserver = TestMutationObserver;

  doc.body.innerHTML = html.replace(/^<!doctype html>/i, "");

  return {
    doc,
    observers,
    cleanup() {
      (globalThis as any).window = saved.window;
      if (typeof saved.document === "undefined") delete (globalThis as any).document;
      else (globalThis as any).document = saved.document;
      if (typeof saved.Node === "undefined") delete (globalThis as any).Node;
      else (globalThis as any).Node = saved.Node;
      if (typeof saved.Element === "undefined") delete (globalThis as any).Element;
      else (globalThis as any).Element = saved.Element;
      if (typeof saved.HTMLTemplateElement === "undefined") {
        delete (globalThis as any).HTMLTemplateElement;
      } else (globalThis as any).HTMLTemplateElement = saved.HTMLTemplateElement;
      if (typeof saved.MutationObserver === "undefined") {
        delete (globalThis as any).MutationObserver;
      } else (globalThis as any).MutationObserver = saved.MutationObserver;
    },
  };
}

describe("Resolve runtime DOM behaviour", () => {
  it("moves template content without cloning script nodes", async () => {
    const { doc, cleanup } = setupDomEnvironment(`
      <div id="suspense-a">loading</div>
      <template data-rw-target="suspense-a">
        <div id="ready">ready</div>
        <script type="application/json" data-test-script="h_1">{"x":1}</script>
      </template>
    `);

    const templateEl = doc.createElement("template") as unknown as HTMLTemplateElement;
    const fragmentProto = Object.getPrototypeOf(templateEl.content) as {
      cloneNode: (deep?: boolean) => Node;
    };
    const originalCloneNode = fragmentProto.cloneNode;
    fragmentProto.cloneNode = () => {
      throw new Error("cloneNode should not be used in resolve runtime");
    };

    try {
      await import(nextResolveRuntimeUrl());
      expect(doc.getElementById("ready")?.textContent).toContain("ready");
      expect(doc.querySelector("template[data-rw-target]")).toBe(null);
      expect(doc.querySelector('script[data-test-script="h_1"]')?.textContent).toContain('"x":1');
    } finally {
      fragmentProto.cloneNode = originalCloneNode;
      cleanup();
    }
  });

  it("retries templates whose targets appear after another replacement", async () => {
    const { doc, cleanup } = setupDomEnvironment(`
      <div id="outer">outer loading</div>
      <template data-rw-target="inner">
        <span id="inner-ready">inner ready</span>
      </template>
      <template data-rw-target="outer">
        <section id="inner">inner loading</section>
      </template>
    `);

    try {
      await import(nextResolveRuntimeUrl());
      expect(doc.getElementById("inner-ready")?.textContent).toContain("inner ready");
      expect(doc.body.textContent).toContain("inner ready");
      expect(doc.querySelector("template[data-rw-target]")).toBe(null);
    } finally {
      cleanup();
    }
  });

  it("resolves nested templates with a single pass per mutation batch", async () => {
    const { doc, observers, cleanup } = setupDomEnvironment("");

    try {
      await import(nextResolveRuntimeUrl());
      const notify = observers[0];
      expect(typeof notify).toBe("function");

      // Streamed chunk: the outer template's content carries the fallback target that
      // the earlier inner template resolves (nested Suspense).
      doc.body.innerHTML = `
        <div id="outer">outer loading</div>
        <template data-rw-target="inner">
          <span id="inner-ready">inner ready</span>
        </template>
        <template data-rw-target="outer">
          <section id="inner">inner loading</section>
        </template>
      `;

      const originalQuerySelectorAll = doc.querySelectorAll.bind(doc);
      let scans = 0;
      (doc as any).querySelectorAll = (selector: string) => {
        if (selector.includes("data-rw-target")) scans += 1;
        return originalQuerySelectorAll(selector);
      };

      // A streamed render delivers many records in one batch; scanning per record is
      // quadratic, so the runtime must scan per batch instead.
      const batch = Array.from({ length: 20 }, () => ({
        addedNodes: [],
        removedNodes: [],
      })) as unknown as MutationRecord[];

      try {
        notify(batch);
      } finally {
        (doc as any).querySelectorAll = originalQuerySelectorAll;
      }

      expect(doc.getElementById("inner-ready")?.textContent).toContain("inner ready");
      expect(doc.body.textContent).not.toContain("outer loading");
      expect(doc.querySelector("template[data-rw-target]")).toBe(null);
      // Bounded by the nesting depth (plus a final no-progress pass), never by the
      // number of records in the batch.
      expect(scans).toBeGreaterThanOrEqual(1);
      expect(scans).toBeLessThanOrEqual(4);
    } finally {
      cleanup();
    }
  });
});

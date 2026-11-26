// deno-lint-ignore-file no-explicit-any
import { describe, expect, it } from "vitest";
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
  let disconnectCount = 0;

  class TestMutationObserver {
    constructor(cb: (mutations: MutationRecord[]) => void) {
      observers.push(cb);
    }
    observe() {}
    disconnect() {
      disconnectCount += 1;
    }
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
    get disconnects() {
      return disconnectCount;
    },
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
      </template><!--rw-end-->
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
      </template><!--rw-end-->
      <template data-rw-target="outer">
        <section id="inner">inner loading</section>
      </template><!--rw-end-->
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
        </template><!--rw-end-->
        <template data-rw-target="outer">
          <section id="inner">inner loading</section>
        </template><!--rw-end-->
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

  it("disconnects its MutationObserver on DOMContentLoaded and skips observing complete documents", async () => {
    const loadingEnv = setupDomEnvironment(`<div id="p">loading</div>`);
    let dclListener: (() => void) | undefined;
    Object.defineProperty(loadingEnv.doc, "readyState", { value: "loading", configurable: true });
    (loadingEnv.doc as any).addEventListener = (type: string, cb: () => void) => {
      if (type === "DOMContentLoaded") dclListener = cb;
    };
    try {
      await import(nextResolveRuntimeUrl());
      expect(loadingEnv.observers.length).toBe(1);
      expect(loadingEnv.disconnects).toBe(0);

      loadingEnv.doc.body.innerHTML += `<template data-rw-target="p"><span id="done">done</span></template><!--rw-end-->`;
      dclListener?.();

      expect(loadingEnv.doc.getElementById("done")?.textContent).toBe("done");
      expect(loadingEnv.disconnects).toBe(1);
    } finally {
      loadingEnv.cleanup();
    }

    const completeEnv = setupDomEnvironment(`
      <div id="p2">loading</div>
      <template data-rw-target="p2"><span id="done2">done2</span></template><!--rw-end-->
    `);
    Object.defineProperty(completeEnv.doc, "readyState", { value: "complete", configurable: true });
    try {
      await import(nextResolveRuntimeUrl());
      expect(completeEnv.doc.getElementById("done2")?.textContent).toBe("done2");
      expect(completeEnv.observers.length).toBe(0);
    } finally {
      completeEnv.cleanup();
    }
  });
});

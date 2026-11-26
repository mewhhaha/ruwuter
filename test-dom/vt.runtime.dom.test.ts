// deno-lint-ignore-file no-explicit-any
import { DOMParser } from "linkedom";
import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { nextVtRuntimeUrl } from "../test-support/client-runtime.inline.ts";

function setupVtEnv(html: string) {
  const doc = new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    "text/html",
  )! as unknown as Document;

  const listeners = new Map<string, Array<(event: any) => void>>();
  const window: any = {
    location: new URL("https://example.com/"),
    addEventListener(type: string, cb: (event: any) => void) {
      const list = listeners.get(type) ?? [];
      list.push(cb);
      listeners.set(type, list);
    },
    dispatch(type: string, event: any) {
      for (const cb of listeners.get(type) ?? []) cb(event);
    },
  };

  // Ensure CSSStyleDeclaration-like helpers exist consistently on linkedom elements.
  for (const el of doc.querySelectorAll("[data-rw-vt]")) {
    const props = new Map<string, string>();
    Object.defineProperty(el, "style", {
      configurable: true,
      value: {
        getPropertyValue: (name: string) => props.get(name) ?? "",
        setProperty: (name: string, value: string) => props.set(name, value),
        removeProperty: (name: string) => props.delete(name),
      },
    });
  }

  const saved = {
    window: (globalThis as any).window,
    document: (globalThis as any).document,
    location: (globalThis as any).location,
    navigation: (globalThis as any).navigation,
    addEventListener: globalThis.addEventListener,
  };
  (globalThis as any).window = window;
  (globalThis as any).document = doc;
  (globalThis as any).location = window.location;
  (globalThis as any).navigation = {};
  (globalThis as any).addEventListener = window.addEventListener.bind(window);

  return {
    doc,
    window,
    listeners,
    cleanup() {
      if (saved.window === undefined) delete (globalThis as any).window;
      else (globalThis as any).window = saved.window;
      if (saved.document === undefined) delete (globalThis as any).document;
      else (globalThis as any).document = saved.document;
      if (saved.location === undefined) delete (globalThis as any).location;
      else (globalThis as any).location = saved.location;
      if (saved.navigation === undefined) delete (globalThis as any).navigation;
      else (globalThis as any).navigation = saved.navigation;
      (globalThis as any).addEventListener = saved.addEventListener;
    },
  };
}

describe("vt.js MPA runtime DOM behaviour", () => {
  it("activates only matching elements on pageswap, sets direction types, and cleans up after finished", async () => {
    const { doc, window, cleanup } = setupVtEnv(`
      <article id="card-a" data-rw-vt="art-a" data-rw-vt-for="/items/a" data-rw-vt-class="hero"></article>
      <article id="card-b" data-rw-vt="art-b" data-rw-vt-for="/items/b" data-rw-vt-class="hero"></article>
      <div id="shared" data-rw-vt="nav" data-rw-vt-for="*"></div>
      <div id="dup" data-rw-vt="art-a" data-rw-vt-for="/items/a"></div>
    `);
    try {
      await import(nextVtRuntimeUrl());

      let resolveFinished!: () => void;
      const finished = new Promise<void>((resolve) => {
        resolveFinished = resolve;
      });
      const types = new Set<string>();

      window.dispatch("pageswap", {
        viewTransition: { finished, types },
        activation: {
          navigationType: "push",
          from: { url: "https://example.com/", index: 0 },
          entry: { url: "https://example.com/items/a?ref=1", index: 1 },
        },
      });

      const cardA = doc.getElementById("card-a") as any;
      const cardB = doc.getElementById("card-b") as any;
      const shared = doc.getElementById("shared") as any;
      const dup = doc.getElementById("dup") as any;

      expect(types.has("forward")).toBe(true);
      expect(cardA.style.getPropertyValue("view-transition-name")).toBe("art-a");
      expect(cardA.style.getPropertyValue("view-transition-class")).toBe("hero");
      expect(cardB.style.getPropertyValue("view-transition-name")).toBe("");
      expect(shared.style.getPropertyValue("view-transition-name")).toBe("nav");
      // Duplicate transition names must be skipped so they never abort the transition.
      expect(dup.style.getPropertyValue("view-transition-name")).toBe("");

      resolveFinished();
      await finished;
      await Promise.resolve();

      // Inline styles are restored once the transition finishes (BFCache safety).
      expect(cardA.style.getPropertyValue("view-transition-name")).toBe("");
      expect(cardA.style.getPropertyValue("view-transition-class")).toBe("");
      expect(shared.style.getPropertyValue("view-transition-name")).toBe("");
    } finally {
      cleanup();
    }
  });

  it("activates returning elements on pagereveal with back direction type and stays idempotent", async () => {
    const { doc, window, listeners, cleanup } = setupVtEnv(`
      <article id="card-a" data-rw-vt="art-a" data-rw-vt-for="/items/a" data-rw-vt-class="hero"></article>
      <article id="card-b" data-rw-vt="art-b" data-rw-vt-for="/items/b"></article>
    `);
    try {
      await import(nextVtRuntimeUrl());
      await import(nextVtRuntimeUrl());
      expect(listeners.get("pagereveal")?.length).toBe(1);

      let resolveFinished!: () => void;
      const finished = new Promise<void>((resolve) => {
        resolveFinished = resolve;
      });
      const types = new Set<string>();
      (globalThis as any).navigation.activation = {
        navigationType: "traverse",
        from: { url: "https://example.com/items/a", index: 2 },
        entry: { url: "https://example.com/", index: 1 },
      };

      window.dispatch("pagereveal", {
        viewTransition: { finished, types },
      });

      const cardA = doc.getElementById("card-a") as any;
      const cardB = doc.getElementById("card-b") as any;
      expect(types.has("back")).toBe(true);
      expect(cardA.style.getPropertyValue("view-transition-name")).toBe("art-a");
      expect(cardA.style.getPropertyValue("view-transition-class")).toBe("hero");
      expect(cardB.style.getPropertyValue("view-transition-name")).toBe("");

      resolveFinished();
      await finished;
      await Promise.resolve();
      expect(cardA.style.getPropertyValue("view-transition-name")).toBe("");
    } finally {
      cleanup();
    }
  });
});

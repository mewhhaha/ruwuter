/**
 * @module
 *
 * Browser runtime for explicit Ruwuter activation controllers.
 */

import type { Controller, ControllerCleanup, JsonValue } from "../components/client.ts";

const CONTROLLER_ATTR = "data-rw-controller";
const PROPS_ATTR = "data-rw-props";
const REF_ATTR = "data-rw-ref";

type ControllerModule = {
  default?: unknown;
};

type ControllerModuleLoader = (url: URL) => Promise<ControllerModule>;

type MountedController = {
  controller: AbortController;
  cleanup: ControllerCleanup;
};

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" && name === "AbortError";
}

function initializeActivationRuntime(): void {
  const mounted = new WeakMap<Element, MountedController>();

  const resolveModuleUrl = (spec: string): URL => {
    const base = (typeof document.baseURI === "string" && document.baseURI &&
        document.baseURI !== "about:blank")
      ? document.baseURI
      : (typeof globalThis.location?.href === "string"
        ? globalThis.location.href
        : "http://localhost/");
    const url = new URL(spec, base);
    const locationUrl = new URL(
      typeof globalThis.location?.href === "string" ? globalThis.location.href : base,
    );

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== locationUrl.origin
    ) {
      throw new TypeError(`Controller module URL is not allowed: ${url.href}`);
    }

    return url;
  };

  const loadModule = async (spec: string): Promise<Controller> => {
    const url = resolveModuleUrl(spec);
    const customLoader = (globalThis as {
      __ruwuterControllerModuleLoader?: ControllerModuleLoader;
    }).__ruwuterControllerModuleLoader;
    const mod = customLoader ? await customLoader(url) : await import(url.href);
    if (!mod || typeof mod.default !== "function") {
      throw new TypeError(`Controller module must default export a function: ${url.href}`);
    }
    return mod.default as Controller;
  };

  const isConnected = (root: Element): boolean => {
    if ("isConnected" in root) return root.isConnected;
    return document.documentElement?.contains(root) ?? false;
  };

  const parseProps = (root: Element): JsonValue | undefined => {
    const text = root.getAttribute(PROPS_ATTR);
    if (!text) return undefined;
    return JSON.parse(text) as JsonValue;
  };

  const collectRefs = (root: Element): Record<string, Element> => {
    const refs: Record<string, Element> = Object.create(null);
    const add = (element: Element) => {
      const name = element.getAttribute(REF_ATTR);
      if (!name) return;
      if (Object.hasOwn(refs, name)) {
        throw new TypeError(`Duplicate controller ref "${name}".`);
      }
      refs[name] = element;
    };

    add(root);
    root.querySelectorAll(`[${REF_ATTR}]`).forEach((element) => add(element));

    return new Proxy(refs, {
      get(target, prop: PropertyKey) {
        if (typeof prop !== "string") return Reflect.get(target, prop);
        if (!Object.hasOwn(target, prop)) {
          throw new TypeError(`Controller ref "${prop}" was not found.`);
        }
        return target[prop];
      },
    });
  };

  const mount = async (root: Element): Promise<void> => {
    if (mounted.has(root)) return;

    const spec = root.getAttribute(CONTROLLER_ATTR);
    if (!spec) return;

    const controller = new AbortController();
    mounted.set(root, { controller, cleanup: undefined });

    try {
      const activate = await loadModule(spec);
      if (controller.signal.aborted || !isConnected(root)) {
        controller.abort();
        mounted.delete(root);
        return;
      }

      const cleanup = await activate({
        root,
        props: parseProps(root),
        refs: collectRefs(root),
        signal: controller.signal,
      });

      const current = mounted.get(root);
      if (!current || current.controller !== controller) {
        if (typeof cleanup === "function") await cleanup();
        return;
      }
      current.cleanup = cleanup;
    } catch (error) {
      const wasAborted = controller.signal.aborted;
      mounted.delete(root);
      controller.abort();
      if (!wasAborted && !isAbortError(error)) {
        console.error(error);
      }
    }
  };

  const dispose = async (root: Element): Promise<void> => {
    const current = mounted.get(root);
    if (!current) return;

    mounted.delete(root);
    current.controller.abort();

    try {
      if (typeof current.cleanup === "function") {
        await current.cleanup();
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error(error);
      }
    }
  };

  const mountNode = (node: Node): void => {
    if (!(node instanceof Element)) return;
    if (node.hasAttribute(CONTROLLER_ATTR)) {
      void mount(node);
    }
    node.querySelectorAll(`[${CONTROLLER_ATTR}]`).forEach((root) => {
      void mount(root);
    });
  };

  const scheduleDispose = (root: Element): void => {
    queueMicrotask(() => {
      if (isConnected(root)) return;
      void dispose(root);
      root.querySelectorAll(`[${CONTROLLER_ATTR}]`).forEach((child) => {
        if (child instanceof Element && !isConnected(child)) {
          void dispose(child);
        }
      });
    });
  };

  document.querySelectorAll(`[${CONTROLLER_ATTR}]`).forEach((root) => {
    void mount(root);
  });

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes?.forEach((node) => mountNode(node));
      mutation.removedNodes?.forEach((node) => {
        if (node instanceof Element) scheduleDispose(node);
      });
    }
  });

  observer.observe(document, { childList: true, subtree: true });
}

if (typeof window !== "undefined") {
  initializeActivationRuntime();
}

export {};

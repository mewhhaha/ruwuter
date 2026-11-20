/**
 * @module
 *
 * Browser runtime for explicit Ruwuter controllers and moved events.
 */

import type { Controller, ControllerCleanup, JsonValue } from "../components/client.ts";

const CONTROLLER_ATTR = "data-rw-controller";
const PROPS_ATTR = "data-rw-props";
const REF_ATTR = "data-rw-ref";
const ACTIVATION_SELECTOR = `[${CONTROLLER_ATTR}]`;

type ClientModule = {
  default?: unknown;
};

type ClientModuleLoader = (url: URL) => Promise<ClientModule>;

type MountedActivation = {
  abortController: AbortController;
  cleanup: ControllerCleanup;
};

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { name?: unknown }).name === "AbortError";
}

function initializeActivationRuntime(): void {
  const mounted = new WeakMap<Element, MountedActivation>();

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
      throw new TypeError(`Browser module URL is not allowed: ${url.href}`);
    }

    return url;
  };

  const loadModule = async <ModuleExport>(spec: string): Promise<ModuleExport> => {
    const url = resolveModuleUrl(spec);
    const customLoader = (globalThis as {
      __ruwuterControllerModuleLoader?: ClientModuleLoader;
    }).__ruwuterControllerModuleLoader;
    const mod = customLoader ? await customLoader(url) : await import(url.href);
    if (!mod || typeof mod.default !== "function") {
      throw new TypeError(`Browser module must default export a function: ${url.href}`);
    }
    return mod.default as ModuleExport;
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

    const controllerSpec = root.getAttribute(CONTROLLER_ATTR);
    if (!controllerSpec) return;

    const abortController = new AbortController();
    mounted.set(root, { abortController, cleanup: undefined });

    try {
      const activate = await loadModule<Controller>(controllerSpec);
      if (abortController.signal.aborted || !isConnected(root)) {
        abortController.abort();
        if (mounted.get(root)?.abortController === abortController) mounted.delete(root);
        return;
      }

      const controllerCleanup = await activate({
        root,
        props: parseProps(root),
        refs: collectRefs(root),
        signal: abortController.signal,
      });

      const current = mounted.get(root);
      if (!current || current.abortController !== abortController) {
        if (typeof controllerCleanup === "function") await controllerCleanup();
        return;
      }
      current.cleanup = controllerCleanup;
    } catch (error) {
      const wasAborted = abortController.signal.aborted;
      if (mounted.get(root)?.abortController === abortController) mounted.delete(root);
      abortController.abort();
      if (!wasAborted && !isAbortError(error)) {
        console.error(error);
      }
    }
  };

  const dispose = async (root: Element): Promise<void> => {
    const current = mounted.get(root);
    if (!current) return;

    mounted.delete(root);
    current.abortController.abort();

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
    if (node.matches(ACTIVATION_SELECTOR)) {
      void mount(node);
    }
    node.querySelectorAll(ACTIVATION_SELECTOR).forEach((root) => {
      void mount(root);
    });
  };

  const scheduleDispose = (root: Element): void => {
    queueMicrotask(() => {
      if (isConnected(root)) return;
      void dispose(root);
      root.querySelectorAll(ACTIVATION_SELECTOR).forEach((child) => {
        if (child instanceof Element && !isConnected(child)) {
          void dispose(child);
        }
      });
    });
  };

  document.querySelectorAll(ACTIVATION_SELECTOR).forEach((root) => {
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

/**
 * @module
 *
 * Browser runtime for explicit Ruwuter controllers.
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
  let mountedCount = 0;

  const trackMounted = (root: Element, activation: MountedActivation): void => {
    if (!mounted.has(root)) mountedCount += 1;
    mounted.set(root, activation);
  };

  const untrackMounted = (root: Element): void => {
    if (mounted.delete(root)) mountedCount -= 1;
  };

  const resolveModuleUrl = (spec: string): URL => {
    const base =
      typeof document.baseURI === "string" && document.baseURI && document.baseURI !== "about:blank"
        ? document.baseURI
        : typeof globalThis.location?.href === "string"
          ? globalThis.location.href
          : "http://localhost/";
    const url = new URL(spec, base);
    const locationUrl = new URL(
      typeof globalThis.location?.href === "string" ? globalThis.location.href : base,
    );

    if (!["http:", "https:"].includes(url.protocol) || url.origin !== locationUrl.origin) {
      throw new TypeError(`Browser module URL is not allowed: ${url.href}`);
    }

    return url;
  };

  const loadModule = async <ModuleExport>(spec: string): Promise<ModuleExport> => {
    const url = resolveModuleUrl(spec);
    const customLoader = (
      globalThis as {
        __ruwuterControllerModuleLoader?: ClientModuleLoader;
      }
    ).__ruwuterControllerModuleLoader;
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

  const ownsRef = (root: Element, element: Element): boolean => {
    for (let node: Element | null = element; node && node !== root; node = node.parentElement) {
      if (node.hasAttribute(CONTROLLER_ATTR)) return false;
    }
    return true;
  };

  const findRef = (root: Element, name: string): Element => {
    let found: Element | undefined;
    if (root.getAttribute(REF_ATTR) === name) found = root;
    for (const element of root.querySelectorAll(`[${REF_ATTR}]`)) {
      if (element.getAttribute(REF_ATTR) !== name || !ownsRef(root, element)) continue;
      if (found) throw new TypeError(`Duplicate controller ref "${name}".`);
      found = element;
    }
    if (!found) throw new TypeError(`Controller ref "${name}" was not found.`);
    return found;
  };

  const createRefs = (root: Element): Record<string, Element> =>
    new Proxy(Object.create(null) as Record<string, Element>, {
      get(_target, prop: PropertyKey) {
        if (typeof prop !== "string") return undefined;
        return findRef(root, prop);
      },
    });

  const mount = async (root: Element): Promise<void> => {
    if (mounted.has(root)) return;

    const controllerSpec = root.getAttribute(CONTROLLER_ATTR);
    if (!controllerSpec) return;

    const abortController = new AbortController();
    trackMounted(root, { abortController, cleanup: undefined });

    try {
      const activate = await loadModule<Controller>(controllerSpec);
      if (abortController.signal.aborted || !isConnected(root)) {
        abortController.abort();
        if (mounted.get(root)?.abortController === abortController) untrackMounted(root);
        return;
      }

      const controllerCleanup = await activate({
        root,
        props: parseProps(root),
        refs: createRefs(root),
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
      if (mounted.get(root)?.abortController === abortController) untrackMounted(root);
      abortController.abort();
      if (!wasAborted && !isAbortError(error)) {
        console.error(error);
      }
    }
  };

  const dispose = async (root: Element): Promise<void> => {
    const current = mounted.get(root);
    if (!current) return;

    untrackMounted(root);
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
    if (node.firstElementChild) {
      node.querySelectorAll(ACTIVATION_SELECTOR).forEach((root) => {
        void mount(root);
      });
    }
  };

  const pendingDispose = new Set<Element>();
  let disposeScheduled = false;

  const flushDispose = (): void => {
    disposeScheduled = false;
    const roots = [...pendingDispose];
    pendingDispose.clear();
    for (const root of roots) {
      if (mountedCount === 0) break;
      if (isConnected(root)) continue;
      if (mounted.has(root)) void dispose(root);
      if (mountedCount > 0 && root.firstElementChild) {
        root.querySelectorAll(ACTIVATION_SELECTOR).forEach((child) => {
          if (mounted.has(child) && !isConnected(child)) {
            void dispose(child);
          }
        });
      }
    }
  };

  const scheduleDispose = (root: Element): void => {
    if (mountedCount === 0) return;
    pendingDispose.add(root);
    if (disposeScheduled) return;
    disposeScheduled = true;
    queueMicrotask(flushDispose);
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

const INSTALLED = Symbol.for("ruwuter.client.v1");

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (!Reflect.has(document, INSTALLED)) {
    Reflect.set(document, INSTALLED, true);
    initializeActivationRuntime();
  }
}

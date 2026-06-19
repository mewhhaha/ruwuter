/**
 * @module
 *
 * Browser runtime for explicit Ruwuter activation controllers.
 */

import type { Controller, ControllerCleanup } from "../components/client.ts";

const CONTROLLER_ATTR = "data-rw-controller";
const PROPS_ATTR = "data-rw-props";

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

  const loadModule = async (spec: string): Promise<Controller | undefined> => {
    const base = (typeof document.baseURI === "string" && document.baseURI &&
        document.baseURI !== "about:blank")
      ? document.baseURI
      : (typeof globalThis.location?.href === "string"
        ? globalThis.location.href
        : "http://localhost/");
    const resolved = new URL(spec, base).href;
    const mod = await import(resolved);
    return typeof mod.default === "function" ? (mod.default as Controller) : undefined;
  };

  const isConnected = (root: Element): boolean => {
    if ("isConnected" in root) return root.isConnected;
    return document.documentElement?.contains(root) ?? false;
  };

  const parseProps = (root: Element): unknown => {
    const text = root.getAttribute(PROPS_ATTR);
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch (error) {
      console.error(error);
      return undefined;
    }
  };

  const mount = async (root: Element): Promise<void> => {
    if (mounted.has(root)) return;

    const spec = root.getAttribute(CONTROLLER_ATTR);
    if (!spec) return;

    const controller = new AbortController();
    mounted.set(root, { controller, cleanup: undefined });

    try {
      const activate = await loadModule(spec);
      if (!activate || controller.signal.aborted || !isConnected(root)) {
        controller.abort();
        mounted.delete(root);
        return;
      }

      const cleanup = await activate({
        root,
        props: parseProps(root),
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

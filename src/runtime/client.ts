type RefListener = () => void;

type EventListenerOptions = {
  capture?: boolean;
  once?: boolean;
  passive?: boolean;
  preventDefault?: boolean;
};

type ModuleEntry = {
  t: "m";
  s: string;
  x?: string;
  ev?: string;
  opt?: EventListenerOptions;
};

type HydrationPayload = {
  bind?: unknown;
  on?: ModuleEntry[];
  ref?: RefObject;
};

type ClientFn = (this: unknown, ev: Event, signal: AbortSignal) => unknown;

interface RefObject {
  id: string;
  get(): unknown;
  set(next: unknown | ((prev: unknown) => unknown)): void;
  toJSON(): { __ref: true; i: string; v: unknown };
  toString(): string;
}

interface RefStore {
  set(id: string, next: unknown | ((prev: unknown) => unknown)): void;
  get(id: string): unknown;
  watch(id: string, fn: RefListener): () => void;
  ref(id: string, initial: unknown): RefObject;
}

interface ElementContext {
  bind: unknown;
  controllers: Map<string, AbortController>;
  unmount: ModuleEntry[];
  refs: RefObject[];
}

type ModuleNamespace = Record<string, unknown>;

interface GlobalClientWindow extends Window {
  __ruwuter?: {
    store?: RefStore;
    loadModule?: (spec: string) => Promise<ModuleNamespace>;
  };
}

interface SyntheticEventInit {
  currentTarget?: EventTarget | null;
}

const syntheticEventCache = new WeakMap<Event, Event>();

function synthesizeEvent<E extends Event>(
  event: E,
  init?: SyntheticEventInit,
) {
  if (!init && syntheticEventCache.has(event)) {
    return syntheticEventCache.get(event)! as E;
  }

  const currentTarget = init?.currentTarget ?? event.currentTarget ?? null;
  const srcElement =
    ("srcElement" in event
      ? (event as Event & { srcElement?: EventTarget | null }).srcElement
      : undefined) ??
      currentTarget;
  const eventPhase = event.eventPhase;
  const hasRelatedTarget = "relatedTarget" in event;
  const relatedTarget = hasRelatedTarget
    ? (event as Event & { relatedTarget?: EventTarget | null }).relatedTarget
    : undefined;
  const composedPath = typeof event.composedPath === "function" ? event.composedPath() : undefined;
  const toggleCandidate = event as Event & {
    newState?: string;
    oldState?: string;
    source?: Element | null;
  };
  const hasToggleState = typeof toggleCandidate.newState === "string" ||
    typeof toggleCandidate.oldState === "string";
  const toggleNewState = hasToggleState ? toggleCandidate.newState : undefined;
  const toggleOldState = hasToggleState ? toggleCandidate.oldState : undefined;
  const toggleSource = hasToggleState ? toggleCandidate.source ?? null : undefined;

  const hasSubmitter = "submitter" in event;
  const submitter = hasSubmitter
    ? (event as Event & { submitter?: Element | null }).submitter ?? null
    : undefined;

  const proxy = new Proxy(event, {
    get(target, prop, _receiver) {
      if (prop === "currentTarget") return currentTarget;
      if (prop === "srcElement") return srcElement;
      if (prop === "eventPhase") return eventPhase;
      if (prop === "relatedTarget" && hasRelatedTarget) return relatedTarget;
      if (prop === "submitter" && hasSubmitter) return submitter;
      if (prop === "composedPath") {
        return () => composedPath ? composedPath.slice() : [];
      }
      if (hasToggleState) {
        if (prop === "newState") return toggleNewState;
        if (prop === "oldState") return toggleOldState;
        if (prop === "source") return toggleSource;
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  if (!init) {
    syntheticEventCache.set(event, proxy);
  }
  return proxy as E;
}

const hasWindow = typeof window !== "undefined";

function initializeClientRuntime(): void {
  if (!hasWindow) return;
  const globalWindow = window as GlobalClientWindow;
  if (globalWindow.__ruwuter?.store) return;
  if (typeof document === "undefined") return;

  const loadModule = (() => {
    const cache = new Map<string, Promise<ModuleNamespace>>();

    const resolve = (spec: string) => {
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(spec)) return spec; // already absolute URL
      if (spec.startsWith("/")) return new URL(spec, window.location.origin).href;
      // Resolve relative to the current directory, not treating the last path segment as a file
      const baseDir = new URL(".", window.location.href);
      return new URL(spec, baseDir).href;
    };

    return (spec: string) => {
      const resolved = resolve(spec);
      if (!cache.has(resolved)) {
        const customLoader = globalWindow.__ruwuter?.loadModule;
        cache.set(
          resolved,
          customLoader ? customLoader(resolved) : import(resolved),
        );
      }
      return cache.get(resolved)!;
    };
  })();

  const store: RefStore = (() => {
    const values = new Map<string, unknown>();
    const listeners = new Map<string, Set<RefListener>>();
    const refs = new Map<string, RefObject>();

    const ensure = (id: string, initial: unknown) => {
      if (!values.has(id)) values.set(id, initial);
      return values.get(id);
    };

    const set = (id: string, next: unknown | ((prev: unknown) => unknown)) => {
      const current = values.get(id);
      const value = typeof next === "function"
        ? (next as (prev: unknown) => unknown)(current)
        : next;
      values.set(id, value);
      const subs = listeners.get(id);
      if (!subs) return;
      const snapshot = Array.from(subs);
      snapshot.forEach((fn) => {
        try {
          fn();
        } catch {
          /* ignore subscriber errors */
        }
      });
    };

    const watch = (id: string, fn: RefListener) => {
      let subs = listeners.get(id);
      if (!subs) {
        subs = new Set<RefListener>();
        listeners.set(id, subs);
      }
      subs.add(fn);
      return () => {
        const bucket = listeners.get(id);
        if (!bucket) return;
        bucket.delete(fn);
        if (bucket.size === 0) listeners.delete(id);
      };
    };

    const createRef = (id: string, initial: unknown): RefObject => {
      ensure(id, initial);
      if (!refs.has(id)) {
        const ref: RefObject = {
          id,
          get: () => values.get(id),
          set: (next) => set(id, next),
          toJSON: () => ({ __ref: true as const, i: id, v: values.get(id) }),
          toString: () => String(values.get(id)),
        };
        refs.set(id, ref);
      }
      return refs.get(id)!;
    };

    return {
      set,
      get: (id: string) => values.get(id),
      watch,
      ref: createRef,
    };
  })();

  const contexts = new WeakMap<Element, ElementContext>();
  const hydrated = new Set<string>();

  function revive(_key: string, value: unknown): unknown {
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (record.__ref === true && typeof record.i === "string") {
        const id = record.i;
        const initial = Object.prototype.hasOwnProperty.call(record, "v") ? record.v : undefined;
        return store.ref(id, initial);
      }
    }
    return value;
  }

  function parsePayload(text: string): HydrationPayload {
    try {
      return (JSON.parse(text, revive) as HydrationPayload) ?? {};
    } catch {
      return {};
    }
  }

  async function resolveEntry(entry?: ModuleEntry): Promise<ClientFn | undefined> {
    if (!entry || entry.t !== "m") return undefined;
    const mod = await loadModule(entry.s);
    const candidate = entry.x && entry.x in mod && typeof mod[entry.x] === "function"
      ? (mod[entry.x] as ClientFn)
      : typeof mod.default === "function"
      ? (mod.default as ClientFn)
      : typeof mod === "function"
      ? (mod as unknown as ClientFn)
      : undefined;
    return candidate;
  }

  function getContext(el: Element): ElementContext {
    let ctx = contexts.get(el);
    if (!ctx) {
      ctx = {
        bind: undefined,
        controllers: new Map<string, AbortController>(),
        unmount: [],
        refs: [],
      };
      contexts.set(el, ctx);
    }
    return ctx;
  }

  async function invokeEntry(
    el: Element,
    entry: ModuleEntry,
    type: string,
    ev: Event,
  ): Promise<void> {
    const fn = await resolveEntry(entry);
    if (!fn) return;
    const ctx = getContext(el);
    const controllers = ctx.controllers;

    if (type === "unmount") {
      controllers.forEach((ctrl) => ctrl.abort());
      controllers.clear();
    }

    const controller = new AbortController();
    if (type) {
      controllers.get(type)?.abort();
      controllers.set(type, controller);
    }

    const eventForHandler = type === "mount" || type === "unmount"
      ? synthesizeEvent(ev, { currentTarget: el })
      : ev;

    try {
      await fn.call(ctx.bind ?? el, eventForHandler, controller.signal);
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        return;
      }
      console.error(err);
    } finally {
      if (type && controllers.get(type) === controller) {
        controllers.delete(type);
      }
    }
  }

  function attachHandler(el: Element, entry: ModuleEntry): void {
    if (!entry || entry.t !== "m") return;
    const type = entry.ev && entry.ev.length > 0 ? entry.ev : "click";

    if (type === "mount") {
      queueMicrotask(() => invokeEntry(el, entry, "mount", new Event("mount")));
      return;
    }

    const ctx = getContext(el);
    if (type === "unmount") {
      ctx.unmount.push(entry);
      return;
    }
    const listenerOptions = entry.opt
      ? {
        capture: entry.opt.capture,
        once: entry.opt.once,
        passive: entry.opt.passive,
      }
      : undefined;
    const preventDefault = entry.opt?.preventDefault === true && entry.opt.passive !== true;
    el.addEventListener(type, (event) => {
      if (preventDefault && event.cancelable) {
        event.preventDefault();
      }
      const synthetic = synthesizeEvent(event);
      void invokeEntry(el, entry, type, synthetic);
    }, listenerOptions);
  }

  function hydratePayload(el: Element, payload: HydrationPayload): void {
    if (!payload || typeof payload !== "object") return;
    const ctx = getContext(el);

    if ("bind" in payload) {
      ctx.bind = payload.bind;
    }

    if (payload.ref) {
      const refs = ctx.refs;
      if (!refs.includes(payload.ref)) {
        refs.push(payload.ref);
      }
      try {
        payload.ref.set(el);
      } catch {
        /* ignore ref assignment errors */
      }
    }

    payload.on?.forEach((entry) => attachHandler(el, entry));
  }

  function findHydrationElement(script: HTMLScriptElement): Element | null {
    const id = script.getAttribute("data-hydrate") ?? "";
    if (!id) return null;

    let node: ChildNode | null = script.previousSibling;
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return node as Element;
      }
      if (node.nodeType === Node.COMMENT_NODE) {
        const comment = node as Comment;
        if (comment.data === `/rw:h:${id}` || comment.data === `/hydration-boundary:${id}`) {
          let prev: ChildNode | null = comment.previousSibling;
          while (prev && prev.nodeType !== Node.ELEMENT_NODE) {
            prev = prev.previousSibling;
          }
          if (prev && prev.nodeType === Node.ELEMENT_NODE) {
            return prev as Element;
          }
        }
        if (comment.data === `hydration-boundary:${id}`) {
          let next: ChildNode | null = comment.nextSibling;
          while (next && next.nodeType !== Node.ELEMENT_NODE) {
            next = next.nextSibling;
          }
          if (next && next.nodeType === Node.ELEMENT_NODE) {
            return next as Element;
          }
        }
      }
      node = node.previousSibling;
    }
    return null;
  }

  function hydrateScript(script: HTMLScriptElement): void {
    const id = script.getAttribute("data-hydrate") ?? "";
    if (!id || hydrated.has(id)) return;

    const el = findHydrationElement(script);
    if (!el) return;

    const payload = parsePayload(script.textContent ?? "{}");
    hydratePayload(el, payload);
    hydrated.add(id);
  }

  function teardownElement(el: Element): void {
    const ctx = contexts.get(el);
    if (!ctx) return;

    ctx.controllers.forEach((ctrl) => ctrl.abort());
    ctx.controllers.clear();

    if (ctx.unmount.length) {
      ctx.unmount.forEach((entry) => {
        void invokeEntry(el, entry, "unmount", new Event("unmount"));
      });
      ctx.unmount.length = 0;
    }

    if (ctx.refs.length) {
      ctx.refs.forEach((ref) => {
        try {
          if (ref.get() === el) {
            ref.set(null);
          }
        } catch {
          /* ignore ref assignment errors */
        }
      });
      ctx.refs.length = 0;
    }

    contexts.delete(el);
  }

  const isHydrationScript = (node: Node): node is HTMLScriptElement =>
    node instanceof HTMLScriptElement &&
    (node.getAttribute("type") || "").toLowerCase() === "application/json" &&
    node.hasAttribute("data-hydrate");

  function seed(): void {
    document
      .querySelectorAll('script[type="application/json"][data-hydrate]')
      .forEach((node) => hydrateScript(node as HTMLScriptElement));
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes?.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (isHydrationScript(node)) {
          hydrateScript(node);
          return;
        }
        node
          .querySelectorAll('script[type="application/json"][data-hydrate]')
          .forEach((script) => hydrateScript(script as HTMLScriptElement));
      });

      mutation.removedNodes?.forEach((node) => {
        if (!(node instanceof Element)) return;
        teardownElement(node);
        node.querySelectorAll("*").forEach((child) => {
          teardownElement(child);
        });
      });
    }
  });

  seed();
  observer.observe(document, { childList: true, subtree: true });

  globalWindow.__ruwuter = Object.assign(globalWindow.__ruwuter ?? {}, {
    store,
  });
}

if (hasWindow) {
  initializeClientRuntime();
}

export {};

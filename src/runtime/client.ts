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

interface RegisteredUnmountHandler {
  controllerKey: string;
  entry: ModuleEntry;
}

interface ElementContext {
  bind: unknown;
  controllers: Map<string, AbortController>;
  unmount: RegisteredUnmountHandler[];
  refs: RefObject[];
}

interface SyntheticEventInit {
  currentTarget?: EventTarget | null;
}

type EventLike = Event & {
  currentTarget?: EventTarget | null;
  srcElement?: EventTarget | null;
  relatedTarget?: EventTarget | null;
  submitter?: HTMLElement | null;
  newState?: string;
  oldState?: string;
  source?: Element | null;
};

type BoundEventMethod = (...args: unknown[]) => unknown;

function synthesizeEvent<E extends Event>(event: E, init?: SyntheticEventInit): E {
  // Shallow wrapper whose prototype chain includes the original event.
  const baseEvent = event as EventLike;
  const snap = Object.create(event) as Record<string, unknown>;
  const define = (key: string, value: unknown) => {
    Object.defineProperty(snap, key, { value, configurable: true });
  };

  const currentTarget = init?.currentTarget ?? baseEvent.currentTarget ?? null;
  define("currentTarget", currentTarget);

  if ("srcElement" in baseEvent) {
    define("srcElement", baseEvent.srcElement ?? currentTarget);
  }

  // Freeze commonly inspected, timing-sensitive properties
  define("eventPhase", event.eventPhase);

  if (typeof event.composedPath === "function") {
    const path = event.composedPath();
    define("composedPath", () => (path ? path.slice() : []));
  }

  if ("relatedTarget" in baseEvent) {
    define("relatedTarget", baseEvent.relatedTarget);
  }

  if ("submitter" in baseEvent) {
    define("submitter", baseEvent.submitter ?? null);
  }

  // Popover toggle fields if present
  if (typeof baseEvent.newState === "string" || typeof baseEvent.oldState === "string") {
    define("newState", baseEvent.newState);
    define("oldState", baseEvent.oldState);
    define("source", baseEvent.source ?? null);
  }

  return snap as E;
}

function synthesizeLifecycleEvent(el: Element, type: "mount" | "unmount"): Event {
  const ev = new Event(type);
  return new Proxy(ev, {
    get(target, prop) {
      if (prop === "currentTarget") return el;
      const value = Reflect.get(target, prop as keyof Event);
      return typeof value === "function" ? (value as BoundEventMethod).bind(target) : value;
    },
  }) as Event;
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" && name === "AbortError";
}

// No global or exported hooks; loader is fixed to dynamic import

function initializeClientRuntime(): void {
  const loadModule = (spec: string) => {
    const base = (typeof document.baseURI === "string" && document.baseURI &&
        document.baseURI !== "about:blank")
      ? document.baseURI
      : (typeof globalThis.location?.href === "string"
        ? globalThis.location.href
        : "http://localhost/");
    const resolved = new URL(spec, base).href;
    return import(resolved);
  };

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
  const hydratedElements = new WeakSet<Element>();
  let controllerSequence = 0;

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
    controllerKey: string,
  ): Promise<void> {
    const fn = await resolveEntry(entry);
    if (!fn) return;
    const ctx = getContext(el);
    const controllers = ctx.controllers;

    if (typeof (globalThis as { document?: unknown }).document === "undefined") {
      const owner = el instanceof Element ? el.ownerDocument : null;
      if (owner) {
        (globalThis as { document?: Document }).document = owner;
      }
    }

    if (type === "unmount") {
      controllers.forEach((ctrl) => ctrl.abort());
      controllers.clear();
    }

    const controller = new AbortController();
    controllers.get(controllerKey)?.abort();
    controllers.set(controllerKey, controller);

    const eventForHandler = ev;

    try {
      await fn.call(ctx.bind ?? el, eventForHandler, controller.signal);
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) {
        return;
      }
      console.error(err);
    } finally {
      if (controllers.get(controllerKey) === controller) {
        controllers.delete(controllerKey);
      }
    }
  }

  function attachHandler(el: Element, entry: ModuleEntry): void {
    if (!entry || entry.t !== "m") return;
    const type = entry.ev && entry.ev.length > 0 ? entry.ev : "click";
    const controllerKey = `${type}:${controllerSequence++}`;

    if (type === "mount") {
      queueMicrotask(() =>
        invokeEntry(el, entry, "mount", synthesizeLifecycleEvent(el, "mount"), controllerKey)
      );
      return;
    }

    const ctx = getContext(el);
    if (type === "unmount") {
      ctx.unmount.push({ controllerKey, entry });
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
      if (preventDefault && event.cancelable) event.preventDefault();
      const synthetic = synthesizeEvent(event, { currentTarget: el });
      void invokeEntry(el, entry, type, synthetic, controllerKey);
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

  function hydrateScript(script: HTMLScriptElement): void {
    // Simple adjacency: the host element is the previous element sibling
    const el = script.previousElementSibling;
    if (!el || hydratedElements.has(el)) return;

    const payload = parsePayload(script.textContent ?? "{}");
    hydratePayload(el, payload);
    hydratedElements.add(el);
  }

  function teardownElement(el: Element): void {
    const ctx = contexts.get(el);
    if (!ctx) return;

    ctx.controllers.forEach((ctrl) => ctrl.abort());
    ctx.controllers.clear();

    if (ctx.unmount.length) {
      ctx.unmount.forEach(({ controllerKey, entry }) => {
        void invokeEntry(
          el,
          entry,
          "unmount",
          synthesizeLifecycleEvent(el, "unmount"),
          controllerKey,
        );
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

  const hydrateNode = (node: Node): void => {
    if (isHydrationScript(node)) {
      hydrateScript(node);
      return;
    }
    if (!(node instanceof Element)) return;
    node
      .querySelectorAll('script[type="application/json"][data-hydrate]')
      .forEach((script) => hydrateScript(script as HTMLScriptElement));
  };

  function seed(): void {
    document
      .querySelectorAll('script[type="application/json"][data-hydrate]')
      .forEach((node) => hydrateScript(node as HTMLScriptElement));
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes?.forEach((node) => hydrateNode(node));

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

  // Keep store internal; no globals/exports for tests or apps.
}

if (typeof window !== "undefined") {
  initializeClientRuntime();
}

export {};

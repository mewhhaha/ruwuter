// @ts-check

let started = false;

/**
 * Bootstraps the browser runtime that wires up client handlers, refs, and
 * function-valued attributes emitted by the server.
 */
export function startClientRuntime() {
  if (typeof window === "undefined") return;
  if (started) return;
  started = true;

  /**
   * Lazily imports ESM modules with in-memory caching so repeated handlers
   * do not trigger additional network requests.
   */
  const loadModule = (() => {
    const cache = new Map();
    return (spec) => {
      if (!cache.has(spec)) cache.set(spec, import(spec));
      return /** @type {Promise<Record<string, unknown>>} */ (cache.get(spec));
    };
  })();

  /**
   * Ref store that tracks values and dependency listeners so attribute
   * computations can re-run when refs change.
   */
  const store = (() => {
    /** @type {Map<string, unknown>} */
    const values = new Map();
    /** @type {Map<string, Set<() => void>>} */
    const listeners = new Map();
    /** @type {Map<string, RefObject>} */
    const refs = new Map();

    const ensure = (id, initial) => {
      if (!values.has(id)) values.set(id, initial);
      return values.get(id);
    };

    const set = (id, next) => {
      const current = values.get(id);
      const value = typeof next === "function" ? next(current) : next;
      values.set(id, value);
      const subs = listeners.get(id);
      if (subs) {
        const snapshot = Array.from(subs);
        snapshot.forEach((fn) => {
          try {
            fn();
          } catch {
            // Swallow subscriber errors to keep refs functional.
          }
        });
      }
    };

    const watch = (id, fn) => {
      let subs = listeners.get(id);
      if (!subs) {
        subs = new Set();
        listeners.set(id, subs);
      }
      subs.add(fn);
      return () => {
        const set = listeners.get(id);
        if (!set) return;
        set.delete(fn);
        if (set.size === 0) listeners.delete(id);
      };
    };

    const createRef = (id, initial) => {
      ensure(id, initial);
      if (!refs.has(id)) {
        const ref = /** @type {RefObject} */ ({
          id,
          get: () => values.get(id),
          set: (next) => set(id, next),
          toJSON: () => ({ __ref: true, i: id, v: values.get(id) }),
        });
        refs.set(id, ref);
      }
      return /** @type {RefObject} */ (refs.get(id));
    };

    return {
      set,
      get: (id) => values.get(id),
      watch,
      ref: createRef,
    };
  })();

  /**
   * Element-local context storage.
   * @type {WeakMap<Element, ElementContext>}
   */
  const contexts = new WeakMap();

  /**
   * Tracks hydrated boundary ids so we do not double-initialize elements.
   * @type {Set<string>}
   */
  const hydrated = new Set();

  /**
   * Revives refs embedded in the hydration payload.
   * @param {string} _key
   * @param {unknown} value
   */
  function revive(_key, value) {
    if (
      value &&
      typeof value === "object" &&
      value.__ref === true &&
      typeof value.i === "string"
    ) {
      const id = value.i;
      const initial = "v" in value ? value.v : undefined;
      return store.ref(id, initial);
    }
    return value;
  }

  /**
   * Parses the JSON payload guarding against malformed data.
   * @param {string} text
   * @returns {HydrationPayload}
   */
  function parsePayload(text) {
    try {
      return JSON.parse(text, revive) ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Resolves (and caches) the function backing a module entry.
   * @param {ModuleEntry} entry
   */
  async function resolveEntry(entry) {
    if (!entry || entry.t !== "m") return undefined;
    const mod = await loadModule(entry.s);
    const candidate =
      entry.x && typeof mod[entry.x] === "function"
        ? mod[entry.x]
        : typeof mod.default === "function"
          ? mod.default
          : typeof mod === "function"
            ? mod
            : undefined;
    return /** @type {ClientFn | undefined} */ (candidate);
  }

  /**
   * Returns or creates the context record for an element.
   * @param {Element} el
   * @returns {ElementContext}
   */
  function getContext(el) {
    let ctx = contexts.get(el);
    if (!ctx) {
      ctx = {
        bind: undefined,
        controllers: new Map(),
        unmount: [],
        attrCleanups: new Map(),
        attrScopes: new Map(),
      };
      contexts.set(el, ctx);
    }
    return ctx;
  }

  /**
   * Calls a handler entry with the correct `this`, event, and abort signal.
   * @param {Element} el
   * @param {ModuleEntry} entry
   * @param {string} type
   * @param {Event} ev
   */
  async function invokeEntry(el, entry, type, ev) {
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

    try {
      await fn.call(ctx.bind ?? el, ev, controller.signal);
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err && typeof err === "object" && "name" in err && err.name === "AbortError")
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

  /**
   * Wires up an individual handler entry.
   * @param {Element} el
   * @param {ModuleEntry} entry
   */
  function attachHandler(el, entry) {
    if (!entry || entry.t !== "m") return;
    const type =
      entry.ev && typeof entry.ev === "string" && entry.ev.length > 0
        ? entry.ev
        : "click";

    if (type === "mount") {
      queueMicrotask(() => invokeEntry(el, entry, "mount", new Event("mount")));
      return;
    }

    const ctx = getContext(el);
    if (type === "unmount") {
      ctx.unmount.push(entry);
      return;
    }

    el.addEventListener(type, (event) => {
      invokeEntry(el, entry, type, event);
    });
  }

  /**
   * Applies class/boolean/default attribute updates.
   * @param {Element} el
   * @param {string} name
   * @param {unknown} value
   */
  function setComputedAttr(el, name, value) {
    if (name === "class") {
      const text = value == null ? "" : String(value);
      el.setAttribute("class", text);
      try {
        if ("className" in el) el.className = text;
      } catch {
        // ignore DOM exceptions when className is read-only
      }
      return;
    }

    if (name === "hidden" || name === "disabled" || name === "inert") {
      if (value) el.setAttribute(name, "");
      else el.removeAttribute(name);
      return;
    }

    if (value == null) {
      el.removeAttribute(name);
    } else {
      el.setAttribute(name, String(value));
    }
  }

  /**
   * Recursively collects ref objects from an arbitrary structure.
   * @param {unknown} value
   * @param {(ref: RefObject) => void} visit
   * @param {Set<unknown>} [seen]
   */
  function collectRefs(value, visit, seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (
      typeof (/** @type {Record<string, unknown>} */ (value)).id === "string" &&
      typeof (/** @type {Record<string, unknown>} */ (value)).get === "function" &&
      typeof (/** @type {Record<string, unknown>} */ (value)).set === "function"
    ) {
      visit(/** @type {RefObject} */ (value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectRefs(item, visit, seen));
      return;
    }
    for (const key in value) {
      collectRefs(
        /** @type {Record<string, unknown>} */ (value)[key],
        visit,
        seen,
      );
    }
  }

  /**
   * Sets up a function-valued attribute so it recomputes whenever any
   * referenced ref changes.
   * @param {Element} el
   * @param {AttrEntry} spec
   */
  function bindComputedAttr(el, spec) {
    if (!spec || typeof spec.n !== "string" || !spec.e || spec.e.t !== "m") return;

    const ctx = getContext(el);
    const key = `${spec.n}:${spec.e.s}:${spec.e.x ?? ""}`;

    ctx.attrCleanups.get(key)?.();

    const scopeMap = ctx.attrScopes;
    if (!scopeMap.has(key)) {
      const args = spec.a && typeof spec.a === "object" ? spec.a : {};
      scopeMap.set(key, args);
    }
    const scope = scopeMap.get(key);

    /** @type {Set<() => void>} */
    const unsubs = new Set();
    let token = 0;

    const run = async () => {
      const current = ++token;
      unsubs.forEach((dispose) => dispose());
      unsubs.clear();

      const fn = await resolveEntry(spec.e);
      if (token !== current || !fn) return;

      let result;
      try {
        result = await fn.call(scope, new Event("update"), new AbortController().signal);
      } catch {
        return;
      }

      if (token !== current) return;
      setComputedAttr(el, spec.n, result);

      collectRefs(scope, (ref) => {
        unsubs.add(store.watch(ref.id, run));
      });
    };

    run();

    ctx.attrCleanups.set(key, () => {
      unsubs.forEach((dispose) => dispose());
      unsubs.clear();
    });
  }

  /**
   * Applies the hydration payload to an element.
   * @param {Element} el
   * @param {HydrationPayload} payload
   */
  function hydratePayload(el, payload) {
    if (!payload || typeof payload !== "object") return;
    const ctx = getContext(el);

    if (payload.bind !== undefined) {
      ctx.bind = payload.bind;
    }

    if (Array.isArray(payload.on)) {
      payload.on.forEach((entry) => attachHandler(el, entry));
    }

    if (Array.isArray(payload.attrs)) {
      payload.attrs.forEach((attr) => bindComputedAttr(el, attr));
    }
  }

  /**
   * Attempts to find the element associated with a hydration script.
   * @param {HTMLScriptElement} script
   */
  function findHydrationElement(script) {
    const id = script.getAttribute("data-hydrate") || "";
    if (!id) return null;

    let node = script.previousSibling;
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return /** @type {Element} */ (node);
      }
      if (
        node.nodeType === Node.COMMENT_NODE &&
        (node.data === `/rw:h:${id}` || node.data === `/hydration-boundary:${id}`)
      ) {
        let prev = node.previousSibling;
        while (prev && prev.nodeType !== Node.ELEMENT_NODE) prev = prev.previousSibling;
        if (prev && prev.nodeType === Node.ELEMENT_NODE) {
          return /** @type {Element} */ (prev);
        }
      }
      node = node.previousSibling;
    }
    return null;
  }

  /**
   * Hydrates an individual script boundary.
   * @param {HTMLScriptElement} script
   */
  function hydrateScript(script) {
    const id = script.getAttribute("data-hydrate") || "";
    if (!id || hydrated.has(id)) return;

    const el = findHydrationElement(script);
    if (!el) return;

    const payload = parsePayload(script.textContent || "{}");
    hydratePayload(el, payload);
    hydrated.add(id);
  }

  /**
   * Cleans up controllers, watchers, and unmount handlers for a detached node.
   * @param {Element} el
   */
  function teardownElement(el) {
    const ctx = contexts.get(el);
    if (!ctx) return;

    ctx.controllers.forEach((ctrl) => ctrl.abort());
    ctx.controllers.clear();

    if (ctx.unmount.length) {
      ctx.unmount.forEach((entry) => {
        invokeEntry(el, entry, "unmount", new Event("unmount"));
      });
      ctx.unmount.length = 0;
    }

    ctx.attrCleanups.forEach((dispose) => dispose());
    ctx.attrCleanups.clear();

    contexts.delete(el);
  }

  const isHydrationScript = (node) =>
    node instanceof HTMLScriptElement &&
    (node.getAttribute("type") || "").toLowerCase() === "application/json" &&
    node.hasAttribute("data-hydrate");

  /**
   * Seeds existing hydration scripts on initial load.
   */
  function seed() {
    document
      .querySelectorAll('script[type="application/json"][data-hydrate]')
      .forEach((node) => hydrateScript(/** @type {HTMLScriptElement} */ (node)));
  }

  /**
   * Processes addition/removal mutations to hydrate or tear down nodes.
   */
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes?.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (isHydrationScript(node)) {
          hydrateScript(/** @type {HTMLScriptElement} */ (node));
          return;
        }
        node
          .querySelectorAll('script[type="application/json"][data-hydrate]')
          .forEach((script) => hydrateScript(/** @type {HTMLScriptElement} */ (script)));
      });

      mutation.removedNodes?.forEach((node) => {
        if (!(node instanceof Element)) return;
        teardownElement(node);
        node.querySelectorAll("*").forEach((child) => {
          teardownElement(/** @type {Element} */ (child));
        });
      });
    }
  });

  seed();
  observer.observe(document, { childList: true, subtree: true });

  window.__ruwuter = Object.assign(window.__ruwuter || {}, {
    store,
  });
}

/**
 * @typedef {{ id: string; get(): unknown; set(next: unknown): void; toJSON(): { __ref: true; i: string; v: unknown } }} RefObject
 * @typedef {{ bind: any; controllers: Map<string, AbortController>; unmount: ModuleEntry[]; attrCleanups: Map<string, () => void>; attrScopes: Map<string, Record<string, unknown>> }} ElementContext
 * @typedef {{ t: "m"; s: string; x?: string; ev?: string }} ModuleEntry
 * @typedef {(this: any, ev: Event, signal: AbortSignal) => unknown} ClientFn
 * @typedef {{ n: string; e: ModuleEntry; a?: Record<string, unknown> }} AttrEntry
 * @typedef {{ bind?: any; on?: ModuleEntry[]; attrs?: AttrEntry[] }} HydrationPayload
 */

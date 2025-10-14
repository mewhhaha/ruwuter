export default function () {
  // @ts-check
  /**
   * Ruwuter client runtime (injected as a module script)
   * Minimal ESNext DOM implementation.
   */

  /** @typedef {{t:'m', s:string, x?:string, ev?:string}} Entry */
  /** @typedef {{el: Element, attr: string, entry: Entry, args: Record<string, any>, key: string}} Watch */

  /** @type {Map<string, Promise<any>>} */
  const loaded = new Map();
  /** @param {string} spec */
  async function load(spec) {
    let p = loaded.get(spec);
    if (!p) {
      p = import(spec);
      loaded.set(spec, p);
    }
    return p;
  }

  /** @type {Map<string, any>} */
  const state = new Map();
  /** @type {Map<string, Set<Watch>>} */
  const watchers = new Map(); // id -> Set<Watch>

  // Per-element state via WeakMaps (bind, ctx, controllers, unmount entries)
  /** @type {WeakMap<Element, any>} */
  const wmBind = new WeakMap();
  /** @type {WeakMap<Element, Record<string, any>>} */
  const wmCtx = new WeakMap();
  /** @type {WeakMap<Element, Entry[]>} */
  const wmUnmount = new WeakMap();
  /** @type {WeakMap<Element, Map<string, AbortController>>} */
  const wmCtrl = new WeakMap();

  /**
   * @param {string} id
   * @param {any|((prev:any)=>any)} next
   */
  function set(id, next) {
    const prev = state.get(id);
    const val = typeof next === "function" ? next(prev) : next;
    state.set(id, val);
    const setFor = watchers.get(id);
    if (setFor)
      setFor.forEach((b) => {
        try {
          applyAttr(b.el, b.attr, b.entry, b.args, b.key);
        } catch {}
      });
  }
  /** @param {string} id */
  function get(id) {
    return state.get(id);
  }

  /** @param {string} _key @param {any} value */
  function revive(_key, value) {
    if (
      value &&
      typeof value === "object" &&
      value.__ref === true &&
      typeof value.i === "string"
    ) {
      const id = value.i;
      if (!state.has(id) && "v" in value) state.set(id, value.v);
      return {
        id,
        get() {
          return get(id);
        },
        set(/** @type {any | ((prev:any)=>any)} */ next) {
          return set(id, next);
        },
      };
    }
    return value;
  }
  /** @param {string} text */
  function parseJson(text) {
    try {
      return JSON.parse(text, revive);
    } catch {
      return null;
    }
  }

  /**
   * @template T
   * @param {any} el
   * @param {string} key
   * @param {T} init
   * @returns {T}
   */
  function getCtx(el, key, init) {
    /** @type {Record<string, any>} */
    let bag =
      wmCtx.get(el) || /** @type {Record<string, any>} */ (Object.create(null));
    if (!wmCtx.has(el)) wmCtx.set(el, bag);
    if (key in bag) return bag[key];
    bag[key] = init;
    return init;
  }

  /** @param {Record<string, any>} ctx */
  function collectRefIds(ctx) {
    const ids = new Set();
    for (const k in ctx) {
      const v = ctx[k];
      if (v && typeof v === "object" && typeof v.id === "string") ids.add(v.id);
    }
    return ids;
  }

  /**
   * @param {any} entry
   * @param {Element} el
   * @param {Event} ev
   * @param {string} type
   */
  async function runEntry(entry, el, ev, type) {
    if (!entry || entry.t !== "m") return;
    const mod = await load(entry.s);
    const fn = entry.x && mod[entry.x] ? mod[entry.x] : (mod.default ?? mod);
    /** @type {Map<string, AbortController>} */
    const controllers = wmCtrl.get(el) || new Map();
    if (!wmCtrl.has(el)) wmCtrl.set(el, controllers);
    const prev = controllers.get(type);
    try {
      prev?.abort?.();
    } catch {}
    const ac = new AbortController();
    controllers.set(type, ac);
    const thisArg = wmBind.get(el) ?? el;
    await fn.call(thisArg, ev, ac.signal);
  }

  /**
   * @param {Element} el
   * @param {string} attr
   * @param {Entry} entry
   * @param {Record<string, any>} args
   * @param {string} key
   */
  async function applyAttr(el, attr, entry, args, key) {
    if (!entry || entry.t !== "m") return;
    const mod = await load(entry.s);
    const fn = entry.x && mod[entry.x] ? mod[entry.x] : (mod.default ?? mod);
    const ctx = getCtx(
      el,
      key,
      (args && typeof args === "object" && args) || {},
    );
    let result;
    try {
      result = await fn.call(
        ctx,
        new Event("update"),
        new AbortController().signal,
      );
    } catch {
      return;
    }
    if (attr === "class") {
      el.setAttribute("class", result == null ? "" : String(result));
    } else if (attr === "hidden" || attr === "disabled" || attr === "inert") {
      if (result) el.setAttribute(attr, "");
      else el.removeAttribute(attr);
    } else {
      if (result == null) el.removeAttribute(attr);
      else el.setAttribute(attr, String(result));
    }
    const ids = collectRefIds(ctx);
    ids.forEach((id) => {
      let watcher = watchers.get(id);
      watcher ??= new Set();
      watchers.set(id, watcher);
      watcher.add({ el, attr, entry, args, key });
    });
  }

  function hydrate() {
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
    const seen = new Set();
    let node = walker.nextNode();
    while (node instanceof Comment) {
      const id = extractBoundaryId(node);
      if (!id || seen.has(id)) {
        node = walker.nextNode();
        continue;
      }
      const el = findBoundaryElement(node);
      if (!el) {
        seen.add(id);
        node = walker.nextNode();
        continue;
      }
      const payload = readBoundaryPayload(el, id);
      if (!payload) {
        seen.add(id);
        node = walker.nextNode();
        continue;
      }
      if (payload.bind !== undefined) wmBind.set(el, payload.bind);
      if (Array.isArray(payload.on)) {
        for (const entry of payload.on) {
          const ev =
            entry && typeof entry.ev === "string" && entry.ev
              ? entry.ev
              : "click";
          if (ev === "mount")
            setTimeout(() => {
              runEntry(entry, el, new Event("mount"), "mount");
            }, 0);
          else if (ev === "unmount") {
            const list = wmUnmount.get(el) || [];
            list.push(entry);
            wmUnmount.set(el, list);
          } else
            el.addEventListener(ev, (e) => {
              runEntry(entry, el, e, ev);
            });
        }
      }
      if (Array.isArray(payload.attrs)) {
        for (const item of payload.attrs) {
          if (!item || typeof item.n !== "string" || !item.e) continue;
          const key = `attr:${item.n}:${item.e.s}:${item.e.x || ""}`;
          applyAttr(el, item.n, item.e, item.a || {}, key);
        }
      }
      seen.add(id);
      node = walker.nextNode();
    }
  }

  /** @param {Comment} node */
  function extractBoundaryId(node) {
    const m = /^rw:h:([A-Za-z0-9_-]+)/.exec(node.data || "");
    return m ? m[1] : "";
  }

  /** @param {Comment} node */
  function findBoundaryElement(node) {
    let el = node.nextSibling;
    while (el && el.nodeType !== 1) el = el.nextSibling;
    return el && el.nodeType === 1 ? /** @type {Element} */ (el) : null;
  }

  /**
   * @param {Element} el
   * @param {string} id
   */
  function readBoundaryPayload(el, id) {
    let sc = el.nextSibling;
    while (sc) {
      if (
        sc.nodeType === 1 &&
        /** @type {Element} */ (sc).tagName === "SCRIPT" &&
        /** @type {Element} */ (sc).getAttribute("data-rw-h") === id
      )
        break;
      sc = sc.nextSibling;
    }
    if (!(sc && sc.nodeType === 1)) return null;
    return parseJson(/** @type {Element} */ (sc).textContent || "{}") || {};
  }

  // attribute binding moved to hydration payload; no DOM-wide scan needed

  function observeRemovals() {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.removedNodes)
          m.removedNodes.forEach((n) => {
            if (!(n instanceof Element)) return;
            const map = wmCtrl.get(n);
            if (map && map.forEach) {
              try {
                map.forEach((c) => {
                  try {
                    c.abort?.();
                  } catch {}
                });
              } catch {}
            }
            const list = wmUnmount.get(n);
            if (Array.isArray(list))
              list.forEach((entry) => {
                runEntry(entry, n, new Event("unmount"), "unmount");
              });
          });
      }
    });
    mo.observe(document, { childList: true, subtree: true });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => {
      hydrate();
    });
  else {
    hydrate();
  }
  observeRemovals();

  // expose minimal API
  // @ts-ignore
  window.__client = Object.assign(window.__client || {}, {
    load,
    set,
    get,
    state,
  });
}

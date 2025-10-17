// @ts-check
let started = false;

/**
 * Bootstraps the client-side runtime used for on/ref hydration.
 */
export function startClientRuntime() {
  if (typeof window === "undefined") return;
  if (started) return;
  started = true;

  const globalClient = (window.__client = Object.assign(window.__client || {}, {}));

  const loaded = new Map();
  function load(spec) {
    let p = loaded.get(spec);
    if (!p) {
      p = import(spec);
      loaded.set(spec, p);
    }
    return p;
  }

  const state = new Map();
  const watchers = new Map();
  const elIds = new WeakMap();
  let elSeq = 0;
  const getElId = (el) => {
    let id = elIds.get(el);
    if (!id) {
      id = `e${++elSeq}`;
      elIds.set(el, id);
    }
    return id;
  };

  const wmBind = new WeakMap();
  const wmCtx = new WeakMap();
  const wmUnmount = new WeakMap();
  const wmCtrl = new WeakMap();

  function set(id, next) {
    const prev = state.get(id);
    const val = typeof next === "function" ? next(prev) : next;
    state.set(id, val);
    const map = watchers.get(id);
    if (!map) return;
    for (const b of map.values()) computeAttr(b.el, b.attr, b.entry, b.args, b.key);
  }
  function get(id) {
    return state.get(id);
  }

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
        set(next) {
          return set(id, next);
        },
      };
    }
    return value;
  }
  function parseJson(text) {
    try {
      return JSON.parse(text, revive);
    } catch {
      return null;
    }
  }

  function getCtx(el, key, init) {
    const bag = wmCtx.get(el) || Object.create(null);
    if (!wmCtx.has(el)) wmCtx.set(el, bag);
    if (key in bag) return bag[key];
    bag[key] = init;
    return init;
  }

  function collectRefIds(ctx) {
    const ids = new Set();
    for (const k in ctx) {
      const v = ctx[k];
      if (v && typeof v === "object" && typeof v.id === "string") ids.add(v.id);
    }
    return ids;
  }

  async function runEntry(entry, el, ev, type) {
    if (!entry || entry.t !== "m") return;
    const mod = await load(entry.s);
    const fn = entry.x && mod[entry.x] ? mod[entry.x] : mod.default ?? mod;
    const controllers = wmCtrl.get(el) || new Map();
    if (!wmCtrl.has(el)) wmCtrl.set(el, controllers);
    controllers.get(type)?.abort?.();
    const ac = new AbortController();
    controllers.set(type, ac);
    const thisArg = wmBind.get(el) ?? el;
    await fn.call(thisArg, ev, ac.signal);
  }

  async function computeAttr(el, attr, entry, args, key) {
    if (!entry || entry.t !== "m") return;
    const mod = await load(entry.s);
    const fn = entry.x && mod[entry.x] ? mod[entry.x] : mod.default ?? mod;
    const ctx = getCtx(
      el,
      key,
      (args && typeof args === "object" && args) || {},
    );
    let result;
    try {
      result = await fn.call(ctx, new Event("update"), new AbortController().signal);
    } catch {
      return;
    }
    setComputedAttr(el, attr, result);
    const ids = collectRefIds(ctx);
    const bindingKey = `${getElId(el)}|${key}`;
    ids.forEach((id) => {
      let map = watchers.get(id);
      if (!map) {
        map = new Map();
        watchers.set(id, map);
      }
      map.set(bindingKey, { el, attr, entry, args, key });
    });
  }

  function setComputedAttr(el, name, value) {
    if (name === "class") {
      const v = value == null ? "" : String(value);
      el.setAttribute("class", v);
      try { if ("className" in el) el.className = v; } catch { /* ignore */ }
      return;
    }
    if (name === "hidden" || name === "disabled" || name === "inert") {
      if (value) el.setAttribute(name, "");
      else el.removeAttribute(name);
      return;
    }
    if (value == null) el.removeAttribute(name);
    else el.setAttribute(name, String(value));
  }

  const hydrated = new Set();

  function hydrateBoundary(id, el, payload) {
    if (!id || hydrated.has(id)) return;
    if (payload && payload.bind !== undefined) wmBind.set(el, payload.bind);
    if (Array.isArray(payload.on)) {
      for (const entry of payload.on) {
        const ev = entry && typeof entry.ev === "string" && entry.ev ? entry.ev : "click";
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
        computeAttr(el, item.n, item.e, item.a || {}, key);
      }
    }
    hydrated.add(id);
  }

  function elementForEndComment(endComment) {
    const prev = endComment.previousSibling;
    return prev && prev.nodeType === 1 ? prev : null;
  }

  function hydrateFromScript(sc) {
    if (!sc || (sc.tagName || "").toUpperCase() !== "SCRIPT") return;
    const id = sc.getAttribute("data-hydrate") || "";
    if (!id || hydrated.has(id)) return;
    let cur = sc.previousSibling;
    let el = null;
    let steps = 0;
    while (cur && steps++ < 100) {
      if (cur.nodeType === 3 && !/\S/.test(cur.textContent || "")) {
        cur = cur.previousSibling;
        continue;
      }
      if (cur.nodeType === 1 && cur.tagName?.toUpperCase() === "SCRIPT") {
        break;
      }
      if (cur.nodeType === 8 && cur.data === `/hydration-boundary:${id}`) {
        el = elementForEndComment(cur);
        break;
      }
      if (cur.nodeType === 8 && cur.data === `hydration-boundary:${id}`) {
        let ne = cur.nextSibling;
        while (ne && ne.nodeType !== 1) ne = ne.nextSibling;
        if (ne && ne.nodeType === 1) el = ne;
        break;
      }
      cur = cur.previousSibling;
    }
    if (!el) {
      let n = sc.previousSibling;
      while (n && n.nodeType !== 1) n = n.previousSibling;
      if (n && n.nodeType === 1) el = n;
    }
    if (!el) return;
    const payload = parseJson(sc.textContent || "{}") || {};
    hydrateBoundary(id, el, payload);
  }

  function seedHydration() {
    const nodes = document.querySelectorAll('script[type="application/json"][data-hydrate]');
    nodes.forEach((n) => hydrateFromScript(n));
  }

  function watchHydration() {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes?.forEach((n) => {
          if (!(n && n.nodeType === 1)) return;
          const isHydrationScript =
            (n.tagName || "").toUpperCase() === "SCRIPT" &&
            (n.getAttribute("type") || "").toLowerCase() === "application/json" &&
            n.hasAttribute("data-hydrate");
          if (isHydrationScript) {
            hydrateFromScript(n);
            return;
          }
          n
            .querySelectorAll('script[type="application/json"][data-hydrate]')
            .forEach((s) => hydrateFromScript(s));
        });
      }
    });
    mo.observe(document, { childList: true, subtree: true });
  }

  function watchRemovals() {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.removedNodes?.forEach((n) => {
          if (!(n instanceof Element)) return;
          const map = wmCtrl.get(n);
          if (map) for (const c of map.values()) c.abort?.();
          const id = elIds.get(n);
          if (id) {
            for (const w of watchers.values()) {
              for (const k of Array.from(w.keys())) if (k.startsWith(id + "|")) w.delete(k);
            }
          }
          const list = wmUnmount.get(n);
          if (Array.isArray(list)) list.forEach((e) => runEntry(e, n, new Event("unmount"), "unmount"));
        });
      }
    });
    mo.observe(document, { childList: true, subtree: true });
  }

  seedHydration();
  watchHydration();
  watchRemovals();

  Object.assign(globalClient, {
    load,
    set,
    get,
    state,
  });
}

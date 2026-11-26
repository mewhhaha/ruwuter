/**
 * @module
 *
 * Optional cross-document MPA View Transition runtime.
 * Activates `data-rw-vt` elements just-in-time on `pageswap` and `pagereveal`,
 * adds directional transition types (`forward` / `back` / `reload`), and cleans up
 * inline styles after `finished` so BFCache restores without stale stacking contexts.
 */

type NavigationEntryLike = {
  readonly url?: string | null;
  readonly index?: number;
};

type NavigationActivationLike = {
  readonly navigationType?: string;
  readonly from?: NavigationEntryLike | null;
  readonly entry?: NavigationEntryLike | null;
};

type ViewTransitionLike = {
  readonly finished: Promise<void>;
  readonly types?: { add(type: string): void };
};

type PageSwapEventLike = Event & {
  readonly viewTransition?: ViewTransitionLike | null;
  readonly activation?: NavigationActivationLike | null;
};

type PageRevealEventLike = Event & {
  readonly viewTransition?: ViewTransitionLike | null;
};

const VT_ATTR = "data-rw-vt";
const VT_FOR_ATTR = "data-rw-vt-for";
const VT_CLASS_ATTR = "data-rw-vt-class";

const pathnameOf = (url?: string | null): string | null => {
  if (!url) return null;
  try {
    return new URL(url, globalThis.location?.href).pathname;
  } catch {
    return null;
  }
};

const directionOf = (activation?: NavigationActivationLike | null): string | undefined => {
  const navType = activation?.navigationType;
  if (!navType) return undefined;
  if (navType === "reload") return "reload";
  if (navType === "traverse") {
    const fromIndex = activation?.from?.index;
    const toIndex = activation?.entry?.index;
    if (typeof fromIndex === "number" && typeof toIndex === "number") {
      return toIndex < fromIndex ? "back" : "forward";
    }
    return "traverse";
  }
  return "forward";
};

const matchesTarget = (spec: string | null, pathname: string | null): boolean => {
  if (!spec || spec === "*") return true;
  if (!pathname) return false;
  return spec.split(/\s+/).includes(pathname);
};

const activate = (
  viewTransition: ViewTransitionLike,
  activation: NavigationActivationLike | null | undefined,
  targetPathname: string | null,
): void => {
  const direction = directionOf(activation);
  if (direction) viewTransition.types?.add(direction);

  const usedNames = new Set<string>();
  const applied: Array<{ el: HTMLElement; prevName: string; prevClass: string }> = [];

  for (const el of document.querySelectorAll<HTMLElement>(`[${VT_ATTR}]`)) {
    const name = el.getAttribute(VT_ATTR);
    if (!name || usedNames.has(name)) continue;
    if (!matchesTarget(el.getAttribute(VT_FOR_ATTR), targetPathname)) continue;

    usedNames.add(name);
    const prevName = el.style.getPropertyValue("view-transition-name");
    const prevClass = el.style.getPropertyValue("view-transition-class");
    el.style.setProperty("view-transition-name", name);
    const cls = el.getAttribute(VT_CLASS_ATTR);
    if (cls) el.style.setProperty("view-transition-class", cls);
    applied.push({ el, prevName, prevClass });
  }

  if (applied.length === 0) return;

  const restore = () => {
    for (const { el, prevName, prevClass } of applied) {
      if (prevName) el.style.setProperty("view-transition-name", prevName);
      else el.style.removeProperty("view-transition-name");
      if (prevClass) el.style.setProperty("view-transition-class", prevClass);
      else el.style.removeProperty("view-transition-class");
    }
  };

  void viewTransition.finished.then(restore, restore);
};

const INSTALLED = Symbol.for("ruwuter.vt.v1");

if (typeof document !== "undefined" && typeof globalThis.addEventListener === "function") {
  if (!Reflect.has(document, INSTALLED)) {
    Reflect.set(document, INSTALLED, true);

    globalThis.addEventListener("pageswap", (event) => {
      const swapEvent = event as PageSwapEventLike;
      if (!swapEvent.viewTransition) return;
      const toPath = pathnameOf(swapEvent.activation?.entry?.url);
      activate(swapEvent.viewTransition, swapEvent.activation, toPath);
    });

    globalThis.addEventListener("pagereveal", (event) => {
      const revealEvent = event as PageRevealEventLike;
      if (!revealEvent.viewTransition) return;
      const activation = (
        globalThis as {
          navigation?: { activation?: NavigationActivationLike | null };
        }
      ).navigation?.activation;
      const fromPath = pathnameOf(activation?.from?.url);
      activate(revealEvent.viewTransition, activation, fromPath);
    });
  }
}

export {};

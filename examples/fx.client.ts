import { defineController, on, swap, type SwapMode } from "@mewhhaha/ruwuter/browser";

export type FxRequestConfig = {
  action: string;
  method: string;
  headers: Record<string, string>;
  body: BodyInit | null;
  target: Element;
  errorTarget: Element | null;
  swap: SwapMode;
  viewTransition: boolean;
  allowStatus: (status: number, response: Response) => boolean;
  trigger: Event;
  element: Element;
};

const defaultTrigger = (element: Element): string => {
  if (element instanceof HTMLFormElement) return "submit";
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return "change";
  }
  return "click";
};

const resolveTarget = (element: Element, spec: string | null): Element => {
  if (!spec) return element;
  if (spec.startsWith("closest ")) {
    const matched = element.closest(spec.slice(8).trim());
    if (!matched) throw new Error(`fx: no ancestor matches "${spec}".`);
    return matched;
  }
  const matched = document.querySelector(spec);
  if (!matched) throw new Error(`fx: no element matches "${spec}".`);
  return matched;
};

const resolveAction = (element: Element, submitter: HTMLElement | null): string => {
  const attr = element.getAttribute("fx-action");
  if (attr) return attr;
  if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
    const formAction = submitter.getAttribute("formaction");
    if (formAction) return formAction;
  }
  if (element instanceof HTMLFormElement) {
    return element.getAttribute("action") ?? globalThis.location.href;
  }
  if (element instanceof HTMLAnchorElement) {
    return element.getAttribute("href") ?? globalThis.location.href;
  }
  return globalThis.location.href;
};

const resolveMethod = (element: Element, submitter: HTMLElement | null): string => {
  const attr = element.getAttribute("fx-method");
  if (attr) return attr.toUpperCase();
  if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
    const formMethod = submitter.getAttribute("formmethod");
    if (formMethod) return formMethod.toUpperCase();
  }
  if (element instanceof HTMLFormElement) {
    return (element.getAttribute("method") ?? "GET").toUpperCase();
  }
  return "GET";
};

const buildRequestBody = (
  element: Element,
  method: string,
  action: string,
  submitter: HTMLElement | null,
): { action: string; body: BodyInit | null } => {
  let data: FormData | undefined;
  if (element instanceof HTMLFormElement) {
    data = new FormData(element, submitter ?? undefined);
  } else if (
    (element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement) &&
    element.name
  ) {
    data = new FormData();
    data.append(element.name, element.value);
  }
  if (!data) return { action, body: null };
  if (method === "GET" || method === "HEAD") {
    const url = new URL(action, globalThis.location.href);
    const params = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      if (typeof value === "string") params.append(key, value);
    }
    url.search = params.toString();
    return { action: url.toString(), body: null };
  }
  return { action, body: data };
};

const emit = (
  element: Element,
  type: string,
  detail: Record<string, unknown>,
  cancelable = false,
): boolean => {
  return element.dispatchEvent(new CustomEvent(type, { bubbles: true, cancelable, detail }));
};

/**
 * Reusable fixi.js-style progressive-enhancement controller backed by Ruwuter's `swap()`.
 *
 * Mount once on a region (`<main {...fx.root()}>`) to declaratively handle `fx-action`,
 * `fx-method`, `fx-target`, `fx-swap`, `fx-trigger`, `fx-debounce`, `fx-error-target`,
 * `fx-reset`, and `fx-transition` attributes via event delegation.
 */
export default defineController(({ root, signal }) => {
  const inflight = new WeakMap<Element, AbortController>();
  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
  const activeTimers = new Set<ReturnType<typeof setTimeout>>();

  const run = async (element: Element, trigger: Event): Promise<void> => {
    const submitter = trigger instanceof SubmitEvent ? trigger.submitter : null;
    const method = resolveMethod(element, submitter);
    const rawAction = resolveAction(element, submitter);
    const { action, body } = buildRequestBody(element, method, rawAction, submitter);
    const target = resolveTarget(element, element.getAttribute("fx-target"));
    const errorSpec = element.getAttribute("fx-error-target");
    const errorTarget = errorSpec ? resolveTarget(element, errorSpec) : null;

    const cfg: FxRequestConfig = {
      action,
      method,
      headers: { "FX-Request": "true" },
      body,
      target,
      errorTarget,
      swap: (element.getAttribute("fx-swap") as SwapMode | null) ?? "outerHTML",
      viewTransition: element.hasAttribute("fx-transition"),
      allowStatus: (status) => status < 500,
      trigger,
      element,
    };

    if (!emit(element, "fx:config", { cfg }, true)) return;

    inflight.get(element)?.abort();
    const requestAbort = new AbortController();
    inflight.set(element, requestAbort);
    const combinedSignal = AbortSignal.any([signal, requestAbort.signal]);

    if (!emit(element, "fx:before", { cfg }, true)) return;

    element.setAttribute("aria-busy", "true");
    cfg.target.setAttribute("aria-busy", "true");
    try {
      const response = await fetch(cfg.action, {
        method: cfg.method,
        headers: cfg.headers,
        body: cfg.body,
        signal: combinedSignal,
      });

      if (!emit(element, "fx:after", { cfg, response }, true)) return;

      const isClientError = response.status >= 400 && response.status < 500;
      const swapTarget = isClientError && cfg.errorTarget ? cfg.errorTarget : cfg.target;
      const swapWrite = isClientError && cfg.errorTarget ? "innerHTML" : cfg.swap;

      const result = await swap(response, {
        target: swapTarget,
        write: swapWrite,
        allowStatus: cfg.allowStatus,
        viewTransition: cfg.viewTransition,
        init: { signal: combinedSignal },
      });

      if (!isClientError) {
        if (cfg.errorTarget) cfg.errorTarget.textContent = "";
        if (element instanceof HTMLFormElement && element.hasAttribute("fx-reset")) {
          element.reset();
        }
      }

      emit(element, "fx:swapped", { cfg, result });
    } catch (error) {
      if (combinedSignal.aborted) return;
      emit(element, "fx:error", { cfg, error });
    } finally {
      if (inflight.get(element) === requestAbort) {
        inflight.delete(element);
        element.removeAttribute("aria-busy");
        cfg.target.removeAttribute("aria-busy");
      }
      emit(element, "fx:finally", { cfg });
    }
  };

  const findSource = (event: Event): Element | null => {
    const rawTarget = event.target;
    if (!(rawTarget instanceof Element)) return null;
    const candidate = rawTarget.closest("[fx-action], [fx-target]");
    if (!candidate || !root.contains(candidate)) return null;
    if (candidate.closest("[fx-ignore]")) return null;
    const expected = candidate.getAttribute("fx-trigger") ?? defaultTrigger(candidate);
    if (expected !== event.type) return null;
    return candidate;
  };

  const handleEvent = (event: Event): void => {
    const element = findSource(event);
    if (!element) return;
    if (
      event.type === "submit" || (event.type === "click" && element instanceof HTMLAnchorElement)
    ) {
      event.preventDefault();
    }
    const debounceMs = Number(element.getAttribute("fx-debounce") ?? "0");
    if (debounceMs > 0) {
      const existing = timers.get(element);
      if (existing !== undefined) {
        clearTimeout(existing);
        activeTimers.delete(existing);
      }
      const id = globalThis.setTimeout(() => {
        timers.delete(element);
        activeTimers.delete(id);
        void run(element, event);
      }, debounceMs);
      timers.set(element, id);
      activeTimers.add(id);
      return;
    }
    void run(element, event);
  };

  for (const type of ["submit", "click", "input", "change"] as const) {
    on(root)[type](handleEvent, { signal });
  }

  return () => {
    for (const id of activeTimers) clearTimeout(id);
    activeTimers.clear();
  };
});

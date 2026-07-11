/**
 * @module
 *
 * Optional browser runtime for Navigation API-powered page swaps.
 */

type NavigateEventLike = Event & {
  canIntercept: boolean;
  destination: { url: string };
  downloadRequest: string | null;
  formData: FormData | null;
  hashChange: boolean;
  navigationType: "push" | "reload" | "replace" | "traverse";
  signal: AbortSignal;
  sourceElement?: Element | null;
  intercept(options: { handler: () => Promise<void> }): void;
};

type NavigationLike = EventTarget & {
  addEventListener(type: "navigate", listener: (event: NavigateEventLike) => void): void;
  removeEventListener(type: "navigate", listener: (event: NavigateEventLike) => void): void;
};

/** Options for the opt-in enhanced-navigation runtime. */
export type NavigateOptions = {
  /** Selector replaced on both the current and fetched documents. Defaults to `body`. */
  target?: string;
  /** Fetch implementation, primarily useful for platform adapters and tests. */
  fetch?: typeof fetch;
  /** Use the View Transitions API when available. Defaults to true. */
  viewTransition?: boolean;
};

const navigationApi = (): NavigationLike | undefined =>
  (globalThis as { navigation?: NavigationLike }).navigation;

const targetSelector = (options: NavigateOptions): string =>
  options.target ||
  document.querySelector('meta[name="rw-navigate-target"]')?.getAttribute("content")?.trim() ||
  "body";

const isAbortError = (error: unknown): boolean =>
  typeof error === "object" && error !== null &&
  (error as { name?: unknown }).name === "AbortError";

const formSource = (event: NavigateEventLike) => {
  const source = event.sourceElement as (Element & { form?: HTMLFormElement | null }) | undefined;
  const form = source?.tagName === "FORM" ? source as unknown as HTMLFormElement : source?.form;
  return { form, source };
};

const formBody = (event: NavigateEventLike, headers: Headers): BodyInit | null => {
  if (!event.formData) return null;

  const { form, source } = formSource(event);
  const enctype = (source?.getAttribute("formenctype") || form?.enctype ||
    "application/x-www-form-urlencoded").toLowerCase();
  if (enctype === "multipart/form-data") return event.formData;

  const entries: [string, string][] = [...event.formData].map(([name, value]) => [
    name,
    typeof value === "string" ? value : (value as { name?: string }).name ?? "",
  ]);
  if (enctype === "text/plain") {
    headers.set("Content-Type", "text/plain;charset=UTF-8");
    return entries.map(([name, value]) => `${name}=${value}\r\n`).join("");
  }
  return new URLSearchParams(entries);
};

let stopActiveNavigation: (() => void) | undefined;

const hardNavigate = (url: URL, event?: NavigateEventLike): void => {
  // A fallback must be a real document load, not another intercepted navigation.
  stopActiveNavigation?.();
  const { form, source } = event ? formSource(event) : {};
  if (event?.formData && form) {
    form.requestSubmit(source?.tagName === "FORM" ? undefined : source as HTMLElement);
    return;
  }
  globalThis.location.assign(url.href);
};

const replaceDocumentTarget = async (
  html: string,
  options: NavigateOptions,
  signal: AbortSignal,
): Promise<boolean> => {
  signal.throwIfAborted();
  const nextDocument = new DOMParser().parseFromString(html, "text/html");
  if (nextDocument.querySelector('meta[name="rw-navigate"][content="reload"]')) return false;
  const selector = targetSelector(options);
  const current = document.querySelector(selector);
  const next = nextDocument.querySelector(selector);
  if (!current || !next) {
    throw new Error(`navigate: target ${JSON.stringify(selector)} is missing.`);
  }

  const nodes = [...next.childNodes].map((node) => document.importNode(node, true));
  const update = () => {
    signal.throwIfAborted();
    current.replaceChildren(...nodes);
    document.title = nextDocument.title;
  };
  const start = options.viewTransition !== false && document.startViewTransition;
  if (!start) {
    update();
    return true;
  }
  await start.call(document, update).finished;
  return true;
};

/**
 * Installs enhanced navigation when the browser exposes the Navigation API.
 * Calling this again replaces the previous Ruwuter listener.
 */
export const enhanceNavigation = (options: NavigateOptions = {}): () => void => {
  stopActiveNavigation?.();

  const navigation = navigationApi();
  if (typeof window === "undefined" || !navigation) {
    stopActiveNavigation = undefined;
    return () => {};
  }

  const listener = (event: NavigateEventLike): void => {
    if (
      !event.canIntercept || event.hashChange || event.downloadRequest !== null ||
      event.navigationType === "reload" ||
      event.sourceElement?.closest("[data-rw-reload]")
    ) return;

    const destination = new URL(event.destination.url, location.href);
    if (
      !["http:", "https:"].includes(destination.protocol) || destination.origin !== location.origin
    ) {
      return;
    }

    event.intercept({
      async handler() {
        try {
          const headers = new Headers({ Accept: "text/html" });
          const body = formBody(event, headers);
          const response = await (options.fetch ?? fetch)(destination, {
            body,
            headers,
            method: body === null ? "GET" : "POST",
            signal: event.signal,
          });
          const responseUrl = response.url ? new URL(response.url) : destination;
          if (response.redirected || responseUrl.href !== destination.href) {
            hardNavigate(responseUrl);
            return;
          }
          if (
            !/\b(?:text\/html|application\/xhtml\+xml)\b/i.test(
              response.headers.get("Content-Type") ?? "",
            )
          ) {
            throw new Error("navigate: destination did not return HTML.");
          }
          if (!await replaceDocumentTarget(await response.text(), options, event.signal)) {
            hardNavigate(destination, event);
          }
        } catch (error) {
          if (event.signal.aborted || isAbortError(error)) return;
          console.error(error);
          hardNavigate(destination, event);
        }
      },
    });
  };

  navigation.addEventListener("navigate", listener);
  let active = true;
  const stop = () => {
    if (!active) return;
    active = false;
    navigation.removeEventListener("navigate", listener);
    if (stopActiveNavigation === stop) stopActiveNavigation = undefined;
  };
  stopActiveNavigation = stop;
  return stop;
};

if (typeof window !== "undefined") enhanceNavigation();

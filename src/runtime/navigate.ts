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

type Submission = { form?: HTMLFormElement; submitter?: HTMLElement };

/** The submission awaiting its navigate event, kept because `sourceElement` is not universal. */
let submission: Submission | undefined;

const rememberSubmission = (event: SubmitEvent): void => {
  // Listening in the bubble phase means the page's own handlers have run: a submission it
  // cancelled never navigates, so keeping it would strand a form for an unrelated navigation.
  submission = event.defaultPrevented
    ? undefined
    : { form: event.target as HTMLFormElement, submitter: event.submitter ?? undefined };
};

/** Resolves, and consumes, the form this navigation is submitting. */
const submissionOf = (event: NavigateEventLike): Submission => {
  const pending = submission;
  submission = undefined;
  const source = event.sourceElement as (Element & { form?: HTMLFormElement | null }) | undefined;
  if (source?.tagName === "FORM") return { form: source as unknown as HTMLFormElement };
  if (source?.form) return { form: source.form, submitter: source as HTMLElement };
  // Without `sourceElement` the submit event that started this navigation still names the form,
  // so its encoding is preserved and a POST is never mistaken for a plain link. Only a form
  // submission carries `formData`, which is what keeps another navigation from claiming it.
  return (event.formData ? pending : undefined) ?? {};
};

const formBody = (
  event: NavigateEventLike,
  headers: Headers,
  { form, submitter }: Submission,
): BodyInit | null => {
  if (!event.formData) return null;

  const enctype = (submitter?.getAttribute("formenctype") || form?.enctype ||
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

/**
 * Loads `url` as a document. Safe at any point: it never repeats a form submission.
 * Interception is dropped first so the fallback is a real load, not another swap.
 */
const loadDocument = (url: URL): void => {
  stopActiveNavigation?.();
  globalThis.location.assign(url.href);
};

/**
 * Hands the navigation back to the browser by running it again. Only valid *before* the
 * request has been sent, because re-submitting a form posts it a second time.
 */
const replayNavigation = (
  event: NavigateEventLike,
  url: URL,
  { form, submitter }: Submission,
): void => {
  // A plain load turns a POST into a GET and drops the body, so it is the last resort: with
  // no form left to submit, landing on the destination still beats dropping the navigation.
  if (!event.formData || !form) {
    loadDocument(url);
    return;
  }
  stopActiveNavigation?.();
  form.requestSubmit(submitter);
};

const replaceDocumentTarget = async (
  html: string,
  options: NavigateOptions,
  signal: AbortSignal,
  repeatable: boolean,
): Promise<boolean> => {
  signal.throwIfAborted();
  const nextDocument = new DOMParser().parseFromString(html, "text/html");
  // Opting back into a native load only works when the navigation can be repeated. A POST
  // has already reached the server, so it renders the buffered response it has instead.
  if (repeatable && nextDocument.querySelector('meta[name="rw-navigate"][content="reload"]')) {
    return false;
  }
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
    const submitted = submissionOf(event);
    if (
      !event.canIntercept || event.hashChange || event.downloadRequest !== null ||
      event.navigationType === "reload" ||
      // The recovered form carries the opt-out too, otherwise it is inert without a source.
      (event.sourceElement ?? submitted.form)?.closest("[data-rw-reload]")
    ) return;

    const destination = new URL(event.destination.url, location.href);
    if (
      !["http:", "https:"].includes(destination.protocol) || destination.origin !== location.origin
    ) {
      return;
    }

    event.intercept({
      async handler() {
        let sent = false;
        try {
          const headers = new Headers({ Accept: "text/html" });
          const body = formBody(event, headers, submitted);
          // From here on the request may have reached the server, so no fallback is
          // allowed to issue it again.
          sent = true;
          const response = await (options.fetch ?? fetch)(destination, {
            body,
            headers,
            method: body === null ? "GET" : "POST",
            signal: event.signal,
          });
          const responseUrl = response.url ? new URL(response.url) : destination;
          if (response.redirected || responseUrl.href !== destination.href) {
            loadDocument(responseUrl);
            return;
          }
          if (
            !/\b(?:text\/html|application\/xhtml\+xml)\b/i.test(
              response.headers.get("Content-Type") ?? "",
            )
          ) {
            throw new Error("navigate: destination did not return HTML.");
          }
          const swapped = await replaceDocumentTarget(
            await response.text(),
            options,
            event.signal,
            body === null,
          );
          // Only a GET reaches this branch, so repeating it as a document load is safe.
          if (!swapped) loadDocument(destination);
        } catch (error) {
          if (event.signal.aborted || isAbortError(error)) return;
          console.error(error);
          if (sent) loadDocument(destination);
          else replayNavigation(event, destination, submitted);
        }
      },
    });
  };

  navigation.addEventListener("navigate", listener);
  document.addEventListener("submit", rememberSubmission);
  let active = true;
  const stop = () => {
    if (!active) return;
    active = false;
    navigation.removeEventListener("navigate", listener);
    document.removeEventListener("submit", rememberSubmission);
    submission = undefined;
    if (stopActiveNavigation === stop) stopActiveNavigation = undefined;
  };
  stopActiveNavigation = stop;
  return stop;
};

if (typeof window !== "undefined") enhanceNavigation();

/**
 * @module
 *
 * Browser-side HTML swap helper used by client handlers.
 * Supports fetchable inputs and Trusted Types-aware HTML sinks.
 */

declare const trustedHTMLBrand: unique symbol;

type TrustedHTMLValue = typeof globalThis extends {
  TrustedHTML: { prototype: infer T };
} ? T
  : string & { readonly [trustedHTMLBrand]: true };

type TrustedTypePolicyValue = typeof globalThis extends {
  TrustedTypePolicy: { prototype: infer P };
} ? P
  : { createHTML(value: string): TrustedHTMLValue };

/** Element reference accepted by `swap` (`Element`, selector, or React-style ref object). */
export type SwapTarget = Element | string | { current?: Element | null | undefined };
/** Write mode used by `swap` when applying HTML to the target element. */
export type SwapMode =
  | "innerHTML"
  | "outerHTML"
  | InsertPosition
  | "remove";

/** Input sources accepted by `swap`. */
export type SwapInput =
  | Request
  | URL
  | Response
  | Promise<Response>
  | TrustedHTMLValue
  | { text: () => Promise<string> }
  | null
  | undefined;

export type SwapSanitizer = (
  html: string,
  context: { response: Response | null },
) => string | TrustedHTMLValue | Promise<string | TrustedHTMLValue>;

/** Options controlling target resolution and write behavior for `swap`. */
export type SwapOptions = {
  target: SwapTarget;
  write?: SwapMode;
  /**
   * Raw markup to insert. Prefer `html`, `sanitizer`, or `trustedTypesPolicy` when Trusted Types is
   * enforced by the page.
   */
  unsafeHTML?: string;
  /** Caller-created TrustedHTML value to insert without library sanitization. */
  html?: TrustedHTMLValue;
  init?: RequestInit;
  expectedContentType?: string | RegExp | false;
  allowRedirects?: boolean;
  sanitizer?: SwapSanitizer;
  trustedTypesPolicy?: TrustedTypePolicyValue;
  viewTransition?: boolean;
};

/** Result returned by `swap` after the DOM update finishes. */
export type SwapResult = {
  target: Element;
  write: SwapMode;
  text: string;
  response: Response | null;
};

const resolveElement = (ref: SwapTarget): Element => {
  if (!ref) {
    throw new TypeError("swap: target is required.");
  }
  if (ref instanceof Element) return ref;
  if (typeof ref === "string") {
    const element = document.querySelector(ref);
    if (!element) {
      throw new Error(`swap: no element matches selector "${ref}".`);
    }
    return element;
  }
  if (typeof ref === "object" && "current" in ref && ref.current instanceof Element) {
    return ref.current;
  }
  throw new TypeError("swap: unsupported element reference provided.");
};

const trustedHTMLCtor =
  (globalThis as { TrustedHTML?: { new (...args: never[]): TrustedHTMLValue } }).TrustedHTML;

const DEFAULT_CONTENT_TYPE = /\b(?:text\/html|application\/xhtml\+xml)\b/i;

const isTrustedHTML = (value: unknown): value is TrustedHTMLValue =>
  !!trustedHTMLCtor && value instanceof trustedHTMLCtor;

const normalizeExpectedContentType = (
  expected: SwapOptions["expectedContentType"],
): RegExp | string | false => expected === undefined ? DEFAULT_CONTENT_TYPE : expected;

const assertResponseAllowed = (
  response: Response,
  expected: SwapOptions["expectedContentType"],
  allowRedirects: boolean | undefined,
): void => {
  if (!response.ok) {
    throw new Error(`swap: response status ${response.status} is not ok.`);
  }

  if (response.redirected && allowRedirects === false) {
    throw new Error("swap: redirected responses are disabled for this swap.");
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  const expectedContentType = normalizeExpectedContentType(expected);
  if (expectedContentType === false) return;

  const matches = typeof expectedContentType === "string"
    ? contentType.toLowerCase().includes(expectedContentType.toLowerCase())
    : expectedContentType.test(contentType);

  if (!matches) {
    throw new Error(
      contentType
        ? `swap: expected HTML response content type, received "${contentType}".`
        : "swap: expected HTML response content type, received none.",
    );
  }
};

const throwIfAborted = (signal?: AbortSignal | null): void => {
  if (!signal?.aborted) return;
  signal.throwIfAborted?.();
  throw new DOMException("The operation was aborted.", "AbortError");
};

const readResponse = async (
  response: Response,
  options: Pick<SwapOptions, "allowRedirects" | "expectedContentType" | "init">,
): Promise<string> => {
  throwIfAborted(options.init?.signal);
  assertResponseAllowed(response, options.expectedContentType, options.allowRedirects);
  const text = await response.text();
  throwIfAborted(options.init?.signal);
  return text;
};

const toHtml = async (
  input: SwapInput,
  options: SwapOptions,
): Promise<{ html: string | TrustedHTMLValue; response: Response | null }> => {
  if (options.html !== undefined) return { html: options.html, response: null };
  if (options.unsafeHTML !== undefined) return { html: options.unsafeHTML, response: null };
  if (isTrustedHTML(input)) {
    return { html: input, response: null };
  }

  const resolvedInput = input instanceof Promise ? await input : input;
  throwIfAborted(options.init?.signal);

  if (typeof resolvedInput === "string") {
    throw new TypeError(
      "swap: string input is ambiguous. Use new URL(...), new Request(...), or options.unsafeHTML.",
    );
  }

  if (resolvedInput instanceof Response) {
    return { html: await readResponse(resolvedInput, options), response: resolvedInput };
  }
  if (resolvedInput instanceof Request || resolvedInput instanceof URL) {
    const response = await fetch(resolvedInput, options.init);
    return { html: await readResponse(response, options), response };
  }
  if (resolvedInput && typeof (resolvedInput as { text?: unknown }).text === "function") {
    const text = await (resolvedInput as { text: () => Promise<string> }).text();
    throwIfAborted(options.init?.signal);
    return { html: text, response: null };
  }
  return { html: "", response: null };
};

const prepareDomValue = async (
  html: string | TrustedHTMLValue,
  options: SwapOptions,
  response: Response | null,
): Promise<string | TrustedHTMLValue> => {
  if (typeof html !== "string") return html;

  const sanitized = options.sanitizer ? await options.sanitizer(html, { response }) : html;
  if (typeof sanitized !== "string") return sanitized;

  return options.trustedTypesPolicy ? options.trustedTypesPolicy.createHTML(sanitized) : sanitized;
};

const applySwap = (
  target: Element,
  mode: SwapMode,
  domValue: string | TrustedHTMLValue,
): void => {
  if (mode === "remove") {
    target.remove();
    return;
  }

  const writable = target as Element & {
    innerHTML: string | TrustedHTMLValue;
    outerHTML: string | TrustedHTMLValue;
    insertAdjacentHTML(position: InsertPosition, text: string | TrustedHTMLValue): void;
  };

  if (mode === "innerHTML") {
    writable.innerHTML = domValue;
  } else if (mode === "outerHTML") {
    writable.outerHTML = domValue;
  } else if (/(before|after)(begin|end)/.test(mode)) {
    // Keep TrustedHTML branded values intact for Trusted Types enforcement
    writable.insertAdjacentHTML(mode as InsertPosition, domValue);
  } else {
    throw new Error(`swap: unsupported swap mode "${mode}".`);
  }
};

type StartViewTransition = (updateCallback: () => void) => { finished: Promise<unknown> };

const runWithTransition = async (
  update: () => void,
  enabled?: boolean,
): Promise<void> => {
  const doc = document as Document & { startViewTransition?: StartViewTransition };
  const start = enabled !== false && doc.startViewTransition
    ? doc.startViewTransition.bind(doc)
    : (cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    };

  await start(update).finished.catch(() => {});
};

/**
 * Swaps HTML into a target element from raw text, fetchable input, or `Response`.
 *
 * @param input - Content source (URL/Request/Response/string/etc).
 * @param options - Swap target and write mode configuration.
 */
export const swap = async (
  input: SwapInput,
  options: SwapOptions,
): Promise<SwapResult> => {
  const target = resolveElement(options.target);
  const writeMode = options.write ?? "innerHTML";

  const { html, response } = await toHtml(input, options);
  const domValue = await prepareDomValue(html, options, response);
  const resolvedText = typeof domValue === "string" ? domValue : String(domValue);

  await runWithTransition(() => applySwap(target, writeMode, domValue), options.viewTransition);

  return {
    target,
    write: writeMode,
    text: resolvedText,
    response,
  };
};

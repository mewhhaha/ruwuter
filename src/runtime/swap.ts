type TrustedHTMLValue = typeof globalThis extends {
  TrustedHTML: { prototype: infer T };
} ? T
  : string & { __trusted_html_brand?: never };

type TrustedTypePolicyValue = typeof globalThis extends {
  TrustedTypePolicy: { prototype: infer P };
} ? P
  : { createHTML(value: string): TrustedHTMLValue };

type TrustedTypePolicyFactoryValue = typeof globalThis extends {
  trustedTypes: infer F;
} ? F
  : {
    createPolicy(
      name: string,
      rules: { createHTML?: (value: string) => string },
    ): TrustedTypePolicyValue;
  };

type ViewTransitionValue = { finished: Promise<unknown> };
type StartViewTransitionValue = (updateCallback: () => void) => ViewTransitionValue;

export type SwapTarget = Element | string | { current?: Element | null | undefined };
export type SwapMode =
  | "innerHTML"
  | "outerHTML"
  | InsertPosition
  | "delete";

export type SwapInput =
  | RequestInfo
  | URL
  | Response
  | string
  | TrustedHTMLValue
  | { text?: () => Promise<string> }
  | null
  | undefined;

export type SwapOptions = {
  target: SwapTarget;
  write?: SwapMode;
  text?: string | TrustedHTMLValue;
  init?: RequestInit;
  viewTransition?: boolean;
};

export type SwapResult = {
  target: Element;
  write: SwapMode;
  text: string;
  response: Response | null;
};

const isResponseLike = (input: unknown): input is Response => input instanceof Response;
const isRequestLike = (input: unknown): input is Request => input instanceof Request;
const hasUrl = (input: unknown): input is { url: string } =>
  typeof input === "object" && input !== null && "url" in input &&
  typeof (input as { url: unknown }).url === "string";

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

const resolveText = async (
  input: SwapInput,
  provided?: string | TrustedHTMLValue,
): Promise<string | TrustedHTMLValue> => {
  if (provided !== undefined) return provided;
  if (typeof input === "string") return input;
  if (typeof globalThis === "object" && "TrustedHTML" in globalThis) {
    const ctor =
      (globalThis as { TrustedHTML?: { new (...args: never[]): TrustedHTMLValue } }).TrustedHTML;
    if (ctor && input instanceof ctor) {
      return input;
    }
  }
  if (isResponseLike(input)) return await input.text();
  if (input && typeof (input as { text?: () => Promise<string> }).text === "function") {
    return await (input as { text: () => Promise<string> }).text();
  }
  return String(input ?? "");
};

const createTrustedHTML = (() => {
  let policy: TrustedTypePolicyValue | null = null;
  return (html: string | TrustedHTMLValue): string | TrustedHTMLValue => {
    if (typeof html !== "string") return html;
    const trustedTypes = typeof window !== "undefined"
      ? (window as { trustedTypes?: TrustedTypePolicyFactoryValue }).trustedTypes
      : undefined;
    if (!trustedTypes) return html;
    policy ??= trustedTypes.createPolicy("ruwuter#swap", {
      createHTML: (value) => value,
    });
    return policy.createHTML(html);
  };
})();

const applySwap = (
  target: Element,
  mode: SwapMode,
  domValue: string | TrustedHTMLValue,
): void => {
  if (mode === "delete") {
    target.remove();
    return;
  }

  if (mode in target) {
    // @ts-expect-error lol random
    target[mode] = domValue;
  } else if (/(before|after)(begin|end)/.test(mode)) {
    target.insertAdjacentHTML(mode as InsertPosition, String(domValue));
  } else {
    throw new Error(`swap: unsupported swap mode "${mode}".`);
  }
};

const resolveViewTransition = (): StartViewTransitionValue | null => {
  if (typeof document === "undefined") return null;
  const { startViewTransition } = document as Document & {
    startViewTransition?: unknown;
  };
  if (typeof startViewTransition !== "function") return null;
  return startViewTransition.bind(document) as StartViewTransitionValue;
};

export const swap = async (
  input: SwapInput,
  options: SwapOptions,
): Promise<SwapResult> => {
  const target = resolveElement(options.target);
  const writeMode = options.write ?? "innerHTML";

  let response: Response | null = null;
  let rawHtml: string | TrustedHTMLValue;

  if (options.text !== undefined) {
    rawHtml = options.text;
  } else if (isResponseLike(input)) {
    response = input;
    rawHtml = await response.text();
  } else if (
    typeof input === "string" ||
    isRequestLike(input) ||
    hasUrl(input)
  ) {
    response = await fetch(input as RequestInfo, options.init);
    rawHtml = await response.text();
  } else {
    rawHtml = await resolveText(input);
  }

  const domValue = createTrustedHTML(rawHtml);
  const resolvedText = typeof rawHtml === "string" ? rawHtml : String(rawHtml);

  let startTransition = (f: () => void) => {
    f();
    return { finished: Promise.resolve() };
  };
  if (options.viewTransition !== false && "startViewTransition" in document) {
    startTransition = document.startViewTransition.bind(document);
  }

  const transition = startTransition(() => {
    await applySwap(target, writeMode, domValue);
  });
  await transition.finished.catch(() => {});

  return {
    target,
    write: writeMode,
    text: resolvedText,
    response,
  };
};

// Always install on window when present, so apps can just use window.swap
const hasWindow = typeof window !== "undefined";
if (hasWindow) {
  (window as unknown as { swap: typeof swap }).swap = swap;
}

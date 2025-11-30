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

export type SwapTarget = Element | string | { current?: Element | null | undefined };
export type SwapMode =
  | "innerHTML"
  | "outerHTML"
  | InsertPosition
  | "remove";

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

const trustedHTMLCtor =
  (globalThis as { TrustedHTML?: { new (...args: never[]): TrustedHTMLValue } }).TrustedHTML;

const toHtml = async (
  input: SwapInput,
  override?: string | TrustedHTMLValue,
  init?: RequestInit,
): Promise<{ html: string | TrustedHTMLValue; response: Response | null }> => {
  if (override !== undefined) return { html: override, response: null };
  if (typeof input === "string") return { html: input, response: null };
  if (trustedHTMLCtor && input instanceof trustedHTMLCtor) {
    return { html: input, response: null };
  }
  if (input instanceof Response) {
    return { html: await input.text(), response: input };
  }
  if (input instanceof Request || hasUrl(input)) {
    const response = await fetch(input as RequestInfo, init);
    return { html: await response.text(), response };
  }
  if (input && typeof (input as { text?: () => Promise<string> }).text === "function") {
    return { html: await (input as { text: () => Promise<string> }).text(), response: null };
  }
  return { html: String(input ?? ""), response: null };
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
  if (mode === "remove") {
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

export const swap = async (
  input: SwapInput,
  options: SwapOptions,
): Promise<SwapResult> => {
  const target = resolveElement(options.target);
  const writeMode = options.write ?? "innerHTML";

  const { html, response } = await toHtml(input, options.text, options.init);
  const domValue = createTrustedHTML(html);
  const resolvedText = typeof html === "string" ? html : String(html);

  await runWithTransition(() => applySwap(target, writeMode, domValue), options.viewTransition);

  return {
    target,
    write: writeMode,
    text: resolvedText,
    response,
  };
};

// Always install on window when present, so apps can just use window.swap
if (typeof window !== "undefined") {
  (window as unknown as { swap: typeof swap }).swap = swap;
}

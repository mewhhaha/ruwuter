type SwapTarget = Element | string | { current?: Element | null | undefined };
type SwapModeHandler = (context: { target: Element; text: string }) => void | Promise<void>;
type SwapMode = SwapModeHandler | string;

type SwapInput =
  | RequestInfo
  | URL
  | Response
  | string
  | { text?: () => Promise<string> }
  | null
  | undefined;

type SwapOptions = {
  target: SwapTarget;
  swap?: SwapMode;
  text?: string;
  init?: RequestInit;
};

type SwapResult = {
  target: Element;
  swap: SwapMode;
  text: string;
  response: Response | null;
};

declare global {
  interface Window {
    swap?: (
      input: SwapInput,
      options: SwapOptions,
    ) => Promise<SwapResult>;
  }
}

const hasWindow = typeof window !== "undefined";

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

const resolveText = async (input: SwapInput, provided?: string): Promise<string> => {
  if (provided !== undefined) return provided;
  if (typeof input === "string") return input;
  if (isResponseLike(input)) return await input.text();
  if (input && typeof (input as { text?: () => Promise<string> }).text === "function") {
    return await (input as { text: () => Promise<string> }).text();
  }
  return String(input ?? "");
};

const applySwap = async (
  target: Element,
  swapMode: SwapMode,
  text: string,
): Promise<void> => {
  if (typeof swapMode === "function") {
    await swapMode({ target, text });
    return;
  }

  const mode = swapMode ?? "innerHTML";

  if (/(before|after)(begin|end)/.test(mode)) {
    target.insertAdjacentHTML(mode as InsertPosition, text);
    return;
  }

  if (mode in target) {
    try {
      // @ts-expect-error - dynamic property assignment
      target[mode] = text;
      return;
    } catch {
      // fallthrough to error
    }
  }

  throw new Error(`swap: unsupported swap mode "${mode}".`);
};

const swapImpl = async (
  input: SwapInput,
  options: SwapOptions = { target: "" as unknown as SwapTarget },
): Promise<SwapResult> => {
  const target = resolveElement(options.target);
  const swapMode = options.swap ?? "innerHTML";

  let response: Response | null = null;
  let text: string;

  if (options.text !== undefined) {
    text = options.text;
  } else if (isResponseLike(input)) {
    response = input;
    text = await response.text();
  } else if (
    typeof input === "string" ||
    isRequestLike(input) ||
    hasUrl(input)
  ) {
    response = await fetch(input as RequestInfo, options.init);
    text = await response.text();
  } else {
    text = await resolveText(input);
  }

  await applySwap(target, swapMode, text);

  return {
    target,
    swap: swapMode,
    text,
    response,
  };
};

const attachSwapToWindow = (global: Window & typeof globalThis) => {
  if (global.swap) return;
  global.swap = swapImpl;
};

if (hasWindow) {
  attachSwapToWindow(window as Window & typeof globalThis);
}

export {};

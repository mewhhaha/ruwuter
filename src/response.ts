import { createContext } from "./components/context.ts";
import { ordered, withPanels } from "./components/suspense.ts";
import { bodyTail } from "./runtime/body-tail.ts";
import { type Html, into } from "./runtime/node.ts";

/** Options for streaming HTML responses. */
export interface HtmlOptions extends ResponseInit {
  /** CSP nonce applied to the auto-injected panel resolver `<script>` tag. */
  nonce?: string;
  /** Override the `src` attribute for the auto-injected panel resolver `<script>` tag. */
  resolverSrc?: string;
}

/** @internal Response lifetime shared by the handler and its HTML body. */
export const renderRequest = createContext<
  {
    getSignal(): AbortSignal;
    streamSignal(): AbortSignal;
    cancel(reason: unknown): void;
    head: boolean;
    resolverSrc: string;
  } | undefined
>(undefined);

const DEFAULT_HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8" };
const HTML_ROOT_PATTERN = /^<html(?:[\s>])/i;

const tryRenderStatic = (node: Html): string | undefined => {
  const { parts } = node;
  const len = parts.length;
  if (len === 0) return "";
  if (len === 1) return typeof parts[0] === "string" ? parts[0] : undefined;
  let out = "";
  for (let i = 0; i < len; i++) {
    const part = parts[i];
    if (typeof part === "string") {
      out += part;
    } else if (part.v === bodyTail) {
      // With no other deferred parts in the tree, no Deferred panel can register.
      continue;
    } else {
      return undefined;
    }
  }
  return out;
};

const htmlHeaders = (input?: HeadersInit): HeadersInit => {
  if (input === undefined) return DEFAULT_HTML_HEADERS;
  const headers = new Headers(input);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "text/html; charset=utf-8");
  return headers;
};

/** Render JSX or text to a complete, escaped string. */
export function renderToString(value: unknown = ""): Promise<string> {
  return ordered(value).toPromise();
}

/** Render JSX or text in document order. */
export function renderToStream(
  value: unknown = "",
  options: { signal?: AbortSignal } = {},
): ReadableStream<Uint8Array> {
  return ordered(value).toReadableStream(options);
}

/** A streaming HTML response. Standalone responses render panels in document order. */
export function html(value: unknown, init?: HtmlOptions): Response {
  let nonce: string | undefined;
  let resolverSrc: string | undefined;
  let responseInit: ResponseInit;
  if (init) {
    const { nonce: initNonce, resolverSrc: initResolverSrc, ...rest } = init;
    nonce = initNonce;
    resolverSrc = initResolverSrc;
    responseInit = { ...rest, headers: htmlHeaders(rest.headers) };
  } else {
    responseInit = { headers: DEFAULT_HTML_HEADERS };
  }
  const scope = renderRequest.use();
  let node = into(value);
  if (scope?.head) return new Response(null, responseInit);
  const staticHtml = tryRenderStatic(node);
  if (staticHtml !== undefined) {
    const body = HTML_ROOT_PATTERN.test(staticHtml) ? "<!doctype html>" + staticHtml : staticHtml;
    return new Response(body, responseInit);
  }
  if (scope) {
    node = withPanels(node, {
      getSignal: scope.getSignal,
      resolverSrc: resolverSrc ?? scope.resolverSrc,
      nonce,
    });
  }
  const body = node.toReadableStream({
    signal: scope?.streamSignal(),
    onCancel: scope?.cancel,
    doctype: true,
  });
  return new Response(body, responseInit);
}

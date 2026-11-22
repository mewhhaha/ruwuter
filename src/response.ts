import { createContext } from "./components/context.ts";
import { ordered, withPanels } from "./components/suspense.ts";
import { into } from "./runtime/node.ts";

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
export function html(value: unknown, init: HtmlOptions = {}): Response {
  const { nonce, resolverSrc, ...responseInit } = init;
  const headers = new Headers(responseInit.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "text/html; charset=utf-8");
  const scope = renderRequest.use();
  let node = into(value);
  if (scope?.head) return new Response(null, { ...responseInit, headers });
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
  return new Response(body, { ...responseInit, headers });
}

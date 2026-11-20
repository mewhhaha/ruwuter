import { createContext } from "./components/context.ts";
import { withPanels } from "./components/suspense.ts";
import { into, rendered } from "./runtime/node.ts";

/** @internal Response lifetime shared by the handler and its HTML body. */
export const renderRequest = createContext<
  {
    signal: AbortSignal;
    cancel(reason: unknown): void;
    head: boolean;
  } | undefined
>(undefined);

/** Render JSX or text to a complete, escaped string. */
export function renderToString(value: unknown = ""): Promise<string> {
  return into(value).toPromise();
}

/** Render JSX or text in document order. */
export function renderToStream(
  value: unknown = "",
  options: { signal?: AbortSignal } = {},
): ReadableStream<Uint8Array> {
  return into(value).toReadableStream(options);
}

/** A streaming HTML response. Standalone responses render panels in document order. */
export function html(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "text/html; charset=utf-8");
  const scope = renderRequest.use();
  if (scope?.head) return new Response(null, { ...init, headers });
  let node = into(value);
  if (scope) node = withPanels(node, scope.signal);
  async function* documentOrFragment() {
    let first = true;
    for await (const chunk of node.generator) {
      if (first && /^<html(?:[\s>])/i.test(chunk)) yield "<!doctype html>";
      first = false;
      yield chunk;
    }
  }
  const body = rendered(documentOrFragment()).toReadableStream({
    signal: scope?.signal,
    onCancel: scope?.cancel,
  });
  return new Response(body, { ...init, headers });
}

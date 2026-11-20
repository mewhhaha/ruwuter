import { createContext } from "./components/context.ts";
import { ordered, withPanels } from "./components/suspense.ts";
import { into, rendered } from "./runtime/node.ts";

/** @internal Response lifetime shared by the handler and its HTML body. */
export const renderRequest = createContext<
  {
    signal: AbortSignal;
    cancel(reason: unknown): void;
    head: boolean;
    requestURL: string;
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
export function html(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "text/html; charset=utf-8");
  const scope = renderRequest.use();
  let node = into(value);
  if (scope?.head) return new Response(null, { ...init, headers });
  if (scope) node = withPanels(node, scope.signal, scope.requestURL);
  async function* documentOrFragment() {
    let first = true;
    for await (let chunk of node.generator) {
      if (first && /^<html(?:[\s>])/i.test(chunk)) chunk = "<!doctype html>" + chunk;
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

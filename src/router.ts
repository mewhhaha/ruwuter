/**
 * @module
 *
 * Core server router for Ruwuter.
 */

import type { JSX } from "./runtime/jsx.ts";
import { type Html, into, isHtml } from "./runtime/node.ts";
import { bindContext, runWithContextStore } from "./components/context.ts";
import { runWithHooksStore, withHookFrame } from "./runtime/hooks.ts";

export type { Html } from "./runtime/node.ts";
export type { JSX } from "./runtime/jsx.ts";

const encoder = new TextEncoder();

/**
 * Renders an HTML value to a complete string.
 */
export const renderToString = (value: unknown = ""): Promise<string> => {
  return into(value).toPromise();
};

/**
 * Renders an HTML value to a byte stream.
 */
export const renderToStream = (
  value: unknown = "",
  options: { signal?: AbortSignal } = {},
): ReadableStream<Uint8Array> => {
  return into(value).toReadableStream(options);
};

/**
 * Environment bindings interface. Extend this interface to add Cloudflare Workers bindings.
 */
// deno-lint-ignore no-empty-interface
export interface Env {}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface RequestContext<Bindings = Env> {
  request: Request;
  params: Record<string, string>;
  env: Bindings;
  executionContext: ExecutionContext;
  signal: AbortSignal;
}

export type ctx = RequestContext<Env>;

export type loader<Bindings = Env> = (
  params: RequestContext<Bindings>,
) => unknown | Promise<unknown>;

export type action<Bindings = Env> = (
  params: RequestContext<Bindings>,
) => unknown | Promise<unknown>;

export type Renderable = JSX.HtmlNode | Promise<JSX.HtmlNode>;
export type EndpointResult = JSX.HtmlNode | Response | Promise<JSX.HtmlNode | Response>;

export type renderer = (
  // deno-lint-ignore no-explicit-any
  props: any,
) => Renderable;

export type headers<Bindings = Env> = (
  params: RequestContext<Bindings> & {
    loaderData: unknown;
  },
) =>
  | Promise<Record<string, string | undefined | null> | Headers>
  | Record<string, string | undefined | null>
  | Headers;

export type FragmentEndpoint<Bindings = Env> = (
  ctx: RequestContext<Bindings>,
) => EndpointResult;

export type mod<Bindings = Env> = {
  loader?: loader<Bindings>;
  action?: action<Bindings>;
  default?: renderer;
  headers?: headers<Bindings>;
  fragments?: Record<string, FragmentEndpoint<Bindings>>;
} & Record<string, unknown>;

/**
 * Fragment represents a matched route module in a nested route stack.
 */
export type fragment<Bindings = Env> = {
  id: string;
  mod: mod<Bindings>;
  params?: string[];
};

export type route<Bindings = Env> = [
  pattern: URLPattern,
  fragments: fragment<Bindings>[],
];

export type router<Bindings = Env> = {
  handle: (
    request: Request,
    env: Bindings,
    executionContext: ExecutionContext,
  ) => Promise<Response>;
};

export function html(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "text/html; charset=utf-8");
  }
  return new Response(renderToStream(value), {
    ...init,
    headers,
  });
}

export function json(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(value), {
    ...init,
    headers,
  });
}

export function fragment<Bindings = Env>(
  render: FragmentEndpoint<Bindings>,
): FragmentEndpoint<Bindings> {
  return render;
}

const toParams = (
  groups: Record<string, string | undefined>,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const key in groups) {
    const value = groups[key];
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
};

const runWithStores = <T>(fn: () => Promise<T>) => runWithHooksStore(() => runWithContextStore(fn));

const ACTION_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

const methodSetForLeaf = (leaf: mod | undefined): Set<string> => {
  const methods = new Set<string>();
  if (!leaf) return methods;
  if (leaf.default || leaf.loader) {
    methods.add("GET");
    methods.add("HEAD");
  }
  if (leaf.action) {
    ACTION_METHODS.forEach((method) => methods.add(method));
  }
  if (methods.size > 0) {
    methods.add("OPTIONS");
  }
  return methods;
};

const allowHeader = (methods: Set<string>): string => Array.from(methods).sort().join(", ");

const withoutBody = (response: Response): Response =>
  new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });

const mergeHeaders = (
  target: Headers,
  source: Headers | Record<string, string | undefined | null>,
) => {
  const entries = source instanceof Headers ? source.entries() : Object.entries(source);
  for (const [key, value] of entries) {
    if (value == null) continue;
    if (key.toLowerCase() === "set-cookie") {
      target.append(key, value);
    } else {
      target.set(key, value);
    }
  }
};

const dataResponse = async (
  f: action | loader,
  ctx: RequestContext,
): Promise<Response> => {
  const value = await f(ctx);
  if (value instanceof Response) {
    return value;
  }
  return json(value);
};

const streamFromGenerator = (
  generator: AsyncGenerator<string>,
  signal: AbortSignal,
): ReadableStream<Uint8Array> => {
  let closed = false;
  const next = bindContext(() => generator.next());
  const close = bindContext(async () => {
    if (closed) return;
    closed = true;
    await generator.return(undefined).catch(() => {});
  });

  return new ReadableStream({
    async pull(controller) {
      try {
        if (signal.aborted) {
          await close();
          signal.throwIfAborted?.();
          throw new DOMException("The operation was aborted.", "AbortError");
        }

        const chunk = await next();
        if (chunk.done) {
          closed = true;
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunk.value));
      } catch (error) {
        await close();
        controller.error(
          error instanceof Response
            ? new TypeError(
              "Route components cannot throw Response after HTML streaming has started. Return responses from loaders or actions instead.",
            )
            : error,
        );
      }
    },
    async cancel() {
      await close();
    },
  });
};

const routeData = async (
  fragments: fragment[],
  ctx: RequestContext,
): Promise<{ headers: Headers; loaderData: unknown[] }> => {
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
  const loaderData: unknown[] = [];

  for (let i = 0; i < fragments.length; i++) {
    const { mod } = fragments[i];
    const data = mod.loader ? await mod.loader(ctx) : undefined;
    if (data instanceof Response) {
      throw data;
    }
    loaderData[i] = data;

    if (mod.headers) {
      const h = await mod.headers({
        ...ctx,
        loaderData: data,
      });
      if (h) mergeHeaders(headers, h);
    }
  }

  return { headers, loaderData };
};

const routeHeadResponse = async (
  fragments: fragment[],
  ctx: RequestContext,
): Promise<Response> => {
  const { headers } = await routeData(fragments, ctx);
  return new Response(null, {
    headers,
    status: 200,
  });
};

const routeResponse = async (
  fragments: fragment[],
  ctx: RequestContext,
): Promise<Response> => {
  const { headers, loaderData } = await routeData(fragments, ctx);

  const renderFragment = async (index: number): Promise<Html> => {
    if (index >= fragments.length) {
      return into("");
    }

    const { mod } = fragments[index];
    const next = () => renderFragment(index + 1);

    const childHtml = into(
      (async function* (): AsyncGenerator<string> {
        const inner = await next();
        yield* inner.generator;
      })(),
    );

    const Component = mod.default;
    if (!Component) {
      return childHtml;
    }

    let result: Renderable;
    try {
      result = await withHookFrame(() =>
        Component({
          loaderData: loaderData[index],
          children: childHtml,
        })
      );
    } catch (error) {
      if (error instanceof Response) {
        throw new TypeError(
          "Route components cannot throw Response. Return responses from loaders or actions instead.",
        );
      }
      throw error;
    }

    if (result instanceof Response) {
      throw new TypeError(
        "Route components cannot return Response. Return responses from loaders or actions instead.",
      );
    }

    return isHtml(result) ? result : into(result);
  };

  const node = await renderFragment(0);

  const body = streamFromGenerator(
    (async function* (): AsyncGenerator<string> {
      yield "<!doctype html>";
      yield* node.generator;
    })(),
    ctx.signal,
  );

  return new Response(body, {
    headers,
    status: 200,
  });
};

const fragmentPath = (pathname: string): { routePath: string; name: string } | undefined => {
  const marker = "/_ruwuter/";
  const markerIndex = pathname.lastIndexOf(marker);
  if (markerIndex < 0) return undefined;

  const encodedName = pathname.slice(markerIndex + marker.length);
  if (!encodedName || encodedName.includes("/")) return undefined;

  return {
    routePath: pathname.slice(0, markerIndex) || "/",
    name: decodeURIComponent(encodedName),
  };
};

const fragmentResponse = async (
  routes: route[],
  request: Request,
  env: Env,
  executionContext: ExecutionContext,
): Promise<Response | undefined> => {
  const url = new URL(request.url);
  const match = fragmentPath(url.pathname);
  if (!match) return undefined;

  const allowed = new Set(["GET", "HEAD", "OPTIONS"]);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { Allow: allowHeader(allowed) } });
  }
  if (!allowed.has(request.method)) {
    return new Response(null, { status: 405, headers: { Allow: allowHeader(allowed) } });
  }

  const routeUrl = new URL(request.url);
  routeUrl.pathname = match.routePath;
  routeUrl.search = "";

  for (const [pattern, stack] of routes) {
    const routeMatch = pattern.exec(routeUrl.href);
    if (!routeMatch) continue;

    for (let index = stack.length - 1; index >= 0; index--) {
      const endpoint = stack[index].mod.fragments?.[match.name];
      if (!endpoint) continue;

      const ctx: RequestContext = {
        request,
        params: toParams(routeMatch.pathname.groups),
        env,
        executionContext,
        signal: request.signal,
      };
      const result = await endpoint(ctx);
      const response = result instanceof Response ? result : html(result);
      return request.method === "HEAD" ? withoutBody(response) : response;
    }
  }

  return new Response(null, { status: 404 });
};

export const Router = <Bindings = Env>(routes: route<Bindings>[]): router<Bindings> => {
  const handle = (
    request: Request,
    env: Bindings,
    executionContext: ExecutionContext,
  ): Promise<Response> => {
    return runWithStores(async () => {
      try {
        const explicitFragment = await fragmentResponse(
          routes as route[],
          request,
          env as Env,
          executionContext,
        );
        if (explicitFragment) return explicitFragment;

        let fragments: fragment<Bindings>[] | undefined;
        let params: Record<string, string> | undefined;
        for (const [pattern, frags] of routes) {
          const match = pattern.exec(request.url);
          if (match) {
            fragments = frags;
            params = toParams(match.pathname.groups);
            break;
          }
        }

        if (!fragments || !params) {
          return new Response(null, { status: 404 });
        }

        const leaf = fragments[fragments.length - 1]?.mod;
        const allowed = methodSetForLeaf(leaf as mod | undefined);
        if (allowed.size === 0) {
          return new Response(null, { status: 404 });
        }

        if (request.method === "OPTIONS") {
          return new Response(null, {
            status: 204,
            headers: { Allow: allowHeader(allowed) },
          });
        }

        if (!allowed.has(request.method)) {
          return new Response(null, {
            status: 405,
            headers: { Allow: allowHeader(allowed) },
          });
        }

        const ctx: RequestContext<Bindings> = {
          request,
          params,
          env,
          executionContext,
          signal: request.signal,
        };

        let response: Response;
        if (request.method === "HEAD") {
          if (leaf?.default) {
            response = await routeHeadResponse(fragments as fragment[], ctx as RequestContext);
          } else if (leaf?.loader) {
            response = withoutBody(
              await dataResponse(leaf.loader as loader, ctx as RequestContext),
            );
          } else {
            return new Response(null, { status: 404 });
          }
        } else if (request.method === "GET") {
          if (leaf?.default) {
            response = await routeResponse(fragments as fragment[], ctx as RequestContext);
          } else if (leaf?.loader) {
            response = await dataResponse(leaf.loader as loader, ctx as RequestContext);
          } else {
            return new Response(null, { status: 404 });
          }
        } else if (leaf?.action) {
          response = await dataResponse(leaf.action as action, ctx as RequestContext);
        } else {
          return new Response(null, { status: 404 });
        }

        return response;
      } catch (error) {
        if (error instanceof Response) {
          return request.method === "HEAD" ? withoutBody(error) : error;
        }

        if (error instanceof Error) {
          console.error(error.message);
        }

        return new Response(null, { status: 500 });
      }
    });
  };

  return { handle };
};

/**
 * @module
 *
 * Core server router for Ruwuter.
 */

import type { JSX } from "./runtime/jsx.ts";
import { fromParts, type Html, into, isHtml } from "./runtime/node.ts";
import { bindContext, runWithContextStore } from "./components/context.ts";

export type { Html } from "./runtime/node.ts";
export type { JSX } from "./runtime/jsx.ts";

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

export type FragmentMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

export type FragmentOptions = {
  /** Methods handled by this endpoint. GET endpoints also answer HEAD. */
  methods?: readonly FragmentMethod[];
};

export type FragmentEndpoint<Bindings = Env> = {
  (ctx: RequestContext<Bindings>): EndpointResult;
  methods?: readonly FragmentMethod[];
};

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
  const body = JSON.stringify(value);
  if (body === undefined) {
    throw new TypeError(`json() cannot serialize a top-level ${typeof value} value.`);
  }
  return new Response(body, {
    ...init,
    headers,
  });
}

export function fragment<Bindings = Env>(
  render: FragmentEndpoint<Bindings>,
  options: FragmentOptions = {},
): FragmentEndpoint<Bindings> {
  if (options.methods) {
    Object.defineProperty(render, "methods", {
      value: [...options.methods],
      configurable: true,
    });
  }
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

/**
 * Wraps a generator so every advance runs under the context store that is
 * active now. Stream pulls happen outside the request's AsyncLocalStorage
 * scope, so lazily rendered components would otherwise lose context values.
 */
const bindGenerator = (generator: AsyncGenerator<string>): AsyncGenerator<string> => {
  const bound: AsyncGenerator<string> = {
    next: bindContext(() => generator.next()) as AsyncGenerator<string>["next"],
    return: bindContext(() => generator.return(undefined)) as AsyncGenerator<string>["return"],
    throw: (error?: unknown) => generator.throw(error),
    [Symbol.asyncIterator]() {
      return bound;
    },
    [Symbol.asyncDispose]() {
      return generator[Symbol.asyncDispose]?.() ?? Promise.resolve();
    },
  };
  return bound;
};

const routeData = async (
  fragments: fragment[],
  ctx: RequestContext,
): Promise<{ headers: Headers; loaderData: unknown[] }> => {
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
  const loaderData: unknown[] = [];
  const results = fragments.map(({ mod }) => Promise.resolve().then(() => mod.loader?.(ctx)));

  // Every loader has started before we settle any of them. If an earlier
  // loader wins by throwing, later failures are still observed.
  results.forEach((result) => result.catch(() => undefined));

  for (let i = 0; i < fragments.length; i++) {
    const { mod } = fragments[i];
    const data = await results[i];
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
      return fromParts([]);
    }

    const { mod } = fragments[index];
    // Children render lazily: the next fragment's component only runs once the
    // stream reaches its position in the parent's markup.
    const childHtml = fromParts([{ v: () => renderFragment(index + 1), esc: false }]);

    const Component = mod.default;
    if (!Component) {
      return childHtml;
    }

    let result: Awaited<Renderable>;
    try {
      result = await Component({
        loaderData: loaderData[index],
        children: childHtml,
      });
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

    return isHtml(result) ? result : fromParts([{ v: result, esc: true }]);
  };

  const node = await renderFragment(0);

  const page = (async function* (): AsyncGenerator<string> {
    try {
      yield "<!doctype html>";
      yield* node.generator;
    } catch (error) {
      throw error instanceof Response
        ? new TypeError(
          "Route components cannot throw Response after HTML streaming has started. Return responses from loaders or actions instead.",
        )
        : error;
    }
  })();

  const body = into(bindGenerator(page)).toReadableStream({ signal: ctx.signal });

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

  let name: string;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    return undefined;
  }

  return {
    routePath: pathname.slice(0, markerIndex) || "/",
    name,
  };
};

type CompiledRoute<Bindings = Env> = {
  pattern: URLPattern;
  fragments: fragment<Bindings>[];
  leaf: mod<Bindings> | undefined;
  allowed: Set<string>;
  allow: string;
};

const fragmentMethods = <Bindings>(endpoint: FragmentEndpoint<Bindings>): Set<string> => {
  const methods = new Set<string>(endpoint.methods ?? ["GET", "HEAD"]);
  if (methods.has("GET")) methods.add("HEAD");
  if (methods.size > 0) methods.add("OPTIONS");
  return methods;
};

type RouteMatch<Bindings> = {
  route: CompiledRoute<Bindings>;
  params: Record<string, string>;
};

function* matchingRoutes<Bindings>(
  routes: readonly CompiledRoute<Bindings>[],
  pathname: string,
): Generator<RouteMatch<Bindings>> {
  for (const route of routes) {
    const match = route.pattern.exec({ pathname });
    if (match) yield { route, params: toParams(match.pathname.groups) };
  }
}

type FragmentMatch<Bindings> = {
  context: RequestContext<Bindings>;
  endpoint?: FragmentEndpoint<Bindings>;
};

const matchFragment = <Bindings>(
  routes: readonly CompiledRoute<Bindings>[],
  request: Request,
  pathname: string,
  env: Bindings,
  executionContext: ExecutionContext,
): FragmentMatch<Bindings> | undefined => {
  const match = fragmentPath(pathname);
  if (!match) return undefined;

  const context: RequestContext<Bindings> = {
    request,
    params: {},
    env,
    executionContext,
    signal: request.signal,
  };

  for (const routeMatch of matchingRoutes(routes, match.routePath)) {
    for (let index = routeMatch.route.fragments.length - 1; index >= 0; index--) {
      const endpoint = routeMatch.route.fragments[index].mod.fragments?.[match.name];
      if (endpoint) {
        return {
          endpoint,
          context: { ...context, params: routeMatch.params },
        };
      }
    }
  }

  return { context };
};

export const Router = <Bindings = Env>(
  routes: route<Bindings>[],
): router<Bindings> => {
  const compiled: CompiledRoute<Bindings>[] = routes.map(([pattern, fragments]) => {
    const leaf = fragments[fragments.length - 1]?.mod;
    const allowed = methodSetForLeaf(leaf as mod | undefined);
    return { pattern, fragments, leaf, allowed, allow: allowHeader(allowed) };
  });

  const handle = (
    request: Request,
    env: Bindings,
    executionContext: ExecutionContext,
  ): Promise<Response> => {
    return runWithContextStore(async () => {
      try {
        const url = new URL(request.url);

        const explicitFragment = matchFragment(
          compiled,
          request,
          url.pathname,
          env,
          executionContext,
        );
        if (explicitFragment) {
          if (!explicitFragment.endpoint) {
            return new Response(null, { status: 404 });
          }

          const methods = fragmentMethods(explicitFragment.endpoint);
          const allow = allowHeader(methods);
          if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: { Allow: allow } });
          }
          if (!methods.has(request.method)) {
            return new Response(null, { status: 405, headers: { Allow: allow } });
          }

          const result = await explicitFragment.endpoint(explicitFragment.context);
          const response = result instanceof Response ? result : html(result);
          return request.method === "HEAD" ? withoutBody(response) : response;
        }

        const routeMatch = matchingRoutes(compiled, url.pathname).next().value;
        if (!routeMatch) {
          return new Response(null, { status: 404 });
        }

        const { fragments, leaf, allowed, allow } = routeMatch.route;
        if (allowed.size === 0) {
          return new Response(null, { status: 404 });
        }

        if (request.method === "OPTIONS") {
          return new Response(null, {
            status: 204,
            headers: { Allow: allow },
          });
        }

        if (!allowed.has(request.method)) {
          return new Response(null, {
            status: 405,
            headers: { Allow: allow },
          });
        }

        const ctx: RequestContext<Bindings> = {
          request,
          params: routeMatch.params,
          env,
          executionContext,
          signal: request.signal,
        };

        if (request.method === "HEAD") {
          if (leaf?.default) {
            return await routeHeadResponse(fragments as fragment[], ctx as RequestContext);
          }
          if (leaf?.loader) {
            return withoutBody(await dataResponse(leaf.loader as loader, ctx as RequestContext));
          }
          return new Response(null, { status: 404 });
        }

        if (request.method === "GET") {
          if (leaf?.default) {
            return await routeResponse(fragments as fragment[], ctx as RequestContext);
          }
          if (leaf?.loader) {
            return await dataResponse(leaf.loader as loader, ctx as RequestContext);
          }
          return new Response(null, { status: 404 });
        }

        if (leaf?.action) {
          return await dataResponse(leaf.action as action, ctx as RequestContext);
        }

        return new Response(null, { status: 404 });
      } catch (error) {
        if (error instanceof Response) {
          return request.method === "HEAD" ? withoutBody(error) : error;
        }
        throw error;
      }
    });
  };

  return { handle };
};

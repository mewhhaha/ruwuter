/**
 * @module
 *
 * Core router module for Ruwuter - a TypeScript web router designed exclusively for Cloudflare Workers.
 *
 * @example
 * ```typescript
 * import { Router } from "@mewhhaha/ruwuter";
 *
 * const routes = [
 *   [new URLPattern({ pathname: "/" }), [{ id: "home", mod: { default: () => <h1>Home</h1> } }]],
 *   [new URLPattern({ pathname: "/about" }), [{ id: "about", mod: { default: () => <h1>About</h1> } }]],
 * ];
 *
 * const router = Router(routes);
 *
 * export default {
 *   fetch: (request, env, ctx) => router.handle(request, env, ctx),
 * };
 * ```
 */

import type { JSX } from "./runtime/jsx.ts";
import { type Html, into, isHtml } from "./runtime/node.ts";
// SuspenseProvider must be applied by the consumer in their layout/document.
import { bindContext, runWithContextStore } from "./components/context.ts";
import { runWithHooksStore } from "./runtime/hooks.ts";

export type { Html } from "./runtime/node.ts";
export type { JSX } from "./runtime/jsx.ts";

/**
 * Renders an Html value to a string.
 *
 * @param value - The Html value to render
 * @returns The rendered HTML string
 */
export const render = (value: Html = into("")): string => {
  return value.toString();
};

/**
 * Environment bindings interface. Extend this interface to add your Cloudflare Workers bindings.
 */
// deno-lint-ignore no-empty-interface
export interface Env {}

/**
 * Context object passed to loaders, actions, and headers functions.
 */
export interface ctx {
  /** The incoming request */
  request: Request;
  /** URL parameters extracted from the route pattern */
  params: Record<string, string>;
  /** Cloudflare Workers context: [env, executionContext] */
  context: [Env, ExecutionContext];
}

/**
 * Loader function for GET requests. Fetches data that will be passed to the component.
 */
export type loader = (params: any) => any;

/**
 * Action function for non-GET requests (POST, PUT, DELETE, etc.).
 */
export type action = (params: any) => any;

/**
 * Component renderer function that returns JSX.
 */
export type renderer = (
  props: any,
) => JSX.Element | Promise<JSX.Element | string>;

/**
 * Headers function to set response headers based on request context and loader data.
 */
export type headers = (
  params: ctx & {
    loaderData: any | never;
  },
) =>
  | Promise<Record<string, string | undefined | null> | Headers>
  | Record<string, string | undefined | null>
  | Headers;

/**
 * Route module that can export loader, action, default component, and headers.
 */
export type mod = {
  /** Data loader for GET requests */
  loader?: loader;
  /** Action handler for non-GET requests */
  action?: action;
  /** Default component to render */
  default?: renderer;
  /** Headers to set on the response */
  headers?: headers;
} & Record<string, unknown>;

/**
 * Fragment represents a piece of a route with its associated module.
 */
export type fragment = { id: string; mod: mod; params?: string[] };

/**
 * Route tuple containing a URLPattern and its associated fragments.
 */
export type route = [pattern: URLPattern, fragments: fragment[]];

const HTML_COMPONENT_MARK = Symbol.for("ruwuter.html");

type HtmlProps = ctx;

type HtmlBrand = { readonly __ruwuterHtml?: true };
type HtmlRuntimeBrand = { [HTML_COMPONENT_MARK]?: true };

type HtmlComponent =
  & ((props: HtmlProps) => JSX.Element | Promise<JSX.Element | string>)
  & HtmlBrand;

const isHtmlComponent = (value: unknown): value is HtmlComponent => {
  return isFunction(value) && (value as HtmlRuntimeBrand)[HTML_COMPONENT_MARK] === true;
};

export function html<explicit extends HtmlProps>(
  render: (props: explicit) => JSX.Element | Promise<JSX.Element | string>,
): HtmlComponent {
  function component(
    props: HtmlProps,
  ): JSX.Element | Promise<JSX.Element | string> {
    return render(props as explicit);
  }

  component[HTML_COMPONENT_MARK] = true;
  return component;
}

function isFunction<Fn extends (...args: unknown[]) => unknown>(
  value: unknown,
): value is Fn {
  return typeof value === "function";
}

/**
 * Router interface with a handle method for processing requests.
 */
export type router = {
  /** Handles incoming requests and returns a Response */
  handle: (request: Request, ...args: ctx["context"]) => Promise<Response>;
};

/**
 * Creates a router instance from an array of routes.
 *
 * @param routes - Array of route tuples
 * @returns A router instance with a handle method
 *
 * @example
 * ```typescript
 * const router = Router([
 *   [new URLPattern({ pathname: "/users/:id" }), fragments]
 * ]);
 * ```
 */
const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

const resolveComponentName = (asset: string): string | undefined => {
  const match = /^([A-Z][A-Za-z0-9_$]*)\.html$/.exec(asset);
  return match?.[1];
};

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

const serveHtmlAsset = async (
  mod: mod,
  exportName: string,
  ctx: ctx,
): Promise<Response | undefined> => {
  const component = mod[exportName];
  if (!isHtmlComponent(component)) return undefined;

  const loader = isFunction<loader>(mod.loader) ? mod.loader : undefined;

  if (loader) {
    const result = await loader(ctx);
    if (result instanceof Response) return result;
  }

  const rendered = await component({
    params: ctx.params,
    request: ctx.request,
    context: ctx.context,
  });

  if (rendered instanceof Response) return rendered;
  if (!isHtml(rendered)) {
    throw new TypeError(
      `Component export "${exportName}" must return Html or Response when requested via __asset.`,
    );
  }
  return new Response(rendered.toReadableStream(), {
    status: 200,
    headers: HTML_HEADERS,
  });
};

const serveAsset = async (
  fragments: fragment[],
  asset: string,
  ctx: ctx,
): Promise<Response> => {
  const exportName = resolveComponentName(asset);
  if (!exportName) return new Response(null, { status: 404 });

  for (let index = fragments.length - 1; index >= 0; index--) {
    const response = await serveHtmlAsset(fragments[index].mod, exportName, ctx);
    if (response) return response;
  }

  return new Response(null, { status: 404 });
};

const runWithStores = (fn: () => Promise<Response>) =>
  runWithHooksStore(() => runWithContextStore(fn));

export const Router = (routes: route[]): router => {
  const handle = (
    request: Request,
    ...args: ctx["context"]
  ): Promise<Response> => {
    return runWithStores(async () => {
      let fragments: fragment[] | undefined;
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

      const assetName = params["__asset"];

      const ctx: ctx = {
        request,
        params,
        context: args,
      };

      if (assetName !== undefined) {
        return await serveAsset(fragments, assetName, ctx);
      }

      const leaf = fragments[fragments.length - 1]?.mod;
      if (!leaf) {
        return new Response(null, { status: 404 });
      }

      try {
        if (request.method === "GET") {
          if (leaf.default) {
            return await routeResponse(fragments, ctx);
          }
          if (leaf.loader) {
            return await dataResponse(leaf.loader, ctx);
          }
        } else if (leaf.action) {
          return await dataResponse(leaf.action, ctx);
        }

        return new Response(null, { status: 404 });
      } catch (e) {
        if (e instanceof Response) {
          return e;
        }

        if (e instanceof Error) {
          console.error(e.message);
        }

        return new Response(null, { status: 500 });
      }
    });
  };

  return {
    handle,
  };
};

const dataResponse = async (f: action | loader, ctx: ctx) => {
  const value = await f(ctx);
  if (value instanceof Response) {
    return value;
  }
  return Response.json(value);
};

const routeResponse = async (fragments: fragment[], ctx: ctx) => {
  const loaders: (Promise<unknown> | undefined)[] = fragments.map(
    (fragment) => fragment.mod.loader ? Promise.resolve(fragment.mod.loader(ctx)) : undefined,
  );
  const headers = new Headers({ "Content-Type": "text/html" });

  for (let i = 0; i < fragments.length; i++) {
    const { mod } = fragments[i];
    const loaderData = await loaders[i];
    if (loaderData instanceof Response) {
      throw loaderData;
    }

    if (!mod.headers) continue;
    const h = await mod.headers({
      request: ctx.request,
      params: ctx.params,
      context: ctx.context,
      loaderData,
    });
    if (!h) continue;
    for (const [k, v] of h instanceof Headers ? h : Object.entries(h)) {
      if (v != null) headers.append(k, v);
    }
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const renderFragment = async (index: number): Promise<Html> => {
    if (index >= fragments.length) {
      return into("");
    }

    const { mod } = fragments[index];
    const next = () => renderFragment(index + 1);
    const loaderData = await loaders[index];
    if (loaderData instanceof Response) {
      throw loaderData;
    }

    // Defer rendering of the child fragment until it is consumed so
    // outer providers can wrap inner fragments while keeping children
    // available as an Html instance for components that expect it.
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

    const result = isHtmlComponent(Component)
      ? await Component({
        children: childHtml,
        request: ctx.request,
        params: ctx.params,
        context: ctx.context,
      })
      : await (Component as renderer)({ loaderData, children: childHtml });

    if (result instanceof Response) {
      throw result;
    }

    return isHtml(result) ? result : into(result);
  };

  const node = await renderFragment(0);

  const htmlStream = node.toReadableStream();
  const reader = htmlStream.getReader();
  let firstChunk: Uint8Array | null = null;

  try {
    const first = await reader.read();
    if (!first.done && first.value) {
      firstChunk = first.value;
    }
  } catch (e) {
    if (e instanceof Response) {
      throw e;
    }
    throw e;
  }

  const startStreaming = async () => {
    try {
      const textEncoder = new TextEncoder();
      await writer.write(textEncoder.encode("<!doctype html>"));
      if (firstChunk) {
        await writer.write(firstChunk);
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    } catch (e) {
      if (e instanceof Response) {
        // A Response was thrown during streaming; we cannot change the
        // already-started response, so swallow to avoid unhandled rejections.
        return;
      }
      if (e instanceof Error) {
        console.error(e.message);
      }
    } finally {
      reader.releaseLock();
      await writer.close();
    }
  };

  // Start streaming under the captured context to preserve AsyncLocalStorage
  bindContext(startStreaming)();

  return new Response(stream.readable, {
    headers,
    status: 200,
  });
};

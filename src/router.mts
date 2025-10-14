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

import { type JSX } from "./runtime/jsx.mts";
import { into, isHtml, type Html } from "./runtime/node.mts";
// SuspenseProvider must be applied by the consumer in their layout/document.
import { runWithContextStore } from "./components/context.mts";
import { runWithHooksStore } from "./runtime/hooks.mts";

export type { Html } from "./runtime/node.mts";
export type { JSX } from "./runtime/jsx.mts";

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
};

/**
 * Fragment represents a piece of a route with its associated module.
 */
export type fragment = { id: string; mod: mod; params?: string[] };

/**
 * Route tuple containing a URLPattern and its associated fragments.
 */
export type route = [pattern: URLPattern, fragments: fragment[]];

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
export const Router = (routes: route[]): router => {
  const handle = (
    request: Request,
    ...args: ctx["context"]
  ): Promise<Response> => {
    return runWithHooksStore(() =>
      runWithContextStore(async () => {
        const urlStr = request.url;
        let fragments: fragment[] | undefined;
        let params: Record<string, string> | undefined;
        for (const [pattern, frags] of routes) {
          const match = pattern.exec(urlStr);
          if (match) {
            fragments = frags;
            params = match.pathname.groups as Record<string, string>;
            break;
          }
        }
        if (!fragments || !params) {
          return new Response(null, { status: 404 });
        }

        if (request.headers.has("fx-request")) {
          fragments = fragments.slice(1);
        }

        const ctx = { request, params, context: args };

        try {
          const leaf = fragments[fragments.length - 1]?.mod;

          if (request.method === "GET" && leaf?.default) {
            return await routeResponse(fragments, ctx);
          }

          if (request.method === "GET" && leaf?.loader) {
            return await dataResponse(leaf.loader, ctx);
          }

          if (request.method !== "GET" && leaf?.action) {
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
      }),
    );
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
  const loaders = await Promise.all(
    fragments.map(async (fragment) => {
      if (!fragment.mod.loader) return undefined;
      const result = await fragment.mod.loader(ctx);
      if (result instanceof Response) {
        throw result;
      }
      return result;
    }),
  );

  const init = new Headers({
    "Content-Type": "text/html",
  });
  const headers = await mergeFragmentHeaders(init, ctx, fragments, loaders);

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const createNode = async () => {
    let acc = into("");
    for (let index = fragments.length - 1; index >= 0; index--) {
      const { mod } = fragments[index];
      const Component = mod.default;
      if (!Component) continue;

      const loaderData = loaders[index];
      const result = await Component({ loaderData, children: acc });

      if (result instanceof Response) {
        throw result;
      }

      acc = isHtml(result) ? result : into(result);
    }

    return acc;
  };

  const node = await createNode();

  const htmlStream = node.toReadableStream();
  const reader = htmlStream.getReader();

  const startStreaming = async () => {
    try {
      const textEncoder = new TextEncoder();
      await writer.write(textEncoder.encode("<!doctype html>"));

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

  ctx.context[1].waitUntil(startStreaming());

  return new Response(stream.readable, {
    headers,
    status: 200,
  });
};

const mergeFragmentHeaders = async (
  headers: Headers,
  ctx: ctx,
  fragments: fragment[],
  loaders: (unknown | undefined)[],
) => {
  for (let i = 0; i < fragments.length; i++) {
    const { mod } = fragments[i];
    if (!mod.headers) continue;
    const h = await mod.headers({ ...ctx, loaderData: loaders[i] });
    if (!h) continue;
    for (const [k, v] of h instanceof Headers ? h : Object.entries(h)) {
      if (v != null) headers.append(k, v);
    }
  }
  return headers;
};

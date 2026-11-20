/** @module HTTP method routing and streaming HTML responses. */
import { renderRequest } from "./response.ts";
import { resolverPath } from "./components/suspense.ts";
import { resolverSource } from "./runtime/resolve-source.ts";

export { html, renderToStream, renderToString } from "./response.ts";
export { type Html, unsafeHTML } from "./runtime/node.ts";
export type { JSX } from "./runtime/jsx.ts";

type Params = Record<string, string | undefined>;
export interface HandlerContext<Bindings = undefined, Parameters = Params> {
  request: Request;
  params: Parameters;
  env: Bindings;
  signal: AbortSignal;
  executionContext?: { waitUntil(work: Promise<unknown>): void };
}
type Method = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
type Handler<Bindings, Parameters> = (
  context: HandlerContext<Bindings, Parameters>,
) => Response | Promise<Response>;
export type RouteHandlers<Bindings = undefined, Parameters = Params> = Partial<
  Record<Method, Handler<Bindings, Parameters>>
>;
type Pattern = string | URLPattern;
type Segment<S extends string> = S extends `:${infer N}?` ? { [K in N]?: string }
  : S extends `:${infer N}` ? { [K in N]: string }
  : unknown;
type PathParams<Path extends Pattern> = Path extends string ? string extends Path ? Params
  : Path extends `${infer First}/${infer Rest}` ? Segment<First> & PathParams<Rest>
  : Segment<Path>
  : Params;
type PlatformArgs<B> = [B] extends [undefined]
  ? [platform?: unknown, executionContext?: HandlerContext["executionContext"]]
  : [env: B, executionContext?: HandlerContext["executionContext"]];
export interface HttpRouter<Bindings = undefined> {
  route<Path extends Pattern>(
    path: Path,
    handlers: RouteHandlers<Bindings, PathParams<Path>>,
  ): HttpRouter<Bindings>;
  get<Path extends Pattern>(
    path: Path,
    handler: Handler<Bindings, PathParams<Path>>,
  ): HttpRouter<Bindings>;
  post<Path extends Pattern>(
    path: Path,
    handler: Handler<Bindings, PathParams<Path>>,
  ): HttpRouter<Bindings>;
  fetch(request: Request, ...platform: PlatformArgs<Bindings>): Promise<Response>;
}
const methods: readonly Method[] = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const resolverResponse = () =>
  new Response(resolverSource, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });

/** Build a Fetch handler. Paths match in registration order. */
export function router<Bindings = undefined>(
  table: readonly (readonly [URLPattern, RouteHandlers<Bindings, never>])[] = [],
): HttpRouter<Bindings> {
  const routes = new Map<
    Pattern,
    { pattern: URLPattern; handlers: RouteHandlers<Bindings>; allow: string }
  >();
  const app: HttpRouter<Bindings> = {
    route(path, handlers) {
      let route = routes.get(path);
      if (!route) {
        let pattern: Pattern = path;
        if (typeof path === "string") pattern = new URLPattern({ pathname: path });
        route = { pattern: pattern as URLPattern, handlers: Object.create(null), allow: "" };
      }
      const entries = methods.filter((method) => Object.hasOwn(handlers, method));
      if (!entries.length) throw new TypeError("A route needs at least one HTTP method handler.");
      for (const method of entries) {
        if (typeof handlers[method] !== "function" || route.handlers[method]) {
          throw new TypeError(
            `Invalid or duplicate ${method} handler for ${route.pattern.pathname}`,
          );
        }
      }
      for (const method of entries) {
        route.handlers[method] = handlers[method] as Handler<Bindings, Params>;
      }
      const allowed = new Set(Object.keys(route.handlers));
      if (allowed.has("GET")) allowed.add("HEAD");
      allowed.add("OPTIONS");
      route.allow = [...allowed].sort().join(", ");
      routes.set(path, route);
      return app;
    },
    get(path, handler) {
      return app.route(path, { GET: handler });
    },
    post(path, handler) {
      return app.route(path, { POST: handler });
    },
    async fetch(request, ...[env, executionContext]) {
      const pathname = new URL(request.url).pathname;
      for (const { pattern, handlers, allow } of routes.values()) {
        const match = pattern.exec({ pathname });
        if (!match) continue;
        const head = request.method === "HEAD";
        let handler = handlers[request.method as Method];
        if (head) handler ??= handlers.GET;
        if (!handler) {
          let status = 405;
          if (request.method === "OPTIONS") status = 204;
          return new Response(null, { status, headers: { Allow: allow } });
        }
        const lifetime = new AbortController();
        const signal = AbortSignal.any([request.signal, lifetime.signal]);
        signal.throwIfAborted();
        const cancel = (reason: unknown) => lifetime.abort(reason);
        const result = await renderRequest.withValue(
          { signal, cancel, head },
          () =>
            handler({
              request,
              params: match.pathname.groups,
              env: env as Bindings,
              executionContext,
              signal,
            }),
        );
        if (!(result instanceof Response)) {
          throw new TypeError("A route handler must return a Response.");
        }
        if (head && result.body) {
          cancel(new DOMException("HEAD omits the body.", "AbortError"));
          void result.body.cancel().catch(() => {});
          return new Response(null, {
            status: result.status,
            statusText: result.statusText,
            headers: result.headers,
          });
        }
        return result;
      }
      return new Response(null, { status: 404 });
    },
  };
  app.route(resolverPath, { GET: resolverResponse });
  for (const [pattern, handlers] of table) app.route(pattern, handlers as RouteHandlers<Bindings>);
  return app;
}

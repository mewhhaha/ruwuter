/** @module HTTP method routing and streaming HTML responses. */
import { runWithIsolatedContext } from "./components/context.ts";
import { renderRequest } from "./response.ts";
import { resolverPath } from "./components/suspense.ts";
import { resolverSource } from "./runtime/resolve-source.ts";

export { html, type HtmlOptions, renderToStream, renderToString } from "./response.ts";
export { type Html, unsafeHTML } from "./runtime/node.ts";
export type { JSX } from "./runtime/jsx.ts";

export interface RouterOptions {
  /**
   * URL emitted for the auto-injected panel resolver `<script>` tag.
   * Defaults to `"/_ruwuter/resolve-v1.js"` (root-relative, safe behind TLS-terminating
   * reverse proxies). Pass an explicit URL or per-request resolver function when documents
   * set a cross-origin `<base href>` or are served behind a subpath prefix.
   */
  resolverSrc?: string | ((request: Request) => string);
}

type Params = Record<string, string | undefined>;
export interface HandlerContext<Bindings = unknown, Parameters = Params> {
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
export type RouteHandlers<Bindings = unknown, Parameters = Params> = Partial<
  Record<Method, Handler<Bindings, Parameters>>
>;
type Pattern = string | URLPattern;
// Infer ordinary :name and :name? segments. URLPattern handles the full grammar;
// complex patterns conservatively expose a dictionary of possibly absent groups.
type SimpleName<S extends string> = S extends `${infer C}${infer Rest}`
  ? C extends "_" | "$" | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
    ? SimpleName<Rest>
  : Lowercase<C> extends Uppercase<C> ? false
  : SimpleName<Rest>
  : true;
type Segment<S extends string> = S extends `:${infer N}?`
  ? SimpleName<N> extends true ? { [K in N]?: string } : Params
  : S extends `:${infer N}` ? SimpleName<N> extends true ? { [K in N]: string } : Params
  : S extends `${string}:${string}` ? Params
  : unknown;
type SimplePathParams<Path extends string> = Path extends `${infer First}/${infer Rest}`
  ? Segment<First> & SimplePathParams<Rest>
  : Segment<Path>;
type PatternSyntax = "(" | ")" | "{" | "}" | "*" | "+" | "\\";
type PathParams<Path extends Pattern> = Path extends string ? string extends Path ? Params
  : Path extends `${string}${PatternSyntax}${string}` ? Params
  : SimplePathParams<Path>
  : Params;
type PlatformArgs<B> = unknown extends B
  ? [platform?: unknown, executionContext?: HandlerContext["executionContext"]]
  : [B] extends [undefined] ? [env?: B, executionContext?: HandlerContext["executionContext"]]
  : [env: B, executionContext?: HandlerContext["executionContext"]];
export interface HttpRouter<Bindings = unknown> {
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
const resolverHeaders = {
  "Content-Type": "text/javascript; charset=utf-8",
  "Cache-Control": "public, max-age=31536000, immutable",
};
const resolverResponse = () => new Response(resolverSource, { headers: resolverHeaders });

const STATIC_PATH_PATTERN = /^\/[A-Za-z0-9/_.~-]*$/;
const SIMPLE_LITERAL_SEGMENT = /^[A-Za-z0-9_.~-]+$/;
const SIMPLE_PARAM_SEGMENT = /^:([A-Za-z_$][A-Za-z0-9_$]*)$/;

type SegmentSpec = { kind: "literal"; value: string } | { kind: "param"; name: string };
type CompiledMatcher =
  | { kind: "static"; pathname: string }
  | { kind: "segments"; segments: readonly SegmentSpec[] }
  | { kind: "pattern"; pattern: URLPattern };

const extractPathname = (url: string): string => {
  const scheme = url.indexOf("://");
  if (scheme === -1) return new URL(url).pathname;
  let start = -1;
  for (let i = scheme + 3; i < url.length; i++) {
    const ch = url.charCodeAt(i);
    if (ch === 47) {
      start = i;
      break;
    }
    if (ch === 63 || ch === 35) return "/";
  }
  if (start === -1) return "/";
  for (let i = start; i < url.length; i++) {
    const ch = url.charCodeAt(i);
    if (ch === 63 || ch === 35) return url.slice(start, i);
  }
  return url.slice(start);
};

const isPathnameOnlyPattern = (pattern: URLPattern): boolean =>
  pattern.protocol === "*" &&
  pattern.username === "*" &&
  pattern.password === "*" &&
  pattern.hostname === "*" &&
  pattern.port === "*" &&
  pattern.search === "*" &&
  pattern.hash === "*" &&
  !(pattern as URLPattern & { hasRegExpGroups?: boolean }).hasRegExpGroups;

const flipFirstAsciiLetter = (value: string): string | undefined => {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      return value.slice(0, i) + String.fromCharCode(code + 32) + value.slice(i + 1);
    }
    if (code >= 97 && code <= 122) {
      return value.slice(0, i) + String.fromCharCode(code - 32) + value.slice(i + 1);
    }
  }
  return undefined;
};

const isCaseSensitivePathname = (pattern: URLPattern, pathname: string): boolean => {
  const sample = pathname.replace(/:([A-Za-z_$][A-Za-z0-9_$]*)/g, "0");
  const flipped = flipFirstAsciiLetter(sample);
  if (!flipped) return true;
  return !pattern.test("http://a.test" + flipped);
};

const compileMatcher = (path: Pattern, pattern: URLPattern): CompiledMatcher => {
  const pathname = typeof path === "string" ? path : pattern.pathname;
  if (
    typeof path !== "string" &&
    (!isPathnameOnlyPattern(pattern) || !isCaseSensitivePathname(pattern, pathname))
  ) {
    return { kind: "pattern", pattern };
  }
  if (STATIC_PATH_PATTERN.test(pathname)) {
    return { kind: "static", pathname };
  }
  if (!pathname.startsWith("/") || pathname.endsWith("/")) {
    return { kind: "pattern", pattern };
  }
  const rawSegments = pathname.slice(1).split("/");
  const segments: SegmentSpec[] = [];
  const seenParams = new Set<string>();
  for (const seg of rawSegments) {
    if (SIMPLE_LITERAL_SEGMENT.test(seg)) {
      segments.push({ kind: "literal", value: seg });
      continue;
    }
    const param = SIMPLE_PARAM_SEGMENT.exec(seg);
    if (param && !seenParams.has(param[1])) {
      seenParams.add(param[1]);
      segments.push({ kind: "param", name: param[1] });
      continue;
    }
    return { kind: "pattern", pattern };
  }
  return { kind: "segments", segments };
};

const matchSegments = (
  pathname: string,
  segments: readonly SegmentSpec[],
): Params | undefined => {
  if (pathname.charCodeAt(0) !== 47) return undefined;
  const len = pathname.length;
  let pos = 1;
  let params: Params | undefined;
  for (let i = 0; i < segments.length; i++) {
    const slash = pathname.indexOf("/", pos);
    const isLast = i === segments.length - 1;
    if (isLast) {
      if (slash !== -1) return undefined;
    } else if (slash === -1) {
      return undefined;
    }
    const end = isLast ? len : slash;
    const segLen = end - pos;
    if (segLen === 0) return undefined;
    const spec = segments[i];
    if (spec.kind === "literal") {
      if (segLen !== spec.value.length || !pathname.startsWith(spec.value, pos)) {
        return undefined;
      }
    } else {
      params ??= {};
      params[spec.name] = pathname.slice(pos, end);
    }
    pos = end + 1;
  }
  return params ?? {};
};

type RouteEntry<Bindings> = {
  pattern: URLPattern;
  matcher: CompiledMatcher;
  handlers: RouteHandlers<Bindings>;
  allow: string;
};

/** Build a Fetch handler. Paths match in registration order. */
export function router<Bindings = unknown>(
  table: readonly (readonly [URLPattern, RouteHandlers<Bindings, never>])[] = [],
  options: RouterOptions = {},
): HttpRouter<Bindings> {
  const routes = new Map<Pattern, RouteEntry<Bindings>>();
  const staticRoutes = new Map<string, RouteEntry<Bindings>>();
  const dynamicRoutes: RouteEntry<Bindings>[] = [];
  const app: HttpRouter<Bindings> = {
    route(path, handlers) {
      const existing = routes.get(path);
      const isNew = !existing;
      const route = existing ?? (() => {
        const pattern: URLPattern = typeof path === "string"
          ? new URLPattern({ pathname: path })
          : path as URLPattern;
        const matcher = compileMatcher(path, pattern);
        return { pattern, matcher, handlers: Object.create(null), allow: "" };
      })();
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
      if (isNew) {
        routes.set(path, route);
        // Leading literal routes resolve in O(1) without changing registration-order precedence.
        if (dynamicRoutes.length === 0 && route.matcher.kind === "static") {
          if (!staticRoutes.has(route.matcher.pathname)) {
            staticRoutes.set(route.matcher.pathname, route);
          }
        } else {
          dynamicRoutes.push(route);
        }
      }
      return app;
    },
    get(path, handler) {
      return app.route(path, { GET: handler });
    },
    post(path, handler) {
      return app.route(path, { POST: handler });
    },
    async fetch(request, ...[env, executionContext]) {
      const pathname = extractPathname(request.url);
      if (pathname === resolverPath) {
        if (request.method === "GET") return resolverResponse();
        if (request.method === "HEAD") {
          return new Response(null, { status: 200, headers: resolverHeaders });
        }
        const status = request.method === "OPTIONS" ? 204 : 405;
        return new Response(null, { status, headers: { Allow: "GET, HEAD, OPTIONS" } });
      }

      let matchedRoute = staticRoutes.get(pathname);
      let matchedParams: Params | undefined = matchedRoute ? {} : undefined;
      if (!matchedRoute) {
        for (let i = 0; i < dynamicRoutes.length; i++) {
          const entry = dynamicRoutes[i];
          const { matcher } = entry;
          if (matcher.kind === "static") {
            if (pathname !== matcher.pathname) continue;
            matchedRoute = entry;
            matchedParams = {};
            break;
          }
          if (matcher.kind === "segments") {
            const groups = matchSegments(pathname, matcher.segments);
            if (!groups) continue;
            matchedRoute = entry;
            matchedParams = groups;
            break;
          }
          const match = matcher.pattern.exec(request.url);
          if (!match) continue;
          matchedRoute = entry;
          matchedParams = match.pathname.groups;
          break;
        }
      }

      if (!matchedRoute) return new Response(null, { status: 404 });

      const { handlers, allow } = matchedRoute;
      const head = request.method === "HEAD";
      let handler = handlers[request.method as Method];
      if (head) handler ??= handlers.GET;
      if (!handler) {
        let status = 405;
        if (request.method === "OPTIONS") status = 204;
        return new Response(null, { status, headers: { Allow: allow } });
      }
      request.signal.throwIfAborted();
      let lifetime: AbortController | undefined;
      let combined: AbortSignal | undefined;
      let cancelled = false;
      let cancelReason: unknown;
      const getSignal = (): AbortSignal => {
        if (!combined) {
          lifetime = new AbortController();
          if (cancelled) lifetime.abort(cancelReason);
          combined = AbortSignal.any([request.signal, lifetime.signal]);
        }
        return combined;
      };
      const streamSignal = (): AbortSignal => combined ?? request.signal;
      const cancel = (reason: unknown) => {
        cancelled = true;
        cancelReason = reason;
        lifetime?.abort(reason);
      };
      const resolverSrc = typeof options.resolverSrc === "function"
        ? options.resolverSrc(request)
        : (options.resolverSrc ?? resolverPath);
      const context: HandlerContext<Bindings> = {
        request,
        params: matchedParams!,
        env: env as Bindings,
        executionContext,
        get signal() {
          return getSignal();
        },
      };
      try {
        const result = await runWithIsolatedContext(
          renderRequest,
          { getSignal, streamSignal, cancel, head, resolverSrc },
          () => handler(context),
        );
        if (!(result instanceof Response)) {
          throw new TypeError("A route handler must return a Response.");
        }
        if (head) {
          cancel(new DOMException("HEAD omits the body.", "AbortError"));
          if (!result.body) return result;
          void result.body.cancel().catch(() => {});
          return new Response(null, {
            status: result.status,
            statusText: result.statusText,
            headers: result.headers,
          });
        }
        if (request.method === "OPTIONS" && result.status && !result.headers.has("Allow")) {
          const headers = new Headers(result.headers);
          headers.set("Allow", allow);
          return new Response(result.body, {
            status: result.status,
            statusText: result.statusText,
            headers,
          });
        }
        return result;
      } catch (error) {
        cancel(error);
        throw error;
      }
    },
  };
  for (const [pattern, handlers] of table) app.route(pattern, handlers as RouteHandlers<Bindings>);
  return app;
}

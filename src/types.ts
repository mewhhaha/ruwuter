/**
 * @module
 *
 * TypeScript utility types for Ruwuter applications.
 * Provides type inference helpers for components, loaders, actions, and headers.
 *
 * @example
 * ```typescript
 * import type { InferComponentProps, InferLoaderArgs } from "@mewhhaha/ruwuter/types";
 *
 * // Infer component props from a module
 * type Props = InferComponentProps<typeof import("./route.tsx")>;
 *
 * // Type-safe loader arguments
 * export const loader = (args: InferLoaderArgs<{ id: string }>) => {
 *   const userId = args.params.id; // typed as string
 *   return { user: await getUser(userId) };
 * };
 * ```
 */

import type { Env, RequestContext } from "./router.ts";
import type { JSX } from "./runtime/jsx.ts";

/**
 * Infers the props type for a component based on its module exports.
 *
 * @typeParam module - The module type containing loader and default exports
 */
export type InferComponentProps<module> = {
  children?: JSX.Element;
  loaderData: module extends {
    loader: infer loader extends (...args: unknown[]) => unknown;
  } ? Awaited<ReturnType<loader>>
    : undefined;
};

/**
 * Infers the argument type for loader functions with typed route parameters.
 *
 * @typeParam params - Route parameters as a Record<string, string>
 */
export type InferLoaderArgs<params extends Record<string, string>> = {
  params: params;
} & Omit<RequestContext<Env>, "params">;

/**
 * Infers the argument type for action functions with typed route parameters.
 *
 * @typeParam params - Route parameters as a Record<string, string>
 */
export type InferActionArgs<params extends Record<string, string>> = {
  params: params;
} & Omit<RequestContext<Env>, "params">;

/**
 * Infers the type for headers functions with typed parameters and loader data.
 *
 * @typeParam params - Route parameters as a Record<string, string>
 * @typeParam module - The module type containing the loader export
 */
export type InferHeadersFunction<
  params extends Record<string, string>,
  module,
> = (
  args: {
    params: params;
    loaderData: module extends {
      loader: infer loader extends (...args: unknown[]) => unknown;
    } ? Awaited<ReturnType<loader>>
      : undefined;
  } & Omit<RequestContext<Env>, "params">,
) => Promise<Headers | HeadersLike> | Headers | HeadersLike;

type HeadersLike = {
  [key in CommonHeaders | OpenString]?: string | undefined | null;
};

type OpenString = string & Record<never, never>;

type CommonHeaders =
  | "Accept"
  | "Accept-CH"
  | "Accept-Encoding"
  | "Accept-Language"
  | "Accept-Patch"
  | "Accept-Post"
  | "Accept-Ranges"
  | "Access-Control-Allow-Credentials"
  | "Access-Control-Allow-Headers"
  | "Access-Control-Allow-Methods"
  | "Access-Control-Allow-Origin"
  | "Access-Control-Expose-Headers"
  | "Access-Control-Max-Age"
  | "Access-Control-Request-Headers"
  | "Access-Control-Request-Method"
  | "Age"
  | "Allow"
  | "Alt-Svc"
  | "Alt-Used"
  | "Attribution-Reporting-Eligible"
  | "Attribution-Reporting-Register-Source"
  | "Attribution-Reporting-Register-Trigger"
  | "Authorization"
  | "Cache-Control"
  | "Clear-Site-Data"
  | "Connection"
  | "Content-Digest"
  | "Content-Disposition"
  | "Content-DPR"
  | "Content-Encoding"
  | "Content-Language"
  | "Content-Length"
  | "Content-Location"
  | "Content-Range"
  | "Content-Security-Policy"
  | "Content-Security-Policy-Report-Only"
  | "Content-Type"
  | "Cookie"
  | "Critical-CH"
  | "Cross-Origin-Embedder-Policy"
  | "Cross-Origin-Opener-Policy"
  | "Cross-Origin-Resource-Policy"
  | "Date"
  | "Device-Memory"
  | "DNT"
  | "Downlink"
  | "DPR"
  | "Early-Data"
  | "ECT"
  | "ETag"
  | "Expect"
  | "Expect-CT"
  | "Expires"
  | "Forwarded"
  | "From"
  | "Host"
  | "If-Match"
  | "If-Modified-Since"
  | "If-None-Match"
  | "If-Range"
  | "If-Unmodified-Since"
  | "Keep-Alive"
  | "Last-Modified"
  | "Link"
  | "Location"
  | "Max-Forwards"
  | "NEL"
  | "No-Vary-Search"
  | "Observe-Browsing-Topics"
  | "Origin"
  | "Origin-Agent-Cluster"
  | "Permissions-Policy"
  | "Pragma"
  | "Priority"
  | "Proxy-Authenticate"
  | "Proxy-Authorization"
  | "Range"
  | "Referer"
  | "Referrer-Policy"
  | "Refresh"
  | "Report-To"
  | "Reporting-Endpoints"
  | "Repr-Digest"
  | "Retry-After"
  | "RTT"
  | "Save-Data"
  | "Sec-Browsing-Topics"
  | "Sec-CH-Prefers-Color-Scheme"
  | "Sec-CH-Prefers-Reduced-Motion"
  | "Sec-CH-Prefers-Reduced-Transparency"
  | "Sec-CH-UA"
  | "Sec-CH-UA-Arch"
  | "Sec-CH-UA-Bitness"
  | "Sec-CH-UA-Full-Version"
  | "Sec-CH-UA-Full-Version-List"
  | "Sec-CH-UA-Mobile"
  | "Sec-CH-UA-Model"
  | "Sec-CH-UA-Platform"
  | "Sec-CH-UA-Platform-Version"
  | "Sec-Fetch-Dest"
  | "Sec-Fetch-Mode"
  | "Sec-Fetch-Site"
  | "Sec-Fetch-User"
  | "Sec-GPC"
  | "Sec-Purpose"
  | "Sec-WebSocket-Accept"
  | "Sec-WebSocket-Extensions"
  | "Sec-WebSocket-Key"
  | "Sec-WebSocket-Protocol"
  | "Sec-WebSocket-Version"
  | "Server"
  | "Server-Timing"
  | "Service-Worker"
  | "Service-Worker-Allowed"
  | "Service-Worker-Navigation-Preload"
  | "Set-Cookie"
  | "Set-Login"
  | "SourceMap"
  | "Speculation-Rules"
  | "Strict-Transport-Security"
  | "Supports-Loading-Mode"
  | "TE"
  | "Timing-Allow-Origin"
  | "Tk"
  | "Trailer"
  | "Transfer-Encoding"
  | "Upgrade"
  | "Upgrade-Insecure-Requests"
  | "User-Agent"
  | "Vary"
  | "Via"
  | "Viewport-Width"
  | "Want-Content-Digest"
  | "Want-Repr-Digest"
  | "Warning"
  | "Width"
  | "WWW-Authenticate"
  | "X-Content-Type-Options"
  | "X-DNS-Prefetch-Control"
  | "X-Forwarded-For"
  | "X-Forwarded-Host"
  | "X-Forwarded-Proto"
  | "X-Frame-Options"
  | "X-Permitted-Cross-Domain-Policies"
  | "X-Powered-By"
  | "X-Robots-Tag"
  | "X-XSS-Protection";

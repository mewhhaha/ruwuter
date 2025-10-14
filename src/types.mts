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

import type { Env } from "./router.mts";
import { type JSX } from "./runtime/jsx.mts";
import type { ExecutionContext } from "@cloudflare/workers-types";

/**
 * Infers the props type for a component based on its module exports.
 *
 * @typeParam module - The module type containing loader and default exports
 */
export type InferComponentProps<module> = {
  children?: JSX.Element;
  loaderData: module extends {
    loader: infer loader extends (...args: any) => any;
  }
    ? Awaited<ReturnType<loader>>
    : undefined;
};

/**
 * Infers the argument type for loader functions with typed route parameters.
 *
 * @typeParam params - Route parameters as a Record<string, string>
 */
export type InferLoaderArgs<params extends Record<string, string>> = {
  request: Request;
  params: params;
  context: [Env, ExecutionContext];
};

/**
 * Infers the argument type for action functions with typed route parameters.
 *
 * @typeParam params - Route parameters as a Record<string, string>
 */
export type InferActionArgs<params extends Record<string, string>> = {
  request: Request;
  params: params;
  context: [Env, ExecutionContext];
};

/**
 * Infers the type for headers functions with typed parameters and loader data.
 *
 * @typeParam params - Route parameters as a Record<string, string>
 * @typeParam module - The module type containing the loader export
 */
export type InferHeadersFunction<
  params extends Record<string, string>,
  module,
> = (args: {
  request: Request;
  params: params;
  context: [Env, ExecutionContext];
  loaderData: module extends {
    loader: infer loader extends (...args: any) => any;
  }
    ? ReturnType<loader>
    : undefined;
}) => Promise<Headers | HeadersLike> | Headers | HeadersLike;

type HeadersLike = {
  [key in CommonHeaders | (string & {})]?: string | undefined | null;
};

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
  | "Attribution-Reporting-Eligible Experimental"
  | "Attribution-Reporting-Register-Source Experimental"
  | "Attribution-Reporting-Register-Trigger Experimental"
  | "Authorization"
  | "Cache-Control"
  | "Clear-Site-Data"
  | "Connection"
  | "Content-Digest"
  | "Content-Disposition"
  | "Content-DPR Non-standard Deprecated"
  | "Content-Encoding"
  | "Content-Language"
  | "Content-Length"
  | "Content-Location"
  | "Content-Range"
  | "Content-Security-Policy"
  | "Content-Security-Policy-Report-Only"
  | "Content-Type"
  | "Cookie"
  | "Critical-CH Experimental"
  | "Cross-Origin-Embedder-Policy"
  | "Cross-Origin-Opener-Policy"
  | "Cross-Origin-Resource-Policy"
  | "Date"
  | "Device-Memory"
  | "DNT Non-standard Deprecated"
  | "Downlink Experimental"
  | "DPR Non-standard Deprecated"
  | "Early-Data Experimental"
  | "ECT Experimental"
  | "ETag"
  | "Expect"
  | "Expect-CT Deprecated"
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
  | "NEL Experimental"
  | "No-Vary-Search Experimental"
  | "Observe-Browsing-Topics Experimental Non-standard"
  | "Origin"
  | "Origin-Agent-Cluster Experimental"
  | "Permissions-Policy Experimental"
  | "Pragma Deprecated"
  | "Priority"
  | "Proxy-Authenticate"
  | "Proxy-Authorization"
  | "Range"
  | "Referer"
  | "Referrer-Policy"
  | "Refresh"
  | "Report-To Non-standard Deprecated"
  | "Reporting-Endpoints Experimental"
  | "Repr-Digest"
  | "Retry-After"
  | "RTT Experimental"
  | "Save-Data Experimental"
  | "Sec-Browsing-Topics Experimental Non-standard"
  | "Sec-CH-Prefers-Color-Scheme Experimental"
  | "Sec-CH-Prefers-Reduced-Motion Experimental"
  | "Sec-CH-Prefers-Reduced-Transparency Experimental"
  | "Sec-CH-UA Experimental"
  | "Sec-CH-UA-Arch Experimental"
  | "Sec-CH-UA-Bitness Experimental"
  | "Sec-CH-UA-Full-Version Deprecated"
  | "Sec-CH-UA-Full-Version-List Experimental"
  | "Sec-CH-UA-Mobile Experimental"
  | "Sec-CH-UA-Model Experimental"
  | "Sec-CH-UA-Platform Experimental"
  | "Sec-CH-UA-Platform-Version Experimental"
  | "Sec-Fetch-Dest"
  | "Sec-Fetch-Mode"
  | "Sec-Fetch-Site"
  | "Sec-Fetch-User"
  | "Sec-GPC Experimental"
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
  | "Set-Login Experimental"
  | "SourceMap"
  | "Speculation-Rules Experimental"
  | "Strict-Transport-Security"
  | "Supports-Loading-Mode Experimental"
  | "TE"
  | "Timing-Allow-Origin"
  | "Tk Non-standard Deprecated"
  | "Trailer"
  | "Transfer-Encoding"
  | "Upgrade"
  | "Upgrade-Insecure-Requests"
  | "User-Agent"
  | "Vary"
  | "Via"
  | "Viewport-Width Non-standard Deprecated"
  | "Want-Content-Digest"
  | "Want-Repr-Digest"
  | "Warning Deprecated"
  | "Width Non-standard Deprecated"
  | "WWW-Authenticate"
  | "X-Content-Type-Options"
  | "X-DNS-Prefetch-Control Non-standard"
  | "X-Forwarded-For Non-standard"
  | "X-Forwarded-Host Non-standard"
  | "X-Forwarded-Proto Non-standard"
  | "X-Frame-Options"
  | "X-Permitted-Cross-Domain-Policies Non-standard"
  | "X-Powered-By Non-standard"
  | "X-Robots-Tag Non-standard"
  | "X-XSS-Protection Non-standard ";

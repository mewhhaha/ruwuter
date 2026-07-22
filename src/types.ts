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

type HeadersLike = Record<string, string | undefined | null>;

/**
 * @module
 *
 * Suspense components for progressive rendering in Ruwuter applications.
 */

import { createContext } from "./context.ts";
import { Fragment, type JSX, jsx } from "@mewhhaha/ruwuter/jsx-runtime";
import { registerBodyTail } from "../runtime/body-tail.ts";
import { fromParts, into, rendered } from "../runtime/node.ts";

type Settled = { id: string; html: string };
type SuspenseErrorFallback = JSX.HtmlNode | ((error: unknown) => JSX.HtmlNode);

type SuspenseRegistry = {
  /** Unique prefix that keeps this registry's boundary ids document-scoped. */
  prefix?: string;
  requestURL?: string;
  signal?: AbortSignal;
  bootstrapped?: boolean;
  /** Monotonic id source for boundaries within one render. */
  counter: number;
  /** Boundaries registered but not yet settled. */
  pending: number;
  /** Settled boundaries waiting to be emitted by `Resolve`. */
  queue: Settled[];
  /** Wakes a `Resolve` that is waiting for the next settlement. */
  wake: (() => void) | undefined;
};

const context = createContext<SuspenseRegistry | undefined>(undefined);
const shell = createContext<SuspenseRegistry | undefined>(undefined);

type SuspenseProps<AS extends keyof JSX.IntrinsicElements = "div"> = {
  as?: AS;
  fallback: JSX.HtmlNode;
  /** Content to replace the fallback when the boundary's child rejects. */
  errorFallback?: SuspenseErrorFallback;
  children?: JSX.HtmlNode | (() => JSX.HtmlNode);
} & Omit<JSX.IntrinsicElements[AS], "children">;

/**
 * Suspense boundary that streams fallback immediately and resolved content later.
 */
export function Suspense<AS extends keyof JSX.IntrinsicElements = "div">({
  fallback,
  errorFallback,
  as,
  children,
  ...props
}: SuspenseProps<AS>): JSX.Element {
  return rendered(
    (async function* () {
      const registry = context.use();
      // Function children are called lazily by the renderer; escaping applies
      // to any plain-string results.
      const content = fromParts([{ v: children, esc: true }]);

      if (!registry) {
        // No registry -> render children directly (no fallback streaming)
        yield* content.generator;
        return;
      }

      // With registry -> register the resolving content and stream fallback now
      registry.prefix ??= crypto.randomUUID();
      const id = `rw-${registry.prefix}-${registry.counter++}`;
      registry.pending++;
      // Resolve recovery content in the boundary's own task and lexical context.
      // A slow recovery must not block delivery of another finished panel.
      const run = async () => {
        let html: string | undefined;
        try {
          html = await content.toPromise();
        } catch (error) {
          if (registry.signal?.aborted) return;
          console.error("Suspense boundary failed", error);
          if (errorFallback === undefined) return;
          try {
            let fallback: unknown = errorFallback;
            if (typeof errorFallback === "function") fallback = await errorFallback(error);
            html = await into(fallback).toPromise();
          } catch (cause) {
            if (!registry.signal?.aborted) console.error("Suspense error fallback failed", cause);
          }
        } finally {
          registry.pending--;
          if (html !== undefined && !registry.signal?.aborted) registry.queue.push({ id, html });
          registry.wake?.();
        }
      };
      void shell.withValue(undefined, run);

      // Emit fallback wrapper immediately
      yield* jsx(as ?? "div", { ...props, id, children: fallback }).generator;
    })(),
  );
}

/**
 * Streams resolved Suspense content. Define once near the end of <body>.
 * The router serves its parser-executed resolver as a same-origin external asset.
 */
export const Resolve = (): JSX.Element => {
  return rendered(
    (async function* () {
      const registry = context.use();
      if (!registry) return;

      while (registry.pending > 0 || registry.queue.length > 0) {
        registry.signal?.throwIfAborted();
        if (registry.queue.length === 0) {
          const next = Promise.withResolvers<void>();
          const wake = () => next.resolve();
          registry.wake = wake;
          registry.signal?.addEventListener("abort", wake, { once: true });
          await next.promise;
          registry.signal?.removeEventListener("abort", wake);
          registry.wake = undefined;
          continue;
        }

        const { id, html } = registry.queue.shift()!;
        if (registry.requestURL && !registry.bootstrapped) {
          registry.bootstrapped = true;
          yield* jsx("script", { src: new URL(resolverPath, registry.requestURL).href }).generator;
        }
        yield `<template data-rw-target="${id}">${html}</template><!--rw-end-->`;
      }
    })(),
  );
};

type SuspenseProviderProps = {
  children?: JSX.HtmlNode;
};

/**
 * Enables streaming Suspense by wiring a per-render registry and appending `<Resolve />`.
 */
export const SuspenseProvider = ({
  children,
}: SuspenseProviderProps): JSX.Element => {
  const registry: SuspenseRegistry = {
    counter: 0,
    pending: 0,
    queue: [],
    wake: undefined,
  };
  const provided = jsx(Fragment, {
    children: [children, jsx(Resolve, {})],
  });

  return jsx(context.Provider, {
    value: registry,
    children: provided,
  });
};

/** @internal The classic asset is served by router().fetch. */
export const resolverPath = "/_ruwuter/resolve-v1.js";

registerBodyTail(() => {
  const scope = context.use();
  if (scope && scope === shell.use() && (scope.pending || scope.queue.length)) return Resolve();
});

/** @internal Each response owns its boundaries, including fragment-only responses. */
export function withPanels(value: unknown, signal: AbortSignal, requestURL: string): JSX.Element {
  const registry: SuspenseRegistry = {
    signal,
    requestURL,
    counter: 0,
    pending: 0,
    queue: [],
    wake: undefined,
  };
  return shell.withValue(
    registry,
    () => context.Provider({ value: registry, children: [into(value), jsx(Resolve, {})] }),
  );
}

/** @internal Capture the caller's application context, isolating the inner render's panel queue. */
export function ordered(value: unknown): JSX.Element {
  return context.Provider({ value: undefined, children: into(value) });
}

/** A deferred HTML panel. Outside a routed response its children render in order. */
export const Deferred: typeof Suspense = Suspense;

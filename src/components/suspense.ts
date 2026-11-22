/**
 * @module
 *
 * Suspense components for progressive rendering in Ruwuter applications.
 */

import { createContext } from "./context.ts";
import { type JSX, jsx } from "@mewhhaha/ruwuter/jsx-runtime";
import { registerBodyTail } from "../runtime/body-tail.ts";
import { fromParts, type Html, into, rendered } from "../runtime/node.ts";

type Settled = { id: string; html: string };
type SuspenseErrorFallback = JSX.HtmlNode | ((error: unknown) => JSX.HtmlNode);

type SuspenseRegistry = {
  /** Unique prefix that keeps this registry's boundary ids document-scoped. */
  prefix?: string;
  resolverSrc?: string;
  nonce?: string;
  getSignal?: () => AbortSignal;
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

type SuspenseScope = {
  registry: SuspenseRegistry;
  isShell: boolean;
};

const context = createContext<SuspenseScope | undefined>(undefined);

type SuspenseProps<AS extends keyof JSX.IntrinsicElements = "div"> = {
  /** Tag name for the temporary fallback wrapper element. Replaced when content settles. */
  as?: AS;
  fallback: JSX.HtmlNode;
  /** Content to render when the boundary's child rejects. */
  errorFallback?: SuspenseErrorFallback;
  children?: JSX.HtmlNode | (() => JSX.HtmlNode);
} & Omit<JSX.IntrinsicElements[AS], "children" | "id">;

/**
 * Suspense boundary that streams fallback immediately and resolved content later.
 * Wrapper props (`as` and attributes) apply only to the fallback element before replacement.
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
      const scope = context.use();
      // Function children are called lazily by the renderer; escaping applies
      // to any plain-string results.
      const content = fromParts([{ v: children, esc: true }]);

      if (!scope) {
        // No registry -> render children in document order
        if (errorFallback === undefined) {
          yield* content.generator;
          return;
        }
        try {
          yield await content.toPromise();
        } catch (error) {
          console.error("Suspense boundary failed", error);
          let fallbackNode: unknown = errorFallback;
          if (typeof errorFallback === "function") fallbackNode = await errorFallback(error);
          yield* into(fallbackNode).generator;
        }
        return;
      }

      const { registry } = scope;
      const signal = registry.getSignal?.();

      // With registry -> register the resolving content and stream fallback now
      registry.prefix ??= crypto.randomUUID();
      const id = `rw-${registry.prefix}-${registry.counter++}`;
      registry.pending++;
      // Resolve recovery content in the boundary's own task and lexical context.
      // A slow recovery must not block delivery of another finished panel.
      const run = async () => {
        let html: string | undefined;
        try {
          html = await content.toPromise({ signal });
        } catch (error) {
          if (signal?.aborted) return;
          console.error("Suspense boundary failed", error);
          if (errorFallback === undefined) return;
          try {
            let fallbackNode: unknown = errorFallback;
            if (typeof errorFallback === "function") fallbackNode = await errorFallback(error);
            html = await into(fallbackNode).toPromise({ signal });
          } catch (cause) {
            if (!signal?.aborted) console.error("Suspense error fallback failed", cause);
          }
        } finally {
          registry.pending--;
          if (html !== undefined && !signal?.aborted) registry.queue.push({ id, html });
          registry.wake?.();
        }
      };
      void context.withValue({ registry, isShell: false }, run);

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
      const scope = context.use();
      if (!scope) return;
      const { registry } = scope;
      const signal = registry.getSignal?.();

      while (registry.pending > 0 || registry.queue.length > 0) {
        signal?.throwIfAborted();
        if (registry.queue.length === 0) {
          const next = Promise.withResolvers<void>();
          const wake = () => next.resolve();
          registry.wake = wake;
          signal?.addEventListener("abort", wake, { once: true });
          await next.promise;
          signal?.removeEventListener("abort", wake);
          registry.wake = undefined;
          continue;
        }

        const { id, html } = registry.queue.shift()!;
        if (registry.resolverSrc && !registry.bootstrapped) {
          registry.bootstrapped = true;
          const attrs: Record<string, string> = {
            src: registry.resolverSrc,
            "data-rw-resolver": "",
          };
          if (registry.nonce !== undefined) attrs.nonce = registry.nonce;
          yield* jsx("script", attrs).generator;
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
  return context.Provider({
    value: { registry, isShell: false },
    children: [children, jsx(Resolve, {})],
  });
};

/** @internal The classic asset is served by router().fetch. */
export const resolverPath = "/_ruwuter/resolve-v1.js";

registerBodyTail(() => {
  const scope = context.use();
  if (scope?.isShell && (scope.registry.pending || scope.registry.queue.length)) return Resolve();
});

/** @internal Each response owns its boundaries, including fragment-only responses. */
export function withPanels(
  value: Html,
  options: { getSignal: () => AbortSignal; resolverSrc: string; nonce?: string },
): JSX.Element {
  const registry: SuspenseRegistry = {
    getSignal: options.getSignal,
    resolverSrc: options.resolverSrc,
    nonce: options.nonce,
    counter: 0,
    pending: 0,
    queue: [],
    wake: undefined,
  };
  const tail = () => (registry.pending || registry.queue.length) ? Resolve() : undefined;
  return context.Provider({
    value: { registry, isShell: true },
    children: fromParts([...value.parts, { v: tail, esc: false }]),
  });
}

/** @internal Capture the caller's application context, isolating the inner render's panel queue. */
export function ordered(value: unknown): JSX.Element {
  return context.Provider({ value: undefined, children: into(value) });
}

/** A deferred HTML panel. Outside a routed response its children render in order. */
export const Deferred: typeof Suspense = Suspense;

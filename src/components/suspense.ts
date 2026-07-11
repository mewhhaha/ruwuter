/**
 * @module
 *
 * Suspense components for progressive rendering in Ruwuter applications.
 */

import { createContext } from "./context.ts";
import { Fragment, into, type JSX, jsx } from "@mewhhaha/ruwuter/jsx-runtime";
import { fromParts } from "../runtime/node.ts";

type Settled =
  | { id: string; ok: true; html: string }
  | {
    id: string;
    ok: false;
    error: unknown;
    errorFallback: SuspenseErrorFallback | undefined;
  };

type SuspenseErrorFallback = JSX.Element | ((error: unknown) => JSX.Element);

type SuspenseRegistry = {
  /** Unique prefix that keeps this provider's boundary ids document-scoped. */
  prefix: string;
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

const settle = (registry: SuspenseRegistry, result: Settled): void => {
  registry.pending--;
  registry.queue.push(result);
  registry.wake?.();
};

type SuspenseProps<AS extends keyof JSX.IntrinsicElements = "div"> = {
  as?: AS;
  fallback: JSX.Element;
  /** Content to replace the fallback when the boundary's child rejects. */
  errorFallback?: SuspenseErrorFallback;
  children?: JSX.Element | (() => Promise<JSX.Element>);
} & Omit<JSX.IntrinsicElements[AS], "children">;

/**
 * Suspense boundary that streams fallback immediately and resolved content later.
 */
export const Suspense = ({
  fallback,
  errorFallback,
  as: As = "div",
  children,
  ...props
}: SuspenseProps): JSX.Element => {
  return into(
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
      const id = `rw-${registry.prefix}-${registry.counter++}`;
      registry.pending++;
      content.toPromise().then(
        (html) => settle(registry, { id, ok: true, html }),
        (error) => settle(registry, { id, ok: false, error, errorFallback }),
      );

      // Emit fallback wrapper immediately
      yield* jsx(As, { ...props, id, children: fallback }).generator;
    })(),
  );
};

/**
 * Streams resolved Suspense content. Define once near the end of <body>.
 * If a strict CSP is used, supply a nonce so the defining script can run.
 */
export const Resolve = (): JSX.Element => {
  return into(
    (async function* () {
      const registry = context.use();
      if (!registry) return;

      // If we arrived before any Suspense registered, allow one tick for registration
      if (registry.pending === 0 && registry.queue.length === 0) {
        await Promise.resolve();
      }

      while (registry.pending > 0 || registry.queue.length > 0) {
        if (registry.queue.length === 0) {
          await new Promise<void>((resolve) => {
            registry.wake = resolve;
          });
          registry.wake = undefined;
          continue;
        }

        const settled = registry.queue.shift()!;
        if (settled.ok) {
          yield `<template data-rw-target="${settled.id}">${settled.html}</template>`;
          continue;
        }

        console.error("Suspense boundary failed", settled.error);
        if (!settled.errorFallback) continue;

        try {
          const fallback = typeof settled.errorFallback === "function"
            ? settled.errorFallback(settled.error)
            : settled.errorFallback;
          const html = await fromParts([{ v: fallback, esc: true }]).toPromise();
          yield `<template data-rw-target="${settled.id}">${html}</template>`;
        } catch {
          // An error fallback must not cause the stream to fail or recurse.
        }
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
    prefix: crypto.randomUUID(),
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

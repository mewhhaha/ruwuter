/**
 * @module
 *
 * Suspense components for progressive rendering in Ruwuter applications.
 */

import { createContext } from "./context.ts";
import { Fragment, into, type JSX, jsx } from "@mewhhaha/ruwuter/jsx-runtime";

type SuspenseRegistry = Map<string, Promise<[id: string, html: string]>>;

const context = createContext<SuspenseRegistry | undefined>(undefined);

const getRegistry = (): SuspenseRegistry | undefined => {
  return context.use();
};

type SuspenseProps<AS extends keyof JSX.IntrinsicElements = "div"> = {
  as?: AS;
  fallback: JSX.Element;
  children?: JSX.Element | (() => Promise<JSX.Element>);
} & Omit<JSX.IntrinsicElements[AS], "children">;

export const Suspense = ({
  fallback,
  as: As = "div",
  children,
  ...props
}: SuspenseProps): JSX.Element => {
  const id = `suspense-${crypto.randomUUID()}`;
  return into(
    (async function* () {
      const registry = getRegistry();
      if (!registry) {
        // No registry -> render children directly (no fallback streaming)
        const content = typeof children === "function" ? await children() : children;
        if (!content) return;
        yield await (await content).toPromise();
        return;
      }

      // With registry -> register resolver promise and stream fallback now
      let promise: Promise<[id: string, html: string]>;
      if (typeof children === "function") {
        promise = children().then(async (el: JSX.Element) => [
          id,
          await (await el).toPromise(),
        ]);
      } else if (children === undefined) {
        promise = Promise.resolve([id, ""]);
      } else {
        promise = (async () => [
          id,
          await (await children).toPromise(),
        ])();
      }
      registry.set(id, promise);

      // Emit fallback wrapper immediately
      yield* into(jsx(As, { id, ...props, children: fallback })).generator;
    })(),
  );
};

/**
 * Streams resolved Suspense content. Define once near the end of <body>.
 * If a strict CSP is used, supply a nonce so the defining script can run.
 */
export const Resolve = ({ nonce }: { nonce?: string } = {}): JSX.Element => {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
  return into(
    (async function* () {
      yield `<script type="module"${nonceAttr}>import "@mewhhaha/ruwuter/resolve";</script>`;

      const registry = getRegistry();
      if (!registry) return;

      // If we arrived before any Suspense registered, allow one tick for registration
      if (registry.size === 0) {
        await Promise.resolve();
      }

      while (registry.size > 0) {
        const [id, element] = await Promise.race(registry.values());
        registry.delete(id);
        yield `<template data-rw-target="${id}">${element}</template>`;
      }
    })(),
  );
};
type SuspenseProviderProps = {
  children?: JSX.Element;
};

export const SuspenseProvider = ({
  children,
}: SuspenseProviderProps): JSX.Element => {
  const registry = new Map<string, Promise<[id: string, html: string]>>();
  const provided = jsx(Fragment, {
    children: [children, jsx(Resolve, {})],
  });

  return jsx(context.Provider, {
    value: registry,
    children: provided,
  });
};

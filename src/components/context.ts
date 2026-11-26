/**
 * @module
 *
 * AsyncLocalStorage‑based context utilities for composing JSX trees.
 * Provides a small Provider/use API that mirrors React's ergonomics.
 */

import { rendered } from "../runtime/node.ts";
import { AsyncLocalStorage } from "node:async_hooks";
import { Fragment, type JSX } from "../runtime/jsx-runtime.ts";

/**
 * Immutable snapshot of the context values visible on one render branch.
 * Providers derive a new store instead of mutating a shared one, so branches
 * that render concurrently (Suspense, sibling awaits) stay isolated.
 */
type Store = ReadonlyMap<symbol, unknown>;

const storage = new AsyncLocalStorage<Store>();
const contextKeys = new WeakMap<object, symbol>();

const getStore = (): Store | undefined => storage.getStore();

/** Copies the active store with `key` set to `value`. */
const derive = (key: symbol, value: unknown): Store => {
  const store = new Map(getStore());
  store.set(key, value);
  return store;
};

/**
 * Wraps a generator so every pull runs under `store`. The renderer interleaves
 * branches, so the store that is ambient at a pull site is not necessarily the
 * one this branch was created with. `next`, `return`, `throw` and disposal all
 * resume the generator body, so all four are bound.
 */
const bindGenerator = (store: Store, generator: AsyncGenerator<string>): AsyncGenerator<string> => {
  const bound: AsyncGenerator<string> = {
    next: () => storage.run(store, () => generator.next()),
    return: (value) => storage.run(store, () => generator.return(value)),
    throw: (error) => storage.run(store, () => generator.throw(error)),
    [Symbol.asyncIterator]() {
      return bound;
    },
    [Symbol.asyncDispose]() {
      return storage.run(store, () => generator[Symbol.asyncDispose]?.() ?? Promise.resolve());
    },
  };
  return bound;
};

/**
 * Runs a function with a fresh context storage Map.
 * Use this to isolate a request or render pass.
 */
export function runWithContextStore<T>(fn: () => T): T {
  return storage.run(new Map(), fn);
}

/** @internal Runs `fn` with a fresh isolated context store seeded with a single value. */
export function runWithIsolatedContext<T, R>(context: CreatedContext<T>, value: T, fn: () => R): R {
  const key = contextKeys.get(context);
  const store = new Map<symbol, unknown>();
  if (key) store.set(key, value);
  return storage.run(store, fn);
}

/**
 * Binds a function to the current context store so later execution sees the same context values.
 */
type UnknownFn = (...args: unknown[]) => unknown;

export function bindContext<F extends UnknownFn>(fn: F): F {
  const store = getStore();
  if (!store) return fn;
  return ((...args: Parameters<F>): ReturnType<F> =>
    storage.run(store, () => fn(...args) as ReturnType<F>)) as F;
}

/**
 * Context API returned by {@link createContext}.
 */
export type CreatedContext<T> = {
  Provider: (props: { value: T; children?: JSX.HtmlNode }) => JSX.Element;
  use: () => T;
  withValue: <R>(value: T, fn: () => R) => R;
};

/**
 * Creates a new Context with the given default value.
 */
export function createContext<T>(defaultValue: T): CreatedContext<T> {
  const key = Symbol("ruwuter.context");

  /**
   * Context Provider component. Renders its children under a store that has
   * `value` set for this context.
   */
  const Provider = ({ value, children }: { value: T; children?: JSX.HtmlNode }): JSX.Element => {
    const content = Fragment({ children });
    return rendered(bindGenerator(derive(key, value), content.generator));
  };

  /**
   * Reads the nearest provided context value, or the default value when unset.
   */
  const use = (): T => {
    const store = getStore();
    if (!store?.has(key)) {
      return defaultValue;
    }

    return store.get(key) as T;
  };

  /**
   * Runs a function with the provided value. The value is scoped to `fn` and to
   * everything it awaits; the caller's own store is untouched.
   */
  function withValue<R>(value: T, fn: () => R): R {
    return storage.run(derive(key, value), fn);
  }

  const api: CreatedContext<T> = { Provider, use, withValue };
  contextKeys.set(api, key);
  return api;
}

export const use = <T>(context: CreatedContext<T>): T => {
  return context.use();
};

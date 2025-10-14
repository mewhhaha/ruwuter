import { AsyncLocalStorage } from "node:async_hooks";
import { into, type JSX } from "../runtime/jsx-runtime.mts";

type Store = Map<symbol, unknown[]>;

const storage = new AsyncLocalStorage<Store>();

const getStore = (): Store | undefined => {
  return storage.getStore();
};

function pushValue<T>(key: symbol, value: T): () => void {
  const store = getStore();
  if (!store) {
    return () => {};
  }

  let stack = store.get(key) as T[] | undefined;
  if (!stack) {
    stack = [];
    store.set(key, stack);
  }

  stack.push(value);

  return () => {
    stack!.pop();
    if (stack!.length === 0) {
      store.delete(key);
    }
  };
}

const isPromise = (value: unknown): value is Promise<unknown> => {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in (value as Record<string | symbol, unknown>)
  );
};

export function runWithContextStore<T>(fn: () => T): T {
  let result!: T;
  storage.run(new Map(), () => {
    result = fn();
  });
  return result;
}

export type CreatedContext<T> = {
  Provider: (props: { value: T; children: JSX.Element }) => JSX.Element;
  use: () => T;
  withValue: <R>(value: T, fn: () => R) => R;
};

export function createContext<T>(defaultValue: T): CreatedContext<T> {
  const key = Symbol("ruwuter.context");

  const Provider = ({
    value,
    children,
  }: {
    value: T;
    children: JSX.Element;
  }): JSX.Element => {
    const store = getStore();
    if (!store) {
      return children;
    }

    const release = pushValue(key, value);
    const content = into(children);

    return into(
      (async function* () {
        try {
          yield* content.text;
        } finally {
          release();
        }
      })(),
    );
  };

  const use = (): T => {
    const store = getStore();
    if (!store) {
      return defaultValue;
    }

    const stack = store.get(key) as T[] | undefined;
    if (!stack || stack.length === 0) {
      return defaultValue;
    }

    return stack[stack.length - 1];
  };

  function withValue<R>(value: T, fn: () => R): R {
    const release = pushValue(key, value);
    try {
      const result = fn();
      if (isPromise(result)) {
        return result.finally(release) as R;
      }
      release();
      return result;
    } catch (error) {
      release();
      throw error;
    }
  }

  const api: CreatedContext<T> = { Provider, use, withValue };
  return api;
}


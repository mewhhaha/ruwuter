import { AsyncLocalStorage } from "node:async_hooks";
import { into } from "./node.ts";
import type { JSX } from "@mewhhaha/ruwuter/jsx-runtime";

type HookFrame = { index: number; values: unknown[] };
type HookStack = HookFrame[];

const storage = new AsyncLocalStorage<HookStack>();

const getStack = (): HookStack | undefined => storage.getStore();

const isPromise = (v: unknown): v is Promise<unknown> =>
  typeof v === "object" && v !== null && "then" in v;

export function runWithHooksStore<T>(fn: () => T): T {
  let result!: T;
  storage.run([], () => {
    result = fn();
  });
  return result;
}

function pushFrame(): () => void {
  const stack = getStack();
  if (!stack) return () => {};
  stack.push({ index: 0, values: [] });
  return () => {
    stack.pop();
  };
}

export function withComponentFrame(
  fn: () => JSX.Element,
): Awaited<JSX.Element> {
  const stack = getStack();
  if (!stack) {
    return into(fn());
  }
  const release = pushFrame();
  try {
    const out = fn();
    if (isPromise(out)) {
      return into(out.finally(release));
    }
    // Normalize to Html so we can release after streaming completes
    const html = into(out);
    return into(
      (async function* () {
        try {
          yield* html.generator;
        } finally {
          release();
        }
      })(),
    );
  } catch (e) {
    release();
    throw e;
  }
}

export function useHook<T>(init: () => T): T {
  const stack = getStack();
  if (!stack || stack.length === 0) return init();
  const frame = stack[stack.length - 1];
  const i = frame.index++;
  if (i < frame.values.length) return frame.values[i] as T;
  const v = init();
  frame.values.push(v);
  return v;
}

import { AsyncLocalStorage } from "node:async_hooks";
import { into, type Html } from "./node.mts";

type HookFrame = { index: number; values: any[] };
type HookStack = HookFrame[];

const storage = new AsyncLocalStorage<HookStack>();

const getStack = (): HookStack | undefined => storage.getStore();

const isPromise = (v: unknown): v is Promise<any> =>
  typeof v === "object" && v !== null && "then" in (v as any);

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

export function withComponentFrame<T>(fn: () => T): T {
  const stack = getStack();
  if (!stack) {
    return fn();
  }
  const release = pushFrame();
  try {
    const out = fn();
    if (isPromise(out)) {
      return out.finally(release) as T;
    }
    // Normalize to Html so we can release after streaming completes
    const html: Html = into(out as any);
    return into(
      (async function* () {
        try {
          yield* html.text;
        } finally {
          release();
        }
      })(),
    ) as unknown as T;
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
  if (i < frame.values.length) return frame.values[i];
  const v = init();
  frame.values.push(v);
  return v;
}

/**
 * @module
 *
 * Client‑side interaction helpers and shared refs for Ruwuter.
 * Provides:
 * - `on(fn)` to mark route‑exported client handlers/components for client loading
 * - `ref(initial)` to create small shared refs across hydration boundaries
 * - `Client` to inject the small browser runtime as a module script
 */

import { into, type Html } from "../runtime/node.mts";
import { useHook } from "../runtime/hooks.mts";
import { sanitizeDynamicImportSource } from "../utils/serialize.mts";

const CLIENT_RUNTIME_MODULE = "@mewhhaha/ruwuter/client-runtime";

/** Client handler signature for on‑module functions. */
export type Handler<This = any> = (
  this: This,
  ev: Event,
  signal: AbortSignal,
) => unknown | Promise<unknown>;

// Marker used by the routes generator to annotate module-exported handlers
const CLIENT_FN = Symbol.for("@mewhhaha/ruwuter.clientfn");

/** Marks a route‑exported handler or component so the routes generator can attach an href. */
export function on<F extends ((event: Event, signal: AbortSignal) => unknown) & { [CLIENT_FN]: true}>(fn: F): F & { href?: string } {
  fn[CLIENT_FN] = true;
  // Friendly fix for Vite SSR dynamic import placeholders in serialized handlers
  try {
    const original = Function.prototype.toString.call(fn) as string;
    const fixed = sanitizeDynamicImportSource(original);
    if (fixed !== original) {
      Object.defineProperty(fn, "toString", { value: () => fixed });
    }
  } catch {
    // non-fatal: keep original function as-is
  }
  return fn as any;
}


const registry = new Map()

/** A small shared ref container used across hydration boundaries. */
export type Ref<T> = {
  readonly id: string;
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  toJSON(): { __ref: true; i: string; v: T };
};

/** Creates a new ref with the given initial value. */
export function ref<T>(initial: T): Ref<T> {
  return useHook(() => {
    const id = crypto.randomUUID().replaceAll(/[^A-Za-z0-9_-]/g, "");
    const marker = { __ref: true as const, i: id, v: initial };
    return {
      id,
      get(): T {
        try {
          return registry.get(id) ?? initial;
        } catch {
          return initial;
        }
      },
      set(next: T): void {
        const prev = registry.get(id) ?? initial;
        const val = typeof next === "function" ? next(prev) : next;
        registry.set(id, val)
      },
      toJSON() {
        return marker;
      },
    } as Ref<T>;
  });
}

/** Injects the client runtime as a module script into the page. */
export const Client = ({ nonce }: { nonce?: string }): Html => {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
  return into(
    `<script type="module"${nonceAttr}>import { startClientRuntime } from "${CLIENT_RUNTIME_MODULE}"; startClientRuntime();</script>`,
  );
};

/**
 * @module
 * Minimal client-interaction + shared refs for Ruwuter.
 */

import { into, type Html } from "../runtime/node.mts";
import { useHook } from "../runtime/hooks.mts";
import cr from "./client.runtime.js";

const clientRuntime = `${cr.toString()}()`;

export type Handler<This = any> = (
  this: This,
  ev: Event,
  signal: AbortSignal,
) => unknown | Promise<unknown>;

// Marker used by the routes generator to annotate module-exported handlers
const CLIENT_FN = Symbol.for("@mewhhaha/ruwuter.clientfn");

/**
 * Marks a route-exported handler so the routes generator can attach an href.
 */
export function on<F extends Function>(fn: F): F & { href?: string } {
  (fn as any)[CLIENT_FN] = true;
  return fn as any;
}

export type Ref<T> = {
  readonly id: string;
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  toJSON(): { __ref: true; i: string; v: T };
};

export function ref<T>(initial: T): Ref<T> {
  return useHook(() => {
    const id = crypto.randomUUID().replaceAll(/[^A-Za-z0-9_-]/g, "");
    const marker = { __ref: true as const, i: id, v: initial };
    return {
      id,
      get(): T {
        try {
          return (window as any).__client?.state?.get(id) ?? initial;
        } catch {
          return initial;
        }
      },
      set(next: any): void {
        try {
          const api = (window as any).__client;
          const prev = api?.state?.get(id) ?? initial;
          const val = typeof next === "function" ? next(prev) : next;
          api?.set?.(id, val);
        } catch {}
      },
      toJSON() {
        return marker;
      },
    } as Ref<T>;
  });
}

export const Client = ({ nonce }: { nonce?: string }): Html => {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
  return into(
    `<script type="module"${nonceAttr}>\n${clientRuntime}\n</script>`,
  );
};

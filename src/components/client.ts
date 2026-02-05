/**
 * @module
 *
 * Client‑side interaction helpers and shared refs for Ruwuter.
 * Provides:
 * - `ref(initial)` to create small shared refs across hydration boundaries
 * - `Client` to inject the small browser runtime as a module script
 * - `Handler` type used by the client events helpers
 */

import { type Html, into } from "../runtime/node.ts";
import { useHook } from "../runtime/hooks.ts";
const CLIENT_RUNTIME_MODULE = "@mewhhaha/ruwuter/client";

/** Client handler signature for browser-dispatched events. */
export type Handler<
  This = unknown,
  Ev extends Event = Event,
  Result = unknown | Promise<unknown>,
> = (this: This, ev: Ev, signal: AbortSignal) => Result;

const registry = new Map<string, unknown>();

/** A small shared ref container used across hydration boundaries. */
export type Ref<T> = {
  readonly id: string;
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  toJSON(): { __ref: true; i: string; v: T };
  toString(): string;
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
          const value = registry.get(id);
          return (value as T | undefined) ?? initial;
        } catch {
          return initial;
        }
      },
      set(next: T | ((prev: T) => T)): void {
        const prev = (registry.get(id) as T | undefined) ?? initial;
        const val = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
        registry.set(id, val);
      },
      toJSON() {
        return marker;
      },
      toString() {
        return String(this.get());
      },
    } as Ref<T>;
  });
}

/** Injects the client runtime as a module script into the page. */
export const Client = ({ nonce }: { nonce?: string }): Html => {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
  return into(
    `<script type="module"${nonceAttr}>import "${CLIENT_RUNTIME_MODULE}";</script>`,
  );
};

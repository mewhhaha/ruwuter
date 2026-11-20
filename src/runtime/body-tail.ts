import type { Html } from "./node.ts";

// The isomorphic JSX factory only records this deferred call. The server supplies
// a lookup into the active render's context, never a shared request or panel queue.
let lookup: (() => Html | undefined) | undefined;
export function registerBodyTail(read: () => Html | undefined): void {
  lookup = read;
}
export function bodyTail(): Html | undefined {
  return lookup?.();
}

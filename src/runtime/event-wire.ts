/**
 * Shared wire contract for serialized client scope hydration payloads.
 * Keep this module runtime-light and isomorphic.
 */

export const HYDRATION_PAYLOAD_VERSION = 1 as const;

export interface ModuleEntry {
  t: "m";
  s: string;
  ev: "mount" | "unmount";
}

export interface HydrationPayloadBase {
  v?: typeof HYDRATION_PAYLOAD_VERSION;
  bind?: unknown;
  on?: ModuleEntry[];
  ref?: unknown;
}

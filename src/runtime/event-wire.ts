/**
 * Shared wire contract for serialized client events and hydration payloads.
 * Keep this module runtime-light and isomorphic.
 */

export const HYDRATION_PAYLOAD_VERSION = 1 as const;

export interface RuntimeEventOptions {
  capture?: boolean;
  once?: boolean;
  passive?: boolean;
  preventDefault?: boolean;
}

export interface ModuleEntry {
  t: "m";
  s: string;
  x?: string;
  ev?: string;
  opt?: RuntimeEventOptions;
}

export const BOUND_EVENTS_MARKER = "__ruwuterBoundEvents" as const;

export type BoundEventsListMarker = {
  readonly [BOUND_EVENTS_MARKER]: true;
};

export interface HydrationPayloadBase {
  v?: typeof HYDRATION_PAYLOAD_VERSION;
  bind?: unknown;
  on?: ModuleEntry[];
  ref?: unknown;
}

export function markBoundEventsList<T extends unknown[]>(value: T): T & BoundEventsListMarker {
  Object.defineProperty(value, BOUND_EVENTS_MARKER, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return value as T & BoundEventsListMarker;
}

export function isBoundEventsList(value: unknown): value is unknown[] & BoundEventsListMarker {
  if (!Array.isArray(value)) return false;
  const markerOwner = value as unknown as { [BOUND_EVENTS_MARKER]?: unknown };
  return markerOwner[BOUND_EVENTS_MARKER] === true;
}

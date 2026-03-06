/**
 * @module
 *
 * Client‑side interaction helpers and shared refs for Ruwuter.
 * Provides:
 * - `ref(initial)` to create small shared refs across hydration boundaries
 * - `client.scope()` to register component-scoped client behavior
 * - `on(ref)` to attach typed DOM listeners inside client scopes
 * - `Client` to inject the small browser runtime as a module script
 * - `Handler` type used by the client events helpers
 */

import { type Html, into } from "../runtime/node.ts";
import type { ModuleEntry } from "../runtime/event-wire.ts";
import { useFrameMeta, useHook } from "../runtime/hooks.ts";
const CLIENT_RUNTIME_MODULE = "@mewhhaha/ruwuter/client";
const CLIENT_SCOPE_PROP = "__clientScope";
const CLIENT_SCOPE_FRAME_KEY = Symbol.for("ruwuter.client.scope.frame");

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

type HandlerModuleLike<Fn = Handler> = (string | URL) & {
  readonly __ruwuterHandler?: Fn;
};

type TransformedClientBinding<Fn = Handler> = Fn & {
  readonly clientHref?: string | URL;
  readonly href?: string | URL;
};

type HandlerReference<Fn = Handler> = HandlerModuleLike<Fn> | TransformedClientBinding<Fn>;

type ClientScopeFrameState = {
  scope?: ClientScopeState<Record<string, unknown>>;
};

type ClientScopeProps = {
  [CLIENT_SCOPE_PROP]: ClientScopeState<Record<string, unknown>>;
};

type ClientScopeState<Bind extends Record<string, unknown>> = {
  readonly bind: Bind;
  readonly entries: ModuleEntry[];
  anchored: boolean;
  explicit: boolean;
};

type EventTargetLike<T extends EventTarget> = T | Ref<T | null> | null | undefined;

type TargetedRuntimeEvent<
  E extends Event,
  Target extends EventTarget,
> = Omit<E, "currentTarget"> & {
  readonly currentTarget: Target;
};

type ListenerOptions = AddEventListenerOptions;

type GlobalDomEventMap = GlobalEventHandlersEventMap;

type OnRegistry<Target extends EventTarget> =
  & {
    [Type in keyof GlobalDomEventMap]: (
      listener: (ev: TargetedRuntimeEvent<GlobalDomEventMap[Type], Target>) => unknown,
      options?: ListenerOptions,
    ) => () => void;
  }
  & Record<
    string,
    (listener: (ev: TargetedRuntimeEvent<Event, Target>) => unknown, options?: ListenerOptions) => () => void
  >;

function normalizeHandlerReference<Fn = Handler>(
  kind: string,
  href: HandlerReference<Fn>,
): string {
  if (typeof href === "function") {
    const transformed = (href as TransformedClientBinding<Fn>).clientHref ??
      (href as TransformedClientBinding<Fn>).href;
    if (typeof transformed === "string" || transformed instanceof URL) {
      return transformed.toString();
    }
    throw new TypeError(
      `client.${kind} requires a module URL; received a function without clientHref. Use a transformed 'use client' binding or ?url import.`,
    );
  }
  return (href as string | URL).toString();
}

function getClientScopeFrameState(): ClientScopeFrameState {
  return useFrameMeta(CLIENT_SCOPE_FRAME_KEY, () => ({}));
}

function createScopeState(): ClientScopeState<Record<string, unknown>> {
  return {
    bind: {},
    entries: [],
    anchored: false,
    explicit: false,
  };
}

function resolveRuntimeTarget<Target extends EventTarget>(
  target: EventTargetLike<Target>,
): Target {
  if (target && typeof target === "object" && "get" in target && typeof target.get === "function") {
    const resolved = target.get() as Target | null | undefined;
    if (!resolved) throw new TypeError("on(ref): target ref is not attached.");
    return resolved;
  }
  if (!target) throw new TypeError("on(ref): target is required.");
  return target as Target;
}

export function on<Target extends EventTarget>(
  target: EventTargetLike<Target>,
): OnRegistry<Target> {
  return new Proxy(Object.create(null), {
    get(_obj, prop: PropertyKey) {
      if (typeof prop !== "string") return undefined;
      return (
        listener: (ev: TargetedRuntimeEvent<Event, Target>) => unknown,
        options?: ListenerOptions,
      ) => {
        const resolved = resolveRuntimeTarget(target);
        const wrapped = listener as EventListener;
        resolved.addEventListener(prop, wrapped, options);
        return () => resolved.removeEventListener(prop, wrapped, options);
      };
    },
  }) as OnRegistry<Target>;
}

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

export type ClientScope<Bind extends Record<string, unknown> = Record<string, unknown>> = {
  ref<Name extends string, T>(name: Name, initial: T): Ref<T> & {
    readonly __scopeName?: Name;
  };
  mount(
    href: HandlerReference<Handler<Bind, Event, unknown | Promise<unknown>>>,
  ): void;
  unmount(
    href: HandlerReference<Handler<Bind, Event, unknown | Promise<unknown>>>,
  ): void;
  props(): ClientScopeProps;
};

function registerScopeState(state: ClientScopeState<Record<string, unknown>>): void {
  const frame = getClientScopeFrameState();
  if (frame.scope && frame.scope !== state) {
    throw new Error("Only one client.scope() may be registered per component frame.");
  }
  frame.scope = state;
}

export function isClientScopeState(
  value: unknown,
): value is ClientScopeState<Record<string, unknown>> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return isPlainObject(record.bind) && Array.isArray(record.entries);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function peekAutoClientScope(
  enabled = true,
):
  | ClientScopeState<Record<string, unknown>>
  | undefined {
  if (!enabled) return undefined;
  const frame = useFrameMeta(CLIENT_SCOPE_FRAME_KEY, () => ({} as ClientScopeFrameState));
  const scope = frame.scope;
  if (!scope || scope.anchored || scope.explicit) return undefined;
  return scope;
}

export function scope<Bind extends Record<string, unknown> = Record<string, unknown>>(): ClientScope<Bind> {
  return useHook(() => {
    const state = createScopeState();
    registerScopeState(state);

    return {
      ref<Name extends string, T>(name: Name, initial: T) {
        const value = ref(initial) as Ref<T> & { readonly __scopeName?: Name };
        (state.bind as Record<string, unknown>)[name] = value;
        return value;
      },
      mount(href) {
        const normalized = normalizeHandlerReference("scope.mount()", href);
        state.entries.push({ t: "m", s: normalized, ev: "mount" });
      },
      unmount(href) {
        const normalized = normalizeHandlerReference("scope.unmount()", href);
        state.entries.push({ t: "m", s: normalized, ev: "unmount" });
      },
      props() {
        state.explicit = true;
        return { [CLIENT_SCOPE_PROP]: state } as ClientScopeProps;
      },
    } satisfies ClientScope<Bind>;
  });
}

export const client = {
  scope,
} as const;

/** Injects the client runtime as a module script into the page. */
export const Client = ({ nonce }: { nonce?: string }): Html => {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
  return into(
    `<script type="module"${nonceAttr}>import "${CLIENT_RUNTIME_MODULE}";</script>`,
  );
};

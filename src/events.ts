/**
 * @module
 *
 * Typed client event helpers used with `on={...}` payloads.
 * This module builds serialized event tuples and strongly typed event aliases for client handlers.
 */

import type { Handler } from "./components/client.ts";

type BindContext<Bind> = Bind extends undefined ? undefined : Bind;
type RequiredBind<Bind> = Bind extends undefined ? unknown : Bind;

/** Extended event listener options accepted by client event tuples. */
export interface ClientEventInit extends AddEventListenerOptions {
  /** When true, calls `event.preventDefault()` before invoking the client handler. */
  preventDefault?: boolean;
}

/** Listener options accepted by serialized client event tuples. */
export type EventOptions = boolean | ClientEventInit;

/**
 * Branded string representing a lazily loaded client handler module.
 * The brand carries the handler type so event helpers can preserve `this` and event payload inference.
 */
export type HandlerModule<Fn = Handler> = (string | URL) & {
  readonly __ruwuterHandler?: Fn;
};

/** Reference to a client handler, optionally rewritten by bundlers to a module URL. */
export type HandlerReference<Fn = Handler> = HandlerModule<Fn> | Fn;

type OverrideEventProperty<
  E extends Event,
  K extends keyof E,
  V,
> = (Omit<E, K> & { readonly [P in K]: V }) & Event;

type OverrideOptionalEventProperty<
  E extends Event,
  K extends PropertyKey,
  V,
> = K extends keyof E ? OverrideEventProperty<E, Extract<K, keyof E>, V> : E;

type WithCurrentTarget<E extends Event, Target extends Element> = OverrideEventProperty<
  E,
  "currentTarget",
  Target
>;

type WithRelatedTarget<E extends Event, Related> = [Related] extends [never] ? E
  : OverrideOptionalEventProperty<E, "relatedTarget", Related>;

/** Rewrites event typings so handlers see a precise `currentTarget` (and optional `relatedTarget`). */
export type TargetedEvent<
  E extends Event,
  CurrentTarget extends Element = Element,
  RelatedTarget = E extends { relatedTarget: infer Related } ? Related : never,
> = WithRelatedTarget<WithCurrentTarget<E, CurrentTarget>, RelatedTarget>;

/** Ensures the default export conforms to the expected handler signature. */
export type HandlerAssert<T> = T extends Handler<infer This, infer Ev, infer Result>
  ? Ev extends Event ? Handler<This, Ev, Result>
  : never
  : never;

/** Tuple representation for a client event binding. */
export type EventTuple<
  Fn = Handler,
  Type extends string = string,
> = [Type, HandlerReference<Fn>, EventOptions?];

type EventBinding<Bind> = EventTuple<
  Handler<BindContext<Bind>, Event, unknown | Promise<unknown>>,
  string
>;
type EventBindingValue<Bind> =
  | EventBinding<Bind>
  | readonly EventBindingValue<Bind>[];

type EventComposer<Required> = <Bind extends Required>(
  helpers: BoundEventHelperRegistry<Bind>,
) => EventBindingValue<Bind>;

/** Helper registry passed into builder callbacks used by `events(bind, on => ...)`. */
export type EventComposerHelpers<Bind = unknown> = BoundEventHelperRegistry<Bind>;

type EventsArg<Bind> = EventBindingValue<Bind> | EventComposer<Bind>;

type BoundEventHelper<Bind, _Type extends string, Ev extends Event> = <
  Target extends Element = Element,
  Result = unknown | Promise<unknown>,
>(
  href: HandlerReference<Handler<BindContext<Bind>, TargetedEvent<Ev, Target>, Result>>,
  options?: EventOptions,
) => EventBinding<Bind>;

type BoundEventHelperRegistry<Bind> =
  & {
    [Type in keyof GlobalEventMap]: BoundEventHelper<Bind, Type, GlobalEventMap[Type]>;
  }
  & Record<string, BoundEventHelper<Bind, string, Event>>;

type EventHelper<_Type extends string, Ev extends Event> = <
  This,
  Target extends Element = Element,
  Result = unknown | Promise<unknown>,
>(
  href: HandlerReference<Handler<This, TargetedEvent<Ev, Target>, Result>>,
  options?: EventOptions,
) => EventComposer<RequiredBind<This>>;

type PopoverToggleEvent =
  & (typeof globalThis extends { ToggleEvent: { prototype: infer Prototype } }
    ? Prototype extends Event ? Prototype
    : Event
    : Event)
  & {
    readonly newState: string;
    readonly oldState: string;
    readonly source: Element | null;
  };

type ToggleEventOverrides = {
  beforetoggle: PopoverToggleEvent;
  toggle: PopoverToggleEvent;
};

type LifecycleEventMap = {
  mount: Event;
  unmount: Event;
};

type GlobalEventMap =
  & Omit<GlobalEventHandlersEventMap, keyof ToggleEventOverrides>
  & ToggleEventOverrides
  & LifecycleEventMap;

type EventHelperRegistry =
  & {
    [Type in keyof GlobalEventMap]: EventHelper<Type, GlobalEventMap[Type]>;
  }
  & Record<string, EventHelper<string, Event>>;

/** Dynamic registry of event helpers backed by the DOM event map. */
export const event: EventHelperRegistry = new Proxy<Record<string, EventHelper<string, Event>>>(
  Object.create(null),
  {
    get(target, prop: PropertyKey, receiver) {
      if (typeof prop !== "string") {
        return Reflect.get(target, prop, receiver);
      }
      const created = ((
        href: HandlerModule | Handler | string | URL,
        options?: EventOptions,
      ) => {
        const normalized = normalizeHandlerReference(prop, href);
        return ((helpers) => helpers[prop](normalized, options)) as EventComposer<unknown>;
      }) as EventHelper<string, Event>;
      return created;
    },
  },
) as EventHelperRegistry;

function normalizeHandlerReference(
  prop: string,
  href: HandlerModule | Handler | string | URL,
): string {
  if (typeof href === "function") {
    throw new TypeError(
      `Client event helpers require a module URL; received a function for "${prop}".`,
    );
  }
  return href.toString();
}

function createBoundHelperRegistry<Bind>(): BoundEventHelperRegistry<Bind> {
  return new Proxy<object>(
    Object.create(null),
    {
      get(_target, prop: PropertyKey, receiver) {
        if (typeof prop !== "string") {
          return Reflect.get(_target, prop, receiver);
        }
        const helper = ((
          href: HandlerModule | Handler | string | URL,
          options?: EventOptions,
        ) => {
          const normalized = normalizeHandlerReference(prop, href);
          return [prop, normalized, options] as EventBinding<Bind>;
        }) as BoundEventHelper<Bind, string, Event>;
        return helper;
      },
    },
  ) as BoundEventHelperRegistry<Bind>;
}

function pushBinding<Bind>(
  target: EventBinding<Bind>[],
  value: EventBindingValue<Bind>,
): void {
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === "string") {
      target.push(value as unknown as EventBinding<Bind>);
      return;
    }
    value.forEach((item) => {
      pushBinding(target, item as EventBindingValue<Bind>);
    });
    return;
  }
  target.push(value as unknown as EventBinding<Bind>);
}

/** Serialized `on` payload shape consumed by the JSX runtime. */
export type ClientEventList<Bind = unknown> =
  | [Bind, ...EventBinding<Bind>[]]
  | readonly EventBinding<Bind>[]
  | EventBinding<Bind>;

/**
 * Builds a serialized `on` payload with an explicit bind context.
 *
 * @example
 * ```ts
 * events({ id: "x" }, event.click(handlerUrl))
 * ```
 */
export const events = <Bind>(
  bind: Bind,
  ...parts: readonly EventsArg<Bind>[]
): ClientEventList<Bind> => {
  const helpers = createBoundHelperRegistry<Bind>();
  const bindings: EventBinding<Bind>[] = [];
  parts.forEach((part) => {
    const value = typeof part === "function" ? (part as EventComposer<Bind>)(helpers) : part;
    pushBinding(bindings, value as EventBindingValue<Bind>);
  });
  return [bind, ...bindings] as ClientEventList<Bind>;
};

/** Event type by key from the helper registry, with typed `currentTarget`. */
export type ClientEvent<
  Type extends keyof GlobalEventMap,
  CurrentTarget extends Element = Element,
> = TargetedEvent<GlobalEventMap[Type], CurrentTarget>;
/** DOM `UIEvent` with typed `currentTarget`. */
export type UIEvent<CurrentTarget extends Element = Element> = TargetedEvent<
  globalThis.UIEvent,
  CurrentTarget
>;
/** DOM `MouseEvent` with typed `currentTarget` and `relatedTarget`. */
export type MouseEvent<
  CurrentTarget extends Element = Element,
  RelatedTarget = globalThis.MouseEvent["relatedTarget"],
> = TargetedEvent<globalThis.MouseEvent, CurrentTarget, RelatedTarget>;
/** DOM `PointerEvent` with typed `currentTarget`. */
export type PointerEvent<CurrentTarget extends Element = Element> = TargetedEvent<
  globalThis.PointerEvent,
  CurrentTarget
>;
/** DOM `KeyboardEvent` with typed `currentTarget`. */
export type KeyboardEvent<CurrentTarget extends Element = Element> = TargetedEvent<
  globalThis.KeyboardEvent,
  CurrentTarget
>;
/** DOM `FocusEvent` with typed `currentTarget` and `relatedTarget`. */
export type FocusEvent<
  CurrentTarget extends Element = Element,
  RelatedTarget = globalThis.FocusEvent["relatedTarget"],
> = TargetedEvent<globalThis.FocusEvent, CurrentTarget, RelatedTarget>;
/** DOM `DragEvent` with typed `currentTarget` and `relatedTarget`. */
export type DragEvent<
  CurrentTarget extends Element = Element,
  RelatedTarget = globalThis.DragEvent["relatedTarget"],
> = TargetedEvent<globalThis.DragEvent, CurrentTarget, RelatedTarget>;
/** DOM `WheelEvent` with typed `currentTarget`. */
export type WheelEvent<CurrentTarget extends Element = Element> = TargetedEvent<
  globalThis.WheelEvent,
  CurrentTarget
>;
/** DOM `TouchEvent` with typed `currentTarget`. */
export type TouchEvent<CurrentTarget extends Element = Element> = TargetedEvent<
  globalThis.TouchEvent,
  CurrentTarget
>;
/** DOM `ClipboardEvent` with typed `currentTarget`. */
export type ClipboardEvent<CurrentTarget extends Element = Element> = TargetedEvent<
  globalThis.ClipboardEvent,
  CurrentTarget
>;
/** DOM `InputEvent` with typed `currentTarget`. */
export type InputEvent<CurrentTarget extends Element = Element> = TargetedEvent<
  globalThis.InputEvent,
  CurrentTarget
>;
/** DOM `CompositionEvent` with typed `currentTarget`. */
export type CompositionEvent<CurrentTarget extends Element = Element> = TargetedEvent<
  globalThis.CompositionEvent,
  CurrentTarget
>;
/** DOM `AnimationEvent` with typed `currentTarget`. */
export type AnimationEvent<CurrentTarget extends Element = Element> = TargetedEvent<
  globalThis.AnimationEvent,
  CurrentTarget
>;
/** DOM `TransitionEvent` with typed `currentTarget`. */
export type TransitionEvent<CurrentTarget extends Element = Element> = TargetedEvent<
  globalThis.TransitionEvent,
  CurrentTarget
>;
/** DOM `SubmitEvent` with typed `currentTarget`. */
export type SubmitEvent<CurrentTarget extends Element = Element> = TargetedEvent<
  globalThis.SubmitEvent,
  CurrentTarget
>;
/** DOM `FormDataEvent` with typed `currentTarget`. */
export type FormDataEvent<CurrentTarget extends Element = Element> = TargetedEvent<
  globalThis.FormDataEvent,
  CurrentTarget
>;
/** Popover toggle event with typed `currentTarget`. */
export type ToggleEvent<CurrentTarget extends Element = Element> = TargetedEvent<
  PopoverToggleEvent,
  CurrentTarget
>;

// Lifecycle events emitted by the client runtime
/** Synthetic mount lifecycle event fired after hydration attaches handlers. */
export type MountEvent<CurrentTarget extends Element = Element> = ClientEvent<
  "mount",
  CurrentTarget
>;
/** Synthetic unmount lifecycle event fired before hydrated elements are torn down. */
export type UnmountEvent<CurrentTarget extends Element = Element> = ClientEvent<
  "unmount",
  CurrentTarget
>;

/** Base synthetic event shape used by lifecycle and wrapped DOM events. */
export type SyntheticEvent<CurrentTarget extends Element = Element> = TargetedEvent<
  Event,
  CurrentTarget
>;

/** Client handler function signature used by serialized event helpers. */
export type { Handler };

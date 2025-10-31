import type { Handler } from "./components/client.ts";

type BindContext<Bind> = [Bind] extends [undefined] ? undefined : Bind;

export interface ClientEventInit extends AddEventListenerOptions {
  preventDefault?: boolean;
}

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

type WithCurrentTarget<E extends Event, Target extends Element> =
  OverrideEventProperty<E, "currentTarget", Target>;

type WithRelatedTarget<E extends Event, Related> = [Related] extends [never] ? E
  : OverrideOptionalEventProperty<E, "relatedTarget", Related>;

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

type HandlerBind<Fn> = Fn extends Handler<infer This, any, any> ? BindContext<This>
  : undefined;

type PrevDepth<D extends number> =
  D extends 0 ? 0
    : D extends 1 ? 0
    : D extends 2 ? 1
    : D extends 3 ? 2
    : D extends 4 ? 3
    : D extends 5 ? 4
    : D extends 6 ? 5
    : D extends 7 ? 6
    : D extends 8 ? 7
    : D extends 9 ? 8
    : D extends 10 ? 9
    : 10;

type ClientEventListRecursive<
  Fn,
  Type extends string,
  Depth extends number,
> =
  Depth extends 0 ? EventTuple<Fn, Type>
    : EventTuple<Fn, Type>
      | readonly ClientEventListRecursive<Fn, Type, PrevDepth<Depth>>[]
      | readonly [
        HandlerBind<Fn>,
        ...readonly ClientEventListRecursive<Fn, Type, PrevDepth<Depth>>[],
      ];

export type ClientEventList<
  Fn = Handler,
  Type extends string = string,
> = ClientEventListRecursive<Fn, Type, 6>;

type HandlerThis<Fn> = Fn extends Handler<infer This, any, any>
  ? Exclude<BindContext<This>, undefined>
  : never;

type ClientEventListThis<List> =
  List extends EventTuple<infer Fn, any> ? HandlerThis<Fn>
    : List extends readonly [infer First, ...infer Rest]
      ? Exclude<First, undefined> | ClientEventListThis<Rest[number]>
      : List extends readonly (infer Item)[]
        ? ClientEventListThis<Item>
        : never;

type UnionToIntersection<U> =
  (U extends unknown ? (arg: U) => void : never) extends (arg: infer I) => void ? I
    : never;

type IntersectionOrUnknown<U> = [U] extends [never] ? unknown : UnionToIntersection<U>;


type EventHelper<Type extends string, Ev extends Event> = <
  Target extends Element = Element,
  This = unknown,
  Result = unknown | Promise<unknown>,
>(
  href: HandlerReference<Handler<This, TargetedEvent<Ev, Target>, Result>>,
  options?: EventOptions,
) => EventTuple<Handler<This, TargetedEvent<Ev, Target>, Result>, Type>;

type PopoverToggleEvent =
  (typeof globalThis extends { ToggleEvent: { prototype: infer Prototype } }
    ? Prototype extends Event ? Prototype
    : Event
    : Event) & {
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
  Omit<GlobalEventHandlersEventMap, keyof ToggleEventOverrides> &
    ToggleEventOverrides &
    LifecycleEventMap;

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
        if (typeof href === "function") {
          throw new TypeError(
            `Client event helpers require a module URL; received a function for "${prop}".`,
          );
        }
        const pathname: string = href instanceof URL ? href.pathname : href.toString();
        return [prop, pathname, options] as unknown as EventTuple<Handler, string>;
      }) as EventHelper<string, Event>;
      return created;
    },
  },
) as EventHelperRegistry;


export const events = <
  const Fns extends readonly ClientEventList<any, string>[],
  T extends Record<string, unknown> & IntersectionOrUnknown<ClientEventListThis<Fns[number]>>,
>(
  bind: T,
  ...fns: Fns
): [T, ...Fns] & ClientEventList => {
  return [bind, ...fns] as [T, ...Fns] & ClientEventList;
};

export type ClientEvent<Type extends keyof GlobalEventMap, CurrentTarget extends Element = Element> =
  TargetedEvent<GlobalEventMap[Type], CurrentTarget>;
export type UIEvent<CurrentTarget extends Element = Element> =
  TargetedEvent<globalThis.UIEvent, CurrentTarget>;
export type MouseEvent<
  CurrentTarget extends Element = Element,
  RelatedTarget = globalThis.MouseEvent["relatedTarget"],
> = TargetedEvent<globalThis.MouseEvent, CurrentTarget, RelatedTarget>;
export type PointerEvent<CurrentTarget extends Element = Element> =
  TargetedEvent<globalThis.PointerEvent, CurrentTarget>;
export type KeyboardEvent<CurrentTarget extends Element = Element> =
  TargetedEvent<globalThis.KeyboardEvent, CurrentTarget>;
export type FocusEvent<
  CurrentTarget extends Element = Element,
  RelatedTarget = globalThis.FocusEvent["relatedTarget"],
> = TargetedEvent<globalThis.FocusEvent, CurrentTarget, RelatedTarget>;
export type DragEvent<
  CurrentTarget extends Element = Element,
  RelatedTarget = globalThis.DragEvent["relatedTarget"],
> = TargetedEvent<globalThis.DragEvent, CurrentTarget, RelatedTarget>;
export type WheelEvent<CurrentTarget extends Element = Element> =
  TargetedEvent<globalThis.WheelEvent, CurrentTarget>;
export type TouchEvent<CurrentTarget extends Element = Element> =
  TargetedEvent<globalThis.TouchEvent, CurrentTarget>;
export type ClipboardEvent<CurrentTarget extends Element = Element> =
  TargetedEvent<globalThis.ClipboardEvent, CurrentTarget>;
export type InputEvent<CurrentTarget extends Element = Element> =
  TargetedEvent<globalThis.InputEvent, CurrentTarget>;
export type CompositionEvent<CurrentTarget extends Element = Element> =
  TargetedEvent<globalThis.CompositionEvent, CurrentTarget>;
export type AnimationEvent<CurrentTarget extends Element = Element> =
  TargetedEvent<globalThis.AnimationEvent, CurrentTarget>;
export type TransitionEvent<CurrentTarget extends Element = Element> =
  TargetedEvent<globalThis.TransitionEvent, CurrentTarget>;
export type SubmitEvent<CurrentTarget extends Element = Element> =
  TargetedEvent<globalThis.SubmitEvent, CurrentTarget>;
export type FormDataEvent<CurrentTarget extends Element = Element> =
  TargetedEvent<globalThis.FormDataEvent, CurrentTarget>;
export type ToggleEvent<CurrentTarget extends Element = Element> =
  TargetedEvent<PopoverToggleEvent, CurrentTarget>;

export type { Handler };

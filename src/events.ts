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

/** Ensures the default export conforms to the expected handler signature. */
export type HandlerAssert<T> = T extends Handler<infer This, infer Ev, infer Result>
  ? Ev extends Event ? Handler<This, Ev, Result>
  : never
  : never;

/** Tuple representation for a client event binding. */
export type EventTuple<
  Fn = Handler,
  Type extends string = string,
> = [Type, HandlerModule<Fn>, EventOptions?];

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
  This = unknown,
  Result = unknown | Promise<unknown>,
>(
  href: HandlerModule<Handler<This, Ev, Result>>,
  options?: EventOptions,
) => EventTuple<Handler<This, Ev, Result>, Type>;

type LifecycleEventMap = {
  mount: Event;
  unmount: Event;
};

type GlobalEventMap = GlobalEventHandlersEventMap & LifecycleEventMap;

type EventHelperRegistry =
  & {
    [Type in keyof GlobalEventMap]: EventHelper<Type, GlobalEventMap[Type]>;
  }
  & Record<string, EventHelper<string, Event>>;

/** Dynamic registry of event helpers backed by the DOM event map. */
const eventHelpers = new Proxy<Record<string, EventHelper<string, Event>>>(
  Object.create(null),
  {
    get(target, prop: PropertyKey, receiver) {
      if (typeof prop !== "string") {
        return Reflect.get(target, prop, receiver);
      }
      const created = (
        href: HandlerModule | string | URL,
        options?: EventOptions,
      ) => {
        const pathname: string = href instanceof URL ? href.pathname : href.toString();
        return [prop, pathname, options] as unknown as EventHelper<string, Event>;
      };
      return created;
    },
  },
) as EventHelperRegistry;

export const event = eventHelpers;

export const events = <
  const Fns extends readonly ClientEventList<any, string>[],
  T extends Record<string, unknown> & IntersectionOrUnknown<ClientEventListThis<Fns[number]>>,
>(
  bind: T,
  ...fns: Fns
) => {
  return [bind, ...fns] as [T, ...Fns] & ClientEventList;
};

export type { Handler };

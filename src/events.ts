import type { Handler } from "./components/client.ts";

export interface ClientEventInit extends AddEventListenerOptions {
  preventDefault?: boolean;
}

export type EventOptions = boolean | ClientEventInit;

type BindContext<Bind> = [Bind] extends [undefined] ? undefined : Bind;

/**
 * Branded string representing a lazily loaded client handler module.
 * The brand carries the handler type so event helpers can preserve `this` and event payload inference.
 */
export type HandlerModule<Fn = Handler> = string & {
  readonly __ruwuterHandler?: Fn;
};

/** Ensures the default export conforms to the expected handler signature. */
export type HandlerAssert<T> = T extends Handler<infer This, infer Ev, infer Result>
  ? Ev extends Event ? Handler<This, Ev, Result>
  : never
  : never;

/** Tuple representation for a client event binding. */
export type ClientEventTuple<
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
  Depth extends 0 ? ClientEventTuple<Fn, Type>
    : ClientEventTuple<Fn, Type>
      | readonly ClientEventListRecursive<Fn, Type, PrevDepth<Depth>>[]
      | readonly [
        HandlerBind<Fn>,
        ...readonly ClientEventListRecursive<Fn, Type, PrevDepth<Depth>>[],
      ];

export type ClientEventList<
  Fn = Handler,
  Type extends string = string,
> = ClientEventListRecursive<Fn, Type, 6>;


type EventHelper<Type extends string, Ev extends Event> = <
  This = unknown,
  Result = unknown | Promise<unknown>,
>(
  href: HandlerModule<Handler<This, Ev, Result>>,
  options?: EventOptions,
) => ClientEventTuple<Handler<This, Ev, Result>, Type>;

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
export const events = new Proxy<Record<string, EventHelper<string, Event>>>(
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
        return [prop, pathname, options] as unknown as EventHelper<string, Event>
      };
      return created;
    },
  },
) as EventHelperRegistry;

export type { Handler };

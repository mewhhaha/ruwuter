import type { Handler } from "./components/client.ts";

type EventOptions = boolean | AddEventListenerOptions;

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

/** Recursive structure for composing multiple client event tuples. */
export type ClientEventList<
  Fn = Handler,
  Type extends string = string,
> = ClientEventTuple<Fn, Type> | readonly ClientEventList<Fn, Type>[];

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
      const cached = target[prop];
      if (cached !== undefined) {
        return cached;
      }
      const created = ((
        href: HandlerModule,
        options?: EventOptions,
      ) => {
        href = href instanceof URL ? href.pathname : href
        return options === undefined ? [prop, href] : [prop, href, options]) as EventHelper<
        string,
        Event
      >;}
      target[prop] = created;
      return created;
    },
  },
) as EventHelperRegistry;

export type { Handler };

import type { Handler } from "./components/client.mts";

type EventOptions = boolean | AddEventListenerOptions;

type AnyHandler = (this: unknown, ev: unknown, signal: AbortSignal) => unknown;

/**
 * Branded string representing a lazily loaded client handler module.
 * The brand carries the handler type so event helpers can preserve `this` and event payload inference.
 */
export type HandlerModule<Fn extends (...args: any[]) => unknown = AnyHandler> = string & {
  readonly __ruwuterHandler?: Fn;
};

/** Ensures the default export conforms to the expected handler signature. */
export type HandlerAssert<T> = T extends Handler<infer This, infer Ev, infer Result>
  ? Ev extends Event ? Handler<This, Ev, Result>
  : never
  : never;

/** Tuple representation for a client event binding. */
export type ClientEventTuple<
  Fn extends (...args: any[]) => unknown = AnyHandler,
  Type extends string = string,
> =
  | [Type, HandlerModule<Fn>]
  | [Type, HandlerModule<Fn>, EventOptions];

type AttrScope = Record<string, unknown>;

/** Descriptor for function-valued attributes computed on the client. */
export type ClientAttrDescriptor<
  Fn extends (...args: any[]) => unknown = AnyHandler,
  Scope extends AttrScope | undefined = AttrScope,
> = {
  readonly __ruwuterAttr: true;
  href: HandlerModule<Fn>;
  scope?: Scope;
};

/**
 * Creates a tuple describing a client-side event handler.
 *
 * @param type - DOM event type (e.g. "click")
 * @param href - URL of the handler module
 * @param options - Optional event listener options (`capture`, `once`, etc.)
 */
export function on<Type extends string, Fn extends (...args: any[]) => unknown>(
  type: Type,
  href: HandlerModule<Fn>,
  options?: EventOptions,
): ClientEventTuple<Fn, Type> {
  return options === undefined ? [type, href] : [type, href, options];
}

type EventFactory<Type extends string, Ev extends Event> = <
  This = unknown,
  Result = unknown | Promise<unknown>,
>(
  href: HandlerModule<Handler<This, Ev, Result>>,
  options?: EventOptions,
) => ClientEventTuple<Handler<This, Ev, Result>, Type>;

const eventFactory = <Type extends string, Ev extends Event>(
  type: Type,
): EventFactory<Type, Ev> => {
  return function <This = unknown, Result = unknown | Promise<unknown>>(
    href: HandlerModule<Handler<This, Ev, Result>>,
    options?: EventOptions,
  ): ClientEventTuple<Handler<This, Ev, Result>, Type> {
    return on<Type, Handler<This, Ev, Result>>(type, href, options);
  };
};

/** Builds a `click` event tuple. */
export const click: EventFactory<"click", MouseEvent> = eventFactory<"click", MouseEvent>("click");

/** Builds a `submit` event tuple. */
export const submit: EventFactory<"submit", SubmitEvent> = eventFactory<"submit", SubmitEvent>(
  "submit",
);

/** Builds an `input` event tuple. */
export const input: EventFactory<"input", InputEvent> = eventFactory<"input", InputEvent>("input");

/** Builds a `change` event tuple. */
export const change: EventFactory<"change", Event> = eventFactory<"change", Event>("change");

/** Builds a `focus` event tuple. */
export const focus: EventFactory<"focus", FocusEvent> = eventFactory<"focus", FocusEvent>("focus");

/** Builds a `blur` event tuple. */
export const blur: EventFactory<"blur", FocusEvent> = eventFactory<"blur", FocusEvent>("blur");

/** Builds a `mount` lifecycle tuple. */
type LifecycleFactory<Type extends string> = <
  This = unknown,
  Result = unknown | Promise<unknown>,
>(
  href: HandlerModule<Handler<This, Event, Result>>,
  options?: EventOptions,
) => ClientEventTuple<Handler<This, Event, Result>, Type>;

const lifecycleFactory = <Type extends "mount" | "unmount">(
  type: Type,
): LifecycleFactory<Type> => {
  return function <This = unknown, Result = unknown | Promise<unknown>>(
    href: HandlerModule<Handler<This, Event, Result>>,
    options?: EventOptions,
  ): ClientEventTuple<Handler<This, Event, Result>, Type> {
    return on<Type, Handler<This, Event, Result>>(type, href, options);
  };
};

export const mount: LifecycleFactory<"mount"> = lifecycleFactory("mount");

/** Builds an `unmount` lifecycle tuple. */
export const unmount: LifecycleFactory<"unmount"> = lifecycleFactory("unmount");

/**
 * Creates an attribute descriptor that points to a client module computing the attribute value.
 * The optional `scope` object is shallow-cloned on the client and used as `this` during updates.
 */
type AttributeFactory = <
  This = unknown,
  Result = unknown | Promise<unknown>,
  Scope extends AttrScope | undefined = AttrScope,
>(
  href: HandlerModule<Handler<This, Event, Result>>,
  scope?: Scope,
) => ClientAttrDescriptor<Handler<This, Event, Result>, Scope>;

export const attribute: AttributeFactory = (href, scope) => ({
  __ruwuterAttr: true,
  href,
  scope,
});

export type { Handler };

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

const eventFactory = <Type extends string, Ev extends Event>(type: Type) =>
<
  This = unknown,
  Result = unknown | Promise<unknown>,
  Fn extends Handler<This, Ev, Result> = Handler<This, Ev, Result>,
>(
  href: HandlerModule<Fn>,
  options?: EventOptions,
): ClientEventTuple<Fn, Type> => on<Type, Fn>(type, href, options);

/** Builds a `click` event tuple. */
export const click = eventFactory<"click", MouseEvent>("click");

/** Builds a `submit` event tuple. */
export const submit = eventFactory<"submit", SubmitEvent>("submit");

/** Builds an `input` event tuple. */
export const input = eventFactory<"input", InputEvent>("input");

/** Builds a `change` event tuple. */
export const change = eventFactory<"change", Event>("change");

/** Builds a `focus` event tuple. */
export const focus = eventFactory<"focus", FocusEvent>("focus");

/** Builds a `blur` event tuple. */
export const blur = eventFactory<"blur", FocusEvent>("blur");

/** Builds a `mount` lifecycle tuple. */
export const mount = <
  This = unknown,
  Result = unknown | Promise<unknown>,
  Fn extends Handler<This, Event, Result> = Handler<This, Event, Result>,
>(
  href: HandlerModule<Fn>,
  options?: EventOptions,
): ClientEventTuple<Fn, "mount"> => on("mount", href, options);

/** Builds an `unmount` lifecycle tuple. */
export const unmount = <
  This = unknown,
  Result = unknown | Promise<unknown>,
  Fn extends Handler<This, Event, Result> = Handler<This, Event, Result>,
>(
  href: HandlerModule<Fn>,
  options?: EventOptions,
): ClientEventTuple<Fn, "unmount"> => on("unmount", href, options);

/**
 * Creates an attribute descriptor that points to a client module computing the attribute value.
 * The optional `scope` object is shallow-cloned on the client and used as `this` during updates.
 */
export const attribute = <
  This = unknown,
  Result = unknown | Promise<unknown>,
  Fn extends Handler<This, Event, Result> = Handler<This, Event, Result>,
  Scope extends AttrScope | undefined = AttrScope,
>(
  href: HandlerModule<Fn>,
  scope?: Scope,
): ClientAttrDescriptor<Fn, Scope> => ({
  __ruwuterAttr: true,
  href,
  scope,
});

export type { Handler };

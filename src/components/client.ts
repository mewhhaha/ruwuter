/**
 * @module
 *
 * Browser activation helpers for explicit controller roots.
 */

export type ControllerCleanup = void | (() => void | Promise<void>);

export type ControllerContext<Props = unknown> = {
  root: Element;
  props: Props;
  signal: AbortSignal;
};

export type Controller<Props = unknown> = (
  context: ControllerContext<Props>,
) => ControllerCleanup | Promise<ControllerCleanup>;

type ControllerModuleLike<Fn = Controller> = (string | URL) & {
  readonly __ruwuterController?: Fn;
};

type TransformedControllerBinding<Fn = Controller> = Fn & {
  readonly clientHref?: string | URL;
  readonly href?: string | URL;
};

type ControllerReference<Fn = Controller> =
  | ControllerModuleLike<Fn>
  | TransformedControllerBinding<Fn>;

export type ControllerAttributes = {
  "data-rw-controller": string;
  "data-rw-props"?: string;
};

type EventTargetLike<Target extends EventTarget> = Target | null | undefined;

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
    (
      listener: (ev: TargetedRuntimeEvent<Event, Target>) => unknown,
      options?: ListenerOptions,
    ) => () => void
  >;

function normalizeControllerReference<Fn = Controller>(
  href: ControllerReference<Fn>,
): string {
  if (typeof href === "function") {
    const transformed = (href as TransformedControllerBinding<Fn>).clientHref ??
      (href as TransformedControllerBinding<Fn>).href;
    if (typeof transformed === "string" || transformed instanceof URL) {
      return transformed.toString();
    }
    throw new TypeError(
      "controller() requires a module URL; received a function without clientHref. Use a transformed 'use client' binding or ?url import.",
    );
  }
  return (href as string | URL).toString();
}

function escapeJsonForAttribute(json: string): string {
  return json
    .replaceAll(/</g, "\\u003C")
    .replaceAll(/>/g, "\\u003E")
    .replaceAll(/&/g, "\\u0026")
    .replaceAll(/\u2028/g, "\\u2028")
    .replaceAll(/\u2029/g, "\\u2029");
}

export function controller<Props>(
  href: ControllerReference<Controller<Props>>,
  props?: Props,
): ControllerAttributes {
  const attrs: ControllerAttributes = {
    "data-rw-controller": normalizeControllerReference(href),
  };

  if (props !== undefined) {
    attrs["data-rw-props"] = escapeJsonForAttribute(JSON.stringify(props));
  }

  return attrs;
}

function resolveRuntimeTarget<Target extends EventTarget>(
  target: EventTargetLike<Target>,
): Target {
  if (!target) throw new TypeError("on(target): target is required.");
  return target;
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

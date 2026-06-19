/**
 * @module
 *
 * Browser activation helpers for explicit controller roots.
 */

export type ControllerCleanup = void | (() => void | Promise<void>);

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

type ControllerRefs = Record<string, Element>;
declare const definedControllerBrand: unique symbol;
declare const controllerHrefBrand: unique symbol;

export type ControllerRefToken<
  Name extends string = string,
  Target extends Element = Element,
> = {
  readonly __ruwuterControllerRef: Name;
  readonly __ruwuterControllerRefTarget: (element: Target) => Target;
};

export type ControllerRefTokens<Refs extends ControllerRefs> = {
  readonly [Name in keyof Refs]: ControllerRefToken<Extract<Name, string>, Refs[Name]>;
};

export type ControllerContext<
  Props extends JsonValue | undefined = JsonValue | undefined,
  Refs extends ControllerRefs = ControllerRefs,
> = {
  root: Element;
  props: Props;
  refs: Readonly<Refs>;
  signal: AbortSignal;
};

export type Controller<
  Props extends JsonValue | undefined = JsonValue | undefined,
  Refs extends ControllerRefs = ControllerRefs,
> = (
  context: ControllerContext<Props, Refs>,
) => ControllerCleanup | Promise<ControllerCleanup>;

export type ControllerDefinition = {
  props?: JsonValue;
  refs?: ControllerRefs;
};

type DefinitionProps<Definition extends ControllerDefinition> = Definition extends {
  props: infer Props extends JsonValue;
} ? Props
  : undefined;

type DefinitionRefs<Definition extends ControllerDefinition> = Definition extends {
  refs: infer Refs extends ControllerRefs;
} ? Refs
  : ControllerRefs;

export type DefinedController<Definition extends ControllerDefinition = ControllerDefinition> =
  & Controller<DefinitionProps<Definition>, DefinitionRefs<Definition>>
  & {
    readonly [definedControllerBrand]: Definition;
    readonly clientHref?: string | URL;
    readonly href?: string | URL;
  };

export type ControllerHref<Definition extends ControllerDefinition = ControllerDefinition> =
  & string
  & {
    readonly [controllerHrefBrand]: DefinedController<Definition>;
  };

type TypedControllerReference<Definition extends ControllerDefinition = ControllerDefinition> =
  | DefinedController<Definition>
  | ControllerHref<Definition>;

type UntypedControllerReference =
  | (string & { readonly [controllerHrefBrand]?: never })
  | URL;

type ControllerReference<Definition extends ControllerDefinition = ControllerDefinition> =
  | TypedControllerReference<Definition>
  | UntypedControllerReference;

export type ControllerAttributes = {
  "data-rw-controller": string;
  "data-rw-props"?: string;
};

export type ControllerMount<Refs extends ControllerRefs = ControllerRefs> = {
  root(): ControllerAttributes;
  refs: ControllerRefTokens<Refs>;
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

export function isControllerRefToken(value: unknown): value is ControllerRefToken {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { __ruwuterControllerRef?: unknown }).__ruwuterControllerRef === "string"
  );
}

export function defineController<Definition extends ControllerDefinition>(
  mount: Controller<DefinitionProps<Definition>, DefinitionRefs<Definition>>,
): DefinedController<Definition> {
  return mount as DefinedController<Definition>;
}

function normalizeControllerReference<Definition extends ControllerDefinition>(
  href: ControllerReference<Definition>,
): string {
  if (typeof href === "function") {
    const transformed = href.clientHref ?? href.href;
    if (typeof transformed === "string" || transformed instanceof URL) {
      return transformed.toString();
    }
    throw new TypeError(
      "controller() requires a module URL; received a controller definition without clientHref. Use a transformed controller binding or ?url import.",
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

function assertJsonValue(value: unknown, seen = new WeakSet<object>()): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("controller() props must be JSON-serializable.");
    }
    return;
  }

  if (typeof value !== "object") {
    throw new TypeError("controller() props must be JSON-serializable.");
  }

  if (seen.has(value)) {
    throw new TypeError("controller() props must be JSON-serializable.");
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      assertJsonValue(item, seen);
    }
    seen.delete(value);
    return;
  }

  for (const item of Object.values(value)) {
    assertJsonValue(item, seen);
  }
  seen.delete(value);
}

function serializeProps(props: JsonValue | undefined): string | undefined {
  if (props === undefined) return undefined;
  assertJsonValue(props);
  let json: string | undefined;
  try {
    json = JSON.stringify(props);
  } catch (error) {
    throw new TypeError("controller() props must be JSON-serializable.", { cause: error });
  }
  if (typeof json !== "string") {
    throw new TypeError("controller() props must be JSON-serializable.");
  }
  return escapeJsonForAttribute(json);
}

function createRefTokens<Refs extends ControllerRefs>(): ControllerRefTokens<Refs> {
  const cache = new Map<string, ControllerRefToken>();
  return new Proxy(Object.create(null), {
    get(_target, prop: PropertyKey) {
      if (typeof prop !== "string") return undefined;
      let token = cache.get(prop);
      if (!token) {
        token = {
          __ruwuterControllerRef: prop,
          __ruwuterControllerRefTarget: (element: Element) => element,
        } as ControllerRefToken;
        cache.set(prop, token);
      }
      return token;
    },
  }) as ControllerRefTokens<Refs>;
}

export function controller<Definition extends ControllerDefinition>(
  href: TypedControllerReference<Definition>,
  props?: DefinitionProps<Definition>,
): ControllerMount<DefinitionRefs<Definition>>;
export function controller(
  href: UntypedControllerReference,
  props?: JsonValue,
): ControllerMount<ControllerRefs>;
export function controller<Definition extends ControllerDefinition>(
  href: ControllerReference<Definition>,
  props?: DefinitionProps<Definition> | JsonValue,
): ControllerMount<DefinitionRefs<Definition>> {
  const spec = normalizeControllerReference(href);
  const serializedProps = serializeProps(props as JsonValue | undefined);

  return {
    root() {
      const attrs: ControllerAttributes = {
        "data-rw-controller": spec,
      };

      if (serializedProps !== undefined) {
        attrs["data-rw-props"] = serializedProps;
      }

      return attrs;
    },
    refs: createRefTokens<DefinitionRefs<Definition>>(),
  };
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

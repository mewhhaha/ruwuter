/**
 * @module
 *
 * Custom JSX runtime for Ruwuter - a zero-dependency, streaming-first implementation.
 * Provides automatic HTML escaping and support for async components.
 *
 * @example
 * ```tsx
 * // Configure TypeScript to use this runtime
 * // tsconfig.json:
 * {
 *   "compilerOptions": {
 *     "jsx": "react-jsx",
 *     "jsxImportSource": "@mewhhaha/ruwuter"
 *   }
 * }
 *
 * // Then write JSX as normal
 * const Component = () => <div>Hello World</div>;
 * ```
 */

import { type Html, into, isHtml } from "./node.ts";
import { withComponentFrame } from "./hooks.ts";
import {
  peekAutoClientScope,
  isClientScopeState,
  type Ref as ClientRef,
} from "../components/client.ts";
import {
  HYDRATION_PAYLOAD_VERSION,
  type HydrationPayloadBase,
  type ModuleEntry,
} from "./event-wire.ts";
import "./typed.ts";
import type { JSX } from "./typed.ts";
export type * from "./typed.ts";
export { type JSX } from "./jsx.ts";
/**
 * Converts various inputs into an Html instance for streaming.
 * @see {@link into}
 */
export { into };

/**
 * Fragment component for grouping multiple elements without a wrapper.
 */
export const Fragment = (props: { children?: unknown }): Html => jsx("", props);

// Void elements are self-closing and shouldn't have a closing tag
const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

// Sequence for JSON hydration ids for `on` handlers
let HYDRATE_SEQ = 0;

type HydrationPayload = Omit<HydrationPayloadBase, "ref"> & {
  ref?: ClientRef<unknown>;
};

type RefMarker = {
  __ref: true;
  i: string;
  v: unknown;
};

type RefAttrBinding = {
  attr: string;
  id: string;
};

const RESERVED_RUNTIME_ATTRS = new Set(["data-rw-ref-text", "data-rw-ref-attr"]);
const AUTO_SCOPE_SKIP_TAGS = new Set(["html", "head", "body"]);

const extractRefMarker = (value: unknown): RefMarker | undefined => {
  if (!value || typeof value !== "object") return undefined;

  const fromRecord = value as Record<string, unknown>;
  if (fromRecord.__ref === true && typeof fromRecord.i === "string") {
    return { __ref: true, i: fromRecord.i, v: fromRecord.v };
  }

  if (!("toJSON" in fromRecord) || typeof fromRecord.toJSON !== "function") {
    return undefined;
  }

  try {
    const marker = fromRecord.toJSON() as Record<string, unknown> | null | undefined;
    if (marker && marker.__ref === true && typeof marker.i === "string") {
      return { __ref: true, i: marker.i, v: marker.v };
    }
  } catch {
    // Ignore marker extraction failures and treat as a normal value.
  }

  return undefined;
};

const isBindableRefAttribute = (key: string): boolean =>
  key.startsWith("data-") || key.startsWith("aria-");

const toBoundAttributeValue = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  return String(value);
};

const serializeRefAttrBindings = (bindings: readonly RefAttrBinding[]): string =>
  bindings.map(({ attr, id }) => `${attr}=${id}`).join(";");

const isPlainObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const mergeHydrationBind = (existing: unknown, incoming: unknown): unknown => {
  if (incoming === undefined) return existing;
  if (existing === undefined) return incoming;
  if (isPlainObjectRecord(existing) && isPlainObjectRecord(incoming)) {
    return { ...existing, ...incoming };
  }
  console.warn(
    "[ruwuter] Ignoring client scope bind merge because both sources are non-object values.",
  );
  return existing;
};

const escapeJsonForScript = (json: string): string =>
  json
    .replaceAll(/</g, "\\u003C")
    .replaceAll(/>/g, "\\u003E")
    .replaceAll(/&/g, "\\u0026")
    .replaceAll(/\u2028/g, "\\u2028")
    .replaceAll(/\u2029/g, "\\u2029");

/**
 * Core JSX factory function that creates HTML elements or calls component functions.
 *
 * @param tag - HTML tag name or component function
 * @param props - Element properties and children
 * @returns Html instance for streaming
 */
export function jsx<Props extends { children?: unknown } & Record<string, unknown>>(
  tag: string | ((props: Props) => JSX.Element),
  { children, ...props }: Props,
): Html {
  if (typeof tag === "function") {
    return into(
      (async function* (): AsyncGenerator<string> {
        const rendered = withComponentFrame(() => tag({ children, ...props } as Props));
        yield* into(rendered).generator;
      })(),
    );
  }

  let attrs = "";
  let dangerousHtml: string | undefined;
  // Optional combined hydration boundary + payload
  let hydrationId: string | undefined;
  let hydrationPayload: HydrationPayload | undefined;
  const refAttrBindings: RefAttrBinding[] = [];
  let explicitClientScope: {
    bind: Record<string, unknown>;
    entries: ModuleEntry[];
  } | undefined;

  const ensureHydration = (): HydrationPayload => {
    hydrationPayload ||= { v: HYDRATION_PAYLOAD_VERSION } as HydrationPayload;
    hydrationPayload.v ??= HYDRATION_PAYLOAD_VERSION;
    hydrationId ||= `h_${HYDRATE_SEQ++}`;
    return hydrationPayload;
  };

  for (const [key, value] of Object.entries(props)) {
    if (key === "__clientScope" && isClientScopeState(value)) {
      value.anchored = true;
      value.explicit = true;
      explicitClientScope = value;
      continue;
    }

    if (RESERVED_RUNTIME_ATTRS.has(key)) {
      console.warn(`[ruwuter] Ignoring reserved runtime attribute "${key}".`);
      continue;
    }

    if (key === "ref") {
      if (
        value &&
        typeof value === "object" &&
        "set" in value &&
        typeof (value as ClientRef<unknown>).set === "function" &&
        "get" in value &&
        typeof (value as ClientRef<unknown>).get === "function"
      ) {
        ensureHydration().ref = value as ClientRef<unknown>;
      }
      continue;
    }

    if (key === "on") {
      throw new TypeError(
        '[ruwuter] The on prop has been removed. Use client.scope() with scope.mount()/scope.unmount() instead.',
      );
    }

    const refMarker = extractRefMarker(value);
    if (refMarker) {
      if (!isBindableRefAttribute(key)) {
        console.warn(
          `[ruwuter] Ignoring ref() binding on unsupported attribute "${key}". Use data-* or aria-* attributes.`,
        );
        continue;
      }
      refAttrBindings.push({ attr: key, id: refMarker.i });
      const initial = toBoundAttributeValue(refMarker.v);
      if (initial !== undefined) {
        attrs += ` ${key}="${sanitize(initial)}" `;
      }
      continue;
    }

    // Legacy onX handlers removed; use `on` prop instead

    // Handle dangerouslySetInnerHTML
    if (
      key === "dangerouslySetInnerHTML" &&
      typeof value === "object" &&
      value !== null &&
      "__html" in value && typeof value.__html === "string"
    ) {
      dangerousHtml = value.__html;
      continue;
    }

    // Boolean/static attributes — render presence for true, skip false/null/undefined
    if (value === true) {
      attrs += ` ${key}="" `;
      continue;
    }
    if (value === false || value == null) continue;

    let sanitized = sanitize(value);
    if (sanitized === undefined) continue;

    // Special case for class to make the class names more readable

    if (key === "class") {
      sanitized = sanitized
        ?.split(/\s+/g)
        .filter((x: string) => x !== "")
        .join(" ");
    }

    attrs += ` ${key}="${sanitized}" `;
  }

  if (refAttrBindings.length > 0) {
    attrs += ` data-rw-ref-attr="${sanitize(serializeRefAttrBindings(refAttrBindings))}" `;
  }

  const implicitClientScope = explicitClientScope
    ? undefined
    : peekAutoClientScope(!AUTO_SCOPE_SKIP_TAGS.has(tag));

  const attachClientScope = (
    scope:
      | { bind: Record<string, unknown>; entries: ModuleEntry[]; anchored?: boolean },
  ) => {
    const hydration = ensureHydration();
    hydration.bind = mergeHydrationBind(hydration.bind, scope.bind);
    hydration.on = [...(hydration.on ?? []), ...scope.entries];
  };

  const generator = async function* (): AsyncGenerator<string> {
    async function* processChild(child: unknown): AsyncGenerator<string> {
      if (child === undefined || child === null || child === false) {
        return;
      }
      if (child instanceof Promise) {
        const resolved = await child;
        yield* processChild(resolved);
        return;
      }
      if (isHtml(child)) {
        yield* child.generator;
        return;
      }
      if (Array.isArray(child)) {
        for (const c of child as unknown[]) {
          yield* processChild(c);
        }
        return;
      }

      if (typeof child === "function") {
        // Treat function children as mini-components for hook scoping
        yield* into(withComponentFrame(() => child())).generator;
        return;
      }

      // Render ref() values (via toJSON marker) as their initial value
      const marker = extractRefMarker(child);
      if (marker) {
        const initial = marker.v === null || marker.v === undefined ? "" : String(marker.v);
        yield `<span data-rw-ref-text="${escapeHtml(marker.i)}">${escapeHtml(initial)}</span>`;
        return;
      }

      yield escapeHtml(child.toString());
    }
    let primedChild: IteratorResult<string> | undefined;
    let childIterator: AsyncGenerator<string> | undefined;

    if (explicitClientScope) {
      attachClientScope(explicitClientScope);
    } else if (
      implicitClientScope &&
      !implicitClientScope.explicit &&
      !implicitClientScope.anchored
    ) {
      implicitClientScope.anchored = true;
      attachClientScope(implicitClientScope);
    }

    if (dangerousHtml === undefined) {
      childIterator = (async function* (): AsyncGenerator<string> {
        yield* processChild(children);
      })();
      primedChild = await childIterator.next();
    }
    if (tag) {
      yield `<${tag}${attrs}>`;
    }

    // If dangerouslySetInnerHTML is provided, use it instead of children
    if (dangerousHtml !== undefined) {
      yield dangerousHtml;
    } else if (childIterator) {
      if (primedChild && !primedChild.done) {
        yield primedChild.value;
      }
      for await (const chunk of childIterator) {
        yield chunk;
      }
    }
    if (tag && !voidElements.has(tag)) {
      yield `</${tag}>`;
    }
    if (hydrationId && hydrationPayload) {
      const json = escapeJsonForScript(JSON.stringify(hydrationPayload));
      yield `<script type="application/json" data-hydrate="${hydrationId}">${json}</script>`;
    }
  };

  return into(generator());
}

/**
 * Escapes HTML special characters to prevent XSS attacks.
 *
 * @param input - String to escape
 * @returns Escaped string safe for HTML output
 */
export function escapeHtml(input: string): string {
  return input.replaceAll(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

const sanitize = (value: unknown): string | undefined => {
  if (typeof value === "string") return value.replaceAll(/"/g, "&quot;");
  if (value === null || value === undefined || value === false) return undefined;
  if (value === true) return "true";
  if (typeof value === "number") return value.toString();
  return undefined;
};

/**
 * JSX factory for multiple children (same as jsx in this implementation).
 *
 * @param tag - HTML tag name or component function
 * @param props - Element properties and children
 * @returns JSX element
 */
export function jsxs<Props extends { children?: unknown } & Record<string, unknown>>(
  tag: string | ((props: Props) => JSX.Element),
  props: Props,
): Html {
  return jsx(tag, props);
}

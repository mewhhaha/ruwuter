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
import type { EventOptions } from "@mewhhaha/ruwuter/events";
import type { Ref as ClientRef } from "../components/client.ts";
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

type EventListenerOptions = {
  capture?: boolean;
  once?: boolean;
  passive?: boolean;
  preventDefault?: boolean;
};

type ModuleEntry = { t: "m"; s: string; x?: string; ev?: string; opt?: EventListenerOptions };
type HydrationPayload = {
  bind?: unknown;
  on?: ModuleEntry[];
  ref?: ClientRef<unknown>;
};

const escapeJsonForScript = (json: string): string => json.replaceAll("</script>", "<\\/script>");

const normalizeEventOptions = (
  options: EventOptions | undefined,
): EventListenerOptions | undefined => {
  if (options === undefined || options === null) {
    return undefined;
  }
  if (typeof options === "boolean") {
    return options ? { capture: true } : undefined;
  }
  if (typeof options !== "object") {
    return undefined;
  }
  const normalized: EventListenerOptions = {};
  if ("capture" in options && options.capture === true) normalized.capture = true;
  if ("once" in options && options.once === true) normalized.once = true;
  if ("passive" in options && options.passive === true) normalized.passive = true;
  if ("preventDefault" in options && options.preventDefault === true) {
    normalized.preventDefault = true;
  }
  return Object.keys(normalized).length ? normalized : undefined;
};

/**
 * Core JSX factory function that creates HTML elements or calls component functions.
 *
 * @param tag - HTML tag name or component function
 * @param props - Element properties and children
 * @returns Html instance for streaming
 */
export function jsx(
  // deno-lint-ignore no-explicit-any
  tag: string | ((props: any) => JSX.Element),
  { children, ...props }: { children?: unknown } & Record<string, unknown>,
): Html {
  if (typeof tag === "function") {
    return withComponentFrame(() => tag({ children, ...props }));
  }

  let attrs = "";
  let dangerousHtml: string | undefined;
  // Optional combined hydration boundary + payload
  let hydrationId: string | undefined;
  let hydrationPayload: HydrationPayload | undefined;

  const ensureHydration = (): HydrationPayload => {
    hydrationPayload ||= {} as HydrationPayload;
    hydrationId ||= `h_${HYDRATE_SEQ++}`;
    return hydrationPayload;
  };

  for (const [key, value] of Object.entries(props)) {
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

    // Event handlers: accept
    // - tuples [type, href, options?]
    // - arrays of tuples (possibly nested), optionally prefixed with a bind value
    // - composer functions from `event.*(href)` and builder forms
    if (key === "on") {
      const items: ModuleEntry[] = [];
      let bindCaptured = false;
      const captureBind = (candidate: unknown) => {
        if (bindCaptured) return;
        ensureHydration().bind = candidate;
        bindCaptured = true;
      };

      const normalizeHref = (href: unknown): string | null => {
        if (href == null) return null;
        if (href instanceof URL) return href.pathname;
        if (typeof href === "string") return href;
        if (typeof href === "object" && typeof (href as any).toString === "function") {
          const s = (href as any).toString();
          return typeof s === "string" && s.length > 0 ? s : null;
        }
        // functions are not supported here
        return null;
      };

      const toModuleEntry = (tuple: readonly unknown[]): ModuleEntry | null => {
        if (tuple.length < 2) return null;
        const [ev, href, opts] = tuple;
        if (typeof ev !== "string" || ev.length === 0) return null;
        const hrefStr = normalizeHref(href);
        if (!hrefStr) return null;
        const entry: ModuleEntry = { t: "m", s: hrefStr, x: "default", ev };
        const normalized = normalizeEventOptions(opts as EventOptions | undefined);
        if (normalized) entry.opt = normalized;
        return entry;
      };

      const isEventTuple = (tuple: readonly unknown[]): boolean =>
        tuple.length >= 2 && typeof tuple[0] === "string" && typeof tuple[1] !== "undefined";

      const helpers = new Proxy(Object.create(null), {
        get(_t, prop: PropertyKey) {
          if (typeof prop !== "string") return undefined;
          return (href: unknown, options?: EventOptions) => [prop, href, options] as const;
        },
      });

      const expandComposer = (fn: unknown): unknown => {
        if (typeof fn !== "function") return fn;
        try {
          // event.click(...): composer that expects helpers
          return (fn as (h: any) => unknown)(helpers);
        } catch {
          return undefined;
        }
      };

      const visit = (node: unknown, allowBind: boolean): void => {
        if (node == null) return;
        // Expand composer functions
        const expanded = typeof node === "function" ? expandComposer(node) : node;
        if (Array.isArray(expanded)) {
          if (isEventTuple(expanded)) {
            const entry = toModuleEntry(expanded);
            if (entry) items.push(entry);
            return;
          }
          let startIndex = 0;
          if (
            allowBind && expanded.length > 0 && !Array.isArray(expanded[0]) &&
            typeof expanded[0] !== "function"
          ) {
            captureBind(expanded[0]);
            startIndex = 1;
          }
          for (let index = startIndex; index < expanded.length; index++) {
            visit(expanded[index], true);
          }
          return;
        }
        // Single tuple
        if (typeof expanded === "object") {
          // not a supported form; ignore
          return;
        }
      };

      visit(value, true);
      if (items.length) ensureHydration().on = items;
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
      if (
        typeof child === "object" && child !== null && "toJSON" in child &&
        typeof child.toJSON === "function"
      ) {
        try {
          const marker = child.toJSON?.();
          if (marker && marker.__ref === true) {
            yield escapeHtml(String(marker.v));
            return;
          }
        } catch {
          // Do nothing
        }
      }

      yield escapeHtml(child.toString());
    }
    if (tag) {
      yield `<${tag}${attrs}>`;
    }

    // If dangerouslySetInnerHTML is provided, use it instead of children
    if (dangerousHtml !== undefined) {
      yield dangerousHtml;
    } else {
      yield* processChild(children);
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
export function jsxs(
  // deno-lint-ignore no-explicit-any
  tag: string | ((props: any) => JSX.Element),
  props: { children?: unknown } & Record<string, unknown>,
): Html {
  return jsx(tag, props);
}

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

import { type Html, into, isHtml } from "./node.mts";
import { withComponentFrame } from "./hooks.mts";
import "./typed.mts";
import type { JSX } from "./typed.mts";
export type * from "./typed.mts";
export { type JSX } from "./jsx.mts";
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

// Sequence for JSON hydration boundaries for `on` handlers
let HYDRATE_SEQ = 0;

type ModuleEntry = { t: "m"; s: string; x?: string; ev?: string };
type HydrationPayload = { bind?: unknown; on?: ModuleEntry[] };

const escapeJsonForScript = (json: string): string => json.replaceAll("</script>", "<\\/script>");

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
    // Explicit state binding for event handlers via `bind` prop
    if (key === "bind") {
      ensureHydration().bind = value;
      continue;
    }

    // Event handlers: expect tuple descriptors [eventType, href, options?]
    if (key === "on" && Array.isArray(value)) {
      const base = value as unknown[];
      const tuples = Array.isArray(base[0]) ? base : [base];
      const items: ModuleEntry[] = [];
      for (const tuple of tuples) {
        if (!Array.isArray(tuple) || tuple.length < 2) continue;
        const [ev, href] = tuple as [unknown, unknown, unknown];
        if (typeof ev !== "string" || ev.length === 0) continue;
        if (typeof href !== "string" || href.length === 0) continue;
        items.push({ t: "m", s: href, x: "default", ev });
      }
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
        yield* child.text;
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
        yield* into(withComponentFrame(() => child())).text;
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
    // Pre-comment hydration boundary
    if (hydrationId) {
      yield `<!--hydration-boundary:${hydrationId}-->`;
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
      yield `<!--/hydration-boundary:${hydrationId}-->`;
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
): JSX.Element {
  return jsx(tag, props);
}

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

import { into, isHtml, type Html } from "./node.mts";
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
export const Fragment = (props: any): any => jsx("", props);

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
let __ON_SEQ = 0;

const escapeJsonForScript = (json: string): string => {
  // Prevent closing script tag from breaking out
  return json.replaceAll("</script>", "<\\/script>");
};

const deriveEventName = (fn: any): string => {
  try {
    const hinted: unknown = (fn && (fn as any).event) || undefined;
    let name = typeof hinted === "string" && hinted ? hinted : fn?.name || "";
    if (name.startsWith("on")) name = name.slice(2);
    name = name.toLowerCase();
    return name || "click";
  } catch {
    return "click";
  }
};

/**
 * Core JSX factory function that creates HTML elements or calls component functions.
 *
 * @param tag - HTML tag name or component function
 * @param props - Element properties and children
 * @returns Html instance for streaming
 */
export function jsx(
  tag: string | Function,
  { children, ...props }: { children?: unknown } & Record<string, any>,
): Html {
  if (typeof tag === "function") {
    return withComponentFrame(() => tag({ children, ...props }));
  }

  let attrs = "";
  let dangerousHtml: string | undefined;
  // Optional combined hydration boundary + payload
  let hydrationId: string | undefined;
  let hydrationPayload: any | undefined;

  for (const key in props) {
    let value = props[key];

    // Explicit state binding for event handlers via `bind` prop
    if (key === "bind") {
      if (!hydrationId) hydrationId = `h_${__ON_SEQ++}`;
      try {
        (hydrationPayload ||= {} as any).bind = value;
      } catch {}
      continue;
    }

    // New unified `on` handlers: accept one or several functions, infer event by function name
    if (key === "on" && (typeof value === "function" || Array.isArray(value))) {
      const fns = Array.isArray(value) ? value : [value];
      const items: any[] = [];
      for (const fn of fns) {
        if (typeof fn !== "function") continue;
        const ev = deriveEventName(fn);
        const href = (fn as any).href;
        if (typeof href === "string" && href) {
          items.push({ t: "m", s: href, x: "default", ev });
        }
      }
      if (items.length) {
        if (!hydrationId) hydrationId = `h_${__ON_SEQ++}`;
        (hydrationPayload ||= {} as any).on = items;
      }
      continue;
    }

    // Legacy onX handlers removed; use `on` prop instead

    // Attribute binding: function-valued props (e.g., class={fn})
    // Collect into a hydration payload array so the client can compute + update on ref changes
    if (typeof value === "function") {
      const href = (value as any).href;
      if (typeof href === "string" && href) {
        const entry = { t: "m", s: href, x: "default" } as const;
        const args = Object.fromEntries(Object.entries(value as any));
        if (!hydrationId) hydrationId = `h_${__ON_SEQ++}`;
        ((hydrationPayload ||= {} as any).attrs ||= []).push({ n: key, e: entry, a: args });
      }
      continue;
    }

    // Handle dangerouslySetInnerHTML
    if (
      key === "dangerouslySetInnerHTML" &&
      typeof value === "object" &&
      value !== null &&
      "__html" in value
    ) {
      dangerousHtml = value.__html;
      continue;
    }

    let sanitized = sanitize(value);
    if (sanitized === undefined) {
      continue;
    }

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
    // Pre-comment boundary
    if (hydrationId) {
      yield `<!--rw:h:${hydrationId}-->`;
    }
    if (tag) {
      yield `<${tag}${attrs}>`;
    }

    // If dangerouslySetInnerHTML is provided, use it instead of children
    if (dangerousHtml !== undefined) {
      yield dangerousHtml;
    } else {
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
          for (let i = 0; i < child.length; i++) {
            const c = child[i];
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
      if (typeof child === "object" && child !== null) {
        try {
          const marker = (child as any).toJSON?.();
          if (marker && marker.__ref === true) {
            yield escapeHtml(String(marker.v));
            return;
          }
        } catch {}
      }

        yield escapeHtml(child.toString());
      }

      yield* processChild(children);
    }

    if (tag && !voidElements.has(tag)) {
      yield `</${tag}>`;
    }
    if (hydrationId && hydrationPayload) {
      yield `<!--/rw:h:${hydrationId}-->`;
      const json = escapeJsonForScript(JSON.stringify(hydrationPayload));
      yield `<script type="application/json" data-rw-h="${hydrationId}">${json}</script>`;
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

const sanitize = (value: any) => {
  if (typeof value === "string") {
    return value.replaceAll(/"/g, "&quot;");
  }
  if (value === null || value === undefined || value === false) {
    return undefined;
  }

  if (value === true) {
    return "true";
  }

  if (typeof value === "number") {
    return value.toString();
  }
};

/**
 * JSX factory for multiple children (same as jsx in this implementation).
 *
 * @param tag - HTML tag name or component function
 * @param props - Element properties and children
 * @returns JSX element
 */
export function jsxs(tag: any, props: any): JSX.Element {
  return jsx(tag, props);
}

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

import { escapeHtml, fromParts, type Html, into, isHtml, type Part } from "./node.ts";
import {
  isControllerRefToken,
  isMovedHandler,
  type MovedHandlerToken,
  serializeMovedEvents,
} from "../components/client.ts";
import "./typed.ts";
import type { JSX } from "./typed.ts";
export type * from "./typed.ts";
export { type JSX } from "./jsx.ts";
export { escapeHtml };
/**
 * Converts various inputs into an Html instance for streaming.
 * @see {@link into}
 */
export { into };

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

/** Appends finished markup, coalescing with a preceding string part. */
const append = (parts: Part[], text: string): void => {
  const last = parts.length - 1;
  if (last >= 0 && typeof parts[last] === "string") {
    parts[last] = (parts[last] as string) + text;
  } else {
    parts.push(text);
  }
};

/**
 * Appends a JSX child. Synchronous values (strings, numbers, arrays, Html) are
 * flattened into string parts immediately; async or lazy values are kept as
 * deferred parts and resolved during rendering with escaping enabled.
 */
const pushChild = (parts: Part[], child: unknown): void => {
  if (child == null || child === false) return;

  switch (typeof child) {
    case "string":
      append(parts, escapeHtml(child));
      return;
    case "number":
    case "bigint":
      append(parts, child.toString());
      return;
    case "boolean":
      append(parts, "true");
      return;
    case "function":
      parts.push({ v: child, esc: true });
      return;
    case "object":
      break;
    default:
      append(parts, escapeHtml(String(child)));
      return;
  }

  if (isHtml(child)) {
    for (const part of child.parts) {
      if (typeof part === "string") {
        append(parts, part);
      } else {
        parts.push(part);
      }
    }
    return;
  }

  if (Array.isArray(child)) {
    for (const item of child) {
      pushChild(parts, item);
    }
    return;
  }

  // Promises, iterables, and other objects resolve during rendering.
  parts.push({ v: child, esc: true });
};

/**
 * Fragment component for grouping multiple elements without a wrapper.
 */
export const Fragment = (props: { children?: unknown }): Html => {
  const parts: Part[] = [];
  pushChild(parts, props.children);
  return fromParts(parts);
};

const ATTR_ESCAPE_PATTERN = /[&"]/;

const sanitize = (value: unknown): string | undefined => {
  switch (typeof value) {
    case "string":
      if (!ATTR_ESCAPE_PATTERN.test(value)) return value;
      return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
    case "number":
      return value.toString();
    case "boolean":
      return value ? "true" : undefined;
    default:
      return undefined;
  }
};

/**
 * Core JSX factory function that creates HTML elements or calls component functions.
 *
 * @param tag - HTML tag name or component function
 * @param props - Element properties and children
 * @returns Html instance for streaming
 */
export function jsx<Props extends { children?: unknown } & Record<string, unknown>>(
  tag: string | ((props: Props) => JSX.Element),
  props: Props,
): Html {
  if (typeof tag === "function") {
    // Components run lazily during rendering so context providers up the tree
    // are active when they execute. Plain-string results are escaped.
    return fromParts([{ v: () => tag(props), esc: true }]);
  }

  let attrs = "";
  let dangerousHtml: string | undefined;
  const movedEvents: Array<readonly [string, MovedHandlerToken]> = [];

  for (const key in props) {
    if (key === "children") continue;
    const value = props[key];

    if (key === "ref") {
      if (value == null || value === false) continue;
      if (!isControllerRefToken(value)) {
        throw new TypeError(
          `[ruwuter] Unsupported ref value. Use a controller ref token such as ref={controller.refs.name}.`,
        );
      }
      attrs += ` data-rw-ref="${sanitize(value.__ruwuterControllerRef)}"`;
      continue;
    }

    if (key.startsWith("on:")) {
      if (!isMovedHandler(value)) {
        throw new TypeError(
          `[ruwuter] ${key} requires move(values, callback) with the Ruwuter Vite plugin.`,
        );
      }
      const eventType = key.slice(3);
      if (!eventType) throw new TypeError("[ruwuter] Moved event type is required.");
      movedEvents.push([eventType, value]);
      continue;
    }

    if ((key.charCodeAt(0) | 32) === 111 && (key.charCodeAt(1) | 32) === 110) {
      throw new TypeError(
        `[ruwuter] Inline event attributes are unsupported ("${key}"). Use controller() with a client module instead.`,
      );
    }

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
      attrs += ` ${key}=""`;
      continue;
    }
    if (value === false || value == null) continue;

    let sanitized = sanitize(value);
    if (sanitized === undefined) continue;

    // Special case for class to make the class names more readable
    if (key === "class") {
      sanitized = sanitized.replace(/\s+/g, " ").trim();
    }

    attrs += ` ${key}="${sanitized}"`;
  }

  if (movedEvents.length > 0) {
    attrs += ` data-rw-events="${sanitize(serializeMovedEvents(movedEvents))}"`;
  }

  const parts: Part[] = [];
  if (tag) {
    parts.push(`<${tag}${attrs}>`);
  }

  // If dangerouslySetInnerHTML is provided, use it instead of children
  if (dangerousHtml !== undefined) {
    append(parts, dangerousHtml);
  } else {
    pushChild(parts, props.children);
  }

  if (tag && !voidElements.has(tag)) {
    append(parts, `</${tag}>`);
  }

  return fromParts(parts);
}

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

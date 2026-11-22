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

import { bodyTail } from "./body-tail.ts";
import { escapeHtml, fromParts, type Html, into, isHtml, observeInput, type Part } from "./node.ts";
import { isControllerRefToken } from "../components/client.ts";
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
  // Booleans render nothing, so `{cond && <X />}` and `{!!x}` never leak text.
  if (child == null || typeof child === "boolean") return;

  switch (typeof child) {
    case "string":
      append(parts, escapeHtml(child));
      return;
    case "number":
    case "bigint":
      append(parts, child.toString());
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

  // A later sibling can reject while an earlier sibling still owns the stream.
  observeInput(child);
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

/**
 * Conservative HTML/SVG attribute-name shape. Anything outside it (whitespace,
 * quotes, `=`, `<`, `>`) could break out of the attribute and inject markup,
 * so such keys are rejected instead of escaped.
 */
const ATTR_NAME_PATTERN = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/;

const assertAttributeName = (key: string): void => {
  if (ATTR_NAME_PATTERN.test(key)) return;
  throw new TypeError(`[ruwuter] Invalid attribute name ("${key}").`);
};

/**
 * Conservative HTML/SVG tag-name shape. Covers every `JSX.IntrinsicElements`
 * name, including SVG camelCase (`feTurbulence`) and custom elements
 * (`my-element`). Anything outside it (whitespace, quotes, `=`, `/`, `<`, `>`)
 * could break out of the tag and inject markup, so such tags are rejected
 * instead of escaped.
 */
const TAG_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/;

const assertTagName = (tag: string): void => {
  if (TAG_NAME_PATTERN.test(tag)) return;
  throw new TypeError(`[ruwuter] Invalid tag name ("${tag}").`);
};

/**
 * Renders an attribute value as a quoted-attribute-safe string, or `undefined`
 * when the value has no textual form. Booleans never arrive here: callers
 * either pass a string or handle `true`/`false` before calling.
 */
const sanitize = (value: unknown): string | undefined => {
  switch (typeof value) {
    case "string":
      if (!ATTR_ESCAPE_PATTERN.test(value)) return value;
      return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
    case "number":
      return value.toString();
    default:
      if (value instanceof Date) return value.toISOString();
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
    // Data props can hold already-started work. Leave getters and lazy callbacks
    // untouched while a preceding sibling or HEAD keeps this component unrendered.
    for (const key of Object.keys(props)) {
      observeInput(Object.getOwnPropertyDescriptor(props, key)?.value);
    }
    // Components run lazily during rendering so context providers up the tree
    // are active when they execute. Plain-string results are escaped.
    return fromParts([{ v: () => tag(props), esc: true }]);
  }

  // An empty tag emits no markup at all (the fragment path), so there is
  // nothing for a hostile name to break out of.
  if (tag) assertTagName(tag);

  let attrs = "";
  for (const key of Object.keys(props)) {
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

    if (/^on/i.test(key)) {
      throw new TypeError(
        `[ruwuter] Inline event attributes are unsupported ("${key}"). Use controller() with a client module instead.`,
      );
    }

    if (key === "dangerouslySetInnerHTML") {
      throw new TypeError("Use unsafeHTML() as a child for trusted markup.");
    }

    assertAttributeName(key);

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

  const parts: Part[] = [];
  if (tag) {
    parts.push(`<${tag}${attrs}>`);
  }

  pushChild(parts, props.children);

  if (tag.toLowerCase() === "body") parts.push({ v: bodyTail, esc: false });
  if (tag && !voidElements.has(tag.toLowerCase())) {
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

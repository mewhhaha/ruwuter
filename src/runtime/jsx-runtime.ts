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
import { isControllerRefToken } from "../components/client.ts";
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

  for (const [key, value] of Object.entries(props)) {
    if (key === "ref") {
      if (value == null || value === false) continue;
      if (!isControllerRefToken(value)) {
        throw new TypeError(
          `[ruwuter] Unsupported ref value. Use a controller ref token such as ref={controller.refs.name}.`,
        );
      }
      attrs += ` data-rw-ref="${sanitize(value.__ruwuterControllerRef)}" `;
      continue;
    }

    if (/^on/i.test(key)) {
      throw new TypeError(
        `[ruwuter] Inline event attributes are unsupported ("${key}"). Use controller() with a client module instead.`,
      );
    }

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

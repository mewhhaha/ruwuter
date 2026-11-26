/**
 * @module
 *
 * React-inspired declarative View Transition helpers for MPA and partial HTML updates.
 */

import { Fragment, type JSX, jsx } from "@mewhhaha/ruwuter/jsx-runtime";
import { unsafeHTML } from "../runtime/node.ts";

const CSS_IDENT = /^[A-Za-z_-][A-Za-z0-9_-]*$/;
const RESERVED_IDENTS = new Set([
  "none",
  "auto",
  "initial",
  "inherit",
  "unset",
  "revert",
  "revert-layer",
]);

const assertIdent = (value: string, label: string): string => {
  if (!CSS_IDENT.test(value) || RESERVED_IDENTS.has(value.toLowerCase())) {
    throw new TypeError(`[ruwuter] Invalid view transition ${label} ("${value}").`);
  }
  return value;
};

const normalizeClasses = (value?: string): string | undefined => {
  if (!value) return undefined;
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return undefined;
  return tokens.map((token) => assertIdent(token, "class")).join(" ");
};

const normalizeFor = (value: string | readonly string[]): string => {
  const list = typeof value === "string" ? [value] : value;
  const normalized = list.map((item) => {
    const trimmed = item.trim();
    if (!trimmed || /\s/.test(trimmed) || (trimmed !== "*" && !trimmed.startsWith("/"))) {
      throw new TypeError(
        `[ruwuter] Invalid view transition "for" target ("${item}"). Use "*" or a pathname starting with "/".`,
      );
    }
    return trimmed;
  });
  if (normalized.length === 0) {
    throw new TypeError('[ruwuter] View transition "for" target cannot be empty.');
  }
  return normalized.join(" ");
};

const mergeStyle = (first: string, second?: string): string => {
  if (!second) return first;
  const trimmed = second.trim();
  return trimmed ? `${first};${trimmed}` : first;
};

export interface ViewTransitionOptions {
  /** Reusable CSS `view-transition-class` token(s) for shared `::view-transition-group(.name)` rules. */
  share?: string;
  /**
   * Scope just-in-time MPA activation via `@mewhhaha/ruwuter/vt.js` to navigations targeting or
   * returning from the given pathname(s), or `"*"` for any cross-document transition.
   * Omit to emit inline CSS `view-transition-name` directly (works with zero JavaScript).
   */
  for?: string | readonly string[];
  /** Optional inline style to merge with emitted `view-transition-*` declarations. */
  style?: string;
}

export type ViewTransitionAttributes = {
  style?: string;
  "data-rw-vt"?: string;
  "data-rw-vt-for"?: string;
  "data-rw-vt-class"?: string;
};

/**
 * Produces HTML attributes for attaching a View Transition directly to an intrinsic element
 * (such as `<img>`, `<h1>`, or `<li>`) without adding a wrapper element.
 */
export function vt(name: string, options: ViewTransitionOptions = {}): ViewTransitionAttributes {
  const validName = assertIdent(name, "name");
  const share = normalizeClasses(options.share);

  if (options.for !== undefined) {
    const attrs: ViewTransitionAttributes = {
      "data-rw-vt": validName,
      "data-rw-vt-for": normalizeFor(options.for),
    };
    if (share) attrs["data-rw-vt-class"] = share;
    if (options.style) attrs.style = options.style;
    return attrs;
  }

  const vtStyle = share
    ? `view-transition-name:${validName};view-transition-class:${share}`
    : `view-transition-name:${validName}`;
  return { style: mergeStyle(vtStyle, options.style) };
}

export type ViewTransitionProps<AS extends keyof JSX.IntrinsicElements = "div"> = {
  /** Tag name for the transition box element. Defaults to `"div"`. */
  as?: AS;
  /** CSS `view-transition-name` identifier matching elements across views. */
  name: string;
  /** Reusable CSS `view-transition-class` token(s) for shared animations. */
  share?: string;
  /**
   * Optional pathname(s) or `"*"` for just-in-time activation via `@mewhhaha/ruwuter/vt.js`.
   * Omit for zero-JS inline `view-transition-name`.
   */
  for?: string | readonly string[];
  children?: JSX.HtmlNode;
} & Omit<JSX.IntrinsicElements[AS], "children">;

/**
 * Declarative View Transition boundary inspired by React's `<ViewTransition>`.
 * Renders a real layout box (`div` by default, or `as="..."`) with validated transition styling
 * or just-in-time `data-rw-vt` attributes for MPA navigations.
 */
export function ViewTransition<AS extends keyof JSX.IntrinsicElements = "div">({
  as,
  name,
  share,
  for: matchFor,
  style,
  children,
  ...props
}: ViewTransitionProps<AS>): JSX.Element {
  const attrs = vt(name, {
    share,
    for: matchFor,
    style: typeof style === "string" ? style : undefined,
  });
  return jsx(as ?? "div", { ...props, ...attrs, children });
}

export interface ViewTransitionsProps {
  /** Optional CSP nonce applied to the emitted `@view-transition` `<style>` tag. */
  nonce?: string;
  /**
   * Element id(s) (e.g. `"#product-hero"`) the browser should wait for before capturing the
   * incoming MPA snapshot (`<link rel="expect" blocking="render">`).
   */
  expect?: string | readonly string[];
  /** Optional `@view-transition` CSS types applied to cross-document navigations. */
  types?: readonly string[];
}

/**
 * Opts a document `<head>` into zero-JS cross-document MPA View Transitions (`@view-transition`)
 * and optional render-blocking `<link rel="expect">` targets for streamed pages.
 */
export function ViewTransitions({ nonce, expect, types }: ViewTransitionsProps = {}): JSX.Element {
  const validTypes = types?.length
    ? types.map((type) => assertIdent(type, "type")).join(" ")
    : undefined;
  const css = validTypes
    ? `@view-transition{navigation:auto;types:${validTypes}}`
    : "@view-transition{navigation:auto}";

  const expectList = expect === undefined ? [] : typeof expect === "string" ? [expect] : expect;
  const links = expectList.map((raw) => {
    const trimmed = raw.trim();
    const id = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
    if (!id || /\s/.test(id)) {
      throw new TypeError(`[ruwuter] Invalid ViewTransitions expect id ("${raw}").`);
    }
    return jsx("link", { rel: "expect", blocking: "render", href: `#${id}` });
  });

  const styleProps: Record<string, unknown> = { children: unsafeHTML(css) };
  if (nonce !== undefined) styleProps.nonce = nonce;
  return Fragment({ children: [jsx("style", styleProps), ...links] });
}

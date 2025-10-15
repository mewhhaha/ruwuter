/**
 * @module
 *
 * Suspense components for progressive rendering in Ruwuter applications.
 */

import { createContext } from "./context.mts";
import { type JSX, jsx, Fragment, into } from "@mewhhaha/ruwuter/jsx-runtime";

type SuspenseRegistry = Map<string, Promise<[id: string, html: string]>>;

const context = createContext<SuspenseRegistry | undefined>(
  undefined,
);

const getRegistry = (): SuspenseRegistry | undefined => {
  return context.use();
};

type SuspenseProps<AS extends keyof JSX.IntrinsicElements = "div"> = {
  as?: AS;
  fallback: JSX.Element;
  children: JSX.Element | (() => Promise<JSX.Element>);
} & Omit<JSX.IntrinsicElements[AS], "children">;

export const Suspense = ({
  fallback,
  as: As = "div",
  children,
  ...props
}: SuspenseProps): JSX.Element => {
  const registry = getRegistry();
  if (!registry) {
    const content = typeof children === "function" ? children() : children;
    return jsx(As, { ...props, children: content });
  }

  const id = `suspense-${crypto.randomUUID()}`;

  let promise: Promise<[id: string, html: string]> | undefined;
  if (typeof children === "function") {
    promise = children().then(async (el) => [id, await (await el).toPromise()]);
  } else {
    promise = (async () => [id, await (await children).toPromise()])();
  }

  registry.set(id, promise);

  return jsx(As, { id, ...props, children: fallback });
};

type ResolveProps = { nonce?: string };

export const SuspenseProvider = ({
  children,
}: {
  children: JSX.Element;
}): JSX.Element => {
  // Provide an empty registry for any Suspense boundaries within.
  return jsx(context.Provider, {
    value: new Map<string, Promise<[id: string, html: string]>>(),
    children,
  });
};

/**
 * Streams resolved Suspense content. Define once near the end of <body>.
 * If a strict CSP is used, supply a nonce so the defining script can run.
 */
export const Resolve = ({ nonce }: ResolveProps): JSX.Element => {
  const registry = getRegistry();
  if (!registry || registry.size === 0) {
    return jsx(Fragment, {});
  }

  return into(
    (async function* () {
      const nonceAttribute = nonce ? ` nonce="${nonce}"` : "";
      // Define the custom element once with a nonce-bearing script so later chunks don't need inline scripts.
      yield* html`
<script type="application/javascript"${nonceAttribute}>
if (!customElements.get('resolved-data')) {
  class ResolvedData extends HTMLElement {
    connectedCallback() {
      const templateId = this.getAttribute('from');
      const targetId = this.getAttribute('to');
      const template = document.getElementById(templateId || '');
      const target = document.getElementById(targetId || '');
      try {
        if (template instanceof HTMLTemplateElement && target instanceof HTMLElement) {
          target.replaceWith(template.content.cloneNode(true));
        }
      } finally {
        this.remove();
        template?.remove();
      }            
    }
  }
  customElements.define('resolved-data', ResolvedData);
}
</script>`;

      while (registry.size > 0) {
        const templateId = crypto.randomUUID();
        const [id, element] = await Promise.race(registry.values());
        registry.delete(id);
        yield* html`
<template id="${templateId}">${element}</template>
<resolved-data to="${id}" from="${templateId}"></resolved-data>`;
      }
    })(),
  );
};

function html(strings:TemplateStringsArray, ...values: string[]): string{
  return String.raw({raw: strings}, ...values)
  
}

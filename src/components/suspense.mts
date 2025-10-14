/**
 * @module
 *
 * Suspense components for progressive rendering in Ruwuter applications.
 */

import { createContext } from "./context.mts";
import { type JSX, jsx, Fragment, into } from "../runtime/jsx-runtime.mts";

type SuspenseRegistry = Map<string, Promise<[id: string, html: string]>>;

const SuspenseRegistryContext = createContext<SuspenseRegistry | undefined>(
  undefined,
);

export function withSuspenseContext<T>(fn: () => T): T {
  return SuspenseRegistryContext.withValue(new Map(), fn);
}

const getRegistry = (): SuspenseRegistry | undefined => {
  return SuspenseRegistryContext.use();
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
  return jsx(SuspenseRegistryContext.Provider, {
    value: new Map<string, Promise<[id: string, html: string]>>(),
    children,
  });
};

export const Resolve = ({ nonce }: ResolveProps): JSX.Element => {
  const registry = getRegistry();
  if (!registry || registry.size === 0) {
    return jsx(Fragment, {});
  }

  return into(
    (async function* () {
      const nonceAttribute = nonce ? ` nonce="${nonce}"` : "";
      // Define the custom element once with a nonce-bearing script so later chunks don't need inline scripts.
      yield* `
<script type="application/javascript"${nonceAttribute}>
  (function(){
    if (!customElements.get('resolved-data')) {
      class ResolvedData extends HTMLElement {
        connectedCallback() {
          const templateId = this.getAttribute('from');
          const targetId = this.getAttribute('to');
          const template = document.getElementById(templateId || '');
          const target = document.getElementById(targetId || '');
          if (template instanceof HTMLTemplateElement && target instanceof HTMLElement) {
            try { target.replaceWith(template.content.cloneNode(true)); } catch(_) {}
          }
          try { this.remove(); } catch(_) {}
          try { template && template.remove && template.remove(); } catch(_) {}
        }
      }
      try { customElements.define('resolved-data', ResolvedData); } catch(_) {}
    }
  })();
</script>`;

      while (registry.size > 0) {
        const templateId = crypto.randomUUID();
        const [id, element] = await Promise.race(registry.values());
        registry.delete(id);
        yield* `
<template id="${templateId}">${element}</template>
<resolved-data to="${id}" from="${templateId}"></resolved-data>`;
      }
    })(),
  );
};

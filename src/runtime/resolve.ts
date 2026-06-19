/**
 * @module
 *
 * Browser runtime for streamed Suspense templates.
 * Replaces fallback nodes when matching `<template data-rw-target>` chunks arrive.
 */

const hasWindow = typeof window !== "undefined";

function initializeResolveRuntime(): void {
  if (!hasWindow) return;

  const processed = new WeakSet<HTMLTemplateElement>();

  const processTemplate = (template: HTMLTemplateElement | Element | Node): boolean => {
    if (!(template instanceof HTMLTemplateElement) || processed.has(template)) return false;

    const targetId = template.getAttribute("data-rw-target");
    if (!targetId) return false;

    const target = document.getElementById(targetId);
    if (!target) return false;

    // Move nodes out of the template directly rather than cloning.
    // Cloning template content that includes <script> can trip TT script enforcement.
    target.replaceWith(template.content);
    processed.add(template);
    template.remove();
    return true;
  };

  const scanRoot = (root: Document | DocumentFragment | Element): void => {
    const nodeList = root.querySelectorAll?.("template[data-rw-target]");
    let replaced = false;
    nodeList?.forEach((node) => {
      if (node instanceof HTMLTemplateElement) {
        replaced = processTemplate(node) || replaced;
      }
    });
    if (replaced) scanRoot(document);
  };

  scanRoot(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes?.forEach((node) => {
        if (node instanceof HTMLTemplateElement) {
          processTemplate(node);
        } else if (node instanceof Element) {
          scanRoot(node);
        }
      });
      scanRoot(document);
    }
  });

  observer.observe(document, { childList: true, subtree: true });
}

if (hasWindow) {
  initializeResolveRuntime();
}

export {};

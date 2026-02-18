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

  const processTemplate = (template: HTMLTemplateElement | Element | Node): void => {
    if (!(template instanceof HTMLTemplateElement) || processed.has(template)) return;

    const targetId = template.getAttribute("data-rw-target");
    if (!targetId) return;

    const target = document.getElementById(targetId);
    if (!target) return;

    // Move nodes out of the template directly rather than cloning.
    // Cloning template content that includes <script> can trip TT script enforcement.
    target.replaceWith(template.content);
    processed.add(template);
    template.remove();
  };

  const scanRoot = (root: Document | DocumentFragment | Element): void => {
    const nodeList = root.querySelectorAll?.("template[data-rw-target]");
    nodeList?.forEach((node) => {
      if (node instanceof HTMLTemplateElement) {
        processTemplate(node);
      }
    });
  };

  scanRoot(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes?.forEach((node) => {
        if (node instanceof HTMLTemplateElement) {
          processTemplate(node);
          return;
        }
        if (node instanceof Element) {
          scanRoot(node);
        }
      });
    }
  });

  observer.observe(document, { childList: true, subtree: true });
}

if (hasWindow) {
  initializeResolveRuntime();
}

export {};

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

  // Resolves every template whose target is already in the document. Replacing one
  // target can reveal another template's target (nested Suspense), so repeat until a
  // pass makes no progress. Bounded: every extra pass consumes at least one template.
  const resolveTemplates = (): void => {
    let replaced = true;
    while (replaced) {
      replaced = false;
      document.querySelectorAll("template[data-rw-target]").forEach((node) => {
        replaced = processTemplate(node) || replaced;
      });
    }
  };

  resolveTemplates();

  // One pass per mutation batch, not per record: streamed renders deliver many records
  // and each pass already covers the whole document.
  const observer = new MutationObserver(() => {
    resolveTemplates();
  });

  observer.observe(document, { childList: true, subtree: true });
}

if (hasWindow) {
  initializeResolveRuntime();
}

export {};

// @ts-check
let started = false;

/**
 * Bootstraps template-based suspense resolution on the client.
 */
export function startResolveRuntime() {
  if (typeof window === "undefined") return;
  if (started) return;
  started = true;

  const processed = new WeakSet();

  const processTemplate = (template) => {
    if (!(template instanceof HTMLTemplateElement)) return;
    if (processed.has(template)) return;
    const targetId = template.getAttribute("data-rw-target");
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    const fragment = template.content.cloneNode(true);
    target.replaceWith(fragment);
    processed.add(template);
    template.remove();
  };

  const scanRoot = (root) => {
    const nodes = root.querySelectorAll?.('template[data-rw-target]') ?? [];
    nodes.forEach((node) => processTemplate(node));
  };

  scanRoot(document);

  const mo = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes?.forEach((node) => {
        if (node instanceof HTMLTemplateElement) {
          processTemplate(node);
          return;
        }
        if (node && node.nodeType === 1) {
          scanRoot(node);
        }
      });
    }
  });

  mo.observe(document, { childList: true, subtree: true });
}

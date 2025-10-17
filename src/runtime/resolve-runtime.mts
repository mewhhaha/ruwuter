let started = false;

export function startResolveRuntime(): void {
  if (typeof window === "undefined" || started) return;
  started = true;

  const processed = new WeakSet<HTMLTemplateElement>();

  const processTemplate = (template: HTMLTemplateElement | Element | Node): void => {
    if (!(template instanceof HTMLTemplateElement) || processed.has(template)) return;

    const targetId = template.getAttribute("data-rw-target");
    if (!targetId) return;

    const target = document.getElementById(targetId);
    if (!target) return;

    const fragment = template.content.cloneNode(true);
    target.replaceWith(fragment);
    processed.add(template);
    template.remove();
  };

  const scanRoot = (root: Document | DocumentFragment | Element): void => {
    const nodeList = root.querySelectorAll?.("template[data-rw-target]");
    const nodes = nodeList
      ? Array.from(nodeList).filter((node): node is HTMLTemplateElement => node instanceof HTMLTemplateElement)
      : [];
    nodes.forEach((node) => processTemplate(node));
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

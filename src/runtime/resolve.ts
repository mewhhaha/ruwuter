/**
 * @module
 * Classic script for completed out-of-order HTML panels. Its generated copy is
 * served by the Fetch router, including in deployments without a filesystem.
 */
if (typeof document !== "undefined") {
  const resolvePanels = (): void => {
    let replaced: boolean;
    do {
      replaced = false;
      for (
        const template of document.querySelectorAll<HTMLTemplateElement>("template[data-rw-target]")
      ) {
        const end = template.nextSibling;
        if (end?.nodeType !== 8 || end.nodeValue !== "rw-end") continue;
        const target = document.getElementById(template.getAttribute("data-rw-target")!);
        if (!target) continue;
        target.replaceWith(template.content);
        end.remove();
        template.remove();
        replaced = true;
      }
    } while (replaced);
  };

  // A document can receive several independently rendered fragments.
  const installed = Symbol.for("ruwuter.resolve.v1");
  if (!Reflect.has(document, installed)) {
    Reflect.set(document, installed, true);
    new MutationObserver(resolvePanels).observe(document, { childList: true, subtree: true });
  }
  resolvePanels();
}

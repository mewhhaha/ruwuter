export function resolvePanels(
  root: Document | DocumentFragment | Element,
  existing?: Set<Element>,
): void {
  let replaced: boolean;
  do {
    replaced = false;
    for (
      const template of root.querySelectorAll<HTMLTemplateElement>("template[data-rw-target]")
    ) {
      if (existing?.has(template)) continue;
      const end = template.nextSibling;
      if (end?.nodeType !== 8 || end.nodeValue !== "rw-end") continue;
      const id = template.getAttribute("data-rw-target")!;
      if (!id || !template.content) continue;
      let target: Element | null;
      if ("getElementById" in root) target = root.getElementById(id);
      else target = root.querySelector("#" + CSS.escape(id));
      if (!target || existing?.has(target)) continue;
      target.replaceWith(template.content);
      end.remove();
      template.remove();
      replaced = true;
    }
  } while (replaced);
}

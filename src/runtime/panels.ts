export function resolvePanels(root: Document | DocumentFragment | Element): void {
  let replaced: boolean;
  do {
    replaced = false;
    for (
      const template of root.querySelectorAll<HTMLTemplateElement>("template[data-rw-target]")
    ) {
      const end = template.nextSibling;
      if (end?.nodeType !== 8 || end.nodeValue !== "rw-end") continue;
      const id = template.getAttribute("data-rw-target")!;
      if (!id || !template.content) continue;
      let target: Element | null;
      if ("getElementById" in root) target = root.getElementById(id);
      else target = root.querySelector("#" + CSS.escape(id));
      if (!target) continue;
      target.replaceWith(template.content);
      end.remove();
      template.remove();
      replaced = true;
    }
  } while (replaced);
}

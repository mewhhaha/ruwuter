import { client, controller, on } from "../src/browser.ts";

function compileClientMacroTypes() {
  const href = client<{
    props: { label: string };
    refs: { button: HTMLButtonElement };
  }>(({ props, refs, signal }) => {
    props.label.toUpperCase();
    on(refs.button).click(() => {}, { signal });
  });

  const mounted = controller(href, { label: "Open" });
  mounted.refs.button satisfies { readonly __ruwuterControllerRef: "button" };

  // @ts-expect-error required controller props remain required after extraction
  controller(href);
}

void compileClientMacroTypes;

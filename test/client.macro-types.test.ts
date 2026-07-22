import { client, controller, move, on } from "../src/browser.ts";
import type { JSX } from "../src/router.ts";

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

  const button: JSX.IntrinsicElements["button"] = {
    "on:click": move({ count: 1 }, (event, values) => {
      event.currentTarget.disabled = true;
      event.clientX satisfies number;
      values.count satisfies number;
    }),
  };

  const form: JSX.IntrinsicElements["form"] = {
    "on:submit": move({ endpoint: "/save" }, (event, values) => {
      event.currentTarget.method = "post";
      event.submitter satisfies HTMLElement | null;
      values.endpoint satisfies string;
    }),
  };

  void button;
  void form;
}

void compileClientMacroTypes;

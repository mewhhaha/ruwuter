import { controller, type ControllerHref } from "@mewhhaha/ruwuter/browser";
import type { OpenPaletteController } from "./open-palette.client.ts";
import openPaletteHrefValue from "./open-palette.client.ts?ruwuter-controller-url";

// Low-level Vite-plugin form. Applications normally import this from generated app/controllers.ts.
const openPalette = openPaletteHrefValue as unknown as ControllerHref<OpenPaletteController>;

export default function CommandPaletteExample() {
  const palette = controller(openPalette);

  return (
    <html>
      <body>
        <section {...palette.root()}>
          <button type="button" ref={palette.refs.open} commandfor="palette" command="show-modal">
            Open palette
          </button>
          <dialog id="palette" ref={palette.refs.dialog}>
            <form method="dialog">
              <input autofocus placeholder="Type a command" />
              <button type="submit" value="cancel">Close</button>
            </form>
          </dialog>
        </section>
        <script type="module" src="@mewhhaha/ruwuter/client.js"></script>
      </body>
    </html>
  );
}

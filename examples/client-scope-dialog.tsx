import { controller } from "@mewhhaha/ruwuter/components";
const openPaletteHref = "./open-palette.client.ts?url";

export default function CommandPaletteExample() {
  return (
    <html>
      <body>
        <section {...controller(openPaletteHref)}>
          <button type="button" data-ref="open" commandfor="palette" command="show-modal">
            Open palette
          </button>
          <dialog id="palette" data-ref="dialog">
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

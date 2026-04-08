import { Client, client, ref } from "@mewhhaha/ruwuter/components";
const openPaletteHref = "./open-palette.client.ts?url";

export default function CommandPaletteExample() {
  const dialog = ref(null as HTMLDialogElement | null);
  const button = ref(null as HTMLButtonElement | null);
  const scope = client.scope({ dialog, button });

  scope.mount(openPaletteHref);

  return (
    <html>
      <body>
        <section>
          <button type="button" ref={button} commandfor="palette" command="show-modal">
            Open palette
          </button>
          <dialog id="palette" ref={dialog}>
            <form method="dialog">
              <input autofocus placeholder="Type a command" />
              <button type="submit" value="cancel">Close</button>
            </form>
          </dialog>
        </section>
        <Client />
      </body>
    </html>
  );
}

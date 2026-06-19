"use client";

import { defineController, on } from "@mewhhaha/ruwuter/browser";

export type OpenPaletteController = {
  refs: {
    open: HTMLButtonElement;
    dialog: HTMLDialogElement;
  };
};

export default defineController<OpenPaletteController>(({ refs, signal }) => {
  on(refs.open).click(() => {
    refs.dialog.showModal();
  }, { signal });
});

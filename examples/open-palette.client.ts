"use client";

import { on, type Ref } from "@mewhhaha/ruwuter/components";

export default function openPalette(
  this: {
    button: Ref<HTMLButtonElement | null>;
    dialog: Ref<HTMLDialogElement | null>;
  },
  _ev: Event,
  signal: AbortSignal,
) {
  on(this.button).click(() => {
    this.dialog.get()?.showModal();
  }, { signal });
}

"use client";

import { type ControllerContext, on } from "@mewhhaha/ruwuter/components";

export default function openPalette(
  { root, signal }: ControllerContext,
) {
  const button = root.querySelector<HTMLButtonElement>('[data-ref="open"]');
  const dialog = root.querySelector<HTMLDialogElement>('[data-ref="dialog"]');

  on(button).click(() => {
    dialog?.showModal();
  }, { signal });
}

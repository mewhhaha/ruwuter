/**
 * @module
 * Classic script for completed out-of-order HTML panels. Its generated copy is
 * served by the Fetch router, including in deployments without a filesystem.
 */
import { resolvePanels } from "./panels.ts";

if (typeof document !== "undefined") {
  // A document can receive several independently rendered fragments.
  const installed = Symbol.for("ruwuter.resolve.v1");
  if (!Reflect.has(document, installed)) {
    Reflect.set(document, installed, true);
    new MutationObserver(() => resolvePanels(document)).observe(document, {
      childList: true,
      subtree: true,
    });
  }
  resolvePanels(document);
}

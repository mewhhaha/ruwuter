/**
 * @module
 *
 * Browser-only helpers for controller modules.
 */

export {
  type Controller,
  controller,
  type ControllerCleanup,
  type ControllerContext,
  type ControllerDefinition,
  type ControllerHref,
  type ControllerRefToken,
  type ControllerRefTokens,
  defineController,
  type JsonValue,
  on,
} from "./components/client.ts";
import type {
  Controller,
  ControllerDefinition,
  ControllerHref,
  JsonValue,
} from "./components/client.ts";

/** Derives a typed controller href from a module's actual default export. */
export type ControllerHrefOf<Module> = Module extends {
  default: import("./components/client.ts").DefinedController<
    infer Definition extends ControllerDefinition
  >;
} ? ControllerHref<Definition>
  : never;

/** Reports whether a module's default export was created with `defineController()`. */
export type IsControllerModule<Module> = Module extends {
  default: import("./components/client.ts").DefinedController<
    infer Definition extends ControllerDefinition
  >;
} ? true
  : false;

type ClientProps<Definition extends ControllerDefinition> = Definition extends {
  props: infer Props extends JsonValue;
} ? Props
  : undefined;

type ClientRefs<Definition extends ControllerDefinition> = Definition extends {
  refs: infer Refs extends Record<string, Element>;
} ? Refs
  : Record<string, Element>;

/**
 * Marks controller code for extraction by the experimental Ruwuter Vite plugin.
 *
 * This function is deliberately unusable without `ruwuter({ clientMacro: true })`:
 * Deno-only applications should continue to use a separate `.client.ts` module.
 */
export function client<Definition extends ControllerDefinition>(
  _mount: Controller<ClientProps<Definition>, ClientRefs<Definition>>,
): ControllerHref<Definition> {
  throw new Error(
    "client() requires the Ruwuter Vite plugin with clientMacro: true. " +
      "Use a separate .client.ts module outside Vite.",
  );
}
export { swap, type SwapOptions, type SwapResult } from "./runtime/swap.ts";

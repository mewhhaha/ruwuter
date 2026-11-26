/**
 * @module
 *
 * Browser helpers for typed controller modules.
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
  type TargetedRuntimeEvent,
} from "./components/client.ts";
import type { ControllerDefinition, ControllerHref } from "./components/client.ts";

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

export {
  swap,
  type SwapInput,
  type SwapMode,
  type SwapOptions,
  type SwapResult,
  type SwapSanitizer,
  type SwapTarget,
  type SwapWriteFn,
} from "./runtime/swap.ts";
export {
  type BrowserViewTransitionOptions,
  viewTransition,
  type ViewTransitionHandle,
  type ViewTransitionOption,
} from "./runtime/view-transition.ts";

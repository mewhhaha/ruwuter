import controllerHref from "./fixtures/generated-controller.client.ts?ruwuter-controller-url";
import type { ControllerHrefOf, IsControllerModule } from "../src/browser.ts";

type Assert<Value extends true> = Value;
type ValidController = Assert<
  IsControllerModule<typeof import("./fixtures/generated-controller.client.ts")>
>;

export const generatedController = controllerHref as unknown as ControllerHrefOf<
  typeof import("./fixtures/generated-controller.client.ts")
>;

// @ts-expect-error invalid default exports are rejected by the generated href constraint
type InvalidController = Assert<IsControllerModule<typeof import("./fixtures/invalid.client.ts")>>;

void (0 as unknown as ValidController);

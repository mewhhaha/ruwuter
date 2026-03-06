import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { jsx } from "../src/runtime/jsx-runtime.ts";

describe("on prop removal", () => {
  it("throws when on is provided on an intrinsic element", () => {
    let error: unknown;
    try {
      jsx("button", {
        on: [["click", "./handlers/click.client.js"]],
        children: "x",
      } as never);
    } catch (caught) {
      error = caught;
    }

    expect(error instanceof TypeError).toBe(true);
    expect((error as Error | undefined)?.message).toContain("on prop has been removed");
  });
});

import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { jsx } from "../src/runtime/jsx-runtime.ts";
import type { JSX } from "../src/router.ts";

describe("on prop removal", () => {
  it("does not expose inline event attributes in JSX types", () => {
    // @ts-expect-error Inline DOM event attributes are not supported by Ruwuter JSX.
    const props: JSX.IntrinsicElements["button"] = { onClick: "alert(1)" };

    expect("onClick" in props).toBe(true);
  });

  it("throws when inline event attributes are provided on an intrinsic element", () => {
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
    expect((error as Error | undefined)?.message).toContain("Inline event attributes");
  });
});

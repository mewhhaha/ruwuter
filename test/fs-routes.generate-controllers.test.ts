import { join } from "node:path";
import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { generateControllers } from "../src/fs-routes/generate-controllers.ts";
import { writeGeneratedFiles } from "../src/fs-routes/write.ts";

describe("generateControllers", () => {
  it("generates deterministic hrefs whose types come from each default export", async () => {
    const app = await Deno.makeTempDir();
    try {
      await Deno.mkdir(join(app, "routes", "palette"), { recursive: true });
      await Deno.writeTextFile(
        join(app, "routes", "palette", "open-palette.client.ts"),
        "export default 1;",
      );
      await Deno.writeTextFile(join(app, "dialog.client.tsx"), "export default 1;");

      const [output] = await generateControllers(app);
      if (!output) throw new Error("Expected controller output");
      expect(output.path).toBe(join(app, "controllers.ts"));
      expect(output.contents).toContain(
        'import dialogHref from "./dialog.client.tsx?ruwuter-controller-url";',
      );
      expect(output.contents).toContain("export const dialog = dialogHref as unknown as import");
      expect(output.contents).toContain("IsControllerModule");
      expect(output.contents).toContain(
        'import openPaletteHref from "./routes/palette/open-palette.client.ts?ruwuter-controller-url";',
      );
      expect(output.contents).toContain('typeof import("./routes/palette/open-palette.client.ts")');
    } finally {
      await Deno.remove(app, { recursive: true });
    }
  });

  it("rejects ambiguous generated controller names", async () => {
    const app = await Deno.makeTempDir();
    try {
      await Deno.writeTextFile(join(app, "open-palette.client.ts"), "export default 1;");
      await Deno.writeTextFile(join(app, "open palette.client.ts"), "export default 1;");
      let error: unknown;
      try {
        await generateControllers(app);
      } catch (caught) {
        error = caught;
      }
      expect(error instanceof Error).toBe(true);
      expect((error as Error).message).toContain("controller symbol collision");
    } finally {
      await Deno.remove(app, { recursive: true });
    }
  });

  it("preserves an unmarked user-owned controllers.ts file", async () => {
    const app = await Deno.makeTempDir();
    try {
      await Deno.mkdir(join(app, "routes"), { recursive: true });
      await Deno.writeTextFile(join(app, "document.tsx"), "export default 1;");
      await Deno.writeTextFile(join(app, "routes", "index.ts"), "export default 1;");
      await Deno.writeTextFile(join(app, "example.client.ts"), "export default 1;");
      await Deno.writeTextFile(join(app, "controllers.ts"), "export const mine = true;");
      let error: unknown;
      try {
        await writeGeneratedFiles(app, { controllers: true });
      } catch (caught) {
        error = caught;
      }
      expect(error instanceof Error).toBe(true);
      expect(await Deno.readTextFile(join(app, "controllers.ts"))).toContain("mine");
    } finally {
      await Deno.remove(app, { recursive: true });
    }
  });
});

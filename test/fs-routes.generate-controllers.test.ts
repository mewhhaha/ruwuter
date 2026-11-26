import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateControllers,
  GENERATED_CONTROLLERS_MARKER,
} from "../src/fs-routes/generate-controllers.ts";
import { generatedTypesRoot, writeGeneratedFiles } from "../src/fs-routes/write.ts";

const exists = async (path: string): Promise<boolean> => {
  return await stat(path)
    .then(() => true)
    .catch(() => false);
};

describe("generateControllers", () => {
  it("generates deterministic hrefs whose types come from each default export", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-ctrl-"));
    try {
      await mkdir(join(app, "routes", "palette"), { recursive: true });
      await writeFile(
        join(app, "routes", "palette", "open-palette.client.ts"),
        "export default 1;",
      );
      await writeFile(join(app, "dialog.client.tsx"), "export default 1;");

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
      await rm(app, { recursive: true, force: true });
    }
  });

  it("disambiguates same-basename controllers in different subdirectories", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-ctrl-"));
    try {
      await mkdir(join(app, "products"), { recursive: true });
      await mkdir(join(app, "users"), { recursive: true });
      await writeFile(join(app, "products", "form.client.ts"), "export default 1;");
      await writeFile(join(app, "users", "form.client.ts"), "export default 1;");
      await writeFile(join(app, "unique.client.ts"), "export default 1;");

      const [output] = await generateControllers(app);
      if (!output) throw new Error("Expected controller output");
      expect(output.contents).toContain("export const productsForm =");
      expect(output.contents).toContain("export const usersForm =");
      expect(output.contents).toContain("export const unique =");
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it("rejects ambiguous generated controller names", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-ctrl-"));
    try {
      await writeFile(join(app, "open-palette.client.ts"), "export default 1;");
      await writeFile(join(app, "open palette.client.ts"), "export default 1;");
      let error: unknown;
      try {
        await generateControllers(app);
      } catch (caught) {
        error = caught;
      }
      expect(error instanceof Error).toBe(true);
      expect((error as Error).message).toContain("controller symbol collision");
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it("preserves an unmarked user-owned controllers.ts file", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-ctrl-"));
    try {
      await mkdir(join(app, "routes"), { recursive: true });
      await writeFile(join(app, "document.tsx"), "export default 1;");
      await writeFile(join(app, "routes", "index.ts"), "export default 1;");
      await writeFile(join(app, "example.client.ts"), "export default 1;");
      await writeFile(join(app, "controllers.ts"), "export const mine = true;");
      let error: unknown;
      try {
        await writeGeneratedFiles(app, { controllers: true });
      } catch (caught) {
        error = caught;
      }
      expect(error instanceof Error).toBe(true);
      expect(await readFile(join(app, "controllers.ts"), "utf8")).toContain("mine");
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it("removes a marked controllers.ts once no controllers remain", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-ctrl-"));
    try {
      await mkdir(join(app, "routes"), { recursive: true });
      await writeFile(join(app, "document.tsx"), "export default 1;");
      await writeFile(join(app, "routes", "index.ts"), "export default 1;");
      // No `*.client.*` module exists, so the previously generated barrel is stale.
      await writeFile(
        join(app, "controllers.ts"),
        `${GENERATED_CONTROLLERS_MARKER}\nexport const stale = 1;\n`,
      );

      await writeGeneratedFiles(app, { controllers: true });

      expect(await exists(join(app, "controllers.ts"))).toBe(false);
    } finally {
      await rm(app, { recursive: true, force: true });
      await rm(generatedTypesRoot(app), { recursive: true, force: true }).catch(() => {});
    }
  });
});

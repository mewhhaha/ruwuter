import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTypes } from "../src/fs-routes/generate-types.ts";

describe("generateTypes", () => {
  it("treats .ts routes as files, not route directories", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-types-"));
    try {
      const routesDir = join(app, "routes");
      await mkdir(routesDir, { recursive: true });
      await writeFile(join(routesDir, "api.users.ts"), "export const loader = () => null;");

      const outputs = await generateTypes(app);
      const hasBadDirectoryOutput = outputs.some((file) =>
        file.path.includes("api.users.ts/+types.route.d.ts"),
      );
      expect(hasBadDirectoryOutput).toBe(false);

      const routeTypeFile = outputs.find((file) => file.path.includes("+types.api.users.ts"));
      expect(routeTypeFile != null).toBe(true);
      expect(routeTypeFile?.contents).toContain("export type Context<Bindings = unknown>");
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it("extracts safe param names from suffix route segments", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-types-"));
    try {
      const routesDir = join(app, "routes");
      await mkdir(routesDir, { recursive: true });
      await writeFile(join(routesDir, "reports.$id[.pdf].tsx"), "export default 1;");

      const outputs = await generateTypes(app);
      const routeTypeFile = outputs.find((file) =>
        file.path.includes("+types.reports.$id[.pdf].ts"),
      );
      if (!routeTypeFile) throw new Error("Expected report route type file");

      expect(routeTypeFile.contents).toContain('"id": string;');
      expect(routeTypeFile.contents).not.toContain('"id[.pdf]":');
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it("reports filesystem errors while reading routes", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-types-"));
    try {
      await writeFile(join(app, "routes"), "not a directory");

      let caught: unknown;
      try {
        await generateTypes(app);
      } catch (error) {
        caught = error;
      }

      expect(caught instanceof Error).toBe(true);
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });
});

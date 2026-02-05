import { join } from "node:path";
import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { generateTypes } from "../src/fs-routes/generate-types.ts";

describe("generateTypes", () => {
  it("treats .ts routes as files, not route directories", async () => {
    const app = await Deno.makeTempDir();
    try {
      const routesDir = join(app, "routes");
      await Deno.mkdir(routesDir, { recursive: true });
      await Deno.writeTextFile(join(routesDir, "api.users.ts"), "export const loader = () => null;");

      const outputs = await generateTypes(app);
      const hasBadDirectoryOutput = outputs.some((file) =>
        file.path.includes("api.users.ts/+types.route.d.ts")
      );
      expect(hasBadDirectoryOutput).toBe(false);

      const routeTypeFile = outputs.find((file) => file.path.includes("+types.api.users.ts"));
      expect(routeTypeFile != null).toBe(true);
      expect(routeTypeFile?.contents).toContain('import * as r from "./api.users.js";');
    } finally {
      await Deno.remove(app, { recursive: true });
    }
  });

  it("extracts safe param names from suffix route segments", async () => {
    const app = await Deno.makeTempDir();
    try {
      const routesDir = join(app, "routes");
      await Deno.mkdir(routesDir, { recursive: true });
      await Deno.writeTextFile(join(routesDir, "reports.$id[.pdf].tsx"), "export default 1;");

      const outputs = await generateTypes(app);
      const routeTypeFile = outputs.find((file) => file.path.includes("+types.reports.$id[.pdf].ts"));
      if (!routeTypeFile) throw new Error("Expected report route type file");

      expect(routeTypeFile.contents).toContain('"id": string;');
      expect(routeTypeFile.contents).not.toContain('"id[.pdf]":');
    } finally {
      await Deno.remove(app, { recursive: true });
    }
  });
});

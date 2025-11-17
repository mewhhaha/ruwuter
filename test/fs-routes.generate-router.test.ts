import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { join } from "node:path";
import { generateRouter } from "../src/fs-routes/generate-router.ts";

describe("generateRouter", () => {
  it("includes entries for prefixed routes so layouts stay navigable", async () => {
    const app = await Deno.makeTempDir();
    try {
      const routesDir = join(app, "routes");
      await Deno.mkdir(routesDir, { recursive: true });
      await Deno.writeTextFile(join(routesDir, "a.tsx"), "export default 1;");
      await Deno.writeTextFile(join(routesDir, "a.b.tsx"), "export default 2;");

      const [routerFile] = await generateRouter(app);
      if (!routerFile) throw new Error("Router file not generated");

      const { contents } = routerFile;
      const patternMatches = contents.match(/new URLPattern/g) ?? [];
      expect(patternMatches.length).toBe(2);
      expect(contents).toContain('pathname: "/a/b/:__asset');
      expect(contents).toContain('pathname: "/a/:__asset');
      expect(contents).toContain("[$document,$$a,$$a_b]");
      expect(contents).toContain("[$document,$$a]]");
    } finally {
      await Deno.remove(app, { recursive: true });
    }
  });
});

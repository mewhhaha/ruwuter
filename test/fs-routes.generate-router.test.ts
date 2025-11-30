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

  it("does not create matchable routes for pathless layouts", async () => {
    const app = await Deno.makeTempDir();
    try {
      const routesDir = join(app, "routes");
      await Deno.mkdir(routesDir, { recursive: true });
      await Deno.writeTextFile(join(routesDir, "_app.tsx"), "export default 1;");
      await Deno.writeTextFile(join(routesDir, "_app.b.tsx"), "export default 2;");

      const [routerFile] = await generateRouter(app);
      if (!routerFile) throw new Error("Router file not generated");

      const { contents } = routerFile;
      const patternMatches = contents.match(/new URLPattern/g) ?? [];
      expect(patternMatches.length).toBe(1);
      expect(contents).toContain('pathname: "/b/:__asset');
      expect(contents).not.toContain('pathname: "(/):__asset');
      expect(contents).toContain("[$document,$$_app,$$_app_b]");
    } finally {
      await Deno.remove(app, { recursive: true });
    }
  });

  it("allows pathless segments in the middle but not at the tail", async () => {
    const app = await Deno.makeTempDir();
    try {
      const routesDir = join(app, "routes");
      await Deno.mkdir(routesDir, { recursive: true });
      await Deno.writeTextFile(join(routesDir, "_a.b.tsx"), "export default 1;");
      await Deno.writeTextFile(join(routesDir, "_a.b._c.tsx"), "export default 2;");

      const [routerFile] = await generateRouter(app);
      if (!routerFile) throw new Error("Router file not generated");

      const { contents } = routerFile;
      const patternMatches = contents.match(/new URLPattern/g) ?? [];
      expect(patternMatches.length).toBe(1);
      expect(contents).toContain('pathname: "/b/:__asset');
      expect(contents).not.toContain('pathname: "/c/:__asset');
      expect(contents).toContain("[$document,$$_a_b]");
      expect(contents).toContain('id: "_a.b._c"'); // remains available for children
    } finally {
      await Deno.remove(app, { recursive: true });
    }
  });

  it("supports escaped route conventions", async () => {
    const app = await Deno.makeTempDir();
    try {
      const routesDir = join(app, "routes");
      await Deno.mkdir(routesDir, { recursive: true });
      const files = [
        "sitemap[.]xml.tsx",
        "[sitemap.xml].tsx",
        "weird-url.[_index].tsx",
        "dolla-bills-[$].tsx",
        "[[so-weird]].tsx",
        "reports.$id[.pdf].tsx",
      ];
      await Promise.all(
        files.map((file) => Deno.writeTextFile(join(routesDir, file), "export default 1;")),
      );

      const [routerFile] = await generateRouter(app);
      if (!routerFile) throw new Error("Router file not generated");
      const { contents } = routerFile;

      expect(contents).toContain('pathname: "/sitemap.xml/:__asset');
      expect(contents).toContain('pathname: "/weird-url/_index/:__asset');
      expect(contents).toContain('pathname: "/dolla-bills-$/:__asset');
      expect(contents).toContain('pathname: "/[so-weird]/:__asset');
      expect(contents).toContain('pathname: "/reports/:id.pdf/:__asset');
      expect(contents).toContain('params: ["id"]');
    } finally {
      await Deno.remove(app, { recursive: true });
    }
  });

  it("orders more specific routes before generic params", async () => {
    const app = await Deno.makeTempDir();
    try {
      const routesDir = join(app, "routes");
      await Deno.mkdir(routesDir, { recursive: true });
      const files = [
        "reports.$id.tsx",
        "reports.$id[.pdf].tsx",
        "reports.(foo).tsx",
      ];
      await Promise.all(
        files.map((file) => Deno.writeTextFile(join(routesDir, file), "export default 1;")),
      );

      const [routerFile] = await generateRouter(app);
      if (!routerFile) throw new Error("Router file not generated");
      const { contents } = routerFile;
      const order = Array.from(
        contents.matchAll(/pathname: "([^"]+)"/g),
        (m) => m[1],
      );

      const pdfIndex = order.findIndex((value) => value.includes("/reports/:id.pdf"));
      const paramIndex = order.findIndex((value) => value.includes("/reports/:id/:__asset"));
      const optionalLiteralIndex = order.findIndex((value) => value.includes("/reports/(foo)?"));

      expect(pdfIndex).toBeGreaterThanOrEqual(0);
      expect(paramIndex).toBeGreaterThanOrEqual(0);
      expect(optionalLiteralIndex).toBeGreaterThanOrEqual(0);
      expect(pdfIndex).toBeLessThan(paramIndex);
      expect(optionalLiteralIndex).toBeLessThan(paramIndex);
    } finally {
      await Deno.remove(app, { recursive: true });
    }
  });
});

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateRouter } from "../src/fs-routes/generate-router.ts";
import { bySpecificity } from "../src/fs-routes/sort.ts";

describe("generateRouter", () => {
  it("sorts catch-all routes with an antisymmetric comparator", () => {
    const forward = bySpecificity("files.$", "assets.$");
    const reverse = bySpecificity("assets.$", "files.$");

    expect(Math.sign(forward)).toBe(-Math.sign(reverse));
  });

  it("includes entries for prefixed routes so layouts stay navigable", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-router-"));
    try {
      const routesDir = join(app, "routes");
      await mkdir(routesDir, { recursive: true });
      await writeFile(join(routesDir, "a.tsx"), "export default 1;");
      await writeFile(join(routesDir, "a.b.tsx"), "export default 2;");

      const [routerFile] = await generateRouter(app);
      if (!routerFile) throw new Error("Router file not generated");

      const { contents } = routerFile;
      const patternMatches = contents.match(/new URLPattern/g) ?? [];
      expect(patternMatches.length).toBe(2);
      expect(contents).toContain('pathname: "/a/b"');
      expect(contents).toContain('pathname: "/a"');
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it("does not create matchable routes or unused imports for pathless layouts", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-router-"));
    try {
      const routesDir = join(app, "routes");
      await mkdir(routesDir, { recursive: true });
      await writeFile(join(routesDir, "_app.tsx"), "export default 1;");
      await writeFile(join(routesDir, "_app.b.tsx"), "export default 2;");

      const [routerFile] = await generateRouter(app);
      if (!routerFile) throw new Error("Router file not generated");

      const { contents } = routerFile;
      const patternMatches = contents.match(/new URLPattern/g) ?? [];
      expect(patternMatches.length).toBe(1);
      expect(contents).toContain('pathname: "/b"');
      expect(contents).not.toContain('pathname: "/"');
      expect(contents).not.toContain("./routes/_app.tsx");
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it("allows pathless segments in the middle but not at the tail", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-router-"));
    try {
      const routesDir = join(app, "routes");
      await mkdir(routesDir, { recursive: true });
      await writeFile(join(routesDir, "_a.b.tsx"), "export default 1;");
      await writeFile(join(routesDir, "_a.b._c.tsx"), "export default 2;");

      const [routerFile] = await generateRouter(app);
      if (!routerFile) throw new Error("Router file not generated");

      const { contents } = routerFile;
      const patternMatches = contents.match(/new URLPattern/g) ?? [];
      expect(patternMatches.length).toBe(1);
      expect(contents).toContain('pathname: "/b"');
      expect(contents).not.toContain('pathname: "/c"');
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it("supports escaped route conventions", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-router-"));
    try {
      const routesDir = join(app, "routes");
      await mkdir(routesDir, { recursive: true });
      const files = [
        "sitemap[.]xml.tsx",
        "weird-url.[_index].tsx",
        "dolla-bills-[$].tsx",
        "[[so-weird]].tsx",
        "reports.$id[.pdf].tsx",
      ];
      await Promise.all(files.map((file) => writeFile(join(routesDir, file), "export default 1;")));

      const [routerFile] = await generateRouter(app);
      if (!routerFile) throw new Error("Router file not generated");
      const { contents } = routerFile;

      expect(contents).toContain('pathname: "/sitemap.xml"');
      expect(contents).toContain('pathname: "/weird-url/_index"');
      expect(contents).toContain('pathname: "/dolla-bills-$"');
      expect(contents).toContain('pathname: "/[so-weird]"');
      expect(contents).toContain('pathname: "/reports/:id.pdf"');
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it("treats .ts routes as files, not route directories", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-router-"));
    try {
      const routesDir = join(app, "routes");
      await mkdir(routesDir, { recursive: true });
      await writeFile(join(routesDir, "api.users.ts"), "export default 1;");

      const [routerFile] = await generateRouter(app);
      if (!routerFile) throw new Error("Router file not generated");
      const { contents } = routerFile;

      expect(contents).toContain('import * as $api_users from "./routes/api.users.ts";');
      expect(contents).not.toContain("./routes/api.users.ts/route.tsx");
      expect(contents).toContain('pathname: "/api/users"');
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it("orders more specific routes before generic params", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-router-"));
    try {
      const routesDir = join(app, "routes");
      await mkdir(routesDir, { recursive: true });
      const files = ["reports.$id.tsx", "reports.$id[.pdf].tsx", "reports.(foo).tsx"];
      await Promise.all(files.map((file) => writeFile(join(routesDir, file), "export default 1;")));

      const [routerFile] = await generateRouter(app);
      if (!routerFile) throw new Error("Router file not generated");
      const { contents } = routerFile;
      const order = Array.from(contents.matchAll(/pathname: "([^"]+)"/g), (m) => m[1]);

      const pdfIndex = order.findIndex((value) => value.includes("/reports/:id.pdf"));
      const paramIndex = order.findIndex((value) => value === "/reports/:id");
      const optionalLiteralIndex = order.findIndex((value) => value.includes("/reports/(foo)?"));

      expect(pdfIndex).toBeGreaterThanOrEqual(0);
      expect(paramIndex).toBeGreaterThanOrEqual(0);
      expect(optionalLiteralIndex).toBeGreaterThanOrEqual(0);
      expect(pdfIndex).toBeLessThan(paramIndex);
      expect(optionalLiteralIndex).toBeLessThan(paramIndex);
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it("rejects equivalent route patterns", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-router-"));
    try {
      const routesDir = join(app, "routes");
      await mkdir(routesDir, { recursive: true });
      await writeFile(join(routesDir, "sitemap[.]xml.tsx"), "export default 1;");
      await writeFile(join(routesDir, "[sitemap.xml].tsx"), "export default 2;");

      let error: unknown;
      try {
        await generateRouter(app);
      } catch (caught) {
        error = caught;
      }

      expect(error instanceof Error).toBe(true);
      expect((error as Error).message).toContain('Route pattern "/sitemap.xml"');
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it("rejects route patterns that differ only by param name", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-router-"));
    try {
      const routesDir = join(app, "routes");
      await mkdir(routesDir, { recursive: true });
      await writeFile(join(routesDir, "users.$id.tsx"), "export default 1;");
      await writeFile(join(routesDir, "users.$slug.tsx"), "export default 2;");

      let error: unknown;
      try {
        await generateRouter(app);
      } catch (caught) {
        error = caught;
      }

      expect(error instanceof Error).toBe(true);
      expect((error as Error).message).toContain('Route pattern "/users/:');
      expect((error as Error).message).toContain("users.$id");
      expect((error as Error).message).toContain("users.$slug");
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it("quotes route file names as JSON string literals", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-router-"));
    try {
      const routesDir = join(app, "routes");
      await mkdir(routesDir, { recursive: true });
      await writeFile(join(routesDir, 'quote["].tsx'), "export default 1;");

      const [routerFile] = await generateRouter(app);

      expect(routerFile.contents).toContain(JSON.stringify('./routes/quote["].tsx'));
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it("sorts specificity by compiled URL segments rather than raw pathless or wildcard filenames", () => {
    expect(["_marketing.promo.$id", "promo.featured"].sort(bySpecificity)).toEqual([
      "promo.featured",
      "_marketing.promo.$id",
    ]);
    expect(["_app.$id", "about"].sort(bySpecificity)).toEqual(["about", "_app.$id"]);
    expect(["$", "products.$"].sort(bySpecificity)).toEqual(["products.$", "$"]);
    expect(["a.$.b", "a.b"].sort(bySpecificity)).toEqual(["a.b", "a.$.b"]);
  });

  it("discovers directory routes with route.tsx or route.ts and ignores helper folders", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-router-"));
    try {
      const routesDir = join(app, "routes");
      await mkdir(join(routesDir, "products"), { recursive: true });
      await mkdir(join(routesDir, "api"), { recursive: true });
      await mkdir(join(routesDir, "palette"), { recursive: true });
      await writeFile(join(routesDir, "products", "route.tsx"), "export const GET = 1;");
      await writeFile(join(routesDir, "api", "route.ts"), "export const GET = 1;");
      await writeFile(join(routesDir, "palette", "open-palette.client.ts"), "export default 1;");

      const [routerFile] = await generateRouter(app);
      if (!routerFile) throw new Error("Router file not generated");

      expect(routerFile.contents).toContain(
        'import * as $products from "./routes/products/route.tsx";',
      );
      expect(routerFile.contents).toContain('import * as $api from "./routes/api/route.ts";');
      expect(routerFile.contents).not.toContain("palette");
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });
});

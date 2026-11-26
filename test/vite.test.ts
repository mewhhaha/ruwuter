import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { generatedTypesRoot } from "../src/fs-routes/write.ts";
import { ruwuter } from "../src/vite.ts";

class FakeWatcher {
  #listeners: Array<(event: string, file: string) => void> = [];

  on(_event: "all", listener: (event: string, file: string) => void) {
    this.#listeners.push(listener);
    return this;
  }

  emit(event: string, file: string) {
    for (const listener of this.#listeners) {
      listener(event, file);
    }
  }
}

class FakeWebSocket {
  sent: Array<{ type: "full-reload" }> = [];

  send(payload: { type: "full-reload" }) {
    this.sent.push(payload);
  }
}

const waitFor = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 1_000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for condition");
};

describe("ruwuter vite plugin", () => {
  it("keeps generated type output roots inside .router/types", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-vite-"));
    try {
      const typesRoot = generatedTypesRoot(app);
      const resolvedTypesRoot = resolve(typesRoot);
      const allowedRoot = resolve(".router", "types");

      expect(resolvedTypesRoot.startsWith(`${allowedRoot}/`)).toBe(true);
      expect(typesRoot).not.toContain("..");
    } finally {
      await rm(app, { recursive: true, force: true, maxRetries: 5 });
    }
  });

  it("generates routes and clears stale type outputs during buildStart", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-vite-"));
    const typesRoot = generatedTypesRoot(app);
    try {
      const routesDir = join(app, "routes");
      await mkdir(routesDir, { recursive: true });
      await writeFile(join(app, "document.tsx"), "export default 1;");
      await writeFile(join(routesDir, "index.tsx"), "export default 1;");

      const staleFile = join(typesRoot, "routes", "stale.ts");
      await mkdir(dirname(staleFile), { recursive: true });
      await writeFile(staleFile, "stale");

      const plugin = ruwuter({ appFolder: app });
      await plugin.buildStart?.();

      const routerFile = await readFile(join(app, "routes.ts"), "utf8");
      expect(routerFile).toContain('import * as $index from "./routes/index.tsx";');

      let staleExists = true;
      try {
        await stat(staleFile);
      } catch {
        staleExists = false;
      }
      expect(staleExists).toBe(false);
    } finally {
      await rm(app, { recursive: true, force: true, maxRetries: 5 });
      await rm(typesRoot, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
    }
  });

  it("regenerates and triggers a full reload when a watched route file changes", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-vite-"));
    const typesRoot = generatedTypesRoot(app);
    try {
      const routesDir = join(app, "routes");
      await mkdir(routesDir, { recursive: true });
      await writeFile(join(app, "document.tsx"), "export default 1;");
      await writeFile(join(routesDir, "index.tsx"), "export default 1;");

      const watcher = new FakeWatcher();
      const ws = new FakeWebSocket();
      const plugin = ruwuter({ appFolder: app });

      plugin.configureServer?.({
        watcher,
        config: {
          logger: {
            error(message: string) {
              throw new Error(message);
            },
          },
        },
        ws,
      });

      await plugin.buildStart?.();
      await writeFile(join(routesDir, "about.tsx"), "export default 2;");
      watcher.emit("change", join(routesDir, "about.tsx"));

      await waitFor(async () => {
        const contents = await readFile(join(app, "routes.ts"), "utf8");
        return contents.includes('import * as $about from "./routes/about.tsx";');
      });

      await waitFor(() => ws.sent.some((payload) => payload.type === "full-reload"));
    } finally {
      await rm(app, { recursive: true, force: true, maxRetries: 5 });
      await rm(typesRoot, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
    }
  });

  it("ignores events for generated outputs while watching controller inputs", async () => {
    const app = await mkdtemp(join(tmpdir(), "ruwuter-vite-"));
    const typesRoot = generatedTypesRoot(app);
    try {
      const routesDir = join(app, "routes");
      await mkdir(routesDir, { recursive: true });
      await writeFile(join(app, "document.tsx"), "export default 1;");
      await writeFile(join(routesDir, "index.ts"), "export default 1;");
      await writeFile(join(app, "palette.client.ts"), "export default 1;");
      const watcher = new FakeWatcher();
      const ws = new FakeWebSocket();
      const plugin = ruwuter({ appFolder: app });
      plugin.configureServer?.({ watcher, ws });
      await plugin.buildStart?.();

      watcher.emit("change", join(app, "routes.ts"));
      watcher.emit("change", join(app, "controllers.ts"));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(ws.sent).toEqual([]);

      watcher.emit("change", join(app, "palette.client.ts"));
      await waitFor(() => ws.sent.some((payload) => payload.type === "full-reload"));
    } finally {
      await rm(app, { recursive: true, force: true, maxRetries: 5 });
      await rm(typesRoot, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
    }
  });

  it("does not rewrite rendered chunks", () => {
    const plugin = ruwuter();

    expect("renderChunk" in plugin).toBe(false);
  });

  it("builds a production SSR entry without rewriting application import.meta.url", async () => {
    const { build } = await import("vite");
    const app = await mkdtemp(join(tmpdir(), "ruwuter-vite-"));
    const typesRoot = generatedTypesRoot(app);

    try {
      const routesDir = join(app, "routes");
      const distDir = join(app, "dist");
      await mkdir(routesDir, { recursive: true });
      await writeFile(join(app, "asset.txt"), "asset");
      await writeFile(
        join(app, "document.tsx"),
        `
export default function Document({ children }: { children?: unknown }) {
  return children;
}
`,
      );
      await writeFile(
        join(routesDir, "index.ts"),
        `
export const GET = () => new Response("ok");
`,
      );
      await writeFile(
        join(app, "entry.ts"),
        `
import { router } from "@mewhhaha/ruwuter";
import { routes } from "./routes.ts";

export const assetHref = new URL("./asset.txt", import.meta.url).href;
export const app = router(routes);
`,
      );

      await build({
        root: app,
        base: "/docs/",
        configFile: false,
        logLevel: "silent",
        plugins: [ruwuter({ appFolder: app })],
        resolve: {
          alias: [
            {
              find: "@mewhhaha/ruwuter/jsx-runtime",
              replacement: resolve("src/runtime/jsx-runtime.ts"),
            },
            {
              find: "@mewhhaha/ruwuter",
              replacement: resolve("src/router.ts"),
            },
          ],
        },
        build: {
          emptyOutDir: true,
          minify: false,
          outDir: distDir,
          ssr: join(app, "entry.ts"),
          target: "esnext",
          rolldownOptions: {
            output: {
              entryFileNames: "entry.js",
            },
          },
        },
      });

      const generatedRoutes = await readFile(join(app, "routes.ts"), "utf8");
      expect(generatedRoutes).not.toContain("import.meta.url");

      const bundledEntry = await readFile(join(distDir, "entry.js"), "utf8");
      expect(bundledEntry).toContain("import.meta.url");
      const { app: built } = await import(pathToFileURL(join(distDir, "entry.js")).href);
      expect(await (await built.fetch(new Request("https://example.org/index"))).text()).toBe("ok");
      expect(bundledEntry).not.toContain('"file://"');
    } finally {
      await rm(app, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
      await rm(typesRoot, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
    }
  });

  it("serves and emits executable generated controller modules", async () => {
    const { build, createServer } = await import("vite");
    const app = await mkdtemp(join(tmpdir(), "ruwuter-vite-"));
    const typesRoot = generatedTypesRoot(app);
    try {
      await mkdir(join(app, "routes"), { recursive: true });
      await writeFile(join(app, "document.tsx"), "export default 1;");
      await writeFile(join(app, "routes", "index.ts"), "export default 1;");
      await writeFile(
        join(app, "open.client.ts"),
        `import { defineController } from "@mewhhaha/ruwuter/browser";
export default defineController((context: { root: Element }) => console.log(context.root));`,
      );
      await writeFile(
        join(app, "entry.ts"),
        `export { open } from "./controllers.ts";
export { default as direct } from "./open.client.ts?ruwuter-controller-url";`,
      );
      const plugin = ruwuter({ appFolder: app });
      await plugin.buildStart?.();
      const server = await createServer({
        root: app,
        configFile: false,
        logLevel: "silent",
        plugins: [plugin],
        resolve: {
          alias: [{ find: "@mewhhaha/ruwuter/browser", replacement: resolve("src/browser.ts") }],
        },
      });
      try {
        const generated = await server.transformRequest("/controllers.ts");
        const proxy = generated?.code.match(/(\/@id\/__x00__ruwuter-controller-url:[^\s"']+)/)?.[1];
        if (!proxy) throw new Error(`Expected generated controller URL proxy: ${generated?.code}`);
        const urlModule = await server.transformRequest(proxy);
        const controllerUrl = urlModule?.code.match(
          /(\/@id\/__x00__ruwuter-controller:[^\s"']+)/,
        )?.[1];
        if (!controllerUrl) throw new Error("Expected executable controller module URL");
        const controller = await server.transformRequest(controllerUrl);
        expect(controller?.code).not.toContain("context:");
        const compiledClient = await server.transformRequest("/open.client.ts");
        expect(compiledClient?.code).toContain("defineController");
        expect(compiledClient?.code).not.toContain("context:");
      } finally {
        await server.close();
      }

      const dist = join(app, "dist");
      await build({
        root: app,
        base: "/docs/",
        configFile: false,
        logLevel: "silent",
        plugins: [ruwuter({ appFolder: app })],
        resolve: {
          alias: [{ find: "@mewhhaha/ruwuter/browser", replacement: resolve("src/browser.ts") }],
        },
        build: {
          outDir: dist,
          ssr: join(app, "entry.ts"),
          minify: false,
          rolldownOptions: { output: { entryFileNames: "entry.js" } },
        },
      });
      const mod = (await import(pathToFileURL(join(dist, "entry.js")).href)) as {
        direct: string;
        open: string;
      };
      if (!mod.open.startsWith("/docs/assets/")) {
        throw new Error(`Expected browser controller href, got ${mod.open}`);
      }
      expect(mod.open.startsWith("data:")).toBe(false);
      expect(mod.open.startsWith("file:")).toBe(false);
      expect(mod.direct.startsWith("/docs/assets/")).toBe(true);
      expect(mod.direct.startsWith("data:")).toBe(false);
      const chunk = await readFile(join(dist, mod.open.slice("/docs/".length)), "utf8");
      expect(chunk).toContain("defineController");
      expect(mod.open).toBe(mod.direct);

      // Rebuilding unchanged inputs yields deterministic content-hashed chunk names.
      const dist2 = join(app, "dist2");
      await build({
        root: app,
        base: "/docs/",
        configFile: false,
        logLevel: "silent",
        plugins: [ruwuter({ appFolder: app })],
        resolve: {
          alias: [{ find: "@mewhhaha/ruwuter/browser", replacement: resolve("src/browser.ts") }],
        },
        build: {
          outDir: dist2,
          ssr: join(app, "entry.ts"),
          minify: false,
          rolldownOptions: { output: { entryFileNames: "entry.js" } },
        },
      });
      const mod2 = (await import(pathToFileURL(join(dist2, "entry.js")).href)) as {
        open: string;
      };
      expect(mod2.open).toBe(mod.open);
    } finally {
      await rm(app, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
      await rm(typesRoot, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
    }
  });

  it("busts controller chunk hashes when a local imported helper changes", async () => {
    const { build } = await import("vite");
    const app = await mkdtemp(join(tmpdir(), "ruwuter-vite-"));
    const typesRoot = generatedTypesRoot(app);
    try {
      await mkdir(join(app, "routes"), { recursive: true });
      await writeFile(join(app, "document.tsx"), "export default 1;");
      await writeFile(join(app, "routes", "index.ts"), "export default 1;");
      await writeFile(join(app, "helper.ts"), `export const label = "v1";`);
      await writeFile(
        join(app, "widget.client.ts"),
        `import { defineController } from "@mewhhaha/ruwuter/browser";
import { label } from "./helper.ts";
export default defineController(({ root }) => { root.setAttribute("data-v", label); });`,
      );
      await writeFile(join(app, "entry.ts"), `export { widget } from "./controllers.ts";`);

      const runBuild = async (outDir: string) => {
        await build({
          root: app,
          base: "/",
          configFile: false,
          logLevel: "silent",
          plugins: [ruwuter({ appFolder: app })],
          resolve: {
            alias: [{ find: "@mewhhaha/ruwuter/browser", replacement: resolve("src/browser.ts") }],
          },
          build: {
            outDir,
            ssr: join(app, "entry.ts"),
            minify: false,
            rolldownOptions: { output: { entryFileNames: "entry.js" } },
          },
        });
        return (await import(`${pathToFileURL(join(outDir, "entry.js")).href}?t=${outDir}`)) as {
          widget: string;
        };
      };

      const first = await runBuild(join(app, "dist1"));
      await writeFile(join(app, "helper.ts"), `export const label = "v2";`);
      const second = await runBuild(join(app, "dist2"));
      expect(second.widget === first.widget).toBe(false);
    } finally {
      await rm(app, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
      await rm(typesRoot, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
    }
  });

  it("emits documented browser runtime URLs as executable chunks", async () => {
    const { build } = await import("vite");
    const app = await mkdtemp(join(tmpdir(), "ruwuter-vite-"));
    const typesRoot = generatedTypesRoot(app);
    try {
      await mkdir(join(app, "routes"), { recursive: true });
      await writeFile(join(app, "document.tsx"), "export default 1;");
      await writeFile(join(app, "routes", "index.ts"), "export default 1;");
      await writeFile(
        join(app, "entry.ts"),
        `import clientRuntime from "@mewhhaha/ruwuter/client.js?url&no-inline";
import vtRuntime from "@mewhhaha/ruwuter/vt.js?url&no-inline";
export { clientRuntime, vtRuntime };`,
      );
      const dist = join(app, "dist");
      await build({
        root: app,
        base: "/docs/",
        configFile: false,
        logLevel: "silent",
        plugins: [ruwuter({ appFolder: app })],
        resolve: {
          alias: [
            {
              find: /^@mewhhaha\/ruwuter\/client\.js$/,
              replacement: resolve("src/runtime/client.ts"),
            },
            {
              find: /^@mewhhaha\/ruwuter\/vt\.js$/,
              replacement: resolve("src/runtime/vt.ts"),
            },
          ],
        },
        build: {
          outDir: dist,
          ssr: join(app, "entry.ts"),
          minify: false,
          rolldownOptions: { output: { entryFileNames: "entry.js" } },
        },
      });

      const serverModule = (await import(pathToFileURL(join(dist, "entry.js")).href)) as {
        clientRuntime: string;
        vtRuntime: string;
      };
      expect(serverModule.clientRuntime.startsWith("/docs/assets/ruwuter-client-")).toBe(true);
      expect(serverModule.vtRuntime.startsWith("/docs/assets/ruwuter-vt-")).toBe(true);
      const runtimePath = join(dist, serverModule.clientRuntime.slice("/docs/".length));
      const runtimeCode = await readFile(runtimePath, "utf8");
      expect(runtimeCode).toContain("data-rw-controller");
      expect(runtimeCode).not.toContain("type MountedActivation");
      const vtPath = join(dist, serverModule.vtRuntime.slice("/docs/".length));
      const vtCode = await readFile(vtPath, "utf8");
      expect(vtCode).toContain("pageswap");
      await import(pathToFileURL(runtimePath).href);
      await import(pathToFileURL(vtPath).href);
    } finally {
      await rm(app, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
      await rm(typesRoot, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
    }
  });
});

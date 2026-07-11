import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
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

const waitFor = async (
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 1_000,
) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for condition");
};

describe("ruwuter vite plugin", () => {
  it("keeps generated type output roots inside .router/types", async () => {
    const app = await Deno.makeTempDir();
    try {
      const typesRoot = generatedTypesRoot(app);
      const resolvedTypesRoot = resolve(typesRoot);
      const allowedRoot = resolve(".router", "types");

      expect(resolvedTypesRoot.startsWith(`${allowedRoot}/`)).toBe(true);
      expect(typesRoot).not.toContain("..");
    } finally {
      await Deno.remove(app, { recursive: true });
    }
  });

  it("generates routes and clears stale type outputs during buildStart", async () => {
    const app = await Deno.makeTempDir();
    const typesRoot = generatedTypesRoot(app);
    try {
      const routesDir = join(app, "routes");
      await Deno.mkdir(routesDir, { recursive: true });
      await Deno.writeTextFile(join(app, "document.tsx"), "export default 1;");
      await Deno.writeTextFile(join(routesDir, "index.tsx"), "export default 1;");

      const staleFile = join(typesRoot, "routes", "stale.ts");
      await Deno.mkdir(dirname(staleFile), { recursive: true });
      await Deno.writeTextFile(staleFile, "stale");

      const plugin = ruwuter({ appFolder: app });
      await plugin.buildStart?.();

      const routerFile = await Deno.readTextFile(join(app, "routes.ts"));
      expect(routerFile).toContain('import * as $index from "./routes/index.tsx";');

      let staleExists = true;
      try {
        await Deno.stat(staleFile);
      } catch {
        staleExists = false;
      }
      expect(staleExists).toBe(false);
    } finally {
      await Deno.remove(app, { recursive: true });
      await Deno.remove(typesRoot, { recursive: true }).catch(() => {});
    }
  });

  it("regenerates and triggers a full reload when a watched route file changes", async () => {
    const app = await Deno.makeTempDir();
    const typesRoot = generatedTypesRoot(app);
    try {
      const routesDir = join(app, "routes");
      await Deno.mkdir(routesDir, { recursive: true });
      await Deno.writeTextFile(join(app, "document.tsx"), "export default 1;");
      await Deno.writeTextFile(join(routesDir, "index.tsx"), "export default 1;");

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
      await Deno.writeTextFile(join(routesDir, "about.tsx"), "export default 2;");
      watcher.emit("change", join(routesDir, "about.tsx"));

      await waitFor(async () => {
        const contents = await Deno.readTextFile(join(app, "routes.ts"));
        return contents.includes('import * as $about from "./routes/about.tsx";');
      });

      await waitFor(() => ws.sent.some((payload) => payload.type === "full-reload"));
    } finally {
      await Deno.remove(app, { recursive: true });
      await Deno.remove(typesRoot, { recursive: true }).catch(() => {});
    }
  });

  it("ignores events for generated outputs while watching controller inputs", async () => {
    const app = await Deno.makeTempDir();
    const typesRoot = generatedTypesRoot(app);
    try {
      const routesDir = join(app, "routes");
      await Deno.mkdir(routesDir, { recursive: true });
      await Deno.writeTextFile(join(app, "document.tsx"), "export default 1;");
      await Deno.writeTextFile(join(routesDir, "index.ts"), "export default 1;");
      await Deno.writeTextFile(join(app, "palette.client.ts"), "export default 1;");
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
      await Deno.remove(app, { recursive: true });
      await Deno.remove(typesRoot, { recursive: true }).catch(() => {});
    }
  });

  it("does not rewrite rendered chunks", () => {
    const plugin = ruwuter();

    expect("renderChunk" in plugin).toBe(false);
  });

  it("builds a production SSR entry without rewriting application import.meta.url", async () => {
    const { build } = await import("vite");
    const app = await Deno.makeTempDir();
    const typesRoot = generatedTypesRoot(app);

    try {
      const routesDir = join(app, "routes");
      const distDir = join(app, "dist");
      await Deno.mkdir(routesDir, { recursive: true });
      await Deno.writeTextFile(join(app, "asset.txt"), "asset");
      await Deno.writeTextFile(
        join(app, "document.tsx"),
        `
export default function Document({ children }: { children?: unknown }) {
  return children;
}
`,
      );
      await Deno.writeTextFile(
        join(routesDir, "index.ts"),
        `
export const loader = () => ({ ok: true });
export default function Index() {
  return "ok";
}
`,
      );
      await Deno.writeTextFile(
        join(app, "entry.ts"),
        `
import { Router } from "@mewhhaha/ruwuter";
import { routes } from "./routes.ts";

export const assetHref = new URL("./asset.txt", import.meta.url).href;
export const router = Router(routes);
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
          rollupOptions: {
            output: {
              entryFileNames: "entry.js",
            },
          },
        },
      });

      const generatedRoutes = await Deno.readTextFile(join(app, "routes.ts"));
      expect(generatedRoutes).not.toContain("import.meta.url");

      const bundledEntry = await Deno.readTextFile(join(distDir, "entry.js"));
      expect(bundledEntry).toContain("import.meta.url");
      expect(bundledEntry).not.toContain('"file://"');
    } finally {
      await Deno.remove(app, { recursive: true }).catch(() => {});
      await Deno.remove(typesRoot, { recursive: true }).catch(() => {});
    }
  });

  it("serves and emits executable generated controller modules", async () => {
    const { build, createServer } = await import("vite");
    const app = await Deno.makeTempDir();
    const typesRoot = generatedTypesRoot(app);
    try {
      await Deno.mkdir(join(app, "routes"), { recursive: true });
      await Deno.writeTextFile(join(app, "document.tsx"), "export default 1;");
      await Deno.writeTextFile(join(app, "routes", "index.ts"), "export default 1;");
      await Deno.writeTextFile(
        join(app, "open.client.ts"),
        `import { defineController } from "@mewhhaha/ruwuter/browser";
export default defineController((context: { root: Element }) => console.log(context.root));`,
      );
      await Deno.writeTextFile(
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
        const controllerUrl = urlModule?.code.match(/(\/@id\/__x00__ruwuter-controller:[^\s"']+)/)
          ?.[1];
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
          rollupOptions: { output: { entryFileNames: "entry.js" } },
        },
      });
      const mod = await import(pathToFileURL(join(dist, "entry.js")).href) as {
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
      const chunk = await Deno.readTextFile(join(dist, mod.open.slice("/docs/".length)));
      expect(chunk).toContain("defineController");
    } finally {
      await Deno.remove(app, { recursive: true }).catch(() => {});
      await Deno.remove(typesRoot, { recursive: true }).catch(() => {});
    }
  });

  it("emits documented browser runtime URLs as executable chunks", async () => {
    const { build } = await import("vite");
    const app = await Deno.makeTempDir();
    const typesRoot = generatedTypesRoot(app);
    try {
      await Deno.mkdir(join(app, "routes"), { recursive: true });
      await Deno.writeTextFile(join(app, "document.tsx"), "export default 1;");
      await Deno.writeTextFile(join(app, "routes", "index.ts"), "export default 1;");
      await Deno.writeTextFile(
        join(app, "entry.ts"),
        `import navigateRuntime from "@mewhhaha/ruwuter/navigate.js?url&no-inline";
export { navigateRuntime };`,
      );
      const dist = join(app, "dist");
      await build({
        root: app,
        base: "/docs/",
        configFile: false,
        logLevel: "silent",
        plugins: [ruwuter({ appFolder: app })],
        resolve: {
          alias: [{
            find: /^@mewhhaha\/ruwuter\/navigate\.js$/,
            replacement: resolve("src/runtime/navigate.ts"),
          }],
        },
        build: {
          outDir: dist,
          ssr: join(app, "entry.ts"),
          minify: false,
          rollupOptions: { output: { entryFileNames: "entry.js" } },
        },
      });

      const serverModule = await import(pathToFileURL(join(dist, "entry.js")).href) as {
        navigateRuntime: string;
      };
      expect(serverModule.navigateRuntime.startsWith("/docs/assets/ruwuter-navigate-")).toBe(true);
      const runtimePath = join(dist, serverModule.navigateRuntime.slice("/docs/".length));
      const runtimeCode = await Deno.readTextFile(runtimePath);
      expect(runtimeCode).toContain('addEventListener("navigate"');
      expect(runtimeCode).not.toContain("type NavigateEventLike");
      await import(pathToFileURL(runtimePath).href);
    } finally {
      await Deno.remove(app, { recursive: true }).catch(() => {});
      await Deno.remove(typesRoot, { recursive: true }).catch(() => {});
    }
  });

  it("extracts opt-in client() callbacks into production controller chunks", async () => {
    const { build } = await import("vite");
    const app = await Deno.makeTempDir();
    const typesRoot = generatedTypesRoot(app);
    try {
      const routesDir = join(app, "routes");
      const distDir = join(app, "dist");
      await Deno.mkdir(routesDir, { recursive: true });
      await Deno.writeTextFile(join(app, "document.tsx"), "export default 1;");
      await Deno.writeTextFile(join(routesDir, "index.ts"), "export default 1;");
      await Deno.writeTextFile(
        join(app, "helper.ts"),
        `export const report = (value: unknown) => console.log(value);
export default report;`,
      );
      await Deno.writeTextFile(
        join(app, "entry.ts"),
        `
import { client as browserClient } from "@mewhhaha/ruwuter/browser";
import { report } from "./helper.ts";
export const controllerHref = browserClient<{ props: { label: string } }>(({ root, props }) => report([root, props.label]));
`,
      );

      await build({
        root: app,
        base: "/docs/",
        configFile: false,
        logLevel: "silent",
        plugins: [ruwuter({ appFolder: app, clientMacro: true })],
        resolve: {
          alias: [{
            find: "@mewhhaha/ruwuter/browser",
            replacement: resolve("src/browser.ts"),
          }],
        },
        build: {
          emptyOutDir: true,
          minify: false,
          outDir: distDir,
          ssr: join(app, "entry.ts"),
          target: "esnext",
          rollupOptions: { output: { entryFileNames: "entry.js" } },
        },
      });

      const output = await Deno.readTextFile(join(distDir, "entry.js"));
      expect(output).not.toContain("client((");
      const mod = await import(pathToFileURL(join(distDir, "entry.js")).href) as {
        controllerHref: string;
      };
      expect(mod.controllerHref.startsWith("/docs/assets/")).toBe(true);
      expect(mod.controllerHref.startsWith("file:")).toBe(false);
    } finally {
      await Deno.remove(app, { recursive: true }).catch(() => {});
      await Deno.remove(typesRoot, { recursive: true }).catch(() => {});
    }
  });

  it("serves extracted client() callbacks through Vite in development", async () => {
    const { createServer } = await import("vite");
    const app = await Deno.makeTempDir();
    const typesRoot = generatedTypesRoot(app);
    try {
      await Deno.mkdir(join(app, "routes"), { recursive: true });
      await Deno.writeTextFile(join(app, "document.tsx"), "export default 1;");
      await Deno.writeTextFile(join(app, "routes", "index.ts"), "export default 1;");
      await Deno.writeTextFile(
        join(app, "helper.ts"),
        "export const report = (value: unknown) => console.log(value);",
      );
      await Deno.writeTextFile(
        join(app, "entry.ts"),
        `
import { client as browserClient } from "@mewhhaha/ruwuter/browser";
import report, * as helpers from "./helper.ts";
export const controllerHref = browserClient(({ root }) => {
  report(root);
  helpers.report(root);
});
`,
      );
      const server = await createServer({
        root: app,
        configFile: false,
        logLevel: "silent",
        plugins: [ruwuter({ appFolder: app, clientMacro: true })],
        resolve: {
          alias: [{
            find: "@mewhhaha/ruwuter/browser",
            replacement: resolve("src/browser.ts"),
          }],
        },
      });
      try {
        const entry = await server.transformRequest("/entry.ts");
        const href = entry?.code.match(/"(\/@id\/__x00__ruwuter-client:[^"]+)"/)?.[1];
        if (!href) throw new Error("Expected the client macro URL in transformed entry");
        const controller = await server.transformRequest(href);
        expect(controller?.code).toContain("defineController");
        expect(controller?.code).toContain("helper.ts");
        expect(controller?.code).toContain("report, * as helpers");
        expect(controller?.code).not.toContain('from "./helper.ts"');
      } finally {
        await server.close();
      }
    } finally {
      await Deno.remove(app, { recursive: true }).catch(() => {});
      await Deno.remove(typesRoot, { recursive: true }).catch(() => {});
    }
  });

  it("allows globals but rejects captured locals and non-top-level client() calls", async () => {
    const { build, createServer } = await import("vite");
    const app = await Deno.makeTempDir();
    const typesRoot = generatedTypesRoot(app);
    try {
      await Deno.mkdir(join(app, "routes"), { recursive: true });
      await Deno.writeTextFile(join(app, "document.tsx"), "export default 1;");
      await Deno.writeTextFile(join(app, "routes", "index.ts"), "export default 1;");
      await Deno.writeTextFile(
        join(app, "globals.ts"),
        `import { client as browserClient } from "@mewhhaha/ruwuter/browser";
export const href = browserClient(() => fetch(location.href));`,
      );
      await Deno.writeTextFile(
        join(app, "capture.ts"),
        `import { client } from "@mewhhaha/ruwuter/browser";
const serverValue = "server";
export const href = client(() => {
  const shadow = (serverValue: string) => serverValue;
  console.log(serverValue, shadow("browser"));
});`,
      );
      await Deno.writeTextFile(
        join(app, "nested.ts"),
        `import { client } from "@mewhhaha/ruwuter/browser";
export const make = () => client(() => console.log("browser"));`,
      );
      await Deno.writeTextFile(
        join(app, "nested-default.ts"),
        `import { client } from "@mewhhaha/ruwuter/browser";
const serverValue = "server";
export const href = client(() => {
  const nested = (value = serverValue) => value;
  console.log(nested());
});`,
      );
      await Deno.writeTextFile(
        join(app, "var-hoist.ts"),
        `import { client } from "@mewhhaha/ruwuter/browser";
const value = "server";
export const href = client(() => {
  if (location.href) { var value = "client"; }
  for (var index = 0; index < 1; index++) {}
  console.log(value, index);
});`,
      );
      await Deno.writeTextFile(
        join(app, "module-var.ts"),
        `import { client } from "@mewhhaha/ruwuter/browser";
if (true) { var moduleValue = "server"; }
export const href = client(() => console.log(moduleValue));`,
      );
      const server = await createServer({
        root: app,
        configFile: false,
        logLevel: "silent",
        plugins: [ruwuter({ appFolder: app, clientMacro: true })],
        resolve: {
          alias: [{ find: "@mewhhaha/ruwuter/browser", replacement: resolve("src/browser.ts") }],
        },
      });
      try {
        const globals = await server.transformRequest("/globals.ts");
        expect(globals?.code).toContain("/@id/__x00__ruwuter-client:");
        const varHoist = await server.transformRequest("/var-hoist.ts");
        expect(varHoist?.code).toContain("/@id/__x00__ruwuter-client:");
        for (
          const [file, message] of [
            ["capture.ts", 'captures "serverValue"'],
            ["nested.ts", "top-level const"],
            ["nested-default.ts", 'captures "serverValue"'],
            ["module-var.ts", 'captures "moduleValue"'],
          ] as const
        ) {
          let error: unknown;
          try {
            await build({
              root: app,
              configFile: false,
              logLevel: "silent",
              plugins: [ruwuter({ appFolder: app, clientMacro: true })],
              resolve: {
                alias: [{
                  find: "@mewhhaha/ruwuter/browser",
                  replacement: resolve("src/browser.ts"),
                }],
              },
              build: {
                outDir: join(app, `dist-${file}`),
                ssr: join(app, file),
              },
            });
          } catch (caught) {
            error = caught;
          }
          expect(error instanceof Error).toBe(true);
          expect((error as Error).message).toContain(message);
        }
      } finally {
        await server.close();
      }
    } finally {
      await Deno.remove(app, { recursive: true }).catch(() => {});
      await Deno.remove(typesRoot, { recursive: true }).catch(() => {});
    }
  });
});

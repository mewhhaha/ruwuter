import { dirname, join, resolve } from "node:path";
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
});

import { dirname, join } from "node:path";
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

  it("regenerates when a watched route file changes", async () => {
    const app = await Deno.makeTempDir();
    const typesRoot = generatedTypesRoot(app);
    try {
      const routesDir = join(app, "routes");
      await Deno.mkdir(routesDir, { recursive: true });
      await Deno.writeTextFile(join(app, "document.tsx"), "export default 1;");
      await Deno.writeTextFile(join(routesDir, "index.tsx"), "export default 1;");

      const watcher = new FakeWatcher();
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
      });

      await plugin.buildStart?.();
      await Deno.writeTextFile(join(routesDir, "about.tsx"), "export default 2;");
      watcher.emit("change", join(routesDir, "about.tsx"));

      await waitFor(async () => {
        const contents = await Deno.readTextFile(join(app, "routes.ts"));
        return contents.includes('import * as $about from "./routes/about.tsx";');
      });
    } finally {
      await Deno.remove(app, { recursive: true });
      await Deno.remove(typesRoot, { recursive: true }).catch(() => {});
    }
  });

  it("rewrites import.meta.url only when enabled", () => {
    const enabled = ruwuter();
    const disabled = ruwuter({ rewriteImportMeta: false });
    const code = "const here = import.meta.url;";

    expect(enabled.renderChunk?.(code)).toBe('const here = "file://";');
    expect(disabled.renderChunk?.(code) ?? null).toBe(null);
  });
});

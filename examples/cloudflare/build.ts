import { mkdir } from "node:fs/promises";
import { rolldown } from "rolldown";

const root = new URL("../../", import.meta.url);
const dist = new URL("./dist/", import.meta.url);

await mkdir(new URL("./server/", dist), { recursive: true });
await mkdir(new URL("./assets/", dist), { recursive: true });

const bundles = [
  {
    input: new URL("./worker.ts", import.meta.url).pathname,
    file: new URL("./server/worker.mjs", dist).pathname,
    platform: "node" as const,
    external: ["node:async_hooks"],
    minify: false,
  },
  {
    input: new URL("./src/runtime/client.ts", root).pathname,
    file: new URL("./assets/client.js", dist).pathname,
    platform: "browser" as const,
    external: [],
    minify: true,
  },
  {
    input: new URL("./src/runtime/vt.ts", root).pathname,
    file: new URL("./assets/vt.js", dist).pathname,
    platform: "browser" as const,
    external: [],
    minify: true,
  },
  {
    input: new URL("./examples/fx.client.ts", root).pathname,
    file: new URL("./assets/fx.client.js", dist).pathname,
    platform: "browser" as const,
    external: [],
    minify: true,
  },
];

for (const entry of bundles) {
  const build = await rolldown({
    input: entry.input,
    platform: entry.platform,
    external: entry.external,
    transform: {
      jsx: {
        runtime: "automatic",
        importSource: "@mewhhaha/ruwuter",
      },
    },
  });
  await build.write({
    file: entry.file,
    format: "es",
    minify: entry.minify,
  });
  await build.close();
}

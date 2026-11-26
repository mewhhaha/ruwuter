import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Context = {
  emitFile(file: { type: "chunk"; id: string; fileName: string }): string;
};

const MODULE_PREFIX = "\0ruwuter-runtime:";
const URL_PREFIX = "\0ruwuter-runtime-url:";
const RUNTIME_SOURCES: ReadonlyMap<string, URL> = new Map([
  ["@mewhhaha/ruwuter/client.js", new URL("../runtime/client.ts", import.meta.url)],
  // Retained for legacy SuspenseProvider apps; the 0.7 router serves /_ruwuter/resolve-v1.js itself.
  ["@mewhhaha/ruwuter/resolve.js", new URL("../runtime/resolve.ts", import.meta.url)],
  ["@mewhhaha/ruwuter/swap.js", new URL("../runtime/swap.ts", import.meta.url)],
  ["@mewhhaha/ruwuter/vt.js", new URL("../runtime/vt.ts", import.meta.url)],
]);

const publicId = (id: string): string => `/@id/${id.replace("\0", "__x00__")}`;

/** Turns standard Vite `?url` imports for Ruwuter runtimes into compiled module chunks. */
export class RuntimeUrls {
  #modules = new Map<string, string>();
  #emitted = new Map<string, string>();

  constructor(
    private readonly isBuild: () => boolean,
    private readonly base: () => string,
  ) {}

  resolveId(id: string): string | undefined {
    if (id.startsWith("/@id/__x00__ruwuter-runtime")) {
      return `\0${id.slice("/@id/__x00__".length)}`;
    }
    if (id.startsWith(MODULE_PREFIX) || id.startsWith(URL_PREFIX)) return id;

    const queryIndex = id.indexOf("?");
    if (queryIndex === -1) return;
    const specifier = id.slice(0, queryIndex);
    if (!RUNTIME_SOURCES.has(specifier)) return;
    const query = new URLSearchParams(id.slice(queryIndex + 1));
    if (!query.has("url")) return;

    const encoded = encodeURIComponent(specifier);
    const moduleId = `${MODULE_PREFIX}${encoded}`;
    const urlId = `${URL_PREFIX}${encoded}`;
    this.#modules.set(moduleId, `export * from ${JSON.stringify(specifier)};\n`);
    this.#modules.set(urlId, moduleId);
    return urlId;
  }

  load(context: Context, id: string): string | undefined {
    const module = this.#modules.get(id);
    if (!module) return;
    if (id.startsWith(MODULE_PREFIX)) return module;
    if (!this.isBuild()) return `export default ${JSON.stringify(publicId(module))};\n`;

    let fileName = this.#emitted.get(id);
    if (!fileName) {
      const entry = decodeURIComponent(module.slice(MODULE_PREFIX.length));
      const name = entry.slice(entry.lastIndexOf("/") + 1, -3);
      const hash = createHash("sha256");
      hash.update(entry);
      const sourceUrl = RUNTIME_SOURCES.get(entry);
      if (sourceUrl?.protocol === "file:") {
        try {
          hash.update("\0");
          hash.update(readFileSync(fileURLToPath(sourceUrl)));
        } catch {
          // Fall back to specifier hash when packaged without local file access.
        }
      }
      fileName = `assets/ruwuter-${name}-${hash.digest("hex").slice(0, 8)}.js`;
      context.emitFile({ type: "chunk", id: module, fileName });
      this.#emitted.set(id, fileName);
    }
    const base = this.base();
    return `export default ${
      JSON.stringify(`${base.endsWith("/") ? base : `${base}/`}${fileName}`)
    };\n`;
  }
}

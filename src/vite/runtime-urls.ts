type Context = {
  emitFile(file: { type: "chunk"; id: string; fileName: string }): string;
};

const MODULE_PREFIX = "\0ruwuter-runtime:";
const URL_PREFIX = "\0ruwuter-runtime-url:";
const RUNTIME_ENTRIES = new Set([
  "@mewhhaha/ruwuter/client.js",
  "@mewhhaha/ruwuter/navigate.js",
  "@mewhhaha/ruwuter/resolve.js",
  "@mewhhaha/ruwuter/swap.js",
]);

const publicId = (id: string): string => `/@id/${id.replace("\0", "__x00__")}`;

/** Turns standard Vite `?url` imports for Ruwuter runtimes into compiled module chunks. */
export class RuntimeUrls {
  #modules = new Map<string, string>();
  #nextFile = 0;

  constructor(
    private readonly isBuild: () => boolean,
    private readonly base: () => string,
    private readonly buildId: string,
  ) {}

  resolveId(id: string): string | undefined {
    if (id.startsWith("/@id/__x00__ruwuter-runtime")) {
      return `\0${id.slice("/@id/__x00__".length)}`;
    }
    if (id.startsWith(MODULE_PREFIX) || id.startsWith(URL_PREFIX)) return id;

    const queryIndex = id.indexOf("?");
    if (queryIndex === -1) return;
    const specifier = id.slice(0, queryIndex);
    if (!RUNTIME_ENTRIES.has(specifier)) return;
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

    const entry = decodeURIComponent(module.slice(MODULE_PREFIX.length));
    const name = entry.slice(entry.lastIndexOf("/") + 1, -3);
    const fileName = `assets/ruwuter-${name}-${this.buildId}-${this.#nextFile++}.js`;
    context.emitFile({ type: "chunk", id: module, fileName });
    const base = this.base();
    return `export default ${
      JSON.stringify(`${base.endsWith("/") ? base : `${base}/`}${fileName}`)
    };\n`;
  }
}

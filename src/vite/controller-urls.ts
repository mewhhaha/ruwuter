import path from "node:path";

type Context = { emitFile(file: { type: "chunk"; id: string; fileName?: string }): string };

const QUERY = "?ruwuter-controller-url";
const MODULE_PREFIX = "\0ruwuter-controller:";
const URL_PREFIX = "\0ruwuter-controller-url:";

const publicId = (id: string): string => `/@id/${id.replace("\0", "__x00__")}`;

/** Converts generated controller imports into executable Vite module URLs. */
export class ControllerUrls {
  #modules = new Map<string, string>();
  #nextFile = 0;

  constructor(
    private readonly isBuild: () => boolean,
    private readonly appFolder: string,
    private readonly base: () => string,
    private readonly buildId: string,
  ) {}

  register(importer: string, source: string): string {
    const importerPath = importer.startsWith("/") && !importer.startsWith(this.appFolder)
      ? path.join(this.appFolder, importer)
      : importer;
    const absolute = path.resolve(
      path.dirname(importerPath),
      source.startsWith("/") ? `.${source}` : source,
    );
    const moduleId = `${MODULE_PREFIX}${encodeURIComponent(absolute)}`;
    const urlId = `${URL_PREFIX}${encodeURIComponent(absolute)}`;
    this.#modules.set(moduleId, `export { default } from ${JSON.stringify(`/@fs/${absolute}`)};\n`);
    this.#modules.set(urlId, moduleId);
    return urlId;
  }

  resolveId(id: string, importer?: string): string | undefined {
    if (id.startsWith("/@id/__x00__ruwuter-controller")) {
      return `\0${id.slice("/@id/__x00__".length)}`;
    }
    if (id.startsWith(MODULE_PREFIX) || id.startsWith(URL_PREFIX)) return id;
    const queryIndex = id.indexOf(QUERY);
    if (queryIndex === -1 || !importer) return;
    return this.register(importer, id.slice(0, queryIndex));
  }

  load(context: Context, id: string): string | undefined {
    const module = this.#modules.get(id);
    if (!module) return;
    if (id.startsWith(MODULE_PREFIX)) return module;
    if (!this.isBuild()) return `export default ${JSON.stringify(publicId(module))};\n`;
    const fileName = `assets/ruwuter-controller-${this.buildId}-${this.#nextFile++}.js`;
    context.emitFile({ type: "chunk", id: module, fileName });
    const base = this.base();
    return `export default ${
      JSON.stringify(`${base.endsWith("/") ? base : `${base}/`}${fileName}`)
    };\n`;
  }
}

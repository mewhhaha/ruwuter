import { createHash, type Hash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

type Context = { emitFile(file: { type: "chunk"; id: string; fileName?: string }): string };

const QUERY = "?ruwuter-controller-url";
const MODULE_PREFIX = "\0ruwuter-controller:";
const URL_PREFIX = "\0ruwuter-controller-url:";
const RELATIVE_IMPORT =
  /(?:(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?|import\s*\(\s*)(["'])(\.\.?\/[^"'`]+)\1/g;
const RESOLVE_CANDIDATES = [
  "",
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".mjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

const resolveLocalImport = (fromFile: string, specifier: string): string | undefined => {
  const clean = specifier.split(/[?#]/, 1)[0];
  const base = path.resolve(path.dirname(fromFile), clean);
  for (const suffix of RESOLVE_CANDIDATES) {
    const candidate = base + suffix;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Try next extension candidate.
    }
  }
  return undefined;
};

const hashModuleGraph = (
  entry: string,
  appFolder: string,
  hash: Hash,
  visited = new Set<string>(),
): void => {
  if (visited.has(entry)) return;
  visited.add(entry);
  hash.update(path.relative(appFolder, entry).split(path.sep).join("/"));
  hash.update("\0");
  let source: string;
  try {
    const bytes = readFileSync(entry);
    hash.update(bytes);
    hash.update("\0");
    source = bytes.toString("utf8");
  } catch {
    hash.update(entry);
    hash.update("\0");
    return;
  }
  const deps = new Set<string>();
  for (const match of source.matchAll(RELATIVE_IMPORT)) {
    const resolved = resolveLocalImport(entry, match[2]);
    if (resolved) deps.add(resolved);
  }
  for (const dep of [...deps].sort()) {
    hashModuleGraph(dep, appFolder, hash, visited);
  }
};

const publicId = (id: string): string => `/@id/${id.replace("\0", "__x00__")}`;

const toFsUrl = (absolute: string): string => {
  const posixPath = absolute.split(path.sep).join("/");
  return posixPath.startsWith("/") ? `/@fs${posixPath}` : `/@fs/${posixPath}`;
};

/** Converts generated controller imports into executable Vite module URLs. */
export class ControllerUrls {
  #modules = new Map<string, string>();
  #sources = new Map<string, string>();
  #emitted = new Map<string, string>();

  constructor(
    private readonly isBuild: () => boolean,
    private readonly appFolder: string,
    private readonly base: () => string,
  ) {}

  register(importer: string, source: string): string {
    const cleanImporter = importer.split("?", 1)[0];
    const importerPath =
      cleanImporter.startsWith("/") && !cleanImporter.startsWith(this.appFolder)
        ? path.join(this.appFolder, cleanImporter)
        : cleanImporter;
    const absolute = path.resolve(
      path.dirname(importerPath),
      source.startsWith("/") ? `.${source}` : source,
    );
    const moduleId = `${MODULE_PREFIX}${encodeURIComponent(absolute)}`;
    const urlId = `${URL_PREFIX}${encodeURIComponent(absolute)}`;
    this.#sources.set(moduleId, absolute);
    this.#modules.set(moduleId, `export { default } from ${JSON.stringify(toFsUrl(absolute))};\n`);
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
    let fileName = this.#emitted.get(id);
    if (!fileName) {
      const absolute = this.#sources.get(module) ?? module;
      const hash = createHash("sha256");
      hashModuleGraph(absolute, this.appFolder, hash);
      const slug =
        path
          .basename(absolute)
          .replace(/\.client\.tsx?$/, "")
          .replace(/[^A-Za-z0-9_-]+/g, "-") || "controller";
      fileName = `assets/ruwuter-controller-${slug}-${hash.digest("hex").slice(0, 8)}.js`;
      context.emitFile({ type: "chunk", id: module, fileName });
      this.#emitted.set(id, fileName);
    }
    const base = this.base();
    return `export default ${JSON.stringify(
      `${base.endsWith("/") ? base : `${base}/`}${fileName}`,
    )};\n`;
  }
}

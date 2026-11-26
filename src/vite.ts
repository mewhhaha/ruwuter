import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeGeneratedFiles } from "./fs-routes/write.ts";
import { ControllerUrls } from "./vite/controller-urls.ts";
import { RuntimeUrls } from "./vite/runtime-urls.ts";

type WatchEvent = "add" | "addDir" | "change" | "unlink" | "unlinkDir" | string;

type ViteWatcher = {
  on(event: "all", listener: (event: WatchEvent, file: string) => void): unknown;
};

type ViteLogger = {
  error(message: string, options?: { error?: Error }): void;
};

type ViteWebSocket = {
  send(payload: { type: "full-reload" }): void;
};

type ViteDevServer = {
  watcher: ViteWatcher;
  config?: {
    logger?: ViteLogger;
  };
  ws?: ViteWebSocket;
};

type OutputChunk = {
  type: "chunk";
  fileName: string;
  code: string;
  isEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  viteMetadata?: {
    importedAssets?: Set<string>;
    importedCss?: Set<string>;
  };
};

type OutputBundle = Record<string, OutputChunk | { type: string; fileName: string }>;

type BundleContext = {
  environment?: { name: string };
  emitFile(file: { type: "asset"; fileName: string; source: string }): string;
  error(message: string): never;
};

type ViteBuilder = {
  config: { root: string };
  environments: Record<
    string,
    { isBuilt?: boolean; config: { build: { outDir: string } } } | undefined
  >;
};

export interface RuwuterPluginOptions {
  /**
   * The folder containing the route files.
   * @default "./app"
   */
  appFolder?: string;
}

type RuwuterPlugin = {
  name: string;
  enforce?: "post";
  sharedDuringBuild?: boolean;
  config?: () => { ssr: { noExternal: string[] } };
  configResolved?: (config: { command: "serve" | "build"; base?: string }) => void;
  buildStart?: () => Promise<void>;
  configureServer?: (server: ViteDevServer) => void;
  resolveId?: {
    order: "pre";
    handler(id: string, importer?: string): string | undefined;
  };
  load?: (this: unknown, id: string) => string | undefined;
  transform?: (
    this: unknown,
    source: string,
    id: string,
  ) => Promise<{ code: string; map: null } | undefined> | { code: string; map: null } | undefined;
  generateBundle?: (this: any, options: any, bundle: Record<string, any>) => void;
  buildApp?: {
    order: "post";
    handler(builder: ViteBuilder): Promise<void>;
  };
};

const isWithinFolder = (folder: string, file: string): boolean => {
  return file === folder || file.startsWith(`${folder}${path.sep}`);
};

const isChunk = (output: OutputBundle[string] | undefined): output is OutputChunk => {
  return output?.type === "chunk";
};

const walkChunkGraph = (bundle: OutputBundle, seeds: Iterable<string>): Set<string> => {
  const visited = new Set<string>();
  const pending = [...seeds];
  for (const fileName of pending) {
    if (visited.has(fileName)) continue;
    const output = bundle[fileName];
    if (!isChunk(output)) continue;
    visited.add(fileName);
    for (const dep of output.imports ?? []) pending.push(dep);
    for (const dep of output.dynamicImports ?? []) pending.push(dep);
  }
  return visited;
};

export const ruwuter = (options: RuwuterPluginOptions = {}): RuwuterPlugin => {
  const appFolder = path.normalize(options.appFolder ?? "./app");
  const resolvedAppFolder = path.resolve(appFolder);
  const routesFolder = path.join(resolvedAppFolder, "routes");
  const generatedOutputs = new Set([
    path.join(resolvedAppFolder, "routes.ts"),
    path.join(resolvedAppFolder, "controllers.ts"),
  ]);
  let building = false;
  let base = "/";
  const controllerUrls = new ControllerUrls(
    () => building,
    resolvedAppFolder,
    () => base,
  );
  const runtimeUrls = new RuntimeUrls(
    () => building,
    () => base,
  );
  const browserModules = new Map<string, string>();
  const sharedBrowserModules = new Map<string, string>();

  let queuedWrite = Promise.resolve();

  const regenerate = async () => {
    await writeGeneratedFiles(appFolder, { controllers: true });
  };

  const scheduleRegenerate = () => {
    queuedWrite = queuedWrite.then(regenerate, regenerate);
    return queuedWrite;
  };

  const transformControllerImports = (source: string, id: string) => {
    const cleanId = id.split("?", 1)[0];
    if (
      path.basename(cleanId) !== "controllers.ts" ||
      !source.includes("?ruwuter-controller-url")
    ) {
      return;
    }
    const code = source.replace(
      /(["'])([^"']+)\?ruwuter-controller-url\1/g,
      (_match, quote: string, specifier: string) => {
        const virtualId = controllerUrls.register(cleanId, specifier);
        return `${quote}/@id/${virtualId.replace("\0", "__x00__")}${quote}`;
      },
    );
    return { code, map: null };
  };

  return {
    name: "vite-plugin-ruwuter",
    sharedDuringBuild: true,
    config() {
      // Bundle Ruwuter's own browser helpers into emitted controller/runtime chunks
      // during SSR builds so browser modules never retain bare npm specifiers.
      return {
        ssr: {
          noExternal: ["@mewhhaha/ruwuter"],
        },
      };
    },
    configResolved(config: { command: "serve" | "build"; base?: string }) {
      building = config.command === "build";
      base = config.base ?? "/";
    },
    resolveId: {
      order: "pre" as const,
      handler(id: string, importer?: string) {
        return runtimeUrls.resolveId(id) ?? controllerUrls.resolveId(id, importer);
      },
    },
    load(this: unknown, id: string) {
      return (
        runtimeUrls.load(this as Parameters<RuntimeUrls["load"]>[0], id) ??
        controllerUrls.load(this as Parameters<ControllerUrls["load"]>[0], id)
      );
    },
    transform(this: unknown, source: string, id: string) {
      void this;
      return transformControllerImports(source, id);
    },
    generateBundle(this: unknown, _options: unknown, rawBundle: Record<string, any>) {
      const context = this as BundleContext | undefined;
      const bundle = rawBundle as OutputBundle;

      if (context?.environment?.name === "client") {
        // Emit chunks shared between the server/Worker and browser controllers into the client
        // build so server bundles keep their imports while browsers can still fetch them.
        for (const [fileName, code] of sharedBrowserModules) {
          if (fileName in bundle) continue;
          context.emitFile({ type: "asset", fileName, source: code });
        }
        return;
      }

      const emittedEntries = new Set<string>();
      for (const fileName of runtimeUrls.emittedFileNames()) {
        if (isChunk(bundle[fileName])) emittedEntries.add(fileName);
      }
      for (const fileName of controllerUrls.emittedFileNames()) {
        if (isChunk(bundle[fileName])) emittedEntries.add(fileName);
      }
      if (emittedEntries.size === 0) return;

      const serverEntries = Object.values(bundle).filter(
        (output): output is OutputChunk =>
          isChunk(output) && Boolean(output.isEntry) && !emittedEntries.has(output.fileName),
      );
      const serverEntryFileNames = new Set(serverEntries.map((entry) => entry.fileName));
      const serverReachable = walkChunkGraph(bundle, serverEntryFileNames);
      const browserReachable = walkChunkGraph(bundle, emittedEntries);
      const browserOnly: string[] = [];

      for (const fileName of browserReachable) {
        if (serverEntryFileNames.has(fileName)) {
          context?.error(
            `Ruwuter browser module graph unexpectedly imports server entry "${fileName}".`,
          );
          throw new Error(
            `Ruwuter browser module graph unexpectedly imports server entry "${fileName}".`,
          );
        }
        const chunk = bundle[fileName];
        if (!isChunk(chunk)) continue;
        browserModules.set(fileName, chunk.code);
        if (serverReachable.has(fileName)) {
          sharedBrowserModules.set(fileName, chunk.code);
        } else {
          browserOnly.push(fileName);
        }
      }

      const hostChunk = serverEntries[0] ?? bundle[[...emittedEntries][0]];
      if (isChunk(hostChunk) && browserOnly.length > 0) {
        // Expose browser-only chunks as imported assets so multi-environment builders
        // (such as @cloudflare/vite-plugin) build static assets and move them out of
        // the server/Worker bundle automatically.
        hostChunk.viteMetadata ??= { importedAssets: new Set(), importedCss: new Set() };
        hostChunk.viteMetadata.importedAssets ??= new Set();
        for (const fileName of browserOnly) {
          hostChunk.viteMetadata.importedAssets.add(fileName);
        }
      }
    },
    buildApp: {
      order: "post",
      async handler(builder) {
        if (browserModules.size === 0) return;
        const client = builder.environments.client;
        if (!client?.isBuilt) return;
        const clientDir = path.resolve(builder.config.root, client.config.build.outDir);
        const pending: Array<Promise<void>> = [];
        for (const [fileName, code] of browserModules) {
          const target = path.resolve(clientDir, fileName);
          if (existsSync(target)) continue;
          pending.push(
            mkdir(path.dirname(target), { recursive: true }).then(() => writeFile(target, code)),
          );
        }
        await Promise.all(pending);
        browserModules.clear();
        sharedBrowserModules.clear();
      },
    },
    async buildStart() {
      await scheduleRegenerate();
    },

    configureServer(server) {
      server.watcher.on("all", (event, file) => {
        if (!["add", "addDir", "change", "unlink", "unlinkDir"].includes(event)) return;

        const resolvedFile = path.resolve(file);
        if (generatedOutputs.has(resolvedFile)) return;
        const isRouteInput = isWithinFolder(routesFolder, resolvedFile);
        const isControllerInput =
          !isRouteInput &&
          isWithinFolder(resolvedAppFolder, resolvedFile) &&
          /\.client\.tsx?$/.test(resolvedFile);
        if (!isRouteInput && !isControllerInput) return;

        void scheduleRegenerate()
          .then(() => {
            server.ws?.send({ type: "full-reload" });
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            server.config?.logger?.error(
              `[vite-plugin-ruwuter] Failed to regenerate routes for ${appFolder}: ${message}`,
              error instanceof Error ? { error } : undefined,
            );
          });
      });
    },
  };
};

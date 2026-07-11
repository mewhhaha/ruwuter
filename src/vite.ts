import path from "node:path";
import { writeGeneratedFiles } from "./fs-routes/write.ts";
import { ClientMacro } from "./vite/client-macro.ts";
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

export interface RuwuterPluginOptions {
  /**
   * The folder containing the route files.
   * @default "./app"
   */
  appFolder?: string;
  /** Enables the experimental Vite-only `client()` extraction macro. */
  clientMacro?: boolean;
}

type RuwuterPlugin = {
  name: string;
  enforce?: "post";
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
  ) => { code: string; map: null } | undefined;
};

const isWithinFolder = (folder: string, file: string): boolean => {
  return file === folder || file.startsWith(`${folder}${path.sep}`);
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
  const buildId = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const clientMacro = options.clientMacro
    ? new ClientMacro(() => building, () => base, buildId)
    : undefined;
  const controllerUrls = new ControllerUrls(
    () => building,
    resolvedAppFolder,
    () => base,
    buildId,
  );
  const runtimeUrls = new RuntimeUrls(() => building, () => base, buildId);

  let queuedWrite = Promise.resolve();

  const regenerate = async () => {
    await writeGeneratedFiles(appFolder, { controllers: true });
  };

  const scheduleRegenerate = () => {
    queuedWrite = queuedWrite.then(regenerate, regenerate);
    return queuedWrite;
  };

  const transformControllerImports = (source: string, id: string) => {
    if (path.basename(id) !== "controllers.ts" || !source.includes("?ruwuter-controller-url")) {
      return;
    }
    const code = source.replace(
      /(["'])([^"']+)\?ruwuter-controller-url\1/g,
      (_match, quote: string, specifier: string) => {
        const virtualId = controllerUrls.register(id, specifier);
        return `${quote}/@id/${virtualId.replace("\0", "__x00__")}${quote}`;
      },
    );
    return { code, map: null };
  };

  return {
    name: "vite-plugin-ruwuter",
    configResolved(config: { command: "serve" | "build"; base?: string }) {
      building = config.command === "build";
      base = config.base ?? "/";
    },
    ...(clientMacro
      ? {
        enforce: "post" as const,
        resolveId: {
          order: "pre" as const,
          handler(id: string, importer?: string) {
            return runtimeUrls.resolveId(id) ?? controllerUrls.resolveId(id, importer) ??
              clientMacro.resolveId(id);
          },
        },
        load(this: unknown, id: string) {
          return runtimeUrls.load(this as Parameters<RuntimeUrls["load"]>[0], id) ??
            controllerUrls.load(this as Parameters<ControllerUrls["load"]>[0], id) ??
            clientMacro.load(id);
        },
        transform(this: unknown, source: string, id: string) {
          const controller = transformControllerImports(source, id);
          const macro = clientMacro.transform(
            this as Parameters<ClientMacro["transform"]>[0],
            controller?.code ?? source,
            id,
          );
          return macro ?? controller;
        },
      }
      : {
        resolveId: {
          order: "pre" as const,
          handler(id: string, importer?: string) {
            return runtimeUrls.resolveId(id) ?? controllerUrls.resolveId(id, importer);
          },
        },
        load(this: unknown, id: string) {
          return runtimeUrls.load(this as Parameters<RuntimeUrls["load"]>[0], id) ??
            controllerUrls.load(this as Parameters<ControllerUrls["load"]>[0], id);
        },
        transform(this: unknown, source: string, id: string) {
          void this;
          return transformControllerImports(source, id);
        },
      }),

    async buildStart() {
      await scheduleRegenerate();
    },

    configureServer(server) {
      server.watcher.on("all", (event, file) => {
        if (!["add", "addDir", "change", "unlink", "unlinkDir"].includes(event)) return;

        const resolvedFile = path.resolve(file);
        if (generatedOutputs.has(resolvedFile)) return;
        const isRouteInput = isWithinFolder(routesFolder, resolvedFile);
        const isControllerInput = !isRouteInput &&
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

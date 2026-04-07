import path from "node:path";
import { writeGeneratedFiles } from "./fs-routes/write.ts";

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
  /**
   * Whether to rewrite import.meta.url references in generated chunks.
   * @default true
   */
  rewriteImportMeta?: boolean;
}

type RuwuterPlugin = {
  name: string;
  buildStart?: () => Promise<void>;
  configureServer?: (server: ViteDevServer) => void;
  renderChunk?: (code: string) => string | null;
};

const isWithinFolder = (folder: string, file: string): boolean => {
  return file === folder || file.startsWith(`${folder}${path.sep}`);
};

export const ruwuter = (options: RuwuterPluginOptions = {}): RuwuterPlugin => {
  const appFolder = path.normalize(options.appFolder ?? "./app");
  const routesFolder = path.resolve(appFolder, "routes");
  const rewriteImportMeta = options.rewriteImportMeta ?? true;

  let queuedWrite = Promise.resolve();

  const regenerate = async () => {
    await writeGeneratedFiles(appFolder);
  };

  const scheduleRegenerate = () => {
    queuedWrite = queuedWrite.then(regenerate, regenerate);
    return queuedWrite;
  };

  return {
    name: "vite-plugin-ruwuter",

    async buildStart() {
      await scheduleRegenerate();
    },

    configureServer(server) {
      server.watcher.on("all", (event, file) => {
        if (!["add", "addDir", "change", "unlink", "unlinkDir"].includes(event)) return;

        const resolvedFile = path.resolve(file);
        if (!isWithinFolder(routesFolder, resolvedFile)) return;

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

    renderChunk(code) {
      if (!rewriteImportMeta) return null;
      if (!code.includes("import.meta.url")) return null;
      return code.replaceAll(/\bimport\.meta\.url\b/g, '"file://"');
    },
  };
};

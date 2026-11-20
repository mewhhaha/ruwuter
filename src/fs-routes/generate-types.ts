import { readdir } from "node:fs/promises";
import path from "node:path";
import { extractRouteParams, isRouteModuleName, stripRouteExtension } from "./route-name.ts";
import { generatedTypesRoot } from "./paths.ts";
import type { GeneratedFile } from "./types.ts";

type RouteEntry = {
  sourceName: string;
  routeName: string;
  isDirectory: boolean;
};

/**
 * Generates TypeScript type definitions for route parameters.
 *
 * @param appFolder - Path to the application folder containing the routes directory
 * @internal
 */
export const generateTypes = async (
  appFolder: string,
): Promise<GeneratedFile[]> => {
  const resolvedAppFolder = path.resolve(appFolder);
  const routesFolder = path.join(resolvedAppFolder, "routes");
  let routeEntries: RouteEntry[] = [];
  try {
    const entries = await readdir(routesFolder, { withFileTypes: true });
    routeEntries = entries
      .filter((entry) => entry.isDirectory() || (entry.isFile() && isRouteModuleName(entry.name)))
      .map((entry) => {
        if (entry.isDirectory()) {
          return { sourceName: entry.name, routeName: entry.name, isDirectory: true };
        }
        return {
          sourceName: entry.name,
          routeName: stripRouteExtension(entry.name),
          isDirectory: false,
        };
      });
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }

  const typesRoot = generatedTypesRoot(resolvedAppFolder);
  const routesTypesRoot = path.join(typesRoot, "routes");

  const outputs: GeneratedFile[] = [];

  for (const entry of routeEntries) {
    const { paramNames, optionalParams } = extractRouteParams(entry.routeName);
    const fields = Array.from(paramNames).sort().map((name) => {
      let key = JSON.stringify(name);
      if (optionalParams.has(name)) key += "?";
      return `  ${key}: string;`;
    });
    const contents =
      `import type { HandlerContext } from "@mewhhaha/ruwuter";\n\nexport type RouteParams = {\n${
        fields.join("\n")
      }\n};\nexport type Context<Bindings = undefined> = HandlerContext<Bindings, RouteParams>;\n`;
    let filename = `+types.${stripRouteExtension(entry.sourceName)}.ts`;
    if (entry.isDirectory) filename = path.join(entry.sourceName, "+types.route.d.ts");
    outputs.push({ path: path.join(routesTypesRoot, filename), contents });
  }
  return outputs;
};

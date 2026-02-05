import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  extractRouteParams,
  isRouteModuleName,
  stripRouteExtension,
  toJsModuleName,
} from "./route-name.ts";
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
  } catch {
    return [];
  }

  const relativeAppFolder = path.relative(process.cwd(), resolvedAppFolder) ||
    path.basename(resolvedAppFolder);
  const typesRoot = path.join(".router", "types", relativeAppFolder);
  const routesTypesRoot = path.join(typesRoot, "routes");

  const outputs: GeneratedFile[] = [];

  const routeParams = new Map<
    string,
    {
      paramNames: Set<string>;
      optionalParams: Set<string>;
    }
  >();

  for (const { routeName } of routeEntries) {
    routeParams.set(routeName, extractRouteParams(routeName));
  }

  const allRouteParams = new Map<string, Set<string>>();
  const allOptionalParams = new Map<string, Set<string>>();

  for (const [routeName, params] of routeParams.entries()) {
    allRouteParams.set(routeName, new Set(params.paramNames));
    allOptionalParams.set(routeName, new Set(params.optionalParams));
  }

  const layoutRoutes = new Set<string>();
  for (const routeName of routeParams.keys()) {
    let parentRoute = routeName;
    while (parentRoute.includes(".")) {
      parentRoute = parentRoute.substring(0, parentRoute.lastIndexOf("."));
      layoutRoutes.add(parentRoute);
    }
  }

  for (const layoutRoute of layoutRoutes) {
    const layoutParams = allRouteParams.get(layoutRoute) || new Set();
    const layoutOptionalParams = allOptionalParams.get(layoutRoute) || new Set();

    for (const routeName of routeParams.keys()) {
      if (routeName === layoutRoute || !routeName.startsWith(layoutRoute + ".")) {
        continue;
      }

      const childParams = routeParams.get(routeName);
      if (!childParams) continue;
      for (const param of childParams.paramNames) {
        layoutParams.add(param);
        layoutOptionalParams.add(param);
      }
    }

    allRouteParams.set(layoutRoute, layoutParams);
    allOptionalParams.set(layoutRoute, layoutOptionalParams);
  }

  for (const entry of routeEntries) {
    const params = allRouteParams.get(entry.routeName) || new Set();
    const optionalParams = allOptionalParams.get(entry.routeName) || new Set();

    const paramsString = Array.from(params)
      .sort()
      .map((param) => {
        const isOptional = optionalParams.has(param);
        return `  ${JSON.stringify(param)}${isOptional ? "?" : ""}: string;`;
      })
      .join("\n");

    const template = createTemplate(
      entry.isDirectory ? "route.tsx" : entry.sourceName,
      paramsString,
    );

    const basePath = routesTypesRoot;
    if (entry.isDirectory) {
      const targetDir = path.join(basePath, entry.sourceName);
      const outputPath = path.join(targetDir, "+types.route.d.ts");
      outputs.push({ path: outputPath, contents: template });
    } else {
      const outputPath = path.join(basePath, `+types.${stripRouteExtension(entry.sourceName)}.ts`);
      outputs.push({ path: outputPath, contents: template });
    }
  }

  const rootTemplate = createTemplate("document.tsx", "");
  const rootOutputPath = path.join(typesRoot, "+types.document.ts");
  outputs.push({ path: rootOutputPath, contents: rootTemplate });

  return outputs;
};

const createTemplate = (file: string, params: string) => {
  const paramsObject = params ? `{\n${params}\n}` : "Record<never, never>";

  const template = `
import type {
  InferActionArgs,
  InferComponentProps,
  InferHeadersFunction,
  InferLoaderArgs,
} from "@mewhhaha/ruwuter/types";
import * as r from "./${toJsModuleName(file)}";

export type RouteParams = ${paramsObject};

export namespace Route {
  export type ComponentProps = InferComponentProps<typeof r>;
  export type LoaderArgs = InferLoaderArgs<RouteParams>;
  export type ActionArgs = InferActionArgs<RouteParams>;
  export type HeadersFunction = InferHeadersFunction<RouteParams, typeof r>;
}
    `.trim();

  return template;
};

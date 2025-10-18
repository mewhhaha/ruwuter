import path from "node:path";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";

const unescapedDotRegex = /(?<!\[)\.(?![^[]*\])/g;
const tsRegex = /\.(m)?ts(x)?$/;

/**
 * Generates TypeScript type definitions for route parameters.
 *
 * @param appFolder - Path to the application folder containing the routes directory
 * @internal
 */
export const generateTypes = async (appFolder: string): Promise<void> => {
  const resolvedAppFolder = path.resolve(appFolder);
  const routesFolder = path.join(resolvedAppFolder, "routes");
  let files: string[] = [];
  try {
    files = await readdir(routesFolder);
  } catch {
    await rm(path.join(".router", "types", path.relative(process.cwd(), resolvedAppFolder)), {
      recursive: true,
      force: true,
    });
    return;
  }

  const relativeAppFolder = path.relative(process.cwd(), resolvedAppFolder) ||
    path.basename(resolvedAppFolder);
  const typesRoot = path.join(".router", "types", relativeAppFolder);
  const routesTypesRoot = path.join(typesRoot, "routes");

  const tasks: Promise<void>[] = [];
  await rm(typesRoot, { recursive: true, force: true });
  await mkdir(routesTypesRoot, { recursive: true });

  // First, extract all route parameters
  const routeParams = new Map<
    string,
    {
      paramNames: Set<string>;
      optionalParams: Set<string>;
    }
  >();

  for (const file of files) {
    const routeName = file.replace(tsRegex, "");
    const params = extractParamsFromRoute(routeName);
    routeParams.set(routeName, params);
  }

  // Create a map to track all parameters for each route (including from child routes)
  const allRouteParams = new Map<string, Set<string>>();
  const allOptionalParams = new Map<string, Set<string>>();

  // Initialize with direct parameters
  for (const [routeName, params] of routeParams.entries()) {
    allRouteParams.set(routeName, new Set(params.paramNames));
    allOptionalParams.set(routeName, new Set(params.optionalParams));
  }

  // Find all layout routes
  const layoutRoutes = new Set<string>();
  for (const routeName of routeParams.keys()) {
    let parentRoute = routeName;
    while (parentRoute.includes(".")) {
      parentRoute = parentRoute.substring(0, parentRoute.lastIndexOf("."));
      layoutRoutes.add(parentRoute);
    }
  }

  // For each route, find all child routes and propagate their parameters
  for (const layoutRoute of layoutRoutes) {
    const layoutParams = allRouteParams.get(layoutRoute) || new Set();
    const layoutOptionalParams = allOptionalParams.get(layoutRoute) || new Set();

    // Find all child routes
    for (const routeName of routeParams.keys()) {
      if (
        routeName !== layoutRoute &&
        routeName.startsWith(layoutRoute + ".")
      ) {
        const childParams = routeParams.get(routeName);
        if (childParams) {
          // Add all child parameters to the layout route as optional
          for (const param of childParams.paramNames) {
            layoutParams.add(param);
            layoutOptionalParams.add(param); // All propagated params are optional in the parent
          }
        }
      }
    }

    allRouteParams.set(layoutRoute, layoutParams);
    allOptionalParams.set(layoutRoute, layoutOptionalParams);
  }

  // Now generate the type files with the collected parameters
  for (const file of files) {
    const routeName = file.replace(tsRegex, "");

    // Get all parameters for this route
    const params = allRouteParams.get(routeName) || new Set();
    const optionalParams = allOptionalParams.get(routeName) || new Set();

    // Generate the params string
    const paramsString = Array.from(params)
      .map((param) => {
        const isOptional = optionalParams.has(param);
        return `\t${param}${isOptional ? "?" : ""}: string;`;
      })
      .join("\n");

    const isDirectory = !file.endsWith(".tsx");

    const template = createTemplate(
      isDirectory ? "route.tsx" : file,
      paramsString,
    );

    const basePath = routesTypesRoot;
    if (isDirectory) {
      const task = async () => {
        await mkdir(path.join(basePath, file), { recursive: true });
        await writeFile(
          path.join(basePath, file, `+types.route.d.ts`),
          template,
        );
      };
      tasks.push(task());
    } else {
      const task = () =>
        writeFile(
          path.join(basePath, `+types.${file.replace(tsRegex, ".ts")}`),
          template,
        );
      tasks.push(task());
    }
  }

  const rootTemplate = createTemplate("document.tsx", "");
  tasks.push(writeFile(path.join(typesRoot, "+types.document.ts"), rootTemplate));

  await Promise.all(tasks);
};

/**
 * Extract parameter names from a route, identifying which ones are optional
 */
function extractParamsFromRoute(routeName: string): {
  paramNames: Set<string>;
  optionalParams: Set<string>;
} {
  const paramNames = new Set<string>();
  const optionalParams = new Set<string>();
  let wildcard = 0;

  routeName.split(unescapedDotRegex).forEach((segment) => {
    // Check if this is an optional segment
    const isOptional = segment.startsWith("(") && segment.endsWith(")");
    const actualSegment = isOptional ? segment.slice(1, -1) : segment;

    // Check if it's a parameter
    if (actualSegment === "$" && isOptional) {
      optionalParams.add(wildcard.toString());
      wildcard++;
    } else if (actualSegment === "$") {
      paramNames.add(wildcard.toString());
      wildcard++;
    } else if (actualSegment.startsWith("$")) {
      const paramName = actualSegment.slice(1);
      paramNames.add(paramName);

      // If the segment was optional, mark the parameter as optional
      if (isOptional) {
        optionalParams.add(paramName);
      }
    }
  });

  return { paramNames, optionalParams };
}

const createTemplate = (file: string, params: string) => {
  const paramsObject = params ? `{ ${params.trim()} }` : "Record<never, never>";

  const template = `
import type {
  InferActionArgs,
  InferComponentProps,
  InferHeadersFunction,
  InferLoaderArgs,
} from "@mewhhaha/ruwuter/types";
import * as r from "./${file.replace(tsRegex, ".js")}";

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

import { readdir } from "node:fs/promises";
import path from "node:path/posix";
import {
  extractRouteParams,
  isRouteModuleName,
  splitRouteSegments,
  stripRouteExtension,
  unescapeSegment,
} from "./route-name.ts";
import { bySpecificity } from "./sort.ts";
import type { GeneratedFile } from "./types.ts";

const generatePatternString = (routePath: string): string => {
  const segments = splitRouteSegments(routePath).filter((value) => !value.startsWith("_"));

  if (segments.length === 0) {
    return "/";
  }

  if (segments.length === 1 && segments[0] === "$") {
    return "/*";
  }

  let pattern = "";
  for (const segment of segments) {
    const isOptional = segment.startsWith("(") && segment.endsWith(")");
    const actualSegment = isOptional ? segment.slice(1, -1) : segment;
    const escaped = unescapeSegment(actualSegment);
    const wasEscaped = actualSegment.startsWith("[");

    pattern += "/";
    if (escaped === "$" && !wasEscaped) {
      pattern += "*";
      break;
    } else if (escaped.startsWith("$") && !wasEscaped) {
      let name = escaped.slice(1);
      let optional = isOptional;
      if (name.startsWith("(") && name.endsWith(")")) {
        name = name.slice(1, -1);
        optional = true;
      }
      if (name.length === 0) {
        name = "wild";
      }
      const match = /^([A-Za-z0-9_]+)(.*)$/.exec(name);
      const paramName = match?.[1] ?? "wild";
      const suffix = match?.[2] ?? "";
      pattern += `:${paramName}${suffix}`;
      if (optional) pattern += "?";
    } else {
      if (isOptional) {
        pattern += `(${escaped})?`;
      } else {
        pattern += escaped;
      }
    }
  }

  return pattern;
};

const COMPONENT_SEGMENT = "[A-Z][A-Za-z0-9_$]*\\.html";

type RouteEntry = {
  sourceName: string;
  routeId: string;
  isDirectory: boolean;
};

const isPathlessLayout = (segments: string[]): boolean => {
  const last = segments.at(-1);
  if (!last) return false;
  if (last === "_index") return false;
  return last.startsWith("_");
};

const withAssetPattern = (pattern: string): string => {
  if (pattern === "/") {
    return `(/):__asset(${COMPONENT_SEGMENT})?`;
  }
  if (pattern.endsWith("/*")) {
    return pattern;
  }
  return `${pattern}/:__asset(${COMPONENT_SEGMENT})?`;
};

export const generateRouter = async (
  appFolder: string,
): Promise<GeneratedFile[]> => {
  const routesFolder = path.join(appFolder, "routes");
  const entries = await readdir(routesFolder, { withFileTypes: true });

  const routeEntries: RouteEntry[] = entries
    .filter((entry) => entry.isDirectory() || (entry.isFile() && isRouteModuleName(entry.name)))
    .map((entry) => {
      if (entry.isDirectory()) {
        return { sourceName: entry.name, routeId: entry.name, isDirectory: true };
      }
      return {
        sourceName: entry.name,
        routeId: stripRouteExtension(entry.name),
        isDirectory: false,
      };
    });

  const varName = (routeId: string) => {
    return "$" + routeId.replace(/[^a-zA-Z0-9]/g, "_");
  };

  const routeImports = routeEntries
    .map((entry) => {
      const name = varName(entry.routeId);
      if (entry.isDirectory) {
        return `import * as ${name} from "./routes/${entry.sourceName}/route.tsx";`;
      }
      return `import * as ${name} from "./routes/${entry.sourceName}";`;
    })
    .join("\n");

  const routeData = routeEntries.map((entry) => {
    const routeId = entry.routeId;
    const name = varName(routeId);
    const segments = splitRouteSegments(routeId);
    const pattern = withAssetPattern(generatePatternString(routeId));
    const params = Array.from(extractRouteParams(routeId).paramNames);
    return {
      routeId,
      name,
      pattern,
      params,
      pathless: isPathlessLayout(segments),
    };
  });

  const routes = [...routeData].sort((a, b) => bySpecificity(a.routeId, b.routeId));

  const routable = routes
    .filter(({ pathless }) => !pathless)
    .map(({ routeId, name, pattern }) => {
      return [routeId, name, pattern] as const;
    });

  const routeVars = routes
    .map(({ routeId, name, params }) => {
      if (params.length > 0) {
        return `const $${name} = { id: "${routeId}", mod: ${name}, params: [${
          params
            .map((param: string) => JSON.stringify(param))
            .join(",")
        }] };`;
      }
      return `const $${name} = { id: "${routeId}", mod: ${name} };`;
    })
    .join("\n");

  const routeItems = routable
    .map(([file, name, pattern]) => {
      const fragments = [
        "$document",
        ...routes
          .filter(({ routeId }) => file.startsWith(`${routeId}.`))
          .map(({ name: nestedName }) => `$${nestedName}`)
          .reverse(),
        `$${name}`,
      ];

      return `[new URLPattern({ pathname: ${JSON.stringify(pattern)} }), [${fragments.join(",")}]]`;
    })
    .join(",\n");

  const file = `
import * as document from "./document.tsx";
import { type route } from "@mewhhaha/ruwuter";
${routeImports}
const $document = { id: "", mod: document };
${routeVars}

export const routes: route[] = [${routeItems}];
`;

  const outputPath = path.join(appFolder, "routes.ts");
  return [{ path: outputPath, contents: file }];
};

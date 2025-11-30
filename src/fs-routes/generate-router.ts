import { readdir } from "node:fs/promises";
import path from "node:path/posix";
import { bySpecificity } from "./sort.ts";
import type { GeneratedFile } from "./types.ts";

const unescapedDotRegex = /(?<!\[)\.(?![^[]*\])/g;
const unescapeSegment = (segment: string): string => {
  let result = "";
  for (let index = 0; index < segment.length; index++) {
    const start = segment.indexOf("[", index);
    if (start === -1) {
      result += segment.slice(index);
      break;
    }

    result += segment.slice(index, start);
    const end = segment.indexOf("]", start + 1);
    if (end === -1) {
      result += segment.slice(start);
      break;
    }

    result += segment.slice(start + 1, end);
    index = end;
  }
  return result;
};

const tsRegex = /\.ts(x)?$/;

type ParamInfo = {
  names: string[];
};

const extractRouteParams = (routeName: string): ParamInfo => {
  const paramNames = new Set<string>();
  let wildcard = 0;

  for (const segment of routeName.split(unescapedDotRegex)) {
    const isOptional = segment.startsWith("(") && segment.endsWith(")");
    const actualSegment = isOptional ? segment.slice(1, -1) : segment;
    const escaped = unescapeSegment(actualSegment);

    if (actualSegment.startsWith("[")) continue;

    if (escaped === "$") {
      const name = wildcard.toString();
      paramNames.add(name);
      wildcard++;
      continue;
    }

    if (escaped.startsWith("$")) {
      let name = escaped.slice(1);
      let optional = isOptional;
      if (name.startsWith("(") && name.endsWith(")")) {
        name = name.slice(1, -1);
        optional = true;
      }
      if (name.length === 0) {
        if (!optional) paramNames.add(`${wildcard++}`);
        continue;
      }
      const match = /^([A-Za-z0-9_]+)/.exec(name);
      if (match?.[1]) {
        paramNames.add(match[1]);
      }
    }
  }

  return {
    names: Array.from(paramNames),
  };
};

const generatePatternString = (routePath: string): string => {
  const segments = routePath
    .split(unescapedDotRegex)
    .filter((value) => !value.startsWith("_"));

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

  const files = await readdir(routesFolder);

  const varName = (file: string) => {
    return "$" + file.replace(tsRegex, "").replace(/[^a-zA-Z0-9]/g, "_");
  };

  const routeImports = files
    .map((file) => {
      const isDirectory = !file.endsWith(".tsx");
      const name = varName(file);
      if (isDirectory) {
        return `import * as ${name} from "./routes/${file}/route.tsx";`;
      }
      return `import * as ${name} from "./routes/${file}";`;
    })
    .join("\n");

  const routeData = files.map((file) => {
    const routeId = file.replace(tsRegex, "");
    const name = varName(file);
    const segments = routeId.split(unescapedDotRegex);
    const pattern = withAssetPattern(generatePatternString(routeId));
    const params = extractRouteParams(routeId).names;
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
            .map((param) => JSON.stringify(param))
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

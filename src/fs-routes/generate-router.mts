import { readdir, writeFile } from "node:fs/promises";
import path from "node:path/posix";
import { bySpecificity } from "./sort.mts";

const unescapedDotRegex = /(?<!\[)\.(?![^[]*\])/g;

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

    if (actualSegment === "$") {
      const name = wildcard.toString();
      paramNames.add(name);
      wildcard++;
      continue;
    }

    if (actualSegment.startsWith("$")) {
      let name = actualSegment.slice(1);
      let optional = isOptional;
      if (name.startsWith("(") && name.endsWith(")")) {
        name = name.slice(1, -1);
        optional = true;
      }
      if (name.length === 0) {
        if (!optional) paramNames.add(`${wildcard++}`);
        continue;
      }
      paramNames.add(name);
    }
  }

  return {
    names: Array.from(paramNames),
  };
};

const generatePatternString = (routePath: string): string => {
  const segments = routePath.split(unescapedDotRegex).filter((value) => !value.startsWith("_"));

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

    pattern += "/";
    if (actualSegment === "$") {
      pattern += "*";
      break;
    } else if (actualSegment.startsWith("$")) {
      let name = actualSegment.slice(1);
      let optional = isOptional;
      if (name.startsWith("(") && name.endsWith(")")) {
        name = name.slice(1, -1);
        optional = true;
      }
      if (name.length === 0) {
        name = "wild";
      }
      pattern += `:${name}`;
      if (optional) pattern += "?";
    } else {
      if (isOptional) {
        pattern += `(${actualSegment})?`;
      } else {
        pattern += actualSegment;
      }
    }
  }

  return pattern;
};

const withAssetPattern = (pattern: string): string => {
  if (pattern === "/") {
    return "/:__asset?";
  }
  if (pattern.endsWith("/*")) {
    return pattern;
  }
  return `${pattern}/:__asset?`;
};

export const generateRouter = async (appFolder: string): Promise<void> => {
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
    const pattern = withAssetPattern(generatePatternString(routeId));
    const params = extractRouteParams(routeId).names;
    return {
      routeId,
      name,
      pattern,
      params,
    };
  });

  const routes = routeData
    .map(({ routeId, name, pattern }) => {
      return [routeId, name, pattern] as const;
    })
    .sort(([a], [b]) => bySpecificity(a, b));

  const routeVars = routes
    .map(([routeId, name]) => {
      const data = routeData.find((item) => item.routeId === routeId)!;
      if (data.params.length > 0) {
        return `const $${name} = { id: "${routeId}", mod: ${name}, params: [${data.params
          .map((param) => JSON.stringify(param))
          .join(",")}] };`;
      }
      return `const $${name} = { id: "${routeId}", mod: ${name} };`;
    })
    .join("\n");

  const routeItems = routes
    .filter(([file]) => {
      return routes.every(([suffix]) => {
        return !suffix.startsWith(`${file}.`);
      });
    })
    .map(([file, name, pattern]) => {
      const fragments = [
        "$document",
        ...routes
          .filter(([prefix]) => file.startsWith(`${prefix}.`))
          .map(([, nestedName]) => `$${nestedName}`)
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

  await writeFile(path.join(appFolder, "routes.mts"), file);
};

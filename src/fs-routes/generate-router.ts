import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  isRouteModuleName,
  patternSegments,
  type RouteSegment,
  splitRouteSegments,
  stripRouteExtension,
} from "./route-name.ts";
import { bySpecificity } from "./sort.ts";
import type { GeneratedFile } from "./types.ts";

/**
 * URLPattern pathname metacharacters. Text that is meant to be literal has to
 * be backslash-escaped before it is spliced into the pattern source, otherwise
 * an escaped route literal like `[:]id` would silently become a `:id` group.
 * `.` is deliberately absent: it is an ordinary character to URLPattern.
 */
const PATTERN_META_REGEX = /[\\:*?+(){}]/g;

/** Regex metacharacters, for literals spliced inside a `(...)` regex group. */
const REGEX_META_REGEX = /[\\.*+?^${}()|[\]/]/g;

/**
 * A suffix whose first character URLPattern would read as part of the preceding
 * `:name`. The param-name grammar already consumes `[A-Za-z0-9_]`, so among
 * ASCII only `$` is left — but URLPattern's identifier table is Unicode, and
 * which code points it covers varies by engine and Unicode version, so every
 * non-ASCII character is treated as a possible identifier character.
 */
const NAME_BOUNDARY_REGEX = /^(?:\$|[\u0080-\u{10FFFF}])/u;

const escapeLiteral = (value: string): string => value.replace(PATTERN_META_REGEX, "\\$&");

const escapeRegexLiteral = (value: string): string => value.replace(REGEX_META_REGEX, "\\$&");

const patternPart = (segment: RouteSegment, _index: number, segments: RouteSegment[]): string => {
  if (segment.kind === "static") {
    // An optional literal compiles to a regex group, so its contents are read
    // by the regex engine rather than by the URLPattern parser.
    if (segment.optional) return `/(${escapeRegexLiteral(segment.value)})?`;
    return `/${escapeLiteral(segment.value)}`;
  }

  const suffix = escapeLiteral(segment.suffix);
  // A wildcard has no name for a suffix to leak into; a `:name` does, and a
  // backslash is never an identifier character, so it ends the name and leaves
  // the suffix as literal text.
  const boundary = NAME_BOUNDARY_REGEX.test(segment.suffix) ? "\\" : "";
  const body = segment.kind === "wildcard" ? `*${suffix}` : `:${segment.name}${boundary}${suffix}`;
  if (!segment.optional) return `/${body}`;
  // `?` binds to whatever directly precedes it, so a suffix has to be grouped
  // with the param for the modifier to cover the whole segment.
  if (suffix === "") return `/${body}?`;
  if (segments.length === 1) return `/{${body}}?`;
  return `{/${body}}?`;
};

/** @internal */
export const generatePatternString = (routePath: string): string => {
  const segments = patternSegments(routePath);

  if (segments.length === 0) {
    return "/";
  }

  return segments.map(patternPart).join("");
};

const canonicalPattern = (pattern: string): string => {
  return pattern.replace(/:([A-Za-z0-9_]+)/g, ":$");
};

const DIRECTORY_ROUTE_FILES = ["route.tsx", "route.ts", "route.mtsx", "route.mts"] as const;

export type DiscoveredRouteEntry = {
  sourceName: string;
  routeId: string;
  isDirectory: boolean;
  entryFile?: string;
};

/** @internal */
export const discoverRouteEntries = async (
  routesFolder: string,
): Promise<DiscoveredRouteEntry[]> => {
  const entries = await readdir(routesFolder, { withFileTypes: true });
  const discovered = await Promise.all(
    entries.map(async (entry): Promise<DiscoveredRouteEntry | undefined> => {
      if (entry.isDirectory()) {
        const children = new Set(await readdir(path.join(routesFolder, entry.name)));
        const entryFile = DIRECTORY_ROUTE_FILES.find((candidate) => children.has(candidate));
        if (!entryFile) return undefined;
        return { sourceName: entry.name, routeId: entry.name, isDirectory: true, entryFile };
      }
      if (entry.isFile() && isRouteModuleName(entry.name)) {
        return {
          sourceName: entry.name,
          routeId: stripRouteExtension(entry.name),
          isDirectory: false,
        };
      }
      return undefined;
    }),
  );
  return discovered
    .filter((entry): entry is DiscoveredRouteEntry => entry !== undefined)
    .sort((a, b) => a.routeId < b.routeId ? -1 : a.routeId > b.routeId ? 1 : 0);
};

const isPathlessLayout = (segments: string[]): boolean => {
  const last = segments.at(-1);
  if (!last) return false;
  if (last === "_index") return false;
  return last.startsWith("_");
};

export const generateRouter = async (
  appFolder: string,
): Promise<GeneratedFile[]> => {
  const routesFolder = path.join(appFolder, "routes");
  const routeEntries = (await discoverRouteEntries(routesFolder)).filter(
    (entry) => !isPathlessLayout(splitRouteSegments(entry.routeId)),
  );

  const varName = (routeId: string) => {
    return "$" + routeId.replace(/[^a-zA-Z0-9]/g, "_");
  };

  const seenIds = new Set<string>();
  const seenSymbols = new Map<string, string>();
  const seenPatterns = new Map<string, string>();

  const routeImports = routeEntries
    .map((entry) => {
      const name = varName(entry.routeId);
      if (seenIds.has(entry.routeId)) {
        throw new Error(`Duplicate route id generated for "${entry.routeId}".`);
      }
      seenIds.add(entry.routeId);

      const previousSymbol = seenSymbols.get(name);
      if (previousSymbol) {
        throw new Error(
          `Generated route symbol collision between "${previousSymbol}" and "${entry.routeId}".`,
        );
      }
      seenSymbols.set(name, entry.routeId);

      if (entry.isDirectory) {
        return `import * as ${name} from ${
          JSON.stringify(`./routes/${entry.sourceName}/${entry.entryFile}`)
        };`;
      }
      return `import * as ${name} from ${JSON.stringify(`./routes/${entry.sourceName}`)};`;
    })
    .join("\n");

  const routeData = routeEntries.map((entry) => {
    const routeId = entry.routeId;
    const name = varName(routeId);
    const pattern = generatePatternString(routeId);
    const canonical = canonicalPattern(pattern);
    const previousPattern = seenPatterns.get(canonical);
    if (previousPattern) {
      throw new Error(
        `Route pattern "${pattern}" is generated by both "${previousPattern}" and "${routeId}".`,
      );
    }
    seenPatterns.set(canonical, routeId);
    return {
      routeId,
      name,
      pattern,
    };
  });

  const routes = [...routeData].sort((a, b) => bySpecificity(a.routeId, b.routeId));

  const items = routes.map(({ pattern, name }) =>
    `  [new URLPattern({ pathname: ${JSON.stringify(pattern)} }), ${name}]`
  );
  const importsBlock = routeImports ? `${routeImports}\n\n` : "";
  const file = `${importsBlock}export const routes = [\n${items.join(",\n")}\n] as const;\n`;
  const outputPath = path.join(appFolder, "routes.ts");
  return [{ path: outputPath, contents: file }];
};

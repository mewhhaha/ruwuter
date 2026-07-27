const ROUTE_MODULE_REGEX = /\.(m)?ts(x)?$/;
const UNESCAPED_DOT_REGEX = /(?<!\[)\.(?![^[]*\])/g;

/**
 * Deliberately narrower than the identifier grammar URLPattern accepts for a
 * group name: URLPattern also allows `$` and Unicode identifier characters, but
 * `$` is this grammar's own param sigil and `[$]` has to stay an escapable
 * literal, so a name stops at the first character outside this set and the rest
 * becomes a literal suffix. A name that would be empty is a wildcard instead.
 *
 * Because this is narrower, a suffix can begin with a character URLPattern
 * *would* read as part of the name; the generator ends the name explicitly so
 * the emitted group name is always the name parsed back out.
 */
const PARAM_NAME_REGEX = /^([A-Za-z_][A-Za-z0-9_]*)?([\s\S]*)$/;

/**
 * A single route segment, parsed once and shared by pattern generation, param
 * extraction and specificity sorting so the three can never drift apart.
 */
export type RouteSegment =
  | { kind: "static"; value: string; optional: boolean }
  | { kind: "param"; name: string; suffix: string; optional: boolean }
  | { kind: "wildcard"; suffix: string; optional: boolean };

/**
 * A group that the generated URLPattern will expose in `match.pathname.groups`.
 */
export type RouteGroup = {
  name: string;
  optional: boolean;
};

export type RouteParamInfo = {
  paramNames: Set<string>;
  optionalParams: Set<string>;
};

export const isRouteModuleName = (name: string): boolean => {
  return ROUTE_MODULE_REGEX.test(name);
};

export const stripRouteExtension = (name: string): string => {
  return name.replace(ROUTE_MODULE_REGEX, "");
};

export const toJsModuleName = (name: string): string => {
  return `${stripRouteExtension(name)}.js`;
};

export const splitRouteSegments = (routeName: string): string[] => {
  return routeName.split(UNESCAPED_DOT_REGEX);
};

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

/**
 * Parses one route segment. The grammar is: an optional `(...)` wrapper, then
 * either a literal (with `[...]` escapes) or `$` followed by an optional param
 * name and a trailing suffix. A `$` without a usable name is a wildcard.
 *
 * @internal
 */
export const parseSegment = (raw: string): RouteSegment => {
  const wrapped = raw.startsWith("(") && raw.endsWith(")") && raw.length >= 2;
  const inner = wrapped ? raw.slice(1, -1) : raw;

  if (!inner.startsWith("$")) {
    return { kind: "static", value: unescapeSegment(inner), optional: wrapped };
  }

  let rest = unescapeSegment(inner.slice(1));
  let optional = wrapped;
  if (rest.startsWith("(") && rest.endsWith(")") && rest.length >= 2) {
    rest = rest.slice(1, -1);
    optional = true;
  }

  const [, name = "", suffix = ""] = PARAM_NAME_REGEX.exec(rest) ?? [];
  if (name === "") return { kind: "wildcard", suffix, optional };
  return { kind: "param", name, suffix, optional };
};

/**
 * The segments that reach the generated URLPattern, in order. Pathless
 * segments never appear in a URL, so they are skipped. A *bare* wildcard
 * swallows the rest of the path — nothing after it could ever match — so it
 * ends the pattern. A wildcard carrying a literal suffix is bounded by that
 * suffix and the segments after it stay reachable.
 *
 * @internal
 */
export const patternSegments = (routeName: string): RouteSegment[] => {
  const parsed: RouteSegment[] = [];
  for (const raw of splitRouteSegments(routeName)) {
    if (raw.startsWith("_")) continue;

    const segment = parseSegment(raw);
    parsed.push(segment);
    if (segment.kind === "wildcard" && segment.suffix === "") break;
  }
  return parsed;
};

/**
 * The URLPattern groups a route produces, named the way URLPattern names them:
 * `$name` params keep their name, while anonymous groups — `*` wildcards and
 * optional literals, which compile to `(literal)?` — take the positional index
 * URLPattern assigns them. This is the single source of truth for param names.
 *
 * @internal
 */
export const routeGroups = (routeName: string): RouteGroup[] => {
  const groups: RouteGroup[] = [];
  let anonymous = 0;

  for (const segment of patternSegments(routeName)) {
    switch (segment.kind) {
      case "param":
        groups.push({ name: segment.name, optional: segment.optional });
        break;
      case "wildcard":
        groups.push({ name: `${anonymous++}`, optional: segment.optional });
        break;
      case "static":
        if (segment.optional) groups.push({ name: `${anonymous++}`, optional: true });
        break;
    }
  }

  return groups;
};

export const extractRouteParams = (routeName: string): RouteParamInfo => {
  const paramNames = new Set<string>();
  const optionalParams = new Set<string>();

  for (const { name, optional } of routeGroups(routeName)) {
    paramNames.add(name);
    if (optional) optionalParams.add(name);
  }

  return { paramNames, optionalParams };
};

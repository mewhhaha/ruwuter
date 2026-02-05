const ROUTE_MODULE_REGEX = /\.(m)?ts(x)?$/;
const UNESCAPED_DOT_REGEX = /(?<!\[)\.(?![^[]*\])/g;

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

export const unescapeSegment = (segment: string): string => {
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

export const extractRouteParams = (routeName: string): RouteParamInfo => {
  const paramNames = new Set<string>();
  const optionalParams = new Set<string>();
  let wildcard = 0;

  for (const segment of splitRouteSegments(routeName)) {
    const isOptional = segment.startsWith("(") && segment.endsWith(")");
    const actualSegment = isOptional ? segment.slice(1, -1) : segment;
    const escaped = unescapeSegment(actualSegment);

    if (actualSegment.startsWith("[")) continue;

    if (escaped === "$") {
      const name = wildcard.toString();
      wildcard++;
      paramNames.add(name);
      if (isOptional) optionalParams.add(name);
      continue;
    }

    if (!escaped.startsWith("$")) {
      continue;
    }

    let name = escaped.slice(1);
    let optional = isOptional;
    if (name.startsWith("(") && name.endsWith(")")) {
      name = name.slice(1, -1);
      optional = true;
    }

    if (name.length === 0) {
      const generated = wildcard.toString();
      wildcard++;
      paramNames.add(generated);
      if (optional) optionalParams.add(generated);
      continue;
    }

    const match = /^([A-Za-z0-9_]+)/.exec(name);
    if (!match?.[1]) continue;
    const paramName = match[1];
    paramNames.add(paramName);
    if (optional) optionalParams.add(paramName);
  }

  return { paramNames, optionalParams };
};

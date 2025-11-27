const segments = (a: string) => a.split(unescapedDotRegex);

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

type SegmentInfo = {
  weight: number;
  optional: boolean;
};

const segmentInfo = (raw: string): SegmentInfo => {
  const optional = raw.startsWith("(") && raw.endsWith(")");
  const actual = optional ? raw.slice(1, -1) : raw;
  const escaped = unescapeSegment(actual);
  const wasEscaped = actual.startsWith("[");

  if (!wasEscaped && escaped.startsWith("$")) {
    const rest = escaped.slice(1);
    const match = /^([A-Za-z0-9_]*)(.*)$/.exec(rest);
    const suffix = match?.[2] ?? "";
    const hasSuffix = suffix.length > 0;
    return { weight: hasSuffix ? 2 : 1, optional };
  }

  return { weight: 3, optional };
};

/**
 * Sorts routes by specificity for proper route matching order.
 * More specific routes (with fewer parameters) come before less specific ones.
 *
 * @param a - First route path to compare
 * @param b - Second route path to compare
 * @returns Negative if a is more specific, positive if b is more specific, 0 if equal
 * @internal
 */
export const bySpecificity = (a: string, b: string): number => {
  const aCatchAll = a.endsWith(".$");
  const bCatchAll = b.endsWith(".$");
  if (aCatchAll !== bCatchAll) {
    return aCatchAll ? 1 : -1;
  }
  const aSegments = segments(a);
  const bSegments = segments(b);
  if (aSegments.length === bSegments.length) {
    if (a.endsWith(".$")) {
      return 1;
    }

    if (b.endsWith(".$")) {
      return -1;
    }

    for (let i = 0; i < aSegments.length; i++) {
      const aInfo = segmentInfo(aSegments[i]);
      const bInfo = segmentInfo(bSegments[i]);
      if (aInfo.weight === bInfo.weight && aInfo.optional === bInfo.optional) {
        continue;
      }

      if (aInfo.weight !== bInfo.weight) {
        return bInfo.weight - aInfo.weight;
      }

      if (aInfo.optional !== bInfo.optional) {
        return aInfo.optional ? 1 : -1;
      }
    }

    return 0;
  }

  return bSegments.length - aSegments.length;
};

const unescapedDotRegex = /(?<!\[)\.(?![^[]*\])/g;

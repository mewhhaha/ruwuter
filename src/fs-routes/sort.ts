import { parseSegment, splitRouteSegments } from "./route-name.ts";

const segments = (a: string) => splitRouteSegments(a);

type SegmentInfo = {
  weight: number;
  optional: boolean;
};

/** Literals beat suffixed dynamic segments, which beat bare dynamic segments. */
const segmentInfo = (raw: string): SegmentInfo => {
  const segment = parseSegment(raw);
  if (segment.kind === "static") return { weight: 3, optional: segment.optional };
  return { weight: segment.suffix.length > 0 ? 2 : 1, optional: segment.optional };
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

    return a.localeCompare(b);
  }

  return bSegments.length - aSegments.length;
};

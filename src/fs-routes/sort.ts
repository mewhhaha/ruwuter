import { patternSegments, type RouteSegment } from "./route-name.ts";

const isBareWildcard = (segment: RouteSegment | undefined): boolean =>
  segment?.kind === "wildcard" && segment.suffix === "";

/** Literals beat suffixed dynamic segments, which beat bare dynamic segments. */
const segmentWeight = (segment: RouteSegment): number => {
  if (segment.kind === "static") return 3;
  return segment.suffix.length > 0 ? 2 : 1;
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
  const aSegments = patternSegments(a);
  const bSegments = patternSegments(b);
  const aCatchAll = isBareWildcard(aSegments.at(-1));
  const bCatchAll = isBareWildcard(bSegments.at(-1));
  if (aCatchAll !== bCatchAll) {
    return aCatchAll ? 1 : -1;
  }
  if (aSegments.length === bSegments.length) {
    for (let i = 0; i < aSegments.length; i++) {
      const aSeg = aSegments[i];
      const bSeg = bSegments[i];
      const aWeight = segmentWeight(aSeg);
      const bWeight = segmentWeight(bSeg);
      if (aWeight !== bWeight) {
        return bWeight - aWeight;
      }

      if (aSeg.optional !== bSeg.optional) {
        return aSeg.optional ? 1 : -1;
      }
    }

    return a < b ? -1 : a > b ? 1 : 0;
  }

  return bSegments.length - aSegments.length;
};

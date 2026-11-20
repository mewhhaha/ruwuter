import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { extractRouteParams } from "../src/fs-routes/route-name.ts";
import { generatePatternString } from "../src/fs-routes/generate-router.ts";

type GroupCase = {
  routeId: string;
  /** A path the route id is meant to serve, exercising every optional group. */
  serves: string;
  /** The group keys URLPattern must report for `serves`. */
  groups: string[];
  /** Paths the pattern must not match. */
  rejects?: string[];
};

/**
 * The invariant under test is about the *real* URLPattern, not about generated
 * strings: the group keys `new URLPattern({ pathname })` reports have to be
 * exactly the params `extractRouteParams` reports, and the pattern has to match
 * the URL the route id exists to serve.
 */
const groupCases: GroupCase[] = [
  { routeId: "items.($id[.pdf])", serves: "/items", groups: ["id"] },
  { routeId: "items.($id[.pdf])", serves: "/items/42.pdf", groups: ["id"] },
  { routeId: "($id[.pdf])", serves: "/", groups: ["id"] },
  // A suffixed wildcard is bounded by its suffix, so later segments stay reachable.
  { routeId: "$-b.c", serves: "/x-b/c", groups: ["0"], rejects: ["/x-b"] },
  { routeId: "a.$1x.b", serves: "/a/v1x/b", groups: ["0"], rejects: ["/a/v1x"] },
  // Bracket-escaped literals are literal, whatever URLPattern syntax they contain.
  { routeId: "[:]id", serves: "/:id", groups: [], rejects: ["/anything"] },
  { routeId: "[*]", serves: "/*", groups: [], rejects: ["/anything"] },
  { routeId: "[(]a[)]", serves: "/(a)", groups: [], rejects: ["/a"] },
  { routeId: "a.[?]b", serves: "/a/?b", groups: [], rejects: ["/a/b"] },
  { routeId: "a.[+]b", serves: "/a/+b", groups: [], rejects: ["/a/b"] },
  { routeId: "a.b[(]c[)]", serves: "/a/b(c)", groups: [], rejects: ["/a/b"] },
  // `$` is an identifier character to URLPattern, so a suffix starting with one
  // would be read back as part of the group name unless the pattern ends the
  // name explicitly. The param keeps its declared name and the `$` stays literal.
  { routeId: "a.$id$x", serves: "/a/value$x", groups: ["id"], rejects: ["/a/value"] },
  { routeId: "a.$id[$]", serves: "/a/value$", groups: ["id"], rejects: ["/a/value"] },
  { routeId: "a.$(id$x)", serves: "/a/value$x", groups: ["id"] },
  // Same hazard for every non-ASCII identifier character, not just `$`.
  { routeId: "a.$idé", serves: "/a/valueé", groups: ["id"], rejects: ["/a/value"] },
  // A wildcard has no name to absorb into, so its suffix needs no boundary.
  { routeId: "a.$$x", serves: "/a/value$x", groups: ["0"], rejects: ["/a/value"] },
  // A `$` in a literal segment is already literal: nothing precedes it to absorb it.
  { routeId: "a.[$]b", serves: "/a/$b", groups: [], rejects: ["/a/b"] },
  // Ordinary route ids keep behaving exactly as before.
  { routeId: "a.$", serves: "/a/rest/more", groups: ["0"] },
  { routeId: "a.$id", serves: "/a/value", groups: ["id"] },
  { routeId: "a.$(id-x)", serves: "/a/value-x", groups: ["id"] },
  { routeId: "(a).$id", serves: "/a/value", groups: ["0", "id"] },
  { routeId: "a.$id.b", serves: "/a/value/b", groups: ["id"] },
];

const sorted = (values: Iterable<string>) => Array.from(values).sort();

describe("generated URLPattern groups", () => {
  for (const { routeId, serves, groups, rejects = [] } of groupCases) {
    it(`matches "${serves}" and reports ${JSON.stringify(groups)} for "${routeId}"`, () => {
      const pathname = generatePatternString(routeId);
      const pattern = new URLPattern({ pathname });

      const match = pattern.exec({ pathname: serves });
      if (!match) {
        throw new Error(`Pattern "${pathname}" does not match "${serves}"`);
      }

      expect(sorted(Object.keys(match.pathname.groups))).toEqual(sorted(groups));
      expect(sorted(extractRouteParams(routeId).paramNames)).toEqual(sorted(groups));

      for (const rejected of rejects) {
        if (pattern.exec({ pathname: rejected })) {
          throw new Error(`Pattern "${pathname}" must not match "${rejected}"`);
        }
      }
    });
  }
});

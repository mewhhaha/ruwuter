import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { extractRouteParams, parseSegment } from "../src/fs-routes/route-name.ts";
import { generatePatternString } from "../src/fs-routes/generate-router.ts";

type PatternCase = {
  routeId: string;
  pattern: string;
  /** A path that exercises every group in the pattern, optional ones included. */
  sample: string;
  params: string[];
};

/**
 * The invariant: for every route id, the group names URLPattern reports equal
 * the param names `extractRouteParams` reports. The samples make every optional
 * group participate so the reported groups are the complete set.
 */
const patternCases: PatternCase[] = [
  { routeId: "a.$-b", pattern: "/a/*-b", sample: "/a/value-b", params: ["0"] },
  { routeId: "a.$()", pattern: "/a/*?", sample: "/a/value", params: ["0"] },
  { routeId: "a.$", pattern: "/a/*", sample: "/a/value", params: ["0"] },
  { routeId: "a.$id", pattern: "/a/:id", sample: "/a/value", params: ["id"] },
  {
    routeId: "a.$id-suffix",
    pattern: "/a/:id-suffix",
    sample: "/a/value-suffix",
    params: ["id"],
  },
  { routeId: "(a).$id", pattern: "/(a)?/:id", sample: "/a/value", params: ["0", "id"] },
  { routeId: "[$literal]", pattern: "/$literal", sample: "/$literal", params: [] },
  { routeId: "$", pattern: "/*", sample: "/value", params: ["0"] },
  { routeId: "_index", pattern: "/", sample: "/", params: [] },
  { routeId: "a.b", pattern: "/a/b", sample: "/a/b", params: [] },
  { routeId: "(a).b", pattern: "/(a)?/b", sample: "/a/b", params: ["0"] },
  { routeId: "[$].b", pattern: "/$/b", sample: "/$/b", params: [] },
  { routeId: "a.$id.b", pattern: "/a/:id/b", sample: "/a/value/b", params: ["id"] },
  { routeId: "a.$id.$", pattern: "/a/:id/*", sample: "/a/value/rest", params: ["0", "id"] },
  { routeId: "(a).$", pattern: "/(a)?/*", sample: "/a/rest", params: ["0", "1"] },
  { routeId: "a.$.$id", pattern: "/a/*", sample: "/a/rest/more", params: ["0"] },
  {
    routeId: "reports.$id[.pdf]",
    pattern: "/reports/:id.pdf",
    sample: "/reports/value.pdf",
    params: ["id"],
  },
  { routeId: "sitemap[.]xml", pattern: "/sitemap.xml", sample: "/sitemap.xml", params: [] },
  { routeId: "_app.$id", pattern: "/:id", sample: "/value", params: ["id"] },
];

const sorted = (values: Iterable<string>) => Array.from(values).sort();

describe("route segment parsing", () => {
  for (const { routeId, pattern, sample, params } of patternCases) {
    it(`keeps pattern groups and extracted params in sync for "${routeId}"`, () => {
      expect(generatePatternString(routeId)).toBe(pattern);

      const match = new URLPattern({ pathname: pattern }).exec({ pathname: sample });
      if (!match) throw new Error(`Sample "${sample}" does not match pattern "${pattern}"`);

      const groups = sorted(Object.keys(match.pathname.groups));
      const extracted = sorted(extractRouteParams(routeId).paramNames);

      expect(groups).toEqual(params);
      expect(extracted).toEqual(params);
    });
  }

  it("classifies segments through a single grammar", () => {
    expect(parseSegment("a")).toEqual({ kind: "static", value: "a", optional: false });
    expect(parseSegment("(a)")).toEqual({ kind: "static", value: "a", optional: true });
    expect(parseSegment("[$]")).toEqual({ kind: "static", value: "$", optional: false });
    expect(parseSegment("$id")).toEqual({
      kind: "param",
      name: "id",
      suffix: "",
      optional: false,
    });
    expect(parseSegment("$id[.pdf]")).toEqual({
      kind: "param",
      name: "id",
      suffix: ".pdf",
      optional: false,
    });
    expect(parseSegment("$(id)")).toEqual({
      kind: "param",
      name: "id",
      suffix: "",
      optional: true,
    });
    expect(parseSegment("$")).toEqual({ kind: "wildcard", suffix: "", optional: false });
    expect(parseSegment("$-b")).toEqual({ kind: "wildcard", suffix: "-b", optional: false });
    expect(parseSegment("$()")).toEqual({ kind: "wildcard", suffix: "", optional: true });
  });

  it("marks optional segments as optional params", () => {
    expect(sorted(extractRouteParams("a.$(id)").optionalParams)).toEqual(["id"]);
    expect(sorted(extractRouteParams("(a).$id").optionalParams)).toEqual(["0"]);
    expect(sorted(extractRouteParams("a.$()").optionalParams)).toEqual(["0"]);
  });

  it("never emits a URLPattern group name URLPattern cannot parse", () => {
    // `:1x` is rejected by URLPattern, so a digit-leading name is a wildcard.
    expect(parseSegment("$1x")).toEqual({ kind: "wildcard", suffix: "1x", optional: false });
    expect(generatePatternString("a.$1x")).toBe("/a/*1x");
    expect(sorted(extractRouteParams("a.$1x").paramNames)).toEqual(["0"]);
  });
});

// Minimal Vitest-like shim for Deno's built-in test runner.
// Provides describe/it/expect APIs used by this repo's tests.

import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const nameStack: string[] = [];

export function describe(name: string, fn: () => void) {
  nameStack.push(name);
  try {
    fn();
  } finally {
    nameStack.pop();
  }
}

export function it(name: string, fn: () => any | Promise<any>) {
  const fullName = [...nameStack, name].join(" > ");
  Deno.test(fullName, async () => {
    await fn();
  });
}

type ExpectObj<T> = {
  toBe: (exp: T) => void;
  toEqual: (exp: T) => void;
  toContain: (needle: string) => void;
  toMatch: (re: RegExp) => void;
  toBeGreaterThan: (n: number) => void;
  toBeGreaterThanOrEqual: (n: number) => void;
  toBeLessThan: (n: number) => void;
  toBeLessThanOrEqual: (n: number) => void;
  not: {
    toContain: (needle: string) => void;
    toMatch: (re: RegExp) => void;
  };
};

export function expect<T>(val: T): ExpectObj<T> {
  return {
    toBe(exp: T) {
      assertEquals(val as any, exp as any);
    },
    toEqual(exp: T) {
      assertEquals(val as any, exp as any);
    },
    toContain(needle: string) {
      assertStringIncludes(String(val), needle);
    },
    toMatch(re: RegExp) {
      assertMatch(String(val), re);
    },
    toBeGreaterThan(n: number) {
      assert((val as unknown as number) > n);
    },
    toBeGreaterThanOrEqual(n: number) {
      assert((val as unknown as number) >= n);
    },
    toBeLessThan(n: number) {
      assert((val as unknown as number) < n);
    },
    toBeLessThanOrEqual(n: number) {
      assert((val as unknown as number) <= n);
    },
    not: {
      toContain(needle: string) {
        try {
          assertStringIncludes(String(val), needle);
          throw new Error("Expected string not to contain needle");
        } catch (e: unknown) {
          const msg = (e as any)?.message ?? "";
          if (!String(msg).includes("to include")) throw e;
        }
      },
      toMatch(re: RegExp) {
        try {
          assertMatch(String(val), re);
          throw new Error("Expected string not to match regex");
        } catch (e: unknown) {
          const msg = (e as any)?.message ?? "";
          if (!String(msg).includes("to match")) throw e;
        }
      },
    },
  } as ExpectObj<T>;
}

// Minimal Vitest-like shim for Deno's built-in test runner.
// Provides describe/it/expect APIs used by this repo's tests.

import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "@std/assert";

const nameStack: string[] = [];

export function describe(name: string, fn: () => void) {
  nameStack.push(name);
  try {
    fn();
  } finally {
    nameStack.pop();
  }
}

type TestOptions = {
  permissions?: Deno.PermissionOptionsObject;
};

export function it(name: string, fn: () => unknown | Promise<unknown>): void;
export function it(
  name: string,
  options: TestOptions,
  fn: () => unknown | Promise<unknown>,
): void;
export function it(
  name: string,
  optionsOrFn: TestOptions | (() => unknown | Promise<unknown>),
  maybeFn?: () => unknown | Promise<unknown>,
) {
  const fullName = [...nameStack, name].join(" > ");
  const fn = typeof optionsOrFn === "function" ? optionsOrFn : maybeFn;
  if (!fn) throw new Error("Test function is required");
  const options = typeof optionsOrFn === "function" ? undefined : optionsOrFn;
  Deno.test(
    {
      name: fullName,
      permissions: options?.permissions,
    },
    async () => {
      await fn();
    },
  );
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
      assertEquals(val, exp);
    },
    toEqual(exp: T) {
      assertEquals(val, exp);
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
        if (String(val).includes(needle)) {
          throw new Error("Expected string not to contain needle");
        }
      },
      toMatch(re: RegExp) {
        if (re.test(String(val))) {
          throw new Error("Expected string not to match regex");
        }
      },
    },
  } as ExpectObj<T>;
}

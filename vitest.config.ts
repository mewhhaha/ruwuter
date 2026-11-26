import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "@mewhhaha/ruwuter",
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          include: ["test-dom/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["test-browser/**/*.test.{ts,tsx}"],
          testTimeout: 60_000,
        },
      },
    ],
  },
});

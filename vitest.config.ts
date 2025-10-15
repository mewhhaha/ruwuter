import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { defineConfig } from "vitest/config";

// If running under Deno's npm shim, prefer a plain jsdom environment to avoid
// spawning Miniflare processes (which can fail with os error 6 on Windows).
const isDenoRuntime = typeof (globalThis as any).Deno !== "undefined";

export default isDenoRuntime
  ? defineConfig({
      test: {
        environment: "jsdom",
        include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
        reporters: ["default"],
      },
    })
  : defineWorkersConfig({
      test: {
        pool: "@cloudflare/vitest-pool-workers",
        include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
        reporters: ["default"],
        poolOptions: {
          workers: {
            miniflare: {
              compatibilityDate: "2024-01-01",
            },
          },
        },
      },
    });

import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
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

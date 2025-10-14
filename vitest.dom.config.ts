import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test-dom/**/*.test.ts", "test-dom/**/*.test.tsx"],
    setupFiles: ["test-dom/setup.ts"],
    reporters: ["default"],
  },
});

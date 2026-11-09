// Canonical Hivemind Vitest config.
// - CI runs `vitest run` (non-watch); coverage via @vitest/coverage-v8.
// - tests/ mirrors harnesses/ (see guides/10-vitest-discipline.md).
// - ESM: note the .js-less import here is fine because this is a config file
//   resolved by Vitest, not by Node16 relative resolution.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Match the mirrored layout: tests/<harness>/**/*.test.ts
    include: ["tests/**/*.test.ts"],
    // No real network in unit tests - mock the Deep Lake client instead.
    environment: "node",
    // Keep tests order-independent; restore mocks between tests.
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Chase coverage on the load-bearing paths: the Deep Lake client retry
      // branches, the schema healing diff, and the MCP error paths.
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "dist/**", "bundle/**"],
    },
  },
});

import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.{contract,integration,e2e}.test.ts"],
    testTimeout: 5_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["cloud/src/**/*.ts"],
      exclude: [
        "cloud/src/testing/**",
        "tests/**",
        ...coverageConfigDefaults.exclude,
      ],
    },
  },
});

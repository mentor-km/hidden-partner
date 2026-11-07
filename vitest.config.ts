import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/**/*.test.ts", "apps/server/**/*.test.ts"],
        },
      },
      "apps/web/vitest.config.ts",
    ],
  },
});

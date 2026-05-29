import path from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "#imports": path.resolve(__dirname, "tests/nuxtImportsStub.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          environment: "node",
          exclude: ["tests/**/*.dom.test.ts"],
          include: ["tests/**/*.test.ts"],
          name: "unit",
        },
      },
      {
        extends: true,
        test: {
          environment: "happy-dom",
          include: ["tests/**/*.dom.test.ts"],
          name: "dom",
        },
      },
    ],
  },
});

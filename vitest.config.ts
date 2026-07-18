import path from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "#imports": path.resolve(__dirname, "tests/nuxtImportsStub.ts"),
      "#transport-clock/plugins": path.resolve(
        __dirname,
        "tests/pluginRegistryStub.ts",
      ),
      "#transport-clock/plugin-server-registry": path.resolve(
        __dirname,
        "tests/pluginServerRegistryStub.ts",
      ),
      "#transport-clock/plugin-server": path.resolve(
        __dirname,
        "server/services/pluginHost.ts",
      ),
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

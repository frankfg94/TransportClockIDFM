import path from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "#imports": path.resolve(projectRoot, "tests/nuxtImportsStub.ts"),
      "#transport-clock/plugins": path.resolve(
        projectRoot,
        "tests/pluginRegistryStub.ts",
      ),
      "#transport-clock/plugin-server-registry": path.resolve(
        projectRoot,
        "tests/pluginServerRegistryStub.ts",
      ),
      "#transport-clock/plugin-server": path.resolve(
        projectRoot,
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

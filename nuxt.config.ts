import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  compatibilityDate: "2026-05-17",
  css: [
    "@vue-flow/core/dist/style.css",
    "@vue-flow/controls/dist/style.css",
    "~/src/styles.css",
  ],
  devtools: { enabled: false },
  nitro: {
    preset: process.env.NODE_ENV === "production" ? "cloudflare-pages" : undefined,
  },
  ssr: false,
  experimental: {
    appManifest: false,
    checkOutdatedBuildInterval: false,
  },
  runtimeConfig: {
    idfmApiKey: process.env.IDFM_API_KEY ?? "",
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
  vite: {
    optimizeDeps: {
      exclude: ["lucide-vue-next"],
    },
    server: {
      watch: {
        ignored: ["**/dist/**", "**/.nuxt/**"],
      },
    },
    define: {
      __IDFM_API_KEY_CONFIGURED__: JSON.stringify(
        Boolean(
          (process.env.NUXT_IDFM_API_KEY ?? process.env.IDFM_API_KEY)?.trim(),
        ),
      ),
    },
  },
} as Parameters<typeof defineNuxtConfig>[0] & Record<string, unknown>);

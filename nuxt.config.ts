import { defineNuxtConfig } from "nuxt/config";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";
const serverApiBaseUrl = process.env.NUXT_PUBLIC_API_BASE_URL ?? "";
const mobileReleasePublicBaseUrl =
  process.env.NUXT_PUBLIC_MOBILE_RELEASE_BASE_URL ?? "";
const appSourceRevision =
  process.env.CF_PAGES_COMMIT_SHA ??
  process.env.NUXT_PUBLIC_APP_SOURCE_REVISION ??
  process.env.GITHUB_SHA ??
  "";
const idfmApiKeyConfigured =
  isCapacitorBuild ||
  Boolean(
    (process.env.NUXT_IDFM_API_KEY ?? process.env.IDFM_API_KEY)?.trim(),
  );

if (isCapacitorBuild && !serverApiBaseUrl.trim()) {
  throw new Error(
    "NUXT_PUBLIC_API_BASE_URL est requis pour construire l'application Capacitor.",
  );
}

export default defineNuxtConfig({
  // Keep the native build independent from a concurrently running `nuxt dev`.
  buildDir: isCapacitorBuild ? ".nuxt-capacitor" : undefined,
  compatibilityDate: "2026-05-17",
  css: [
    "~/src/styles.css",
  ],
  devtools: { enabled: false },
  nitro: {
    preset: isCapacitorBuild
      ? "static"
      : process.env.NODE_ENV === "production"
        ? "cloudflare-pages"
        : undefined,
    output: isCapacitorBuild
      ? {
          publicDir: "dist/capacitor",
        }
      : undefined,
  },
  routeRules: {
    // The Capacitor WebView is a different origin from the deployed Nuxt API.
    "/api/**": {
      cors: true,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
        "access-control-allow-headers": "Content-Type, Authorization",
      },
    },
  },
  ssr: false,
  experimental: {
    appManifest: false,
    checkOutdatedBuildInterval: false,
    // A native WebView ships all its assets in the APK; it does not need Nuxt
    // to fetch route payloads from the Capacitor localhost origin.
    payloadExtraction: false,
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
        ignored: ["**/dist/**", "**/.nuxt/**", "**/.nuxt-capacitor/**"],
      },
    },
    define: {
      __IDFM_API_KEY_CONFIGURED__: JSON.stringify(idfmApiKeyConfigured),
      __SERVER_API_BASE_URL__: JSON.stringify(serverApiBaseUrl),
      __MOBILE_RELEASE_PUBLIC_BASE_URL__: JSON.stringify(mobileReleasePublicBaseUrl),
      __APP_SOURCE_REVISION__: JSON.stringify(appSourceRevision),
    },
  },
} as Parameters<typeof defineNuxtConfig>[0] & Record<string, unknown>);

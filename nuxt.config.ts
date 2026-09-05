import { resolve } from "node:path";
import { defineNuxtConfig } from "nuxt/config";
import { resolveUnlimitedNetwork } from "./config/networkPolicy";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";
const committedGtfsDir = resolve(process.cwd(), ".data/gtfs");
const configuredNeighborhoodVerdictDataPath =
  process.env.NUXT_NEIGHBORHOOD_VERDICT_DATA_PATH?.trim() ||
  (process.env.NEIGHBORHOOD_VERDICT_DATA_DIR?.trim()
    ? resolve(process.cwd(), process.env.NEIGHBORHOOD_VERDICT_DATA_DIR.trim(), "compiled.json")
    : "");
const neighborhoodVerdictDataPath = resolve(
  process.cwd(),
  configuredNeighborhoodVerdictDataPath ||
    "../idfm-node-backend/.data/neighborhood-verdict/compiled.json",
);
const serverApiBaseUrl = process.env.NUXT_PUBLIC_API_BASE_URL ?? "";
const mobileReleasePublicBaseUrl = process.env.NUXT_PUBLIC_MOBILE_RELEASE_BASE_URL ?? "";
const appSourceRevision =
  process.env.CF_PAGES_COMMIT_SHA ??
  process.env.NUXT_PUBLIC_APP_SOURCE_REVISION ??
  process.env.GITHUB_SHA ??
  "";
const idfmApiKeyConfigured =
  isCapacitorBuild ||
  [
    process.env.NUXT_IDFM_API_KEY,
    process.env.IDFM_API_KEY,
    process.env.NUXT_IDFM_DATASET_KEY,
    process.env.IDFM_DATASET_KEY,
  ].some((value) => Boolean(value?.trim()));
const disallowPlugins = ["1", "true", "yes", "on"].includes(
  (process.env.DISALLOW_PLUGINS ?? "").trim().toLowerCase(),
);
const enabledPluginPackages = (process.env.ENABLED_PLUGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (isCapacitorBuild && !serverApiBaseUrl.trim()) {
  throw new Error("NUXT_PUBLIC_API_BASE_URL est requis pour construire l'application Capacitor.");
}

export default defineNuxtConfig({
  modules: [
    [
      "@transport-clock/nuxt-plugin-host",
      {
        disallow: disallowPlugins,
        plugins: enabledPluginPackages,
      },
    ],
  ],
  app: {
    head: {
      link: [
        { rel: "preconnect", href: "https://a.basemaps.cartocdn.com", crossorigin: "anonymous" },
        { rel: "preconnect", href: "https://b.basemaps.cartocdn.com", crossorigin: "anonymous" },
        { rel: "preconnect", href: "https://c.basemaps.cartocdn.com", crossorigin: "anonymous" },
      ],
    },
  },
  // Keep the native build independent from a concurrently running `nuxt dev`.
  buildDir: isCapacitorBuild ? ".nuxt-capacitor" : undefined,
  compatibilityDate: "2026-05-17",
  css: ["@fontsource-variable/atkinson-hyperlegible-next/wght.css", "~/src/styles.css"],
  devtools: { enabled: false },
  // Nitro source maps are expensive to generate on Windows and are not used by
  // this SPA during local development. Keep client source maps unchanged.
  sourcemap: { server: false },
  // Generated GTFS data can contain tens of thousands of files and must not be
  // traversed by Nuxt's project watcher during development.
  ignore: [".data"],
  nitro: {
    preset: isCapacitorBuild
      ? "static"
      : process.env.NODE_ENV === "production"
        ? "cloudflare-pages"
        : undefined,
    publicAssets: [
      {
        dir: committedGtfsDir,
        baseURL: "/_gtfs-data",
        fallthrough: false,
        maxAge: 0,
      },
    ],
    output: isCapacitorBuild
      ? {
          publicDir: "dist/capacitor",
        }
      : undefined,
    storage:
      process.env.NODE_ENV === "production"
        ? {}
        : {
            lineGeometry: { driver: "fs", base: "./.data/line-geometry" },
            gtfs: { driver: "fs", base: "./.data/gtfs" },
            traffic: { driver: "fs", base: "./.data/traffic" },
          },
  },
  routeRules: {
    "/api/**": { cors: true },
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
    // idfm-node-backend generates this artifact; Nitro reads it locally and
    // calculates the request-specific verdict without a second HTTP server.
    neighborhoodVerdictDataPath,
    public: {
      nextMap: {
        vectorStyleUrl: process.env.NUXT_PUBLIC_NEXT_MAP_STYLE_URL ?? "",
      },
    },
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
  vite: {
    optimizeDeps: {
      // MapLibre resolves its dedicated worker bundle at runtime. Pre-bundling
      // the package makes Vite look for a generated maplibre-gl-worker.mjs
      // that is not present in Nuxt's dependency cache, leaving the vector map
      // blank before the Deck overlay can be mounted.
      exclude: ["lucide-vue-next", "maplibre-gl"],
    },
    server: {
      watch: {
        ignored: [
          "**/dist/**",
          "**/.nuxt/**",
          "**/.nuxt-capacitor/**",
          "**/.unlighthouse/**",
          "**/android/**",
        ],
      },
    },
    define: {
      __UNLIMITED_NETWORK__: JSON.stringify(resolveUnlimitedNetwork(process.env.UNLIMITED_NETWORK, process.env.NODE_ENV === "development" && !isCapacitorBuild)),
      __IDFM_API_KEY_CONFIGURED__: JSON.stringify(idfmApiKeyConfigured),
      __SERVER_API_BASE_URL__: JSON.stringify(serverApiBaseUrl),
      __MOBILE_RELEASE_PUBLIC_BASE_URL__: JSON.stringify(mobileReleasePublicBaseUrl),
      __APP_SOURCE_REVISION__: JSON.stringify(appSourceRevision),
    },
  },
} as Parameters<typeof defineNuxtConfig>[0] & Record<string, unknown>);

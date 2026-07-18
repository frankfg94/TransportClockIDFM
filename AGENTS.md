# Agent Guide

Transport Clock GPT is a Nuxt 3, Vue 3, TypeScript, Nitro, and Capacitor app for IDFM transit boards, line diagrams, traffic alerts, weather context, Home Assistant APIs, and Android APK distribution.

Use this file as the first context stop. Keep it short in future edits: link to detailed docs instead of copying them here.

## Token-Saving Map

Read these first:

- `package.json` for scripts and pinned toolchain.
- `README.md` for setup, IDFM/NeTEx cache, Cloudflare Pages, Capacitor, and Home Assistant basics.
- `nuxt.config.ts` for runtime mode, env defines, Nitro preset, CORS, and Capacitor build behavior.
- `src/types/transit.ts` for shared domain models.
- `src/App.vue` only when changing the dashboard/home workflow; it is large, so prefer `rg` for relevant functions before opening the whole file.
- `pages/line/[transportType]/[lineId].vue` for line schema/map routing.
- `docs/i18n.md`, `src/features/app-settings/README_appSettings.md`, and `src/services/idfmOpenDataTransfers.README.md` before changing UI text, settings, or transfer resolution.

Ignore generated or noisy context unless explicitly needed:

- `node_modules/`, `dist/`, `.nuxt/`, `.nuxt-capacitor/`, `.output/`, `.wrangler/`, `.unlighthouse/`, `reports/`
- `android/app/src/main/assets/public/` when present; it is generated web output copied into Android.
- `*.tsbuildinfo`, `replay_*.log`, screenshots such as `transport-clock*.png`

You must use Graphify whenever a change may affect many files or requires understanding non-obvious dependencies or architectural edits.

## Common Commands

Use Windows command names in this workspace:

- Install: `npm.cmd install`
- Dev server: `npm.cmd run dev`
- Typecheck: `npm.cmd run tsc`
- Tests: `npm.cmd run test`
- Build: `npm.cmd run build`
- Capacitor web build: `npm.cmd run build:capacitor`
- Sync Android: `npm.cmd run capacitor:sync`
- Android APK release build: `npm.cmd run apk:build`
- Android APK publish: `npm.cmd run apk:publish`

There is no lint script currently. Run targeted Vitest files when possible, then broader `npm.cmd run test` for shared behavior.

Live IDFM transfer tests are opt-in. Do not run them unless the user asks and `LIVE_IDFM_TRANSFER_TESTS=1` plus `IDFM_API_KEY` are available.

## Architecture

Entry points:

- `app.vue` mounts `NuxtLayout` and `NuxtPage`.
- `layouts/default.vue` wraps pages with `AppSettingsRuntime` and `AppNavigationMenu`.
- `pages/index.vue` renders `src/App.vue`, the main dashboard.
- `pages/traffic.vue`, `pages/settings.vue`, and `pages/health.vue` delegate to feature pages.
- `pages/line/[transportType]/[lineId].vue` switches between the embedded line schema and detailed map views.

Main client areas:

- `src/components/`: reusable UI pieces such as `TransitBoard`, station selectors, modals, context menu, line badges, and fullscreen panel.
- `src/features/app-settings/`: settings runtime, Settings page, wake lock behavior, defaults, normalization, and typed setting options.
- `src/features/service-pattern/`: departure pattern modal, line-plan layout, transfer bundles, traffic impact overlays, timeline, compact/realistic flow logic.
- `src/features/line-map/`: detailed line map, station sidebar, map data/view model, display controls.
- `src/features/network-ghost/`: ghost network layer and progressive related-line loading.
- `src/features/traffic/`: traffic page, Navitia disruption normalization, timing, scheduled warnings, board alert presentation.
- `src/features/weather/`: Open-Meteo normalization, weather experience, forecast modal, preset locations.
- `src/features/health/`: service health UI and types.
- `src/features/mobile-release/`: APK release card and client.

Server and data:

- `server/api/idfm/[...path].ts` proxies IDFM/Navitia requests server-side with API key handling, simple GET caching, and retry.
- `server/services/idfm/resolveStopArea.ts` reads `NUXT_IDFM_API_KEY` or `IDFM_API_KEY` from Cloudflare env or Node env.
- `src/services/idfm.ts` is the main Navitia/PRIM client and shared transport data service.
- `server/services/topology/netexCache.ts` reads local, HTTP, or private R2 NeTEx cache and adapts it to the UI topology contract.
- `server/api/lines/[lineId]/topology.get.ts` and `server/api/lines/[transportType]/[lineId]/pattern.get.ts` expose topology and pattern views.
- `server/api/transfer-bundles.post.ts` resolves station transfer bundles with backend/runtime caches and strict matching.
- `server/api/opendata/arrets-lignes/records.get.ts` is the same-origin Open Data proxy.
- `server/services/homeAssistant/` backs `/api/ha/v1/*`.
- `server/services/mobileRelease/` and `scripts/mobile-release/` handle Android release discovery, validation, build, and publish.

Storage:

- `src/storage/transitPreferences.ts` persists dashboards, places, board ordering, and custom stations.
- `src/storage/transitAlarms.ts` persists departure alarms.
- `src/features/app-settings/appSettings.ts` persists global UI/runtime settings.

## Project Rules

User-facing text must go through `src/i18n`. Add the same key in `src/i18n/messages/fr.ts` and `src/i18n/messages/en.ts`, then run `npm.cmd run tsc`. See `docs/i18n.md`.

Settings must flow through `useAppSettings()`. For a new setting, update the `AppSettings` interface, defaults, normalization, parsers/options if needed, and the Settings UI/tests. Child components receive props and emit changes; they should not read/write `localStorage` directly. See `src/features/app-settings/README_appSettings.md`.

Do not expose IDFM credentials to the browser or Capacitor bundle. Browser code should use same-origin `/api/*`; native Capacitor API calls should pass through `toServerApiUrl()` so they hit the deployed Nuxt backend.

Transfer resolution must stay data-driven. Do not add station-specific production tables or broad token matching. Prefer exact station names, official compatible names, and conservative nearby resolution. Protect false-positive cases like `Maisons-Laffitte` vs `Maisons-Alfort`. See `src/services/idfmOpenDataTransfers.README.md`.

NeTEx topology is cache-backed. Unknown topology should fail clearly rather than silently falling back to unrelated live network behavior. Keep server topology contracts compatible with `src/types/transit.ts`.

When editing UI, reuse existing CSS tokens and files under `src/styles/`. `src/styles.css` imports numbered layers; put broad rules in the appropriate layer instead of scattering new global CSS. Use `lucide-vue-next` icons where an icon is needed.

## Tests

Vitest has two projects:

- Unit tests: `tests/**/*.test.ts` in Node.
- DOM tests: `tests/**/*.dom.test.ts` in happy-dom.

Useful targeted areas:

- i18n: `tests/i18n.test.ts`, `tests/settingsPage.dom.test.ts`
- Settings: `tests/appSettings.test.ts`, `tests/settingsPage.dom.test.ts`
- Transfers: `tests/transferBundles.test.ts`, `tests/transferBundleEndpoint.test.ts`, `tests/idfmOpenDataTransfers.test.ts`, `tests/rerAOpenDataTransfers.test.ts`, `tests/rerBOpenDataTransfers.test.ts`
- Line patterns/topology: `tests/departurePatternWorkflow.test.ts`, `tests/departurePatternSettings.dom.test.ts`, `tests/topology.test.ts`, `tests/vueflowNetexGraph.test.ts`
- Traffic: `tests/traffic*.test.ts`, `tests/trafficPage.dom.test.ts`, `tests/boardTrafficAlert.test.ts`
- Weather: `tests/weather*.test.ts`, `tests/weather*.dom.test.ts`
- Home Assistant: `tests/homeAssistantApi.test.ts`
- Mobile release: `tests/mobileRelease*.test.ts`, `tests/mobileReleaseCard.dom.test.ts`

When a change touches shared transport models, transfer resolution, topology, or app settings normalization, add or update regression tests close to the affected module.

## Environment

Important env vars:

- `IDFM_API_KEY` or `NUXT_IDFM_API_KEY`: server-side IDFM/PRIM key.
- `IDFM_NETEX_CACHE_LOCAL`: local NeTEx cache path.
- `IDFM_NETEX_CACHE_REMOTE`: remote NeTEx cache, supports private `r2://...`.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: private R2 cache access.
- `NUXT_PUBLIC_API_BASE_URL`: deployed Nuxt API base for Capacitor builds.
- `TRANSPORT_CLOCK_HA_TOKEN`, `TRANSPORT_CLOCK_INSTANCE_ID`: optional Home Assistant API protection/stable identity.
- Mobile release variables are documented in `.env.mobile-release.example` and `docs/mobile-release.md`.

Never commit real `.env*` files, keystores, API keys, or release credentials.

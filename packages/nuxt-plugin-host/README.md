# @transport-clock/nuxt-plugin-host

Build-time plugin host for Nuxt 3 applications. It validates plugin manifests,
registers their client and Nitro contributions, and generates separate client
and server registries.

A package that is absent from the host configuration is never imported. Its
routes, components, styles, assets, dependencies, and source strings therefore
stay out of the build.

## Installation

```sh
npm install @transport-clock/nuxt-plugin-host
npm install --save-optional @transport-clock/my-plugin
```

Register the module and pass package specifiers at build time:

```ts
const disallowPlugins = ["1", "true", "yes", "on"].includes(
  (process.env.DISALLOW_PLUGINS ?? "").trim().toLowerCase(),
);
const enabledPlugins = (process.env.ENABLED_PLUGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export default defineNuxtConfig({
  modules: [
    [
      "@transport-clock/nuxt-plugin-host",
      {
        disallow: disallowPlugins,
        plugins: enabledPlugins,
      },
    ],
  ],
});
```

Typical build configurations:

```dotenv
# Core-only build
ENABLED_PLUGINS=

# Include one or several comma-separated packages
ENABLED_PLUGINS=@transport-clock/my-plugin,@vendor/another-plugin

# Release guard: fail if any package is requested
DISALLOW_PLUGINS=true
```

$DISALLOW_PLUGINS is intentionally stricter than a runtime switch. It protects
a core-only release from accidentally bundling optional code.

## Create a plugin package

A plugin is a normal Nuxt module package with a default server manifest and one
optional client entry. Keep the package boundary strict: do not import private
application files.

```ts
// src/module.ts
import { fileURLToPath } from "node:url";
import {
  defineTransportClockPlugin,
} from "@transport-clock/nuxt-plugin-host/types";

const resolve = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineTransportClockPlugin({
  apiVersion: 1,
  id: "vendor-example",
  version: "1.0.0",
  metadata: {
    author: "Vendor",
    name: { en: "Example", fr: "Exemple" },
    description: {
      en: "An optional example plugin.",
      fr: "Un exemple de plugin optionnel.",
    },
  },
  register(context) {
    context.addClientEntry(resolve("./runtime/client/index.ts"));
    context.addCss(resolve("./runtime/style.css"));
    context.addServerHandler({
      method: "get",
      route: "/api/example",
      handler: resolve("./runtime/server/example.get.ts"),
    });
    context.addHealthCheck(resolve("./runtime/server/healthCheck.ts"));
  },
});
```

The package should expose its module and declare host, Nuxt, and Vue as peer
dependencies:

```json
{
  "name": "@transport-clock/my-plugin",
  "type": "module",
  "exports": { ".": "./src/module.ts" },
  "files": ["src", "README.md"],
  "peerDependencies": {
    "@transport-clock/nuxt-plugin-host": "^1.0.0",
    "nuxt": "^3.20.0",
    "vue": "^3.5.0"
  }
}
```

Use a globally unique ID. Prefix route-specific identifiers, VueFlow node
types, storage keys, and CSS classes with that ID.

## Client entry and plugin card

The client entry exports a $TransportClockClientPlugin:

```ts
// src/runtime/client/index.ts
import { Clock3 } from "lucide-vue-next";
import type {
  TransportClockClientPlugin,
} from "@transport-clock/nuxt-plugin-host/types";
import PluginSettings from "./PluginSettings.vue";

const plugin: TransportClockClientPlugin = {
  apiVersion: 1,
  id: "vendor-example",
  version: "1.0.0",
  defaultEnabled: false,
  metadata: {
    author: "Vendor",
    name: { en: "Example", fr: "Exemple" },
    description: {
      en: "An optional example plugin.",
      fr: "Un exemple de plugin optionnel.",
    },
  },
  presentation: {
    accentColor: "#5136ff",
    icon: Clock3,
    // imageUrl and localized imageAlt can replace the icon.
  },
  settings: {
    component: PluginSettings,
    defaultValue: { refreshSeconds: 30 },
    version: 1,
    normalize(value) {
      const candidate = value as { refreshSeconds?: unknown } | null;
      return {
        refreshSeconds:
          typeof candidate?.refreshSeconds === "number"
            ? candidate.refreshSeconds
            : 30,
      };
    },
  },
};

export default plugin;
```

Illustration priority in the Settings catalog is $imageUrl, then $icon, then
the generic puzzle icon. $imageAlt is required for meaningful images.
$accentColor controls the card accent and toggle.

The settings component receives:

- $modelValue with the plugin-owned JSON value;
- $disabled while the plugin is switched off;
- $locale with $"fr" or $"en";
- an $update:modelValue event to persist changes.

The host keeps settings versioned and JSON-serializable. Increment $version
when their shape changes. $normalize must accept unknown and old values.
$migrateLegacy can claim former application keys when extracting an existing
feature.

Plugins without a settings component do not show the Customize button.
Settings components are mounted only after the user opens the customizer.

## Activation semantics

There are two separate levels:

1. Build inclusion: the package is listed in $plugins/$ENABLED_PLUGINS.
2. Runtime activation: the user toggles the installed plugin in Settings.

Runtime deactivation stops client contributions that consume the plugin's
$active state. Nitro routes and static assets cannot be removed at runtime
because they were selected during the build.

The application can compare the client registry with a backend registry such
as $/api/_transport-clock/plugins. This is useful when a Capacitor client talks
to a separately deployed Nuxt backend. Compatibility requires matching plugin
ID, API version, and plugin version.

## Server capabilities

Server contributions may use only the stable adapter exposed as
$#transport-clock/plugin-server. Add a capability to that adapter only when it
is generic enough for multiple plugins. Relative imports into the host
application would couple the repositories and defeat plugin isolation.

Health checks should return plugin-owned diagnostics without leaking secrets.
Browser and Capacitor code must call same-origin or configured server API
routes; never expose provider credentials in a client entry.

## Local development

Workspaces are convenient while the API and a plugin evolve together:

```json
{
  "workspaces": [
    "packages/nuxt-plugin-host",
    "packages/my-plugin"
  ]
}
```

Run the same checks used for a published package:

```sh
npm run tsc
npm run test
npm run build
```

Then build with the plugin included:

```sh
ENABLED_PLUGINS=@transport-clock/my-plugin npm run build
```

On PowerShell:

```powershell
$env:ENABLED_PLUGINS="@transport-clock/my-plugin"
npm.cmd run build
```

Finally run a guarded core-only build and inspect its output:

```powershell
$env:ENABLED_PLUGINS=""
$env:DISALLOW_PLUGINS="true"
npm.cmd run build
```

The core-only artifact must contain no plugin route, asset, CSS, registry
entry, dependency chunk, or identifying source string.

## Publish or move to another repository

1. Move the plugin directory into its own repository.
2. Keep its public package name and peer dependency on this host.
3. Publish to npm or a private registry.
4. Install the published version as an optional dependency in the app.
5. Configure registry authentication only in CI/deployment secrets.
6. Run typecheck, tests, plugin-enabled build, and guarded core-only build.
7. Publish the host first when a plugin requires a newer API.

Do not commit registry tokens, real $.npmrc files, API keys, or provider
credentials.

## API compatibility

$apiVersion currently equals $1. Optional presentation fields are backward
compatible. A future breaking contract must increment the host API version;
the module rejects mismatched manifests during the build.

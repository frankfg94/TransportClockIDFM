# Transport Clock plugins

Related documentation:

- [standalone host package guide](../packages/nuxt-plugin-host/README.md);
- [realtime vehicle plugin](../packages/realtime-vehicles/README.md);
- [project setup](../README.md).

The plugin host is a Nuxt module. It discovers only the npm packages listed in
ENABLED_PLUGINS and generates separate client and server registries at build
time. A package that is not listed is not imported by Nuxt, Vite, or Nitro.

## Install and activate a plugin

Install the host and the desired private packages with npm:

    npm install @transport-clock/nuxt-plugin-host
    npm install --save-optional @transport-clock/realtime-vehicles

For private npmjs packages, configure the @transport-clock scope and an npm
token in the deployment environment. Do not commit the token or a real .npmrc.

Then set one of these build configurations:

    # Default: plugin-free artifact
    ENABLED_PLUGINS=

    # Realtime vehicle plugin included
    ENABLED_PLUGINS=@transport-clock/realtime-vehicles

    # CI/release guard: fail if any plugin is requested
    DISALLOW_PLUGINS=true

DISALLOW_PLUGINS=true is deliberately stricter than a runtime toggle: a build
fails when ENABLED_PLUGINS is non-empty. This prevents an accidental plugin
bundle in a core-only release.

After inclusion, users can enable or disable each plugin in Settings. This
toggle stops its client contribution and polling. Server routes remain present
because Nitro routes are selected at build time. The Settings card compares
the client manifest with /api/_transport-clock/plugins, which is also useful
for a Capacitor client connected to a separately deployed backend.

## Installed plugin catalog

The Settings page lists only client plugins present in the generated build
registry. It sorts localized titles, searches names, descriptions, authors,
IDs, and versions without case or accent sensitivity, and paginates ten items
per page. Users can persist either the equal-height grid or compact list view.

Each client entry may expose optional presentation data:

    presentation: {
      icon: Clock3,
      imageUrl: undefined,
      imageAlt: { en: "Clock", fr: "Horloge" },
      accentColor: "#5136ff",
    }

The illustration priority is image, component icon, then the generic puzzle
icon. The core must never select an illustration from a plugin ID: the plugin
owns its visual identity so a core-only build keeps no identifying import.

The Customize action mounts the plugin settings component in a modal only when
requested. A disabled plugin keeps its settings visible but disabled in that
modal. Plugins without a settings component do not show the action.

## Create a plugin

Publish a Nuxt module package with:

- a default TransportClockPluginManifest;
- one client entry exporting a TransportClockClientPlugin;
- optional CSS, Nitro handlers, and health checks;
- no direct import from private core files.

The module manifest registers contributions through
TransportClockPluginRegistrationContext: addClientEntry, addCss,
addServerHandler, and addHealthCheck. Client contributions may provide
metadata, localized flat messages, versioned settings, a legacy migration, and
a service-pattern extension. Service-pattern extensions receive only the
stable vertical API: line identity, diagram coordinates, station resolution,
visibility, settings, translations, API URL resolution, and motion state.

Server code imports core capabilities only from
#transport-clock/plugin-server. Add a capability to this adapter only when it
is generic enough to support third-party plugins; do not reach into the core
with relative paths.

Use a globally unique plugin id. Prefix VueFlow node types and node ids with
that id. Keep settings JSON-serializable and increment their version when the
shape changes. The normalizer must accept unknown or old values.

## Local development and extraction to another repository

This repository currently uses npm workspaces under packages/ so both sides
can evolve atomically. The packages already use normal npm package boundaries.
To extract one:

1. move its directory to a dedicated repository;
2. publish it under the same private package name;
3. replace the workspace resolution with the published version;
4. keep the peer dependency on the host API;
5. run both build matrices below.

Required validation:

    # Core-only: no realtime route, CSS, asset, or client entry in output
    npm run build

    # Plugin build
    ENABLED_PLUGINS=@transport-clock/realtime-vehicles npm run build

On PowerShell, set the environment variable before the command or put it in
.env.local. Also run npm run tsc and npm run test.

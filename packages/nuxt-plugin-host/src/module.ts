import path from "node:path";
import {
  addServerHandler,
  addServerTemplate,
  addTemplate,
  defineNuxtModule,
} from "@nuxt/kit";
import {
  TRANSPORT_CLOCK_PLUGIN_API_VERSION,
  type TransportClockPluginManifest,
} from "./types";

export interface TransportClockPluginHostOptions {
  disallow?: boolean;
  plugins?: string[];
}

interface LoadedPlugin {
  clientEntries: string[];
  healthChecks: string[];
  manifest: TransportClockPluginManifest;
}

export default defineNuxtModule<TransportClockPluginHostOptions>({
  meta: {
    name: "@transport-clock/nuxt-plugin-host",
    configKey: "transportClockPlugins",
    compatibility: { nuxt: ">=3.20.0 <4" },
  },
  defaults: { disallow: false, plugins: [] },
  async setup(options, nuxt) {
    const specifiers = [
      ...new Set(options.plugins?.map((value) => value.trim()).filter(Boolean)),
    ];

    if (options.disallow && specifiers.length > 0) {
      throw new Error(
        "DISALLOW_PLUGINS=true interdit les packages listés dans ENABLED_PLUGINS.",
      );
    }

    const loadedPlugins: LoadedPlugin[] = [];
    const ids = new Set<string>();

    if (!options.disallow) {
      for (const specifier of specifiers) {
        let imported: { default?: TransportClockPluginManifest };

        try {
          imported = await import(specifier);
        } catch (error) {
          throw new Error(
            `Impossible de charger le plugin ${specifier}. Vérifiez son installation.`,
            { cause: error },
          );
        }

        const manifest = imported.default;

        if (!manifest || typeof manifest.register !== "function") {
          throw new Error(`Le package ${specifier} n'expose pas de manifeste valide.`);
        }
        if (manifest.apiVersion !== TRANSPORT_CLOCK_PLUGIN_API_VERSION) {
          throw new Error(
            `Le plugin ${manifest.id} utilise l'API ${manifest.apiVersion}; ` +
              `l'hôte attend ${TRANSPORT_CLOCK_PLUGIN_API_VERSION}.`,
          );
        }
        if (ids.has(manifest.id)) {
          throw new Error(`Identifiant de plugin dupliqué: ${manifest.id}.`);
        }

        ids.add(manifest.id);
        const loaded: LoadedPlugin = {
          clientEntries: [],
          healthChecks: [],
          manifest,
        };

        await manifest.register({
          addClientEntry(entryPath) {
            loaded.clientEntries.push(entryPath);
          },
          addCss(cssPath) {
            nuxt.options.css.push(cssPath);
          },
          addHealthCheck(checkPath) {
            loaded.healthChecks.push(checkPath);
          },
          addServerHandler(handler) {
            addServerHandler(handler);
          },
        });
        loadedPlugins.push(loaded);
      }
    }

    const clientEntries = loadedPlugins.flatMap((plugin) => plugin.clientEntries);
    const healthChecks = loadedPlugins.flatMap((plugin) => plugin.healthChecks);
    const clientTemplate = addTemplate({
      filename: "transport-clock/plugins.client.mjs",
      getContents: () => createClientRegistry(clientEntries),
    });
    addServerTemplate({
      filename: "#transport-clock/plugin-server-registry",
      getContents: () => createServerRegistry(loadedPlugins, healthChecks),
    });

    const serverHostPath = path.resolve(
      nuxt.options.rootDir,
      "server/services/pluginHost.ts",
    );

    nuxt.options.alias["#transport-clock/plugins"] = clientTemplate.dst;
    nuxt.options.alias["#transport-clock/plugin-server"] = serverHostPath;
    nuxt.options.nitro.alias ??= {};
    nuxt.options.nitro.alias["#transport-clock/plugin-server"] = serverHostPath;
  },
});

function createClientRegistry(entries: string[]): string {
  const imports = entries.map(
    (entry, index) => `import plugin${index} from ${JSON.stringify(entry)};`,
  );
  const values = entries.map((_entry, index) => `plugin${index}`);

  return [
    ...imports,
    `export const transportClockPlugins = [${values.join(", ")}];`,
    "export default transportClockPlugins;",
  ].join("\n");
}

function createServerRegistry(
  plugins: LoadedPlugin[],
  healthChecks: string[],
): string {
  const imports = healthChecks.map(
    (entry, index) => `import healthCheck${index} from ${JSON.stringify(entry)};`,
  );
  const checks = healthChecks.map((_entry, index) => `healthCheck${index}`);
  const manifests = plugins.map(({ manifest }) => ({
    apiVersion: manifest.apiVersion,
    id: manifest.id,
    version: manifest.version,
  }));

  return [
    ...imports,
    `export const transportClockPluginHealthChecks = [${checks.join(", ")}];`,
    `export const transportClockServerPlugins = ${JSON.stringify(manifests)};`,
  ].join("\n");
}

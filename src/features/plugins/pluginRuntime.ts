import type {
  TransportClockClientPlugin,
  TransportClockLocale,
  TransportClockTranslationParams,
} from "@transport-clock/nuxt-plugin-host/types";
import { transportClockPlugins } from "#transport-clock/plugins";

export function getTransportClockPlugins(): readonly TransportClockClientPlugin[] {
  return transportClockPlugins;
}

export function translatePluginMessage(
  plugin: TransportClockClientPlugin,
  locale: TransportClockLocale,
  key: string,
  params: TransportClockTranslationParams = {},
): string {
  const template =
    plugin.messages?.[locale]?.[key] ??
    plugin.messages?.fr?.[key] ??
    plugin.messages?.en?.[key] ??
    key;

  return template.replace(/\{(\w+)\}/gu, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}

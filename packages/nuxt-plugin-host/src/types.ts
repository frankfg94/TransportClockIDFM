import type { Node, NodeTypesObject } from "@vue-flow/core";
import type { Component, ComputedRef } from "vue";

export const TRANSPORT_CLOCK_PLUGIN_API_VERSION = 1 as const;

export type TransportClockPluginApiVersion = typeof TRANSPORT_CLOCK_PLUGIN_API_VERSION;
export type TransportClockLocale = "en" | "fr";
export type TransportClockTranslationParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface TransportClockLocalizedText {
  en: string;
  fr: string;
}

export interface TransportClockPluginMetadata {
  author: string;
  description: TransportClockLocalizedText;
  homepage?: string;
  name: TransportClockLocalizedText;
}

export interface TransportClockPluginPresentation {
  accentColor?: string;
  icon?: Component;
  imageAlt?: TransportClockLocalizedText;
  imageUrl?: string;
}

export interface TransportClockPluginSettingsMigration {
  claimedKeys?: string[];
  enabled?: boolean;
  value?: unknown;
}

export interface TransportClockPluginSettingsDefinition {
  component?: Component;
  defaultValue: unknown;
  migrateLegacy?: (
    rawSettings: Record<string, unknown>,
  ) => TransportClockPluginSettingsMigration | undefined;
  normalize: (value: unknown) => unknown;
  version: number;
}

export interface TransportClockPatternPoint {
  x: number;
  y: number;
}

export interface TransportClockPatternLine {
  id?: string;
  mode?: string;
  ref?: string;
  shortName?: string;
  transportType?: string;
}

export interface TransportClockPatternExtensionStatus {
  detail?: string;
  id: string;
  label: string;
  state:
    | "error"
    | "idle"
    | "live"
    | "loading"
    | "rate_limited"
    | "stale"
    | "unavailable";
  tooltip?: string;
}

export interface TransportClockPatternExtensionContext {
  active: ComputedRef<boolean>;
  destinationLabel: ComputedRef<string>;
  fallbackVehicleLabel: ComputedRef<string>;
  formatClock: (value: string) => string;
  isSegmentVisible: (sourceId: string, targetId: string) => boolean;
  line: ComputedRef<TransportClockPatternLine | undefined>;
  patternRoundedCurves: ComputedRef<boolean>;
  reduceMotion: ComputedRef<boolean>;
  resolveServerApiUrl: (path: string) => string;
  resolveStationKey: (stationId: string) => string | undefined;
  settings: ComputedRef<unknown>;
  stationPositions: ComputedRef<Map<string, TransportClockPatternPoint>>;
  t: (key: string, params?: TransportClockTranslationParams) => string;
}

export interface TransportClockPatternExtensionInstance {
  nodes: ComputedRef<Node[]>;
  nodeTypes: NodeTypesObject;
  status?: ComputedRef<TransportClockPatternExtensionStatus | undefined>;
}

export interface TransportClockPatternExtensionDefinition {
  setup: (
    context: TransportClockPatternExtensionContext,
  ) => TransportClockPatternExtensionInstance;
}

export interface TransportClockClientPlugin {
  apiVersion: TransportClockPluginApiVersion;
  defaultEnabled: boolean;
  id: string;
  messages?: Record<TransportClockLocale, Record<string, string>>;
  metadata: TransportClockPluginMetadata;
  presentation?: TransportClockPluginPresentation;
  servicePattern?: TransportClockPatternExtensionDefinition;
  settings?: TransportClockPluginSettingsDefinition;
  version: string;
}

export interface TransportClockPluginRegistrationContext {
  addClientEntry: (path: string) => void;
  addCss: (path: string) => void;
  addHealthCheck: (path: string) => void;
  addServerHandler: (handler: {
    handler: string;
    method?:
      | "connect"
      | "delete"
      | "get"
      | "head"
      | "options"
      | "patch"
      | "post"
      | "put"
      | "trace";
    route: string;
  }) => void;
}

export interface TransportClockPluginManifest {
  apiVersion: TransportClockPluginApiVersion;
  id: string;
  metadata: TransportClockPluginMetadata;
  register: (
    context: TransportClockPluginRegistrationContext,
  ) => Promise<void> | void;
  version: string;
}

export function defineTransportClockPlugin(
  manifest: TransportClockPluginManifest,
): TransportClockPluginManifest {
  return manifest;
}

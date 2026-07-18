export type TransportPositionParameterId =
  | "polling"
  | "trackDistance"
  | "speed"
  | "dwell"
  | "acceleration"
  | "reconciliation"
  | "metro13Profile"
  | "crowding"
  | "trafficState"
  | "speedLimits";

type TranslationKey = string;

export type TransportDistancePreference = "auto" | "gtfs" | "geodesic";
export type TransportAccelerationCurve =
  | "minimum_jerk"
  | "trapezoidal"
  | "linear";

export interface TransportPositionParameterSettings {
  polling: {
    enabled: boolean;
    intervalSeconds: number;
  };
  trackDistance: {
    enabled: boolean;
    source: TransportDistancePreference;
    maxProjectionErrorMeters: number;
  };
  speed: {
    enabled: boolean;
    commercialKph: number;
    smoothing: number;
    maxPlausibleKph: number;
    longSegmentMeters: number;
  };
  dwell: {
    enabled: boolean;
    useRealtimeTimes: boolean;
    fallbackSeconds: number;
  };
  acceleration: {
    enabled: boolean;
    curve: TransportAccelerationCurve;
    accelerationShare: number;
  };
  reconciliation: {
    enabled: boolean;
    maxCorrectionSeconds: number;
    snapAfterSegments: number;
  };
  metro13Profile: {
    enabled: boolean;
    useScheduledRuntimes: boolean;
    useProfileTrackDistances: boolean;
    useRollingStockSpeedCap: boolean;
  };
  crowding: { enabled: boolean };
  trafficState: { enabled: boolean };
  speedLimits: { enabled: boolean };
}

export type TransportPositionParameterOptionType =
  | "slider"
  | "number"
  | "select"
  | "checkbox";

export interface TransportPositionParameterOptionDefinition {
  id: string;
  type: TransportPositionParameterOptionType;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  min?: number;
  max?: number;
  step?: number;
  choices?: readonly string[];
}

export interface TransportPositionParameterDefinition {
  id: TransportPositionParameterId;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  availability: "available" | "future";
  options: readonly TransportPositionParameterOptionDefinition[];
}

export interface TransportPositionParameterState
  extends TransportPositionParameterDefinition {
  enabled: boolean;
  runtimeAvailable: boolean;
  value: TransportPositionParameterSettings[TransportPositionParameterId];
}

export const TRANSPORT_POSITION_PARAMETER_DEFINITIONS: readonly TransportPositionParameterDefinition[] = [
  parameter("polling", "available", [
    option("intervalSeconds", "slider", {
      min: 30,
      max: 300,
      step: 15,
    }),
  ]),
  parameter("trackDistance", "available", [
    option("source", "select", { choices: ["auto", "gtfs", "geodesic"] }),
    option("maxProjectionErrorMeters", "number", {
      min: 25,
      max: 1_000,
      step: 25,
    }),
  ]),
  parameter("speed", "available", [
    option("commercialKph", "number", {
      min: 5,
      max: 160,
      step: 1,
    }),
    option("smoothing", "slider", { min: 0, max: 1, step: 0.05 }),
    option("maxPlausibleKph", "number", {
      min: 20,
      max: 350,
      step: 5,
    }),
    option("longSegmentMeters", "number", {
      min: 300,
      max: 5_000,
      step: 100,
    }),
  ]),
  parameter("dwell", "available", [
    option("useRealtimeTimes", "checkbox"),
    option("fallbackSeconds", "number", { min: 0, max: 180, step: 5 }),
  ]),
  parameter("acceleration", "available", [
    option("curve", "select", {
      choices: ["minimum_jerk", "trapezoidal", "linear"],
    }),
    option("accelerationShare", "slider", {
      min: 0.05,
      max: 0.45,
      step: 0.01,
    }),
  ]),
  parameter("reconciliation", "available", [
    option("maxCorrectionSeconds", "slider", {
      min: 0,
      max: 8,
      step: 0.25,
    }),
    option("snapAfterSegments", "number", { min: 0, max: 1, step: 1 }),
  ]),
  parameter("metro13Profile", "available", [
    option("useScheduledRuntimes", "checkbox"),
    option("useProfileTrackDistances", "checkbox"),
    option("useRollingStockSpeedCap", "checkbox"),
  ]),
  parameter("crowding", "future"),
  parameter("trafficState", "future"),
  parameter("speedLimits", "future"),
] as const;

function parameter(
  id: TransportPositionParameterId,
  availability: "available" | "future",
  options: readonly TransportPositionParameterOptionDefinition[] = [],
): TransportPositionParameterDefinition {
  const prefix = `settings.experimental.parameters.${id}`;
  return {
    id,
    titleKey: `${prefix}.title` as TranslationKey,
    descriptionKey: `${prefix}.description` as TranslationKey,
    availability,
    options,
  };
}

function option(
  id: string,
  type: TransportPositionParameterOptionType,
  values: Partial<TransportPositionParameterOptionDefinition> = {},
): TransportPositionParameterOptionDefinition {
  return {
    id,
    type,
    titleKey: `settings.experimental.options.${id}.title` as TranslationKey,
    descriptionKey: `settings.experimental.options.${id}.description` as TranslationKey,
    ...values,
  };
}

export function createDefaultTransportPositionParameterSettings(): TransportPositionParameterSettings {
  return {
    polling: {
      enabled: true,
      intervalSeconds: 60,
    },
    trackDistance: {
      enabled: true,
      source: "auto",
      maxProjectionErrorMeters: 350,
    },
    speed: {
      enabled: true,
      commercialKph: 32,
      smoothing: 0.65,
      maxPlausibleKph: 160,
      longSegmentMeters: 1_500,
    },
    dwell: {
      enabled: true,
      useRealtimeTimes: true,
      fallbackSeconds: 25,
    },
    acceleration: {
      enabled: true,
      curve: "minimum_jerk",
      accelerationShare: 0.22,
    },
    reconciliation: {
      enabled: true,
      maxCorrectionSeconds: 3,
      snapAfterSegments: 1,
    },
    metro13Profile: {
      enabled: true,
      useScheduledRuntimes: true,
      useProfileTrackDistances: true,
      useRollingStockSpeedCap: true,
    },
    crowding: { enabled: true },
    trafficState: { enabled: true },
    speedLimits: { enabled: true },
  };
}

export function normalizeTransportPositionParameterSettings(
  value: unknown,
): TransportPositionParameterSettings {
  const defaults = createDefaultTransportPositionParameterSettings();
  const record = isRecord(value) ? value : {};

  return {
    polling: {
      enabled: readBoolean(record.polling, "enabled", defaults.polling.enabled),
      intervalSeconds: readNumber(
        record.polling,
        "intervalSeconds",
        30,
        300,
        defaults.polling.intervalSeconds,
      ),
    },
    trackDistance: {
      enabled: readBoolean(record.trackDistance, "enabled", defaults.trackDistance.enabled),
      source: readChoice(record.trackDistance, "source", ["auto", "gtfs", "geodesic"], defaults.trackDistance.source),
      maxProjectionErrorMeters: readNumber(record.trackDistance, "maxProjectionErrorMeters", 25, 1_000, defaults.trackDistance.maxProjectionErrorMeters),
    },
    speed: {
      enabled: readBoolean(record.speed, "enabled", defaults.speed.enabled),
      commercialKph: readNumber(
        record.speed,
        "commercialKph",
        5,
        160,
        defaults.speed.commercialKph,
      ),
      smoothing: readNumber(record.speed, "smoothing", 0, 1, defaults.speed.smoothing),
      maxPlausibleKph: readNumber(record.speed, "maxPlausibleKph", 20, 350, defaults.speed.maxPlausibleKph),
      longSegmentMeters: readNumber(record.speed, "longSegmentMeters", 300, 5_000, defaults.speed.longSegmentMeters),
    },
    dwell: {
      enabled: readBoolean(record.dwell, "enabled", defaults.dwell.enabled),
      useRealtimeTimes: readBoolean(record.dwell, "useRealtimeTimes", defaults.dwell.useRealtimeTimes),
      fallbackSeconds: readNumber(record.dwell, "fallbackSeconds", 0, 180, defaults.dwell.fallbackSeconds),
    },
    acceleration: {
      enabled: readBoolean(record.acceleration, "enabled", defaults.acceleration.enabled),
      curve: readChoice(record.acceleration, "curve", ["minimum_jerk", "trapezoidal", "linear"], defaults.acceleration.curve),
      accelerationShare: readNumber(record.acceleration, "accelerationShare", 0.05, 0.45, defaults.acceleration.accelerationShare),
    },
    reconciliation: {
      enabled: readBoolean(record.reconciliation, "enabled", defaults.reconciliation.enabled),
      maxCorrectionSeconds: readNumber(record.reconciliation, "maxCorrectionSeconds", 0, 8, defaults.reconciliation.maxCorrectionSeconds),
      snapAfterSegments: readNumber(record.reconciliation, "snapAfterSegments", 0, 1, defaults.reconciliation.snapAfterSegments),
    },
    metro13Profile: {
      enabled: readBoolean(
        record.metro13Profile,
        "enabled",
        defaults.metro13Profile.enabled,
      ),
      useScheduledRuntimes: readBoolean(
        record.metro13Profile,
        "useScheduledRuntimes",
        defaults.metro13Profile.useScheduledRuntimes,
      ),
      useProfileTrackDistances: readBoolean(
        record.metro13Profile,
        "useProfileTrackDistances",
        defaults.metro13Profile.useProfileTrackDistances,
      ),
      useRollingStockSpeedCap: readBoolean(
        record.metro13Profile,
        "useRollingStockSpeedCap",
        defaults.metro13Profile.useRollingStockSpeedCap,
      ),
    },
    crowding: {
      enabled: readBoolean(record.crowding, "enabled", defaults.crowding.enabled),
    },
    trafficState: {
      enabled: readBoolean(record.trafficState, "enabled", defaults.trafficState.enabled),
    },
    speedLimits: {
      enabled: readBoolean(record.speedLimits, "enabled", defaults.speedLimits.enabled),
    },
  };
}

function readBoolean(value: unknown, key: string, fallback: boolean): boolean {
  const candidate = isRecord(value) ? value[key] : undefined;
  return typeof candidate === "boolean" ? candidate : fallback;
}

function readNumber(
  value: unknown,
  key: string,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const candidate = isRecord(value) ? Number(value[key]) : Number.NaN;
  return Number.isFinite(candidate)
    ? Math.min(maximum, Math.max(minimum, candidate))
    : fallback;
}

function readChoice<T extends string>(
  value: unknown,
  key: string,
  choices: readonly T[],
  fallback: T,
): T {
  const candidate = isRecord(value) ? value[key] : undefined;
  return typeof candidate === "string" && choices.includes(candidate as T)
    ? (candidate as T)
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

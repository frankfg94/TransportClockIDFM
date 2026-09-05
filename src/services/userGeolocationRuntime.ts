import { Capacitor } from "@capacitor/core";
import {
  Geolocation as CapacitorGeolocation,
  type PermissionStatus as CapacitorPermissionStatus,
  type Position as CapacitorPosition,
  type PositionOptions as CapacitorPositionOptions,
} from "@capacitor/geolocation";

export type GeolocationRuntimePlatform = "web" | "native";

export type GeolocationPermissionState =
  | "checking"
  | "prompt"
  | "prompt-with-rationale"
  | "granted"
  | "denied"
  | "unknown"
  | "unsupported";

export type GeolocationErrorCode =
  | "permission-denied"
  | "position-unavailable"
  | "timeout"
  | "services-disabled"
  | "unsupported"
  | "invalid-position"
  | "unknown";

export interface UserGeolocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface UserGeolocationError {
  code: GeolocationErrorCode;
  message: string;
  cause?: unknown;
}

export interface GeolocationPermissionSnapshot {
  state: GeolocationPermissionState;
  authorized: boolean;
}

export interface GeolocationRuntimeOptions {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
  minimumUpdateInterval?: number;
}

export interface GeolocationRuntimeWatch {
  clear: () => Promise<void>;
}

export type GeolocationPositionListener = (
  coordinates: UserGeolocationCoordinates,
) => void;

export type GeolocationErrorListener = (error: UserGeolocationError) => void;

const DEFAULT_RUNTIME_OPTIONS: GeolocationRuntimeOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 15_000,
  minimumUpdateInterval: 10_000,
};

export function getGeolocationRuntimePlatform(): GeolocationRuntimePlatform {
  return Capacitor.getPlatform() === "web" ? "web" : "native";
}

export function isNativeGeolocationPlatform(): boolean {
  return getGeolocationRuntimePlatform() === "native";
}

export function isGeolocationSupported(): boolean {
  if (isNativeGeolocationPlatform()) return true;
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

export async function checkGeolocationPermission(): Promise<GeolocationPermissionSnapshot> {
  if (!isGeolocationSupported()) {
    return { state: "unsupported", authorized: false };
  }

  if (isNativeGeolocationPlatform()) {
    return normalizeNativePermission(await CapacitorGeolocation.checkPermissions());
  }

  if (typeof navigator.permissions === "undefined") {
    return { state: "unknown", authorized: false };
  }

  try {
    const permission = await navigator.permissions.query({ name: "geolocation" });
    return {
      state: normalizeBrowserPermission(permission.state),
      authorized: permission.state === "granted",
    };
  } catch {
    // Some WebViews expose navigator.permissions but reject the geolocation
    // query. The actual getCurrentPosition call remains the source of truth.
    return { state: "unknown", authorized: false };
  }
}

export async function requestGeolocationPermission(): Promise<GeolocationPermissionSnapshot> {
  if (!isGeolocationSupported()) {
    throw createGeolocationError("unsupported", "La géolocalisation est indisponible sur cet appareil.");
  }

  if (!isNativeGeolocationPlatform()) {
    // Browsers only display their permission prompt from a geolocation call.
    return checkGeolocationPermission();
  }

  return normalizeNativePermission(
    await CapacitorGeolocation.requestPermissions({ permissions: ["location"] }),
  );
}

export async function getCurrentGeolocation(
  options: Partial<GeolocationRuntimeOptions> = {},
): Promise<UserGeolocationCoordinates> {
  const resolvedOptions = resolveOptions(options);

  if (!isGeolocationSupported()) {
    throw createGeolocationError("unsupported", "La géolocalisation est indisponible sur cet appareil.");
  }

  if (isNativeGeolocationPlatform()) {
    try {
      return normalizeNativePosition(
        await CapacitorGeolocation.getCurrentPosition(toCapacitorOptions(resolvedOptions)),
      );
    } catch (error) {
      throw normalizeGeolocationError(error);
    }
  }

  return new Promise<UserGeolocationCoordinates>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        try {
          resolve(normalizeBrowserPosition(position));
        } catch (error) {
          reject(normalizeGeolocationError(error));
        }
      },
      (error) => reject(normalizeGeolocationError(error)),
      toBrowserOptions(resolvedOptions),
    );
  });
}

export async function watchGeolocation(
  options: Partial<GeolocationRuntimeOptions>,
  onPosition: GeolocationPositionListener,
  onError: GeolocationErrorListener,
): Promise<GeolocationRuntimeWatch> {
  const resolvedOptions = resolveOptions(options);

  if (!isGeolocationSupported()) {
    throw createGeolocationError("unsupported", "La géolocalisation est indisponible sur cet appareil.");
  }

  if (isNativeGeolocationPlatform()) {
    try {
      const watchId = await CapacitorGeolocation.watchPosition(
        toCapacitorOptions(resolvedOptions),
        (position, error) => {
          if (position) {
            try {
              onPosition(normalizeNativePosition(position));
            } catch (normalizationError) {
              onError(normalizeGeolocationError(normalizationError));
            }
          }
          if (error) onError(normalizeGeolocationError(error));
        },
      );

      return {
        clear: () => CapacitorGeolocation.clearWatch({ id: watchId }),
      };
    } catch (error) {
      throw normalizeGeolocationError(error);
    }
  }

  const geolocation = navigator.geolocation;
  const watchId = geolocation.watchPosition(
    (position) => {
      try {
        onPosition(normalizeBrowserPosition(position));
      } catch (error) {
        onError(normalizeGeolocationError(error));
      }
    },
    (error) => onError(normalizeGeolocationError(error)),
    toBrowserOptions(resolvedOptions),
  );

  return {
    clear: async () => geolocation.clearWatch(watchId),
  };
}

export function normalizeGeolocationError(error: unknown): UserGeolocationError {
  if (isUserGeolocationError(error)) return error;

  if (isBrowserPositionError(error)) {
    if (error.code === 1 || error.code === error.PERMISSION_DENIED) {
      return createGeolocationError("permission-denied", "L’autorisation de géolocalisation a été refusée.", error);
    }
    if (error.code === 2 || error.code === error.POSITION_UNAVAILABLE) {
      return createGeolocationError("position-unavailable", "La position est momentanément indisponible.", error);
    }
    if (error.code === 3 || error.code === error.TIMEOUT) {
      return createGeolocationError("timeout", "La recherche de position a expiré.", error);
    }
  }

  const nativeCode = readNativeErrorCode(error);
  if (nativeCode.includes("0003") || nativeCode.includes("permission")) {
    return createGeolocationError("permission-denied", "L’autorisation de géolocalisation a été refusée.", error);
  }
  if (
    nativeCode.includes("0007") ||
    nativeCode.includes("0009") ||
    nativeCode.includes("0016") ||
    nativeCode.includes("0017") ||
    nativeCode.includes("location settings") ||
    nativeCode.includes("location disabled") ||
    nativeCode.includes("services disabled") ||
    nativeCode.includes("google play services not available")
  ) {
    return createGeolocationError("services-disabled", "Les services de localisation sont désactivés.", error);
  }
  if (nativeCode.includes("0010") || nativeCode.includes("timeout")) {
    return createGeolocationError("timeout", "La recherche de position a expiré.", error);
  }
  if (nativeCode.includes("0002") || nativeCode.includes("unavailable")) {
    return createGeolocationError("position-unavailable", "La position est momentanément indisponible.", error);
  }

  return createGeolocationError(
    "unknown",
    error instanceof Error && error.message
      ? error.message
      : "La géolocalisation a rencontré une erreur.",
    error,
  );
}

function resolveOptions(options: Partial<GeolocationRuntimeOptions>): GeolocationRuntimeOptions {
  return {
    ...DEFAULT_RUNTIME_OPTIONS,
    ...options,
  };
}

function toBrowserOptions(options: GeolocationRuntimeOptions): PositionOptions {
  return {
    enableHighAccuracy: options.enableHighAccuracy,
    timeout: options.timeout,
    maximumAge: options.maximumAge,
  };
}

function toCapacitorOptions(options: GeolocationRuntimeOptions): CapacitorPositionOptions {
  return {
    enableHighAccuracy: options.enableHighAccuracy,
    timeout: options.timeout,
    maximumAge: options.maximumAge,
    minimumUpdateInterval: options.minimumUpdateInterval,
  };
}

function normalizeBrowserPosition(position: GeolocationPosition): UserGeolocationCoordinates {
  return normalizeCoordinates({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude,
    altitudeAccuracy: position.coords.altitudeAccuracy,
    heading: position.coords.heading,
    speed: position.coords.speed,
    timestamp: position.timestamp,
  });
}

function normalizeNativePosition(position: CapacitorPosition): UserGeolocationCoordinates {
  return normalizeCoordinates({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude,
    altitudeAccuracy: position.coords.altitudeAccuracy ?? null,
    heading: position.coords.heading,
    speed: position.coords.speed,
    timestamp: position.timestamp,
  });
}

function normalizeCoordinates(coordinates: UserGeolocationCoordinates): UserGeolocationCoordinates {
  if (
    !Number.isFinite(coordinates.latitude) ||
    !Number.isFinite(coordinates.longitude) ||
    coordinates.latitude < -90 ||
    coordinates.latitude > 90 ||
    coordinates.longitude < -180 ||
    coordinates.longitude > 180 ||
    !Number.isFinite(coordinates.timestamp)
  ) {
    throw createGeolocationError("invalid-position", "La position reçue est invalide.");
  }

  return {
    ...coordinates,
    accuracy: normalizeNullableNumber(coordinates.accuracy),
    altitude: normalizeNullableNumber(coordinates.altitude),
    altitudeAccuracy: normalizeNullableNumber(coordinates.altitudeAccuracy),
    heading: normalizeNullableNumber(coordinates.heading),
    speed: normalizeNullableNumber(coordinates.speed),
  };
}

function normalizeNullableNumber(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

function normalizeNativePermission(status: CapacitorPermissionStatus): GeolocationPermissionSnapshot {
  const authorized = status.location === "granted" || status.coarseLocation === "granted";
  if (authorized) return { state: "granted", authorized: true };

  const states = [status.location, status.coarseLocation];
  if (states.includes("prompt-with-rationale")) {
    return { state: "prompt-with-rationale", authorized: false };
  }
  if (states.includes("prompt")) return { state: "prompt", authorized: false };
  if (states.every((state) => state === "denied")) return { state: "denied", authorized: false };
  return { state: "unknown", authorized: false };
}

function normalizeBrowserPermission(
  state: PermissionState,
): Exclude<GeolocationPermissionState, "checking" | "unknown" | "unsupported" | "prompt-with-rationale"> {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  return "prompt";
}

function isBrowserPositionError(error: unknown): error is GeolocationPositionError {
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}

function readNativeErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const value = error as { code?: unknown; message?: unknown };
  return `${String(value.code ?? "")} ${String(value.message ?? "")}`.toLowerCase();
}

function createGeolocationError(
  code: GeolocationErrorCode,
  message: string,
  cause?: unknown,
): UserGeolocationError {
  return { code, message, cause };
}

function isUserGeolocationError(error: unknown): error is UserGeolocationError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

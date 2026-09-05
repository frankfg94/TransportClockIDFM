import {
  computed,
  onBeforeUnmount,
  onMounted,
  readonly,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";
import {
  checkGeolocationPermission,
  getCurrentGeolocation,
  isGeolocationSupported,
  isNativeGeolocationPlatform,
  normalizeGeolocationError,
  requestGeolocationPermission,
  type GeolocationPermissionState,
  type GeolocationRuntimeWatch,
  type UserGeolocationCoordinates,
  type UserGeolocationError,
  watchGeolocation,
} from "../services/userGeolocationRuntime";

export type {
  GeolocationErrorCode,
  GeolocationPermissionState,
  UserGeolocationCoordinates,
  UserGeolocationError,
} from "../services/userGeolocationRuntime";

export interface UseUserGeolocationOptions {
  staleAfterMs?: number;
  autoStart?: boolean;
  pauseWhenHidden?: boolean;
  enabled?: MaybeRefOrGetter<boolean>;
}

export interface UseUserGeolocationResult {
  coordinates: Readonly<Ref<UserGeolocationCoordinates | undefined>>;
  lastRefreshDate: Readonly<Ref<Date | undefined>>;
  isAuthorized: ComputedRef<boolean>;
  isEnabled: Readonly<Ref<boolean>>;
  isTracking: Readonly<Ref<boolean>>;
  isStale: ComputedRef<boolean>;
  isSupported: ComputedRef<boolean>;
  isNativeApp: ComputedRef<boolean>;
  permissionState: Readonly<Ref<GeolocationPermissionState>>;
  isLoading: Readonly<Ref<boolean>>;
  error: Readonly<Ref<UserGeolocationError | undefined>>;
  askGeolocation: () => Promise<boolean>;
  refresh: () => Promise<boolean>;
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
  recheckPermission: () => Promise<void>;
  clearPosition: () => void;
}

const DEFAULT_STALE_AFTER_MS = 60_000;
const STALE_CLOCK_INTERVAL_MS = 5_000;

export function useUserGeolocation(
  options: UseUserGeolocationOptions = {},
): UseUserGeolocationResult {
  const staleAfterMs = normalizeStaleAfter(options.staleAfterMs);
  const autoStart = options.autoStart ?? true;
  const pauseWhenHidden = options.pauseWhenHidden ?? true;
  const featureEnabled = computed(() =>
    options.enabled === undefined ? true : toValue(options.enabled),
  );

  const coordinates = ref<UserGeolocationCoordinates>();
  const lastRefreshDate = ref<Date>();
  const permissionState = ref<GeolocationPermissionState>("checking");
  const authorized = ref(false);
  const isEnabled = ref(false);
  const isTracking = ref(false);
  const isLoading = ref(false);
  const error = ref<UserGeolocationError>();
  const staleClock = ref(Date.now());

  const isSupported = computed(() => isGeolocationSupported());
  const isNativeApp = computed(() => isNativeGeolocationPlatform());
  const isAuthorized = computed(() => featureEnabled.value && authorized.value);
  const isStale = computed(() => {
    if (!featureEnabled.value) return false;

    const refreshedAt = lastRefreshDate.value?.getTime();
    return refreshedAt !== undefined && staleClock.value - refreshedAt >= staleAfterMs;
  });

  let watchHandle: GeolocationRuntimeWatch | undefined;
  let staleClockTimer: number | undefined;
  let pendingRequest: Promise<boolean> | undefined;
  let pendingStart: Promise<void> | undefined;
  let trackingGeneration = 0;
  let pausedForVisibility = false;
  let mounted = false;

  async function recheckPermission(): Promise<void> {
    if (!featureEnabled.value) {
      await disableGeolocation();
      return;
    }

    if (!isSupported.value) {
      permissionState.value = "unsupported";
      authorized.value = false;
      isEnabled.value = false;
      clearPosition();
      return;
    }

    isLoading.value = true;
    try {
      const snapshot = await checkGeolocationPermission();
      if (!featureEnabled.value) {
        await disableGeolocation();
        return;
      }
      applyPermissionSnapshot(snapshot.state, snapshot.authorized);

      if (snapshot.authorized && autoStart && !pausedForVisibility) {
        await startTracking();
      } else if (!snapshot.authorized && snapshot.state === "denied") {
        await handlePermissionDenied();
      }
    } catch (cause) {
      if (!featureEnabled.value) {
        await disableGeolocation();
        return;
      }
      const runtimeError = normalizeGeolocationError(cause);
      error.value = runtimeError;
      permissionState.value = runtimeError.code === "unsupported" ? "unsupported" : "unknown";
      if (runtimeError.code === "permission-denied") {
        await handlePermissionDenied();
      } else if (runtimeError.code === "unsupported") {
        clearPosition();
      }
    } finally {
      isLoading.value = false;
    }
  }

  async function askGeolocation(): Promise<boolean> {
    if (!featureEnabled.value) {
      await disableGeolocation();
      return false;
    }

    if (pendingRequest) return pendingRequest;

    pendingRequest = (async () => {
      if (!isSupported.value) {
        permissionState.value = "unsupported";
        return false;
      }

      isLoading.value = true;
      error.value = undefined;
      try {
        if (isNativeApp.value) {
          const snapshot = await requestGeolocationPermission();
          if (!featureEnabled.value) {
            await disableGeolocation();
            return false;
          }
          applyPermissionSnapshot(snapshot.state, snapshot.authorized);
          if (!snapshot.authorized) return false;
        }

        const position = await getCurrentGeolocation();
        if (!featureEnabled.value) {
          await disableGeolocation();
          return false;
        }
        applyPosition(position);
        await startTracking();
        if (!featureEnabled.value) {
          await disableGeolocation();
          return false;
        }
        return true;
      } catch (cause) {
        applyRuntimeError(normalizeGeolocationError(cause));
        return false;
      } finally {
        isLoading.value = false;
      }
    })();

    try {
      return await pendingRequest;
    } finally {
      pendingRequest = undefined;
    }
  }

  async function refresh(): Promise<boolean> {
    if (!featureEnabled.value) {
      await disableGeolocation();
      return false;
    }

    if (!isAuthorized.value) {
      await recheckPermission();
      if (!featureEnabled.value || !isAuthorized.value) return false;
    }

    isLoading.value = true;
    error.value = undefined;
    try {
      const position = await getCurrentGeolocation();
      if (!featureEnabled.value) {
        await disableGeolocation();
        return false;
      }
      applyPosition(position);
      return true;
    } catch (cause) {
      applyRuntimeError(normalizeGeolocationError(cause));
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function startTracking(): Promise<void> {
    if (pendingStart) return pendingStart;

    pendingStart = startTrackingInternal();
    try {
      await pendingStart;
    } finally {
      pendingStart = undefined;
    }
  }

  async function startTrackingInternal(): Promise<void> {
    if (
      watchHandle ||
      !featureEnabled.value ||
      !isSupported.value ||
      !isAuthorized.value ||
      !mounted
    ) {
      return;
    }

    if (pauseWhenHidden && typeof document !== "undefined" && document.hidden) {
      pausedForVisibility = true;
      isEnabled.value = true;
      return;
    }

    const generation = ++trackingGeneration;
    isEnabled.value = true;

    try {
      const nextWatch = await watchGeolocation(
        {},
        (position) => {
          if (generation !== trackingGeneration || !mounted) return;
          applyPosition(position);
        },
        (runtimeError) => {
          if (generation !== trackingGeneration || !mounted) return;
          applyRuntimeError(runtimeError);
        },
      );

      if (generation !== trackingGeneration || !featureEnabled.value || !mounted) {
        await nextWatch.clear();
        return;
      }

      watchHandle = nextWatch;
      isTracking.value = true;
    } catch (cause) {
      if (generation !== trackingGeneration || !mounted) return;
      applyRuntimeError(normalizeGeolocationError(cause));
    }
  }

  async function stopTracking(): Promise<void> {
    pausedForVisibility = false;
    isEnabled.value = false;
    trackingGeneration += 1;
    const currentWatch = watchHandle;
    watchHandle = undefined;
    isTracking.value = false;
    if (currentWatch) await currentWatch.clear();
  }

  async function disableGeolocation(): Promise<void> {
    authorized.value = false;
    permissionState.value = "unknown";
    isLoading.value = false;
    error.value = undefined;
    clearPosition();
    await stopTracking();
  }

  function clearPosition(): void {
    coordinates.value = undefined;
    lastRefreshDate.value = undefined;
    staleClock.value = Date.now();
  }

  function applyPermissionSnapshot(
    state: GeolocationPermissionState,
    nextAuthorized: boolean,
  ): void {
    if (state === "unknown" && authorized.value) return;
    permissionState.value = state;
    authorized.value = nextAuthorized;
    if (nextAuthorized) {
      error.value = undefined;
      return;
    }
    if (state === "denied" || state === "unsupported") {
      isEnabled.value = false;
      clearPosition();
    }
  }

  function applyPosition(position: UserGeolocationCoordinates): void {
    if (!featureEnabled.value) return;

    coordinates.value = position;
    lastRefreshDate.value = new Date(Date.now());
    staleClock.value = Date.now();
    permissionState.value = "granted";
    authorized.value = true;
    error.value = undefined;
  }

  function applyRuntimeError(runtimeError: UserGeolocationError): void {
    if (!featureEnabled.value) {
      void disableGeolocation();
      return;
    }

    error.value = runtimeError;
    if (runtimeError.code === "permission-denied") {
      void handlePermissionDenied();
      return;
    }
    if (runtimeError.code === "unsupported") {
      permissionState.value = "unsupported";
      authorized.value = false;
      isEnabled.value = false;
      clearPosition();
    }
  }

  async function handlePermissionDenied(): Promise<void> {
    if (!featureEnabled.value) {
      await disableGeolocation();
      return;
    }

    permissionState.value = "denied";
    authorized.value = false;
    clearPosition();
    await stopTracking();
  }

  function handleVisibilityChange(): void {
    if (!pauseWhenHidden || !mounted) return;
    if (!featureEnabled.value) {
      void disableGeolocation();
      return;
    }

    if (document.hidden) {
      if (isEnabled.value) {
        pausedForVisibility = true;
        void pauseTracking();
      }
      return;
    }

    const shouldResume = pausedForVisibility;
    pausedForVisibility = false;
    if (shouldResume && isAuthorized.value && isEnabled.value) {
      void startTracking();
    }
    void recheckPermission();
  }

  async function pauseTracking(): Promise<void> {
    trackingGeneration += 1;
    const currentWatch = watchHandle;
    watchHandle = undefined;
    isTracking.value = false;
    if (currentWatch) await currentWatch.clear();
  }

  watch(featureEnabled, (enabled) => {
    if (!mounted) return;

    if (!enabled) {
      void disableGeolocation();
      return;
    }

    pausedForVisibility =
      pauseWhenHidden && typeof document !== "undefined" && document.hidden;
    void recheckPermission();
  }, { flush: "sync" });

  onMounted(() => {
    mounted = true;
    if (typeof window !== "undefined") {
      staleClockTimer = window.setInterval(() => {
        staleClock.value = Date.now();
      }, Math.min(STALE_CLOCK_INTERVAL_MS, staleAfterMs));
    }
    if (pauseWhenHidden && typeof document !== "undefined") {
      pausedForVisibility = document.hidden;
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    if (featureEnabled.value) {
      void recheckPermission();
    } else {
      void disableGeolocation();
    }
  });

  onBeforeUnmount(() => {
    mounted = false;
    trackingGeneration += 1;
    if (staleClockTimer !== undefined && typeof window !== "undefined") {
      window.clearInterval(staleClockTimer);
    }
    if (pauseWhenHidden && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
    const currentWatch = watchHandle;
    watchHandle = undefined;
    isTracking.value = false;
    if (currentWatch) void currentWatch.clear();
  });

  return {
    coordinates: readonly(coordinates),
    lastRefreshDate: readonly(lastRefreshDate),
    isAuthorized,
    isEnabled: readonly(isEnabled),
    isTracking: readonly(isTracking),
    isStale,
    isSupported,
    isNativeApp,
    permissionState: readonly(permissionState),
    isLoading: readonly(isLoading),
    error: readonly(error),
    askGeolocation,
    refresh,
    startTracking,
    stopTracking,
    recheckPermission,
    clearPosition,
  };
}

function normalizeStaleAfter(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? value
    : DEFAULT_STALE_AFTER_MS;
}

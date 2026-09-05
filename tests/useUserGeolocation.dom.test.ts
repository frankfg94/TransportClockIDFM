import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import {
  useUserGeolocation,
  type UseUserGeolocationOptions,
  type UseUserGeolocationResult,
} from "../src/composables/useUserGeolocation";

const mocks = vi.hoisted(() => ({
  nativePlatform: false,
  webPermissionState: "granted" as PermissionState,
  webGetCurrentPosition: vi.fn(),
  webWatchPosition: vi.fn(),
  webClearWatch: vi.fn(),
  permissionQuery: vi.fn(),
  nativeCheckPermissions: vi.fn(),
  nativeRequestPermissions: vi.fn(),
  nativeGetCurrentPosition: vi.fn(),
  nativeWatchPosition: vi.fn(),
  nativeClearWatch: vi.fn(),
  nativeWatchCallback: undefined as
    | ((position: unknown, error?: unknown) => void)
    | undefined,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => (mocks.nativePlatform ? "android" : "web"),
  },
}));

vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    checkPermissions: mocks.nativeCheckPermissions,
    requestPermissions: mocks.nativeRequestPermissions,
    getCurrentPosition: mocks.nativeGetCurrentPosition,
    watchPosition: mocks.nativeWatchPosition,
    clearWatch: mocks.nativeClearWatch,
  },
}));

describe("useUserGeolocation", () => {

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T10:00:00.000Z"));
    vi.clearAllMocks();
    mocks.nativePlatform = false;
    mocks.webPermissionState = "granted";
    mocks.nativeWatchCallback = undefined;
    mocks.permissionQuery.mockImplementation(async () => ({ state: mocks.webPermissionState }));
    mocks.webGetCurrentPosition.mockImplementation((success: (position: GeolocationPosition) => void) => {
      success(createWebPosition());
    });
    mocks.webWatchPosition.mockImplementation(() => 41);
    mocks.nativeCheckPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    mocks.nativeRequestPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    mocks.nativeGetCurrentPosition.mockResolvedValue(createNativePosition());
    mocks.nativeWatchPosition.mockImplementation(async (
      _options: unknown,
      callback: (position: unknown, error?: unknown) => void,
    ) => {
      mocks.nativeWatchCallback = callback;
      return "native-watch-1";
    });
    mocks.nativeClearWatch.mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: mocks.webGetCurrentPosition,
        watchPosition: mocks.webWatchPosition,
        clearWatch: mocks.webClearWatch,
      },
      permissions: { query: mocks.permissionQuery },
    });
  });

  afterEach(() => {
    activeWrappers.forEach((wrapper) => wrapper.unmount());
    activeWrappers.length = 0;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses the Web API, exposes coordinates and marks the position stale", async () => {
    const { result, wrapper } = await mountHarness();

    expect(result.isAuthorized.value).toBe(true);
    expect(result.isEnabled.value).toBe(true);
    expect(result.isTracking.value).toBe(true);
    expect(mocks.webWatchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({
        enableHighAccuracy: true,
        maximumAge: 15_000,
        timeout: 15_000,
      }),
    );
    expect(mocks.nativeWatchPosition).not.toHaveBeenCalled();

    const watchSuccess = mocks.webWatchPosition.mock.calls.at(-1)?.[0] as
      | ((position: GeolocationPosition) => void)
      | undefined;
    watchSuccess?.(createWebPosition({ latitude: 48.8566, longitude: 2.3522 }));
    await nextTick();

    expect(result.coordinates.value).toMatchObject({ latitude: 48.8566, longitude: 2.3522 });
    expect(result.lastRefreshDate.value).toEqual(new Date("2026-08-09T10:00:00.000Z"));
    expect(result.isStale.value).toBe(false);

    vi.advanceTimersByTime(60_001);
    await nextTick();
    expect(result.isStale.value).toBe(true);

    watchSuccess?.(createWebPosition({ latitude: 48.857, longitude: 2.353 }));
    await nextTick();
    expect(result.isStale.value).toBe(false);

    wrapper.unmount();
    await flushPromises();
    expect(mocks.webClearWatch).toHaveBeenCalledWith(41);
  });

  it("keeps the last position after a temporary timeout", async () => {
    const { result } = await mountHarness();
    const watchSuccess = mocks.webWatchPosition.mock.calls.at(-1)?.[0] as
      | ((position: GeolocationPosition) => void)
      | undefined;
    const watchError = mocks.webWatchPosition.mock.calls.at(-1)?.[1] as
      | ((error: GeolocationPositionError) => void)
      | undefined;

    watchSuccess?.(createWebPosition({ latitude: 48.8566, longitude: 2.3522 }));
    await nextTick();
    watchError?.({ code: 3, message: "timeout" } as GeolocationPositionError);
    await nextTick();

    expect(result.coordinates.value).toMatchObject({ latitude: 48.8566, longitude: 2.3522 });
    expect(result.error.value?.code).toBe("timeout");
    expect(result.isEnabled.value).toBe(true);
  });

  it("does not initialize geolocation when the feature is disabled", async () => {
    const { result } = await mountHarness({ enabled: false });

    expect(result.permissionState.value).toBe("unknown");
    expect(result.isAuthorized.value).toBe(false);
    expect(result.isEnabled.value).toBe(false);
    expect(result.coordinates.value).toBeUndefined();
    expect(result.lastRefreshDate.value).toBeUndefined();
    expect(mocks.permissionQuery).not.toHaveBeenCalled();
    expect(mocks.webGetCurrentPosition).not.toHaveBeenCalled();
    expect(mocks.webWatchPosition).not.toHaveBeenCalled();
    expect(mocks.nativeCheckPermissions).not.toHaveBeenCalled();
  });

  it("stops and clears geolocation when the feature is disabled reactively", async () => {
    const enabled = ref(true);
    const { result } = await mountHarness({ enabled });
    const watchSuccess = mocks.webWatchPosition.mock.calls.at(-1)?.[0] as
      | ((position: GeolocationPosition) => void)
      | undefined;
    watchSuccess?.(createWebPosition());
    await nextTick();

    expect(result.coordinates.value).toBeDefined();
    expect(result.isTracking.value).toBe(true);

    enabled.value = false;
    await nextTick();
    await flushPromises();

    expect(result.permissionState.value).toBe("unknown");
    expect(result.isAuthorized.value).toBe(false);
    expect(result.isEnabled.value).toBe(false);
    expect(result.isTracking.value).toBe(false);
    expect(result.coordinates.value).toBeUndefined();
    expect(result.lastRefreshDate.value).toBeUndefined();
    expect(mocks.webClearWatch).toHaveBeenCalledWith(41);
  });

  it("waits for the compact permission action before starting the Web watcher", async () => {
    mocks.webPermissionState = "prompt";
    const { result } = await mountHarness();

    expect(result.permissionState.value).toBe("prompt");
    expect(result.isAuthorized.value).toBe(false);
    expect(mocks.webGetCurrentPosition).not.toHaveBeenCalled();
    expect(mocks.webWatchPosition).not.toHaveBeenCalled();

    expect(await result.askGeolocation()).toBe(true);
    expect(mocks.webGetCurrentPosition).toHaveBeenCalledTimes(1);
    expect(mocks.webWatchPosition).toHaveBeenCalledTimes(1);
    expect(result.coordinates.value).toBeDefined();
    expect(result.permissionState.value).toBe("granted");
  });

  it("clears the position when the Web permission is denied", async () => {
    mocks.webPermissionState = "prompt";
    mocks.webGetCurrentPosition.mockImplementation((
      _success: (position: GeolocationPosition) => void,
      failure: (error: GeolocationPositionError) => void,
    ) => {
      failure({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    });
    const { result } = await mountHarness();

    expect(await result.askGeolocation()).toBe(false);
    expect(result.permissionState.value).toBe("denied");
    expect(result.isAuthorized.value).toBe(false);
    expect(result.isEnabled.value).toBe(false);
    expect(result.coordinates.value).toBeUndefined();
  });

  it("falls back to an unknown permission state when the Permissions API is unavailable", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: mocks.webGetCurrentPosition,
        watchPosition: mocks.webWatchPosition,
        clearWatch: mocks.webClearWatch,
      },
    });

    const { result } = await mountHarness();

    expect(result.permissionState.value).toBe("unknown");
    expect(result.isSupported.value).toBe(true);
    expect(result.isAuthorized.value).toBe(false);
  });

  it("reports an unsupported platform without rendering a position", async () => {
    vi.stubGlobal("navigator", {});

    const { result } = await mountHarness();

    expect(result.isSupported.value).toBe(false);
    expect(result.permissionState.value).toBe("unsupported");
    expect(result.isEnabled.value).toBe(false);
  });

  it("uses Capacitor Geolocation on Android and cleans up its native watcher", async () => {
    mocks.nativePlatform = true;
    const { result, wrapper } = await mountHarness();

    expect(result.isNativeApp.value).toBe(true);
    expect(result.isAuthorized.value).toBe(true);
    expect(mocks.nativeCheckPermissions).toHaveBeenCalledTimes(1);
    expect(mocks.nativeWatchPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        enableHighAccuracy: true,
        minimumUpdateInterval: 10_000,
      }),
      expect.any(Function),
    );
    expect(mocks.webWatchPosition).not.toHaveBeenCalled();

    mocks.nativeWatchCallback?.(createNativePosition({ latitude: 48.86, longitude: 2.36 }));
    await nextTick();
    expect(result.coordinates.value).toMatchObject({ latitude: 48.86, longitude: 2.36 });

    wrapper.unmount();
    await flushPromises();
    expect(mocks.nativeClearWatch).toHaveBeenCalledWith({ id: "native-watch-1" });
  });
});

async function mountHarness(
  options: UseUserGeolocationOptions = {},
): Promise<{ result: UseUserGeolocationResult; wrapper: VueWrapper }> {
  let result: UseUserGeolocationResult | undefined;
  const host = defineComponent({
    setup() {
      result = useUserGeolocation(options);
      return () => h("div");
    },
  });
  const wrapper = mount(host);
  activeWrappers.push(wrapper);
  await flushPromises();
  await flushPromises();
  return { result: result!, wrapper };
}

const activeWrappers: VueWrapper[] = [];

function createWebPosition(
  overrides: Partial<{ latitude: number; longitude: number }> = {},
): GeolocationPosition {
  return {
    coords: {
      latitude: overrides.latitude ?? 48.8566,
      longitude: overrides.longitude ?? 2.3522,
      accuracy: 12,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  };
}

function createNativePosition(
  overrides: Partial<{ latitude: number; longitude: number }> = {},
): {
  timestamp: number;
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
} {
  return {
    timestamp: Date.now(),
    coords: {
      latitude: overrides.latitude ?? 48.8566,
      longitude: overrides.longitude ?? 2.3522,
      accuracy: 8,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
  };
}

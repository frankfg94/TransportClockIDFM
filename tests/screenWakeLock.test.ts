import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nativeWakeLockMocks = vi.hoisted(() => ({
  getPlatform: vi.fn<() => string>(),
  setEnabled: vi.fn<(options: { enabled: boolean }) => Promise<void>>(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: nativeWakeLockMocks.getPlatform,
  },
  registerPlugin: () => ({
    setEnabled: nativeWakeLockMocks.setEnabled,
  }),
}));

import { createFullscreenPanelWakeLockController } from "../src/features/app-settings/screenWakeLock";

describe("fullscreen panel screen wake lock", () => {
  let webRequest: ReturnType<typeof vi.fn>;
  let webRelease: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nativeWakeLockMocks.getPlatform.mockReturnValue("web");
    nativeWakeLockMocks.setEnabled.mockReset().mockResolvedValue(undefined);
    webRelease = vi.fn().mockResolvedValue(undefined);
    webRequest = vi.fn().mockResolvedValue({ released: false, release: webRelease });

    vi.stubGlobal("document", { visibilityState: "visible" });
    vi.stubGlobal("navigator", { wakeLock: { request: webRequest } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the native Android window flag instead of the browser API", async () => {
    nativeWakeLockMocks.getPlatform.mockReturnValue("android");
    const controller = createFullscreenPanelWakeLockController();

    await controller.setEnabled(true);
    expect(nativeWakeLockMocks.setEnabled).toHaveBeenNthCalledWith(1, { enabled: true });
    expect(webRequest).not.toHaveBeenCalled();

    await controller.dispose();
    expect(nativeWakeLockMocks.setEnabled).toHaveBeenLastCalledWith({ enabled: false });
  });

  it("uses the browser wake lock outside the Android app and releases it when disabled", async () => {
    const controller = createFullscreenPanelWakeLockController();

    await controller.setEnabled(true);
    expect(webRequest).toHaveBeenCalledTimes(1);
    expect(nativeWakeLockMocks.setEnabled).not.toHaveBeenCalled();

    await controller.setEnabled(false);
    expect(webRelease).toHaveBeenCalledTimes(1);
  });

  it("falls back to the browser API when the native plugin is unavailable", async () => {
    nativeWakeLockMocks.getPlatform.mockReturnValue("android");
    nativeWakeLockMocks.setEnabled.mockRejectedValueOnce(new Error("plugin unavailable"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const controller = createFullscreenPanelWakeLockController();

    await controller.setEnabled(true);

    expect(webRequest).toHaveBeenCalledTimes(1);
    await controller.dispose();
    expect(webRelease).toHaveBeenCalledTimes(1);
  });
});

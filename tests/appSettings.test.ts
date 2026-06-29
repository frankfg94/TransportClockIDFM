import { describe, expect, it } from "vitest";
import {
  createDefaultAppSettings,
  filterTerminalOnly,
  fullscreenStationPanelDesignOptions,
  getEffectiveMaxDeparturesPerDirection,
  normalizeAppSettings,
  parseMaxDeparturesPerDirection,
  parseTransferBundleRetentionDays,
  parseTransferBundleRequestConcurrency,
  parseTransferBundleRequestSpacingMs,
  parseWeatherLookaheadMinutes,
  transferResolverModeOptions,
} from "../src/features/app-settings/appSettings";

describe("app settings", () => {
  it("keeps current behaviour as the default", () => {
    expect(createDefaultAppSettings()).toMatchObject({
      closedDirectionSummaryMode: "next",
      maxDeparturesPerDirection: "default",
      showPatternMiniMap: true,
      showPatternCityZones: true,
      terminalDirectionsOnly: false,
      wakeLockDuration: "none",
      wakeDeviceOnAlarm: true,
      boardTogglesPlacement: "inline",
      placePresetNavigationMode: "dropdown-swipe",
      navigationAutoHide: "none",
      compactLinePlanMode: "auto",
      richTransferTooltips: true,
      ghostNetworkStructuralOnly: false,
      trafficInfoDesign: "ratp",
      trafficInfoDefaultScope: "optimized",
      fullscreenStationPanelDesign: "all-directions",
      fullscreenStationPanelDarkTheme: false,
      smartTrafficDetection: true,
      transferResolverMode: "auto",
      transferBundleBackendCacheEnabled: true,
      transferBundleLocalCacheEnabled: true,
      transferBundleRetentionDays: 15,
      transferBundleRequestConcurrency: 1,
      transferBundleRequestSpacingMs: 0,
      weatherMode: "animated",
      weatherLookaheadMinutes: 1440,
      weatherShowApparentTemperature: true,
      weatherLocationPreset: "paris",
      weatherCustomLocation: {
        label: "Paris",
        latitude: 48.8566,
        longitude: 2.3522,
      },
      weatherTestMode: "off",
    });
  });

  it("migrates invalid persisted values back to safe defaults", () => {
    const settings = normalizeAppSettings({
      closedDirectionSummaryMode: "future",
      maxDeparturesPerDirection: "999",
      showPatternMiniMap: "yes",
      showPatternCityZones: "yes",
      terminalDirectionsOnly: true,
      boardTogglesPlacement: "drawer",
      placePresetNavigationMode: "future",
      wakeLockDuration: "forever",
      navigationAutoHide: "always",
      compactLinePlanMode: "tiny",
      ghostNetworkStructuralOnly: "yes",
      trafficInfoDesign: "dense",
      trafficInfoDefaultScope: "everything",
      fullscreenStationPanelDesign: "cinema",
      fullscreenStationPanelDarkTheme: "yes",
      smartTrafficDetection: "sometimes",
      transferResolverMode: "telepathy",
      transferBundleBackendCacheEnabled: "no",
      transferBundleRetentionDays: "999",
      transferBundleRequestConcurrency: "999",
      transferBundleRequestSpacingMs: "999999",
      weatherMode: "cinematic",
      weatherLookaheadMinutes: "9999",
      weatherLocationPreset: "moon",
      weatherTestMode: "hail",
      weatherCustomLocation: {
        label: "",
        latitude: "999",
        longitude: "-999",
      },
    });

    expect(settings.closedDirectionSummaryMode).toBe("next");
    expect(settings.maxDeparturesPerDirection).toBe("default");
    expect(settings.showPatternMiniMap).toBe(true);
    expect(settings.showPatternCityZones).toBe(true);
    expect(settings.terminalDirectionsOnly).toBe(true);
    expect(settings.boardTogglesPlacement).toBe("inline");
    expect(settings.placePresetNavigationMode).toBe("dropdown-swipe");
    expect(settings.wakeLockDuration).toBe("none");
    expect(settings.navigationAutoHide).toBe("none");
    expect(settings.compactLinePlanMode).toBe("auto");
    expect(settings.ghostNetworkStructuralOnly).toBe(false);
    expect(settings.trafficInfoDesign).toBe("ratp");
    expect(settings.trafficInfoDefaultScope).toBe("optimized");
    expect(settings.fullscreenStationPanelDesign).toBe("all-directions");
    expect(settings.fullscreenStationPanelDarkTheme).toBe(false);
    expect(settings.smartTrafficDetection).toBe(true);
    expect(settings.transferResolverMode).toBe("auto");
    expect(settings.transferBundleBackendCacheEnabled).toBe(true);
    expect(settings.transferBundleRetentionDays).toBe(15);
    expect(settings.transferBundleRequestConcurrency).toBe(1);
    expect(settings.transferBundleRequestSpacingMs).toBe(0);
    expect(settings.weatherMode).toBe("animated");
    expect(settings.weatherLookaheadMinutes).toBe(1440);
    expect(settings.weatherShowApparentTemperature).toBe(true);
    expect(settings.weatherLocationPreset).toBe("paris");
    expect(settings.weatherTestMode).toBe("off");
    expect(settings.weatherCustomLocation).toEqual({
      label: "Paris",
      latitude: 90,
      longitude: -180,
    });
  });

  it("applies fixed max departure settings without changing the default", () => {
    const defaults = createDefaultAppSettings();
    const custom = normalizeAppSettings({
      ...defaults,
      maxDeparturesPerDirection: "6",
    });

    expect(getEffectiveMaxDeparturesPerDirection(defaults)).toBeUndefined();
    expect(parseMaxDeparturesPerDirection("6")).toBe(6);
    expect(getEffectiveMaxDeparturesPerDirection(custom)).toBe(6);
    expect(parseWeatherLookaheadMinutes("120")).toBe(120);
    expect(parseWeatherLookaheadMinutes("999")).toBe(1440);
    expect(parseTransferBundleRetentionDays("30")).toBe(30);
    expect(parseTransferBundleRetentionDays("999")).toBe(15);
    expect(parseTransferBundleRequestConcurrency("3")).toBe(3);
    expect(parseTransferBundleRequestConcurrency("999")).toBe(1);
    expect(parseTransferBundleRequestSpacingMs("1000")).toBe(1000);
    expect(parseTransferBundleRequestSpacingMs("999999")).toBe(0);
  });

  it("migrates the previous place swipe toggle to the new selector mode", () => {
    expect(
      normalizeAppSettings({ placeSwipeNavigationEnabled: false })
        .placePresetNavigationMode,
    ).toBe("dropdown");
    expect(
      normalizeAppSettings({ placeSwipeNavigationEnabled: true })
        .placePresetNavigationMode,
    ).toBe("dropdown-swipe");
    expect(
      normalizeAppSettings({ placePresetNavigationMode: "swipe" })
        .placePresetNavigationMode,
    ).toBe("swipe");
  });

  it("exposes every transfer resolver mode option", () => {
    expect(transferResolverModeOptions.map((option) => option.id)).toEqual([
      "auto",
      "nearby",
    ]);
  });

  it("exposes every fullscreen station panel design option", () => {
    expect(
      fullscreenStationPanelDesignOptions.map((option) => option.id),
    ).toEqual(["all-directions", "double-stop", "home-card"]);
  });

  it("only hides directions that are explicitly marked as non-terminal", () => {
    const items = [
      { id: "terminal", isTerminal: true },
      { id: "intermediate", isTerminal: false },
      { id: "unknown" },
    ];

    expect(filterTerminalOnly(items, true).map((item) => item.id)).toEqual([
      "terminal",
      "unknown",
    ]);
    expect(filterTerminalOnly(items, false)).toEqual(items);
  });
});


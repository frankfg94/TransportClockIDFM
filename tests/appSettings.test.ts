import { describe, expect, it } from "vitest";
import {
  createDefaultAppSettings,
  compactLinePlanOptions,
  filterTerminalOnly,
  fullscreenStationPanelDesignOptions,
  getEffectiveMaxDeparturesPerDirection,
  normalizeAppSettings,
  parseMaxDeparturesPerDirection,
  parsePatternCompactBranchGap,
  parsePatternCompactForkGap,
  parsePatternRealisticMaxGapCoefficient,
  parsePatternRealisticMinGapCoefficient,
  parseTrafficWarningLookaheadDays,
  parseTransferBundleRetentionDays,
  parseTransferBundleRequestConcurrency,
  parseTransferBundleRequestSpacingMs,
  parseWeatherLookaheadMinutes,
  transferResolverModeOptions,
  trafficCalendarImpactScopeOptions,
} from "../src/features/app-settings/appSettings";

describe("app settings", () => {
  it("keeps current behaviour as the default", () => {
    expect(createDefaultAppSettings()).toMatchObject({
      language: "auto",
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
      pluginViewerMode: "grid",
      plugins: {
        "idfm-realtime-vehicles": {
          enabled: true,
          version: 1,
          value: {
            trackDistance: { enabled: true, source: "auto" },
            speed: { enabled: true },
            crowding: { enabled: true },
          },
        },
      },
      legacyPluginData: {},
      compactLinePlanMode: "compact",
      patternRoundedCurves: true,
      showInterruptionWalkingTimes: true,
      patternCompactBranchGap: 258,
      patternCompactForkGap: 158,
      patternRealisticMinGapCoefficient: 0.5,
      patternRealisticMaxGapCoefficient: 5,
      richTransferTooltips: true,
      ghostNetworkStructuralOnly: false,
      trafficCalendarImpactScope: "all-impacts",
      trafficInfoDesign: "ratp",
      trafficInfoDefaultScope: "optimized",
      trafficWarningLookaheadDays: 10,
      fullscreenStationPanelDesign: "all-directions",
      fullscreenStationPanelDarkTheme: false,
      smartTrafficDetection: true,
      smartTrafficModalFormatting: true,
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
      pluginViewerMode: "tiles",
      experimentalRealtimeVehicleVisualization: "sometimes",
      compactLinePlanMode: "tiny",
      patternRoundedCurves: "yes",
      showInterruptionWalkingTimes: "yes",
      patternCompactBranchGap: "9999",
      patternCompactForkGap: "-999",
      patternRealisticMinGapCoefficient: "2",
      patternRealisticMaxGapCoefficient: "0.5",
      ghostNetworkStructuralOnly: "yes",
      trafficCalendarImpactScope: "everything",
      trafficInfoDesign: "dense",
      trafficInfoDefaultScope: "everything",
      trafficWarningLookaheadDays: "999",
      fullscreenStationPanelDesign: "cinema",
      fullscreenStationPanelDarkTheme: "yes",
      smartTrafficDetection: "sometimes",
      smartTrafficModalFormatting: "sometimes",
      transferResolverMode: "telepathy",
      transferBundleBackendCacheEnabled: "no",
      transferBundleRetentionDays: "999",
      transferBundleRequestConcurrency: "999",
      transferBundleRequestSpacingMs: "999999",
      weatherMode: "cinematic",
      weatherLookaheadMinutes: "9999",
      weatherLocationPreset: "moon",
      weatherTestMode: "hail",
      language: "de",
      weatherCustomLocation: {
        label: "",
        latitude: "999",
        longitude: "-999",
      },
    });

    expect(settings.language).toBe("auto");
    expect(settings.closedDirectionSummaryMode).toBe("next");
    expect(settings.maxDeparturesPerDirection).toBe("default");
    expect(settings.showPatternMiniMap).toBe(true);
    expect(settings.showPatternCityZones).toBe(true);
    expect(settings.terminalDirectionsOnly).toBe(true);
    expect(settings.boardTogglesPlacement).toBe("inline");
    expect(settings.placePresetNavigationMode).toBe("dropdown-swipe");
    expect(settings.wakeLockDuration).toBe("none");
    expect(settings.navigationAutoHide).toBe("none");
    expect(settings.pluginViewerMode).toBe("grid");
    expect(settings.plugins["idfm-realtime-vehicles"].enabled).toBe(true);
    expect(settings.compactLinePlanMode).toBe("compact");
    expect(settings.patternRoundedCurves).toBe(true);
    expect(settings.showInterruptionWalkingTimes).toBe(true);
    expect(settings.patternCompactBranchGap).toBe(360);
    expect(settings.patternCompactForkGap).toBe(110);
    expect(settings.patternRealisticMinGapCoefficient).toBe(1.25);
    expect(settings.patternRealisticMaxGapCoefficient).toBe(1.25);
    expect(settings.ghostNetworkStructuralOnly).toBe(false);
    expect(settings.trafficCalendarImpactScope).toBe("all-impacts");
    expect(settings.trafficInfoDesign).toBe("ratp");
    expect(settings.trafficInfoDefaultScope).toBe("optimized");
    expect(settings.trafficWarningLookaheadDays).toBe(30);
    expect(settings.fullscreenStationPanelDesign).toBe("all-directions");
    expect(settings.fullscreenStationPanelDarkTheme).toBe(false);
    expect(settings.smartTrafficDetection).toBe(true);
    expect(settings.smartTrafficModalFormatting).toBe(true);
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

  it("normalizes and exposes the calendar impact scope", () => {
    expect(
      normalizeAppSettings({
        trafficCalendarImpactScope: "interruptions-only",
      }).trafficCalendarImpactScope,
    ).toBe("interruptions-only");
    expect(trafficCalendarImpactScopeOptions.map((option) => option.id)).toEqual([
      "interruptions-only",
      "all-impacts",
    ]);
  });

  it("preserves the smart traffic modal formatting preference", () => {
    expect(
      normalizeAppSettings({ smartTrafficModalFormatting: false })
        .smartTrafficModalFormatting,
    ).toBe(false);
  });

  it("preserves the interruption walking time preference", () => {
    expect(
      normalizeAppSettings({ showInterruptionWalkingTimes: false })
        .showInterruptionWalkingTimes,
    ).toBe(false);
  });

  it("preserves the experimental realtime vehicle visualization preference", () => {
    expect(
      normalizeAppSettings({ experimentalRealtimeVehicleVisualization: false })
        .plugins["idfm-realtime-vehicles"].enabled,
    ).toBe(false);
  });

  it("preserves a valid plugin viewer mode", () => {
    expect(
      normalizeAppSettings({ pluginViewerMode: "list" }).pluginViewerMode,
    ).toBe("list");
  });

  it("preserves settings for plugins missing from the current build", () => {
    expect(
      normalizeAppSettings({
        plugins: {
          "private-plugin": {
            enabled: false,
            value: { displayMode: "compact" },
            version: 4,
          },
        },
      }).plugins["private-plugin"],
    ).toEqual({
      enabled: false,
      value: { displayMode: "compact" },
      version: 4,
    });
  });

  it("normalizes every realtime position parameter and its options", () => {
    const settings = normalizeAppSettings({
      experimentalRealtimeVehicleParameters: {
        trackDistance: {
          enabled: false,
          source: "gtfs",
          maxProjectionErrorMeters: 99_999,
        },
        speed: {
          enabled: true,
          smoothing: -2,
          maxPlausibleKph: 500,
          longSegmentMeters: 50,
        },
        crowding: { enabled: false },
      },
    }).plugins["idfm-realtime-vehicles"].value as {
      trackDistance: Record<string, unknown>;
      speed: Record<string, unknown>;
      crowding: { enabled: boolean };
      trafficState: { enabled: boolean };
    };

    expect(settings.trackDistance).toEqual({
      enabled: false,
      source: "gtfs",
      maxProjectionErrorMeters: 1_000,
    });
    expect(settings.speed).toMatchObject({
      enabled: true,
      smoothing: 0,
      maxPlausibleKph: 350,
      longSegmentMeters: 300,
    });
    expect(settings.crowding.enabled).toBe(false);
    expect(settings.trafficState.enabled).toBe(true);
  });

  it("accepts the realistic line plan mode", () => {
    expect(compactLinePlanOptions).toContainEqual({
      id: "realistic",
      label: "Realistic view",
    });
    expect(
      normalizeAppSettings({ compactLinePlanMode: "realistic" })
        .compactLinePlanMode,
    ).toBe("realistic");
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
    expect(parseTrafficWarningLookaheadDays("0")).toBe(0);
    expect(parseTrafficWarningLookaheadDays("14")).toBe(14);
    expect(parseTrafficWarningLookaheadDays("999")).toBe(30);
    expect(parsePatternCompactBranchGap("300")).toBe(300);
    expect(parsePatternCompactBranchGap("9999")).toBe(360);
    expect(parsePatternCompactForkGap("180")).toBe(180);
    expect(parsePatternCompactForkGap("-1")).toBe(110);
    expect(parsePatternRealisticMinGapCoefficient("0.75")).toBe(0.75);
    expect(parsePatternRealisticMinGapCoefficient("9")).toBe(1.25);
    expect(parsePatternRealisticMaxGapCoefficient("3", 0.75)).toBe(3);
    expect(parsePatternRealisticMaxGapCoefficient("0.5", 1.25)).toBe(1.25);
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


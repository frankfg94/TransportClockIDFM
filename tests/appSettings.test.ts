import { describe, expect, it } from "vitest";
import {
  createDefaultAppSettings,
  filterTerminalOnly,
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
      closedDirectionSummaryMode: "last",
      maxDeparturesPerDirection: "default",
      showPatternMiniMap: true,
      terminalDirectionsOnly: false,
      wakeLockDuration: "none",
      wakeDeviceOnAlarm: true,
      navigationAutoHide: "none",
      compactLinePlanMode: "auto",
      richTransferTooltips: true,
      trafficInfoDesign: "ratp",
      trafficInfoDefaultScope: "optimized",
      transferResolverMode: "auto",
      transferBundleRetentionDays: 15,
      transferBundleRequestConcurrency: 1,
      transferBundleRequestSpacingMs: 0,
      weatherMode: "animated",
      weatherLookaheadMinutes: 1440,
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
      terminalDirectionsOnly: true,
      wakeLockDuration: "forever",
      navigationAutoHide: "always",
      compactLinePlanMode: "tiny",
      trafficInfoDesign: "dense",
      trafficInfoDefaultScope: "everything",
      transferResolverMode: "telepathy",
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

    expect(settings.closedDirectionSummaryMode).toBe("last");
    expect(settings.maxDeparturesPerDirection).toBe("default");
    expect(settings.showPatternMiniMap).toBe(true);
    expect(settings.terminalDirectionsOnly).toBe(true);
    expect(settings.wakeLockDuration).toBe("none");
    expect(settings.navigationAutoHide).toBe("none");
    expect(settings.compactLinePlanMode).toBe("auto");
    expect(settings.trafficInfoDesign).toBe("ratp");
    expect(settings.trafficInfoDefaultScope).toBe("optimized");
    expect(settings.transferResolverMode).toBe("auto");
    expect(settings.transferBundleRetentionDays).toBe(15);
    expect(settings.transferBundleRequestConcurrency).toBe(1);
    expect(settings.transferBundleRequestSpacingMs).toBe(0);
    expect(settings.weatherMode).toBe("animated");
    expect(settings.weatherLookaheadMinutes).toBe(1440);
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

  it("exposes every transfer resolver mode option", () => {
    expect(transferResolverModeOptions.map((option) => option.id)).toEqual([
      "auto",
      "nearby",
    ]);
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


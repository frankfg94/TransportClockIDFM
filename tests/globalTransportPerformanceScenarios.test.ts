import { describe, expect, it } from "vitest";
import {
  DEFAULT_SELECTED_LINE_ZOOM_TARGET,
  parseGlobalTransportPerformanceScenarioConfig,
} from "../src/features/line-map/useGlobalTransportPerformanceScenarios";

describe("global transport performance scenario config", () => {
  it("keeps the selected-line scenario disabled unless debug mode opts in", () => {
    expect(
      parseGlobalTransportPerformanceScenarioConfig(
        { mapPerfScenario: "selected-line-wheel", mapPerfMode: "coverage" },
        false,
      ),
    ).toEqual({
      extremeChaosEnabled: false,
      selectedLineWheelEnabled: false,
      selectedLineZoomTarget: DEFAULT_SELECTED_LINE_ZOOM_TARGET,
      selectedLineZoomMode: "coverage",
      selectedLineWheelCoverageDelayMs: 0,
      selectedLineZoomRequestedCycles: 3,
      selectedLineZoomGesture: undefined,
      selectedLineZoomLowPauseMs: 0,
      selectedLineCoverOverride: undefined,
    });
  });

  it("parses and clamps coverage controls and custom wheel gestures", () => {
    expect(
      parseGlobalTransportPerformanceScenarioConfig(
        {
          line: ["line:metro:14", "ignored"],
          mapPerfScenario: "selected-line-wheel",
          mapPerfMode: "coverage",
          mapTileDebugDelayMs: "1400",
          mapPerfCycles: "24.8",
          mapPerfRange: "17:12",
          mapPerfEvents: "12",
          mapPerfDurationMs: "2400",
          mapPerfPauseAtLowMs: "420",
          mapLineCover: "0",
        },
        true,
      ),
    ).toEqual({
      extremeChaosEnabled: false,
      selectedLineWheelEnabled: true,
      selectedLineZoomTarget: "line:metro:14",
      selectedLineZoomMode: "coverage",
      selectedLineWheelCoverageDelayMs: 1_000,
      selectedLineZoomRequestedCycles: 20,
      selectedLineZoomGesture: {
        startZoom: 17,
        endZoom: 12,
        eventCount: 12,
        durationMs: 2_400,
      },
      selectedLineZoomLowPauseMs: 420,
      selectedLineCoverOverride: false,
    });
  });

  it("recognizes only the fixed extreme scenario in debug mode", () => {
    expect(
      parseGlobalTransportPerformanceScenarioConfig(
        {
          mapPerfScenario: "chaos-zoom-extreme",
          mapPerfSeed: "123",
          mapPerfDurationMs: "1",
          mapPerfRange: "1:24",
        },
        true,
      ).extremeChaosEnabled,
    ).toBe(true);
    expect(
      parseGlobalTransportPerformanceScenarioConfig(
        { mapPerfScenario: "chaos-zoom-extreme" },
        false,
      ).extremeChaosEnabled,
    ).toBe(false);
    expect(
      parseGlobalTransportPerformanceScenarioConfig(
        { mapPerfScenario: "chaos-zoom-extreme-v2" },
        true,
      ).extremeChaosEnabled,
    ).toBe(false);
  });

  it("ignores malformed gesture ranges while retaining safe defaults", () => {
    const config = parseGlobalTransportPerformanceScenarioConfig(
      {
        mapPerfScenario: "selected-line-wheel",
        mapPerfRange: "12:17",
        mapPerfEvents: "0",
        mapPerfDurationMs: "50",
        mapPerfPauseAtLowMs: "not-a-number",
        mapLineCover: "2",
      },
      true,
    );

    expect(config.selectedLineWheelEnabled).toBe(true);
    expect(config.selectedLineZoomMode).toBe("performance");
    expect(config.selectedLineZoomRequestedCycles).toBe(6);
    expect(config.selectedLineZoomGesture).toBeUndefined();
    expect(config.selectedLineZoomLowPauseMs).toBe(0);
    expect(config.selectedLineCoverOverride).toBeUndefined();
  });
});

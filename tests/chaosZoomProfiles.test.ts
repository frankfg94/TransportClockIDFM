import { describe, expect, it } from "vitest";
import {
  EXTREME_CHAOS_ZOOM_PROFILE,
  createExtremeChaosZoomTrace,
} from "../src/features/line-map/chaosZoomProfiles";
import {
  createChaosZoomExtremeNetworkInvariantDiagnostic,
  recordChaosZoomExtremeNetworkViolation,
  retainWorstChaosZoomSpikes,
  type ChaosZoomExtremePreparation,
  type ChaosZoomExtremeNetworkState,
  validateChaosZoomExtremeNetwork,
} from "../src/features/line-map/useChaosZoom";

describe("Chaos Zoom extreme profile", () => {
  it("generates one deterministic, versioned 46-action trace", () => {
    const first = createExtremeChaosZoomTrace();
    const second = createExtremeChaosZoomTrace();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first).toHaveLength(46);
    expect(EXTREME_CHAOS_ZOOM_PROFILE).toMatchObject({
      id: "extreme",
      version: 2,
      seed: 0x5eed2026,
      minimumZoom: 8.5,
      maximumZoom: 18,
      maximumCenterDistanceKm: 1.5,
    });
  });

  it("crosses the 11, 14 and 17 LOD boundaries without leaving the zoom range", () => {
    const trace = createExtremeChaosZoomTrace();
    const zooms = trace.flatMap((action) =>
      action.targetZoom === undefined ? [] : [action.targetZoom],
    );

    expect(zooms.every((zoom) => zoom >= 8.5 && zoom <= 18)).toBe(true);
    expect(zooms).toEqual(expect.arrayContaining([10.6, 11.4, 13.6, 14.4, 16.6, 17.4]));
    expect(trace.filter((action) => action.phase === "dense-paris")).toHaveLength(8);
    expect(trace.filter((action) => action.phase === "center-drift")).toHaveLength(8);
    expect(trace.filter((action) => action.phase === "mixed-chaos")).toHaveLength(12);
  });

  it("keeps every explicit target within 1.2 km of Châtelet", () => {
    const centeredActions = createExtremeChaosZoomTrace().filter(
      (action) => action.targetCenter !== undefined,
    );
    expect(centeredActions).toHaveLength(20);
    expect(
      centeredActions.every(
        (action) =>
          action.targetDistanceKm !== undefined &&
          action.targetDistanceKm >= 0.1 &&
          action.targetDistanceKm <= 1.2,
      ),
    ).toBe(true);
  });

  it("uses centered wheel anchors and only micro-pans", () => {
    for (const action of createExtremeChaosZoomTrace()) {
      expect(action.anchorRatioX).toBeGreaterThanOrEqual(0.48);
      expect(action.anchorRatioX).toBeLessThanOrEqual(0.52);
      expect(action.anchorRatioY).toBeGreaterThanOrEqual(0.48);
      expect(action.anchorRatioY).toBeLessThanOrEqual(0.52);
      if (action.panFromRatioX !== undefined && action.panToRatioX !== undefined) {
        expect(Math.abs(action.panToRatioX - action.panFromRatioX)).toBeLessThanOrEqual(0.008);
      }
      if (action.panFromRatioY !== undefined && action.panToRatioY !== undefined) {
        expect(Math.abs(action.panToRatioY - action.panFromRatioY)).toBeLessThanOrEqual(0.008);
      }
    }
  });

  it("uses short seeded pauses and a commit window every third burst", () => {
    const trace = createExtremeChaosZoomTrace();
    for (const action of trace) {
      if (action.commitPause) {
        expect(action.pauseMs).toBeGreaterThanOrEqual(400);
        expect(action.pauseMs).toBeLessThanOrEqual(700);
        expect((action.index + 1) % 3).toBe(0);
      } else {
        expect(action.pauseMs).toBeGreaterThanOrEqual(80);
        expect(action.pauseMs).toBeLessThanOrEqual(250);
      }
    }
  });

  it("retains only the 24 worst frame spikes", () => {
    const spikes: Array<{ durationMs: number }> = [];
    for (let durationMs = 1; durationMs <= 40; durationMs += 1) {
      retainWorstChaosZoomSpikes(spikes, { durationMs });
    }
    expect(spikes).toHaveLength(24);
    expect(spikes[0]?.durationMs).toBe(40);
    expect(spikes.at(-1)?.durationMs).toBe(17);
  });

  it("asserts that Extreme runs use the full network", () => {
    const preparation: ChaosZoomExtremePreparation = {
      availableModes: ["METRO", "RER", "BUS"],
      activeModes: ["BUS", "METRO", "RER"],
    };
    const valid = validateChaosZoomExtremeNetwork(preparation, undefined, undefined);
    const reduced = validateChaosZoomExtremeNetwork(preparation, "line:14", "line:14");

    expect(valid).toMatchObject({
      fullNetworkExpected: true,
      fullNetwork: true,
      noActiveLine: true,
      noDetailLine: true,
      allModesActive: true,
      reducedBySelection: false,
    });
    expect(reduced).toMatchObject({
      fullNetworkExpected: true,
      fullNetwork: false,
      reducedBySelection: true,
    });
    expect(reduced.warning).toBeDefined();
  });

  it("records and immediately clears a rogue line activation during Extreme", () => {
    const state: ChaosZoomExtremeNetworkState = {
      availableModes: ["METRO", "RER", "BUS"],
      activeModes: ["METRO", "RER", "BUS"],
      activeLineId: undefined as string | undefined,
      detailLineId: undefined as string | undefined,
    };
    const diagnostic = createChaosZoomExtremeNetworkInvariantDiagnostic();

    state.activeLineId = "line:14";
    state.detailLineId = "line:14";
    recordChaosZoomExtremeNetworkViolation(state, diagnostic, 37.25);

    if (state.activeLineId || state.detailLineId) {
      state.activeLineId = undefined;
      state.detailLineId = undefined;
    }

    expect(diagnostic).toMatchObject({
      violationCount: 1,
      firstViolationAtMs: 37.25,
      activeLineIdsSeen: ["line:14"],
      detailLineIdsSeen: ["line:14"],
      modeMismatchCount: 0,
    });
    expect(
      validateChaosZoomExtremeNetwork(
        { availableModes: [...state.availableModes], activeModes: [...state.activeModes] },
        state.activeLineId,
        state.detailLineId,
      ).fullNetwork,
    ).toBe(true);
  });
});

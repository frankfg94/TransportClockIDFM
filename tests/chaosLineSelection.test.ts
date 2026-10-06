import { describe, expect, it } from "vitest";
import { translate } from "../src/i18n";
import type { GlobalMapLine } from "../src/features/transport-map/contracts/manifest";
import { createChaosLineSelectionTrace, summarizeSelectionStutters, type SelectionChaosFrame } from "../src/features/line-map/useChaosLineSelection";
const lines = ["a", "b", "c"].map(id => ({ id, stationIds: ["station"] }) as GlobalMapLine);
describe("chaotic line selection", () => {
  it("translates the button and progress in both languages", () => {
    expect(translate("fr", "globalMap.page.chaosZoom.selectionButton")).toBe("Chaos sélection de lignes");
    expect(translate("en", "globalMap.page.chaosZoom.selectionRunning", { step: 3, total: 30 })).toBe("Chaos selection… 3/30");
  });
  it("replays the same catalog independent of input order, with no consecutive repeat", () => {
    const first = createChaosLineSelectionTrace(lines);
    expect(first).toHaveLength(30);
    expect(first).toEqual(createChaosLineSelectionTrace([...lines].reverse()));
    expect(first.every((line, index) => index === 0 || first[index - 1]?.id !== line.id)).toBe(true);
    expect(new Set(first.map(line => line.id)).size).toBe(3);
  });
  it("skips unselectable lines and handles empty/single line catalogs", () => {
    expect(createChaosLineSelectionTrace([{ id: "empty", stationIds: [] } as unknown as GlobalMapLine])).toEqual([]);
    expect(createChaosLineSelectionTrace([lines[0]!])).toHaveLength(30);
  });
  it("detects micro stutters and dropped vsyncs on a 120Hz display", () => {
    const frames = [8.333, 8.334, 12, 25, 8.333].map((durationMs, index) => ({ durationMs, startMs: index * 10, endMs: index * 10 + durationMs, actionIndex: 0, lineId: "a", phase: "animation" }) as SelectionChaosFrame);
    const summary = summarizeSelectionStutters(frames, 1000 / 120);
    expect(summary.stutterCount).toBe(2);
    expect(summary.estimatedMissedVsyncs).toBe(2);
    expect(summary.longestConsecutiveStutters).toBe(2);
    expect(summary.maxFrameTimeMs).toBe(25);
    expect(summary.averageFps).toBeCloseTo(1000 * 5 / frames.reduce((sum, frame) => sum + frame.durationMs, 0), 1);
  });
});

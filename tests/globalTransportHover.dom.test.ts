import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref, type Ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  GlobalMapLine,
  GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";
import { createCamera } from "../src/features/transport-map/geo/camera";
import type {
  LineHitCandidate,
  TransportMapHitCandidates,
} from "../src/features/transport-map/spatial/hitTest";
import { useGlobalTransportHover } from "../src/features/line-map/useGlobalTransportHover";

const stationA = {
  id: "station:a",
  index: 0,
  name: "Châtelet",
  worldX: 0.5,
  worldY: 0.5,
} as GlobalMapStation;
const stationB = {
  id: "station:b",
  index: 1,
  name: "Louvre",
  worldX: 0.52,
  worldY: 0.5,
} as GlobalMapStation;
const lineA = {
  id: "line:a",
  label: "A",
  mode: "METRO",
} as GlobalMapLine;
const lineB = {
  id: "line:b",
  label: "B",
  mode: "RER",
} as GlobalMapLine;
const network = {
  stationsById: new Map([
    [stationA.id, stationA],
    [stationB.id, stationB],
  ]),
  linesById: new Map([
    [lineA.id, lineA],
    [lineB.id, lineB],
  ]),
} as unknown as TransportMapNetwork;

function candidate(line: GlobalMapLine, distanceCssPx: number): LineHitCandidate {
  return {
    type: "line",
    id: line.id,
    pathId: `path:${line.id}`,
    distanceCssPx,
    distanceMeters: distanceCssPx,
  };
}

function mountHoverHarness(
  hit: Ref<TransportMapHitCandidates>,
  draw = vi.fn(),
  previewLineId = ref<string>(),
) {
  const hitTest = vi.fn(() => hit.value);
  let controller: ReturnType<typeof useGlobalTransportHover> | undefined;
  const host = defineComponent({
    setup() {
      controller = useGlobalTransportHover({
        getNetwork: () => network,
        getCamera: () => createCamera(),
        hitTest,
        isWheelScrolling: () => false,
        hasActivePointers: () => false,
        draw,
        setSidebarPreviewLineId: (lineId) => {
          previewLineId.value = lineId;
        },
        getSidebarPreviewLineId: () => previewLineId.value,
        selectFeature: () => undefined,
        getFocusableStations: () => [],
        getActiveStationId: () => undefined,
        selectStation: () => undefined,
      });
      return () => h("div");
    },
  });
  const harnessWrapper = mount(host);
  if (!controller) throw new Error("hover controller was not created");
  return { controller, draw, hitTest, previewLineId, wrapper: harnessWrapper };
}

describe("useGlobalTransportHover", () => {
  let wrapper: VueWrapper | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
  });

  it("owns station hover, line candidates, tooltip transitions and selection", async () => {
    const hit = ref<TransportMapHitCandidates>({ lines: [] });
    const previewLineId = ref<string>();
    const activeStationId = ref<string>();
    const selectedFeature: TransportMapHitCandidates[] = [];
    const selectedLines: GlobalMapLine[] = [];
    const draw = vi.fn();
    const focusTooltipChoice = vi.fn();
    let controller: ReturnType<typeof useGlobalTransportHover> | undefined;

    const host = defineComponent({
      setup() {
        controller = useGlobalTransportHover({
          getNetwork: () => network,
          getCamera: () => ({
            ...createCamera(),
            viewportWidthCssPx: 400,
            viewportHeightCssPx: 300,
          }),
          hitTest: () => hit.value,
          isWheelScrolling: () => false,
          hasActivePointers: () => false,
          draw,
          setSidebarPreviewLineId: (lineId) => {
            previewLineId.value = lineId;
          },
          getSidebarPreviewLineId: () => previewLineId.value,
          selectFeature: (feature) => selectedFeature.push(feature),
          selectLine: (line) => {
            selectedLines.push(line);
          },
          getFocusableStations: () => [stationA, stationB],
          getActiveStationId: () => activeStationId.value,
          selectStation: (stationId) => {
            activeStationId.value = stationId;
          },
          focusTooltipChoice,
          isStationHitVisible: () => true,
        });
        return () => h("div");
      },
    });

    wrapper = mount(host);
    if (!controller) throw new Error("hover controller was not created");

    hit.value = {
      station: { type: "station", id: stationA.id, distanceCssPx: 3 },
      lines: [],
    };
    controller.update({ x: 100, y: 80 });
    expect(controller.hoveredFeature.value).toEqual({
      type: "station",
      id: stationA.id,
      distanceCssPx: 3,
    });
    expect(controller.hoveredFeatureLabel.value).toBe("Châtelet");
    expect(controller.tooltipStyle.value.left).toBeDefined();

    const candidates = [candidate(lineA, 2), candidate(lineB, 4)];
    hit.value = { lines: candidates };
    controller.update({ x: 120, y: 90 });
    expect(controller.hoveredTooltipLines.value.map((line) => line.id)).toEqual([
      lineA.id,
      lineB.id,
    ]);

    controller.openLineChoice(candidates);
    await nextTick();
    expect(controller.lineChoiceOpen.value).toBe(true);
    expect(previewLineId.value).toBe(lineA.id);
    expect(focusTooltipChoice).toHaveBeenCalledTimes(1);

    controller.setHoveredTooltipLine(lineB.id);
    expect(controller.hoveredFeature.value?.id).toBe(lineB.id);
    expect(previewLineId.value).toBe(lineB.id);
    controller.restoreHoveredTooltipLine();
    expect(controller.hoveredFeature.value?.id).toBe(lineA.id);
    expect(previewLineId.value).toBeUndefined();

    controller.selectHoveredFeature();
    expect(selectedFeature.at(-1)?.lines).toEqual(candidates);
    controller.selectTooltipLine(lineB.id);
    expect(selectedLines).toEqual([lineB]);
    expect(controller.hoveredFeature.value).toBeUndefined();
    expect(previewLineId.value).toBeUndefined();

    hit.value = { lines: [] };
    controller.focusFeature(1);
    expect(activeStationId.value).toBe(stationA.id);
    expect(controller.hoveredFeature.value?.id).toBe(stationA.id);
    controller.clear();
    expect(controller.hoveredFeature.value).toBeUndefined();
    expect(draw).toHaveBeenCalled();
  });

  it("keeps a tooltip candidate alive across the canvas leave and clears it outside", () => {
    let controller: ReturnType<typeof useGlobalTransportHover> | undefined;
    const host = defineComponent({
      setup() {
        controller = useGlobalTransportHover({
          getNetwork: () => network,
          getCamera: () => createCamera(),
          hitTest: () => ({ lines: [] }),
          isWheelScrolling: () => false,
          hasActivePointers: () => false,
          draw: vi.fn(),
          setSidebarPreviewLineId: () => undefined,
          getSidebarPreviewLineId: () => undefined,
          selectFeature: () => undefined,
          getFocusableStations: () => [],
          getActiveStationId: () => undefined,
          selectStation: () => undefined,
        });
        return () => h("div");
      },
    });
    const localWrapper = mount(host);
    wrapper = localWrapper;
    if (!controller) throw new Error("hover controller was not created");

    controller.openLineChoice([candidate(lineA, 1), candidate(lineB, 2)], new MouseEvent("click"));
    controller.leave(new PointerEvent("pointerleave", { relatedTarget: document.body }));
    expect(controller.hoveredFeature.value?.id).toBe(lineA.id);
    controller.clear();
    expect(controller.hoveredFeature.value).toBeUndefined();
  });

  it("keeps hit-testing an empty background without scheduling redundant draws", () => {
    const hit = ref<TransportMapHitCandidates>({ lines: [] });
    const harness = mountHoverHarness(hit);
    wrapper = harness.wrapper;
    const emptyCandidates = harness.controller.hoveredLineCandidates.value;

    harness.controller.update({ x: 10, y: 20 });
    harness.controller.update({ x: 11, y: 21 });
    harness.controller.update({ x: 12, y: 22 });

    expect(harness.hitTest).toHaveBeenCalledTimes(3);
    expect(harness.draw).not.toHaveBeenCalled();
    expect(harness.controller.hoveredFeature.value).toBeUndefined();
    expect(harness.controller.hoveredPointer.value).toBeUndefined();
    expect(harness.controller.hoveredLineCandidates.value).toBe(emptyCandidates);
  });

  it.each([
    [
      "station",
      {
        station: { type: "station", id: stationA.id, distanceCssPx: 2 },
        lines: [],
      },
    ],
    [
      "line",
      {
        lines: [candidate(lineA, 2)],
      },
    ],
    [
      "isochrone",
      {
        lines: [],
        isochrone: {
          type: "isochrone",
          id: "isochrone:a",
          distanceCssPx: 0,
          surfaces: [],
        },
      },
    ],
  ] satisfies Array<[string, TransportMapHitCandidates]>)(
    "clears a %s hover and skips later empty draws",
    (_kind, activeHit) => {
      const hit = ref<TransportMapHitCandidates>({ lines: [] });
      const harness = mountHoverHarness(hit);
      wrapper = harness.wrapper;

      hit.value = activeHit;
      harness.controller.update({ x: 10, y: 20 });
      expect(harness.draw).toHaveBeenCalledTimes(1);

      hit.value = { lines: [] };
      harness.controller.update({ x: 11, y: 21 });
      expect(harness.draw).toHaveBeenCalledTimes(2);
      expect(harness.controller.hoveredFeature.value).toBeUndefined();
      expect(harness.controller.hoveredPointer.value).toBeUndefined();
      expect(harness.controller.hoveredLineCandidates.value).toEqual([]);
      const clearedCandidates = harness.controller.hoveredLineCandidates.value;

      harness.controller.update({ x: 12, y: 22 });
      expect(harness.hitTest).toHaveBeenCalledTimes(3);
      expect(harness.draw).toHaveBeenCalledTimes(2);
      expect(harness.controller.hoveredLineCandidates.value).toBe(clearedCandidates);
    },
  );

  it("clears a residual sidebar preview before skipping empty hover updates", () => {
    const hit = ref<TransportMapHitCandidates>({ lines: [] });
    const harness = mountHoverHarness(hit, vi.fn(), ref(lineA.id));
    wrapper = harness.wrapper;
    const emptyCandidates = harness.controller.hoveredLineCandidates.value;

    harness.controller.update({ x: 10, y: 20 });

    expect(harness.previewLineId.value).toBeUndefined();
    expect(harness.draw).toHaveBeenCalledTimes(1);
    expect(harness.controller.hoveredLineCandidates.value).toBe(emptyCandidates);

    harness.controller.update({ x: 11, y: 21 });
    expect(harness.hitTest).toHaveBeenCalledTimes(2);
    expect(harness.draw).toHaveBeenCalledTimes(1);
  });
});

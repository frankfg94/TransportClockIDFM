import { afterEach, describe, expect, it, vi } from "vitest";
import type { Layer } from "@deck.gl/core";
import type { TransportMapRenderFrame } from "../src/features/transport-map/contracts/renderer";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { MapLibreDeckOverlayPresenter } from "../src/features/transport-map/next/deckMapPresenter";
import type { TransportMapLabelRenderRecord } from "../src/features/transport-map/render/transportMapRenderModel";
import { interpolateStationLabelTranslation, STATION_LABEL_TRANSLATION_DURATION_MS } from "../src/features/transport-map/render/stationLabelTranslation";
import { measureTransportMapLabelTextWidth } from "../src/features/transport-map/render/stationLabelPlacement";

const label = (offset: readonly [number, number], anchor: "start" | "end" = "start"): TransportMapLabelRenderRecord => ({
  id: "station-label:alpha", text: "Alpha", position: [2, 48], pixelOffsetCssPx: offset,
  textAnchor: anchor, sizeCssPx: 13, color: [15, 23, 42, 255], priority: 1,
});
const screenLeft = (record: TransportMapLabelRenderRecord) => record.pixelOffsetCssPx![0]
  - (record.textAnchor === "end" ? measureTransportMapLabelTextWidth(record.text, record.sizeCssPx) : 0);

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("station label correspondence translation", () => {
  it("moves in both directions over 500ms, including a text-anchor change", () => {
    expect(STATION_LABEL_TRANSLATION_DURATION_MS).toBe(500);
    const ordinary = label([-18, 18], "end");
    const correspondences = label([22, 0]);
    for (const [from, to] of [[ordinary, correspondences], [correspondences, ordinary]]) {
      const beginning = interpolateStationLabelTranslation([from!], [to!], 0)[0]!;
      const halfway = interpolateStationLabelTranslation([from!], [to!], .5)[0]!;
      expect(screenLeft(beginning)).toBeCloseTo(screenLeft(from!));
      expect(screenLeft(halfway)).toBeCloseTo((screenLeft(from!) + screenLeft(to!)) / 2);
      expect(halfway.pixelOffsetCssPx![1]).toBeCloseTo(9);
      expect(interpolateStationLabelTranslation([from!], [to!], 1)[0]).toBe(to);
    }
  });

  it("matches station IDs and keeps entrance labels unchanged", () => {
    const from = [label([0, 0]), { ...label([100, 0]), id: "station-label:beta" }];
    const entrance = { ...label([3, 4]), id: "entrance-label:door" };
    const to = [{ ...label([200, 0]), id: "station-label:beta" }, label([50, 0]), entrance];
    const middle = interpolateStationLabelTranslation(from, to, .5);
    expect(middle.map((entry) => entry.pixelOffsetCssPx)).toEqual([[150, 0], [25, 0], [3, 4]]);
    expect(middle[2]).toBe(entrance);
  });

  it("fades names added or removed by decluttering", () => {
    const from = [label([0, 0])];
    const to = [{ ...label([20, 0]), id: "station-label:beta" }];
    expect(interpolateStationLabelTranslation(from, to, .5).map((entry) => entry.color[3])).toEqual([127.5, 127.5]);
    expect(interpolateStationLabelTranslation(from, to, 1)).toBe(to);
  });

  it("animates Deck names only, reverses from the current position, and cancels on disposal", () => {
    let timestamp = 0;
    vi.spyOn(performance, "now").mockImplementation(() => timestamp);
    const frames = new Map<number, FrameRequestCallback>();
    let sequence = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const tick = (time: number) => {
      timestamp = time;
      const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(time));
    };
    const camera = createCamera({ centerWorldX: .5, centerWorldY: .5, zoom: 13, viewportWidthCssPx: 800, viewportHeightCssPx: 600 });
    let published: Layer[] = [];
    const presenter = new MapLibreDeckOverlayPresenter({
      getCenter: () => ({ lng: 0, lat: 0 }), getZoom: () => 13,
      jumpTo: () => {}, getStyle: () => ({ layers: [] }), triggerRepaint: () => {},
    } as never, { setProps: (props: { layers: Layer[] }) => { published = props.layers; } });
    const base: TransportMapRenderFrame = {
      camera,
      scene: { activeLineId: "line:alpha", lines: [], paths: [], stations: [], selectedStationIds: [], visibleModeMask: 0 },
      model: { sceneVersion: 1, pathCount: 0, vertexCount: 0, basePaths: [], trafficPaths: [], highlightPaths: [], stations: [], quays: [], entrances: [], labels: [label([18, -16])] },
    };
    const on: TransportMapRenderFrame = { ...base,
      scene: { ...base.scene, selectedLineAnnotationLayout: { key: "on", orientation: "vertical", connectionIconBoxes: [] } },
      model: { ...base.model, labels: [label([120, 0])] },
    };
    const currentLabel = () => (published.find((layer) => layer.id === "transport-labels")!.props.data as TransportMapLabelRenderRecord[])[0]!;
    presenter.present(base);
    presenter.present(on);
    expect(currentLabel().pixelOffsetCssPx).toEqual([18, -16]);
    tick(250);
    expect(currentLabel().pixelOffsetCssPx).toEqual([69, -8]);
    presenter.present(base);
    expect(currentLabel().pixelOffsetCssPx).toEqual([69, -8]);
    tick(500);
    expect(currentLabel().pixelOffsetCssPx).toEqual([43.5, -12]);
    tick(750);
    expect(currentLabel()).toBe(base.model.labels[0]);
    expect(frames.size).toBe(0);
    expect(presenter.getPresentationMetrics().layerRebuilds).toBe(1);
    presenter.present(on);
    presenter.setStationLabelFadeEnabled(false);
    expect(currentLabel()).toBe(on.model.labels[0]);
    expect(frames.size).toBe(0);
    presenter.setStationLabelFadeEnabled(true);
    presenter.present(base);
    expect(frames.size).toBe(1);
    presenter.dispose();
    expect(frames.size).toBe(0);
  });
});

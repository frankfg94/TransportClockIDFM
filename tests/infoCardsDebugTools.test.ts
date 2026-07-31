import { describe, expect, it } from "vitest";
import {
  checkDuplicateInfoCards,
  getInfoCardInfos,
  type InfoCardDebugMarker,
} from "../src/features/service-pattern/infoCardsDebugTools/infoCardsDebugTools";

function createMarker(
  markerId: string,
  overrides: Partial<InfoCardDebugMarker> = {},
): InfoCardDebugMarker {
  return {
    markerId,
    groupId: markerId,
    kind: "interruption",
    replacementBus: true,
    segmentIds: [`segment-${markerId}`],
    stationKeys: ["station-a", "station-b"],
    edgeKeys: ["station-a--station-b"],
    text: {
      statusLabel: "Bus de remplacement",
      detailLabel: "Reprise le 23 août",
      endDateLabel: "2026-08-23",
    },
    disruption: {
      id: "disruption-a",
      title: "Travaux",
      message: "Message original",
      kind: "works",
      applicationPeriods: [],
      impactedLineRefs: [],
      impactedStopNames: [],
    },
    anchor: { x: 200, y: 150 },
    card: { x: 100, y: 0, width: 200, height: 100 },
    placement: "above",
    connector: {
      height: 50,
      length: 50,
      offset: 0,
      angle: 90,
    },
    segmentEdges: [
      {
        edgeKey: "station-a--station-b",
        source: "station-a",
        target: "station-b",
        sourcePoint: { x: 100, y: 150 },
        targetPoint: { x: 300, y: 150 },
      },
    ],
    ...overrides,
  };
}

describe("DeparturePatternModal debug tools", () => {
  it("proves that a vertical connector touches the card and its impacted segment", () => {
    const [info] = getInfoCardInfos({
      markers: [createMarker("marker-a")],
      obstacles: [
        {
          id: "station-title",
          type: "station-title",
          rect: { x: 100, y: 220, width: 200, height: 24 },
        },
      ],
    });

    expect(info?.intersection).toMatchObject({
      vertical: true,
      cardCenteredOnAnchor: true,
      connectorTouchesCard: true,
      anchorOnImpactedSegment: true,
      connectorTouchesSegment: true,
      ok: true,
    });
    expect(info?.connector.endpoint).toEqual({ x: 200, y: 150 });
    expect(info?.valid).toBe(true);
    expect(info?.overflow).toMatchObject({
      hasOverflow: false,
      ok: true,
    });
  });

  it("reports a detached diagonal connector and the element it overlaps", () => {
    const [info] = getInfoCardInfos({
      markers: [
        createMarker("marker-b", {
          card: { x: 120, y: 0, width: 200, height: 100 },
          connector: { height: 60, length: 60, offset: 0, angle: 45 },
        }),
      ],
      obstacles: [
        {
          id: "city-title",
          type: "city-title",
          rect: { x: 110, y: 0, width: 240, height: 120 },
        },
      ],
    });

    expect(info?.intersection.vertical).toBe(false);
    expect(info?.intersection.connectorTouchesSegment).toBe(false);
    expect(info?.intersection.ok).toBe(false);
    expect(info?.overflow.collisions).toEqual([
      expect.objectContaining({ id: "city-title", type: "city-title" }),
    ]);
    expect(info?.valid).toBe(false);
  });

  it("does not report a false segment failure for a station-only alert", () => {
    const [info] = getInfoCardInfos({
      markers: [
        createMarker("station-only", {
          segmentIds: ["station-only-alert"],
          edgeKeys: [],
          segmentEdges: [],
        }),
      ],
      obstacles: [],
    });

    expect(info?.intersection).toMatchObject({
      segmentCheckSkipped: true,
      anchorOnImpactedSegment: false,
      connectorTouchesSegment: false,
      ok: true,
    });
    expect(info?.valid).toBe(true);
  });

  it("detects duplicate visible cards on one segment but not cards on another branch", () => {
    const infos = getInfoCardInfos({
      markers: [
        createMarker("marker-a"),
        createMarker("marker-b", {
          segmentIds: ["segment-b"],
          disruption: {
            id: "disruption-b",
            title: "Alerte enrichie",
            message: "Message différent mais même rendu",
            kind: "works",
            applicationPeriods: [],
            impactedLineRefs: [],
            impactedStopNames: [],
          },
        }),
        createMarker("marker-c", {
          edgeKeys: ["station-b--station-c"],
          stationKeys: ["station-b", "station-c"],
          segmentIds: ["segment-c"],
        }),
      ],
      obstacles: [],
    });

    const report = checkDuplicateInfoCards(infos);

    expect(report.hasDuplicates).toBe(true);
    expect(report.duplicateCount).toBe(1);
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0]?.markerIds).toEqual([
      "marker-a",
      "marker-b",
    ]);
    expect(report.duplicates[0]?.edgeKeys).toEqual(["station-a--station-b"]);
    expect(report.duplicates[0]?.criteria).toEqual({
      sameText: true,
      sameEndDate: true,
      sameStations: true,
    });
    expect(infos[0]?.duplicate).toMatchObject({
      isDuplicate: true,
      sameText: true,
      sameEndDate: true,
      sameStations: true,
      markerIds: ["marker-b"],
    });
  });
});

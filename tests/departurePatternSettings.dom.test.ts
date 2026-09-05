import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import {
  defineComponent,
  h,
  isReactive,
  nextTick,
  onMounted,
  ref,
} from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeparturePatternModal from "../src/features/service-pattern/DeparturePatternModal.vue";
import { buildLinePatternViewFromTopology } from "../server/services/servicePattern/buildLinePatternView";
import { getLineTopology } from "../server/services/topology/getLineTopology";
import type {
  DepartureCallingPattern,
  TransferLineOption,
  TransitBoardConfig,
} from "../src/types/transit";
import type { TrafficLineReport, TrafficResponse } from "../src/features/traffic";
import {
  createTrafficMarkerStationObstacles,
  rectanglesOverlap,
} from "../src/features/service-pattern/trafficMarkerLayout";

const board: TransitBoardConfig = {
  id: "rer-test",
  title: "Station test",
  city: "Paris",
  line: {
    ref: "line:test",
    shortName: "T",
    longName: "Test",
    mode: "rer",
    color: "#0064ff",
    textColor: "#ffffff",
  },
  monitoringPoints: [{ ref: "stop:test", label: "Station test" }],
  directionGroups: [],
  maxDepartures: 4,
};

const pattern: DepartureCallingPattern = {
  departureId: "dep-test",
  destination: "Terminus",
  serviceType: "omnibus",
  calls: [
    {
      id: "station-a",
      label: "Station A",
      current: true,
      served: true,
    },
    {
      id: "station-b",
      label: "Station B",
      current: false,
      served: true,
    },
  ],
};

const VueFlowNodeStub = defineComponent({
  name: "VueFlow",
  props: {
    edges: {
      type: Array,
      default: () => [],
    },
    nodes: {
      type: Array,
      default: () => [],
    },
  },
  setup(props, { slots }) {
    return () =>
      h(
        "div",
        { class: "vue-flow" },
        (props.nodes as Array<{ data?: unknown; type?: string }>).flatMap(
          (node) => slots[`node-${node.type}`]?.({ data: node.data }) ?? [],
        ),
      );
  },
});

const vueFlowFitViewMock = vi.fn();
const vueFlowSetViewportMock = vi.fn();

const VueFlowTrafficStub = defineComponent({
  name: "VueFlow",
  props: {
    edges: {
      type: Array,
      default: () => [],
    },
    nodes: {
      type: Array,
      default: () => [],
    },
  },
  emits: ["edge-click", "pane-ready"],
  setup(props, { emit, slots }) {
    onMounted(() => {
      emit("pane-ready", {
        fitView: vueFlowFitViewMock,
        setViewport: vueFlowSetViewportMock,
      });
    });

    return () =>
      h("div", { class: "vue-flow" }, [
        ...(props.nodes as Array<{ data?: unknown; type?: string }>).flatMap(
          (node) => slots[`node-${node.type}`]?.({ data: node.data }) ?? [],
        ),
        ...(props.edges as Array<{ id: string; class?: unknown }>).map(
          (edge) =>
            h(
              "button",
              {
                class: ["edge-button", edge.class],
                "data-edge-id": edge.id,
                type: "button",
                onClick: () => emit("edge-click", { edge }),
              },
              edge.id,
            ),
        ),
      ]);
  },
});

const VueFlowGeometryStub = defineComponent({
  name: "VueFlow",
  props: {
    edges: {
      type: Array,
      default: () => [],
    },
    nodes: {
      type: Array,
      default: () => [],
    },
  },
  setup(props, { slots }) {
    return () =>
      h("div", { class: "vue-flow" }, [
        ...(props.nodes as Array<{ data?: unknown; type?: string }>).flatMap(
          (node) => slots[`node-${node.type}`]?.({ data: node.data }) ?? [],
        ),
        ...(props.edges as Array<{ id: string; source: string; target: string }>).map(
          (edge) =>
            h("span", {
              class: "flow-geometry-edge",
              "data-edge-id": edge.id,
              "data-source": edge.source,
              "data-target": edge.target,
            }),
        ),
      ]);
  },
});

const PatternModeComboboxStub = defineComponent({
  name: "MaterialCombobox",
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    options: {
      type: Array,
      default: () => [],
    },
  },
  emits: ["update:model-value"],
  setup(props, { emit }) {
    return () =>
      h(
        "div",
        {
          class: "pattern-mode-combobox-test",
          "data-model-value": props.modelValue,
        },
        (props.options as Array<{ id: string; label: string }>).map(
          (option) =>
            h(
              "button",
              {
                type: "button",
                "data-mode-id": option.id,
                onClick: () => emit("update:model-value", option.id),
              },
              option.label,
            ),
        ),
      );
  },
});

const StationTransferDetailsStub = defineComponent({
  name: "StationTransferDetails",
  props: {
    stationLabel: {
      type: String,
      default: "",
    },
    transfers: {
      type: Array,
      default: () => [],
    },
  },
  setup(props) {
    return () =>
      h(
        "div",
        { class: "station-transfer-details-test" },
        [
          h("strong", props.stationLabel),
          ...(props.transfers as Array<{ label: string }>).map((transfer) =>
            h("span", { class: "transfer-label" }, transfer.label),
          ),
        ],
      );
  },
});

interface PositionedFlowNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  zIndex?: number;
  data?: Record<string, unknown>;
}

interface PositionedFlowRect {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
}

const VueFlowPositionedStub = defineComponent({
  name: "VueFlow",
  props: {
    edges: {
      type: Array,
      default: () => [],
    },
    nodes: {
      type: Array,
      default: () => [],
    },
  },
  emits: ["pane-ready"],
  setup(props, { emit, slots }) {
    onMounted(() => {
      emit("pane-ready", {
        fitView: vueFlowFitViewMock,
        setViewport: vueFlowSetViewportMock,
      });
    });

    return () =>
      h("div", { class: "vue-flow" }, [
        ...(props.nodes as PositionedFlowNode[]).flatMap((node) => {
          const size = getPositionedFlowNodeSize(node);
          const position = node.position ?? { x: 0, y: 0 };
          const nodeElement = h(
            "div",
            {
              class: "flow-node-geometry",
              "data-flow-node-id": node.id,
              "data-flow-node-type": node.type ?? "",
              "data-flow-x": String(position.x),
              "data-flow-y": String(position.y),
              "data-flow-width": String(size.width),
              "data-flow-height": String(size.height),
              "data-flow-z-index": String(node.zIndex ?? ""),
            },
            slots[`node-${node.type}`]?.({ data: node.data }) ?? [],
          );

          if (node.type !== "station") {
            return [nodeElement];
          }

          const titleObstacle = createTrafficMarkerStationObstacles({
            position,
            width: size.width,
            height: size.height,
            compact: true,
          })[1];

          return [
            nodeElement,
            h("div", {
              class: "flow-node-geometry",
              "data-flow-node-id": `${node.id}:title`,
              "data-flow-node-type": "station-title",
              "data-flow-x": String(titleObstacle?.x ?? position.x),
              "data-flow-y": String(titleObstacle?.y ?? position.y),
              "data-flow-width": String(titleObstacle?.width ?? 0),
              "data-flow-height": String(titleObstacle?.height ?? 0),
            }),
          ];
        }),
        ...(props.edges as Array<{ id: string; source: string; target: string; class?: unknown }>).map(
          (edge) =>
            h(
              "span",
              {
                class: ["flow-positioned-edge", edge.class],
                "data-edge-id": edge.id,
                "data-source": edge.source,
                "data-target": edge.target,
              },
              edge.id,
            ),
        ),
      ]);
  },
});

function getPositionedFlowNodeSize(node: PositionedFlowNode): {
  width: number;
  height: number;
} {
  if (node.type === "station") {
    return { width: 128, height: 150 };
  }

  if (node.type === "city-zone") {
    return {
      width: Number(node.data?.width ?? 0),
      height: 32,
    };
  }

  if (node.type === "traffic-walking") {
    return { width: 84, height: 24 };
  }

  if (node.type === "traffic-marker") {
    return {
      width:
        node.data?.kind === "interruption" || node.data?.replacementBus
          ? 340
          : 120,
      height: Number(node.data?.markerHeight ?? 64),
    };
  }

  if (node.type === "traffic-marker-connector") {
    return {
      width: Number(node.data?.markerWidth ?? 120),
      height:
        Number(node.data?.markerHeight ?? 64) +
        Number(node.data?.connectorHeight ?? 0),
    };
  }

  return { width: 0, height: 0 };
}

function readPositionedFlowRects(wrapper: VueWrapper): PositionedFlowRect[] {
  return wrapper.findAll(".flow-node-geometry").map((node) => ({
    id: node.attributes("data-flow-node-id") ?? "",
    type: node.attributes("data-flow-node-type") ?? "",
    x: Number(node.attributes("data-flow-x")),
    y: Number(node.attributes("data-flow-y")),
    width: Number(node.attributes("data-flow-width")),
    height: Number(node.attributes("data-flow-height")),
    zIndex: Number(node.attributes("data-flow-z-index")),
  }));
}

function expectTrafficMarkerConnectorsToBeVerticalAndAttached(
  wrapper: VueWrapper,
): void {
  const interruptedStations = wrapper.findAll(
    ".pattern-flow-station--traffic-interruption",
  );
  const stationRailPoints = interruptedStations.map((station) => ({
    x: Number(station.attributes("data-node-x")) + 64,
    y: Number(station.attributes("data-node-y")) + COMPACT_STATION_RAIL_CENTER_Y,
  }));

  expect(stationRailPoints.length).toBeGreaterThan(0);

  const minRailX = Math.min(...stationRailPoints.map((point) => point.x));
  const maxRailX = Math.max(...stationRailPoints.map((point) => point.x));
  const railRows = [...new Set(stationRailPoints.map((point) => point.y))];

  wrapper.findAll(".pattern-flow-traffic-marker").forEach((marker) => {
    const geometry = marker.element.closest(".flow-node-geometry");
    expect(geometry).not.toBeNull();

    const markerId = geometry?.getAttribute("data-flow-node-id") ?? "";
    const connector = wrapper
      .findAll(".pattern-flow-traffic-marker-connector")
      .find(
        (candidate) =>
          candidate.element
            .closest(".flow-node-geometry")
            ?.getAttribute("data-flow-node-id") ===
          markerId.replace("traffic-marker:", "traffic-marker-connector:"),
      );
    expect(connector).toBeDefined();

    const x = Number(geometry?.getAttribute("data-flow-x"));
    const y = Number(geometry?.getAttribute("data-flow-y"));
    const width = Number(geometry?.getAttribute("data-flow-width"));
    const height = Number(geometry?.getAttribute("data-flow-height"));
    const connectorOffset = readCssPixel(
      connector?.element,
      "--traffic-marker-connector-offset",
    );
    const connectorHeight = readCssPixel(
      connector?.element,
      "--traffic-marker-connector-height",
    );
    const connectorLength = readCssPixel(
      connector?.element,
      "--traffic-marker-connector-length",
    );
    const connectorAngle = readCssPixel(
      connector?.element,
      "--traffic-marker-connector-angle",
    );
    const above = marker.classes().includes(
      "pattern-flow-traffic-marker--above",
    );
    const cardCenterX = x + width / 2;
    const cardEdgeY = above ? y + height : y;
    const segmentEndY = above
      ? cardEdgeY + connectorHeight
      : cardEdgeY - connectorHeight;

    expect(connectorOffset).toBe(0);
    expect(Math.abs(connectorAngle)).toBe(90);
    expect(connectorLength).toBeCloseTo(connectorHeight);
    expect(cardCenterX + connectorOffset).toBeCloseTo(cardCenterX);
    expect(
      railRows.some((railY) => Math.abs(segmentEndY - railY) <= GEOMETRY_EPSILON),
      `${marker.text()}: connector endpoint must meet an interrupted rail row`,
    ).toBe(true);
    expect(cardCenterX).toBeGreaterThanOrEqual(minRailX - GEOMETRY_EPSILON);
    expect(cardCenterX).toBeLessThanOrEqual(maxRailX + GEOMETRY_EPSILON);
  });
}

function readCssPixel(element: Element | undefined, property: string): number {
  if (!element) {
    return Number.NaN;
  }

  return Number.parseFloat(
    (element as HTMLElement).style.getPropertyValue(property),
  );
}

interface StationGeometry {
  key: string;
  label: string;
  city: string;
  x: number;
  y: number;
  nodeY: number;
}

interface CityZoneGeometry {
  city: string;
  width: number;
  layoutX: number;
  layoutY: number;
  nodeX: number;
  nodeY: number;
}

interface EdgeGeometry {
  id: string;
  source: string;
  target: string;
}

const CITY_ZONE_MATCHING_X_TOLERANCE = 8;
const COMPACT_STATION_NAME_TOP_OFFSET = 70;
const CITY_ZONE_STATION_NAME_MIN_VERTICAL_GAP = 36;
const COMPACT_STATION_RAIL_CENTER_Y = 15;
const GEOMETRY_EPSILON = 0.001;

afterEach(() => {
  vueFlowFitViewMock.mockReset();
  vueFlowSetViewportMock.mockReset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mountRealLineGeometry(
  lineId: string,
  transportType = "train",
): Promise<VueWrapper> {
  const topology = await getLineTopology(lineId);
  const view = buildLinePatternViewFromTopology({ lineId, transportType }, topology);
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ places: [], records: [] }),
  }));

  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "fetch", {
    configurable: true,
    value: fetchMock,
  });

  const wrapper = mount(DeparturePatternModal, {
    props: {
      embedded: true,
      fullLine: true,
      open: true,
      pattern: view.pattern,
      showMiniMap: false,
      transferBundleBackendCacheEnabled: false,
      transferBundleLocalCacheEnabled: false,
    },
    global: {
      stubs: {
        Teleport: true,
        VueFlow: VueFlowGeometryStub,
        Controls: true,
        PatternFlowMiniMap: true,
        LineIconBadge: true,
        MaterialCombobox: true,
        Handle: true,
      },
    },
  });

  await flushPromises();

  return wrapper;
}

function readStationGeometry(wrapper: VueWrapper): StationGeometry[] {
  return wrapper.findAll(".pattern-flow-station").map((station) => ({
    key: station.attributes("data-station-key") ?? "",
    label: station.attributes("data-station-label") ?? "",
    city: station.attributes("data-station-city") ?? "",
    x: Number(station.attributes("data-layout-x")),
    y: Number(station.attributes("data-layout-y")),
    nodeY: Number(station.attributes("data-node-y")),
  }));
}

function readEdgeGeometry(wrapper: VueWrapper): EdgeGeometry[] {
  return wrapper.findAll(".flow-geometry-edge").map((edge) => ({
    id: edge.attributes("data-edge-id") ?? "",
    source: edge.attributes("data-source") ?? "",
    target: edge.attributes("data-target") ?? "",
  }));
}

function readCityZoneGeometry(wrapper: VueWrapper): CityZoneGeometry[] {
  return wrapper.findAll(".pattern-flow-city-zone").map((zone) => ({
    city: zone.text(),
    width: Number(zone.attributes("data-city-zone-width")),
    layoutX: Number(zone.attributes("data-layout-x")),
    layoutY: Number(zone.attributes("data-layout-y")),
    nodeX: Number(zone.attributes("data-node-x")),
    nodeY: Number(zone.attributes("data-node-y")),
  }));
}

function expectReadableStationCoordinates(stations: StationGeometry[]): void {
  expect(stations.length).toBeGreaterThan(0);
  stations.forEach((station) => {
    expect(station.key).not.toBe("");
    expect(station.label).not.toBe("");
    expect(station.city).not.toBe("");
    expect(Number.isFinite(station.x)).toBe(true);
    expect(Number.isFinite(station.y)).toBe(true);
    expect(Number.isFinite(station.nodeY)).toBe(true);
  });
}

function findStationGeometry(
  stations: StationGeometry[],
  label: string,
): StationGeometry {
  const station = stations.find((candidate) => candidate.label === label);

  if (!station) {
    throw new Error(`Station ${label} not found`);
  }

  return station;
}

function expectCityZonesDoNotShareStationNameCoordinates(params: {
  label: string;
  cityZones: CityZoneGeometry[];
  stations: StationGeometry[];
}): void {
  expect(
    params.cityZones.length,
    `${params.label}: expected city zones to be available`,
  ).toBeGreaterThan(0);

  params.cityZones.forEach((zone) => {
    const matchingStations = params.stations.filter(
      (station) =>
        normalizeGeometryLabel(station.city) ===
          normalizeGeometryLabel(zone.city) &&
        Math.abs(station.y - zone.layoutY) <= 0.1 &&
        station.x >= zone.nodeX - CITY_ZONE_MATCHING_X_TOLERANCE &&
        station.x <=
          zone.nodeX + zone.width + CITY_ZONE_MATCHING_X_TOLERANCE,
    );

    expect(
      matchingStations.length,
      `${params.label}: expected city zone ${zone.city} to match at least one station on its row`,
    ).toBeGreaterThan(0);

    matchingStations.forEach((station) => {
      const stationNameLaneY =
        station.nodeY - COMPACT_STATION_NAME_TOP_OFFSET;
      const verticalGap = Math.abs(zone.nodeY - stationNameLaneY);

      expect(
        verticalGap,
        `${params.label}: city zone ${zone.city} at y=${zone.nodeY} is too close to station label ${station.label} at y=${stationNameLaneY}`,
      ).toBeGreaterThanOrEqual(CITY_ZONE_STATION_NAME_MIN_VERTICAL_GAP);
    });
  });
}

function normalizeGeometryLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

function expectBalancedFork(params: {
  junction: StationGeometry;
  upper: StationGeometry;
  lower: StationGeometry;
  label: string;
}): void {
  const upperOffset = Math.abs(params.upper.y - params.junction.y);
  const lowerOffset = Math.abs(params.lower.y - params.junction.y);

  expect(
    params.upper.y,
    `${params.label}: expected ${params.upper.label} to be above ${params.junction.label}`,
  ).toBeLessThan(params.junction.y);
  expect(
    params.lower.y,
    `${params.label}: expected ${params.lower.label} to be below ${params.junction.label}`,
  ).toBeGreaterThan(params.junction.y);
  expect(
    Math.abs(upperOffset - lowerOffset),
    `${params.label}: expected balanced offsets around ${params.junction.label}, got ${upperOffset} and ${lowerOffset}`,
  ).toBeLessThanOrEqual(1);
}

function getClosestStationPair(stations: StationGeometry[]): {
  left: StationGeometry;
  right: StationGeometry;
  distance: number;
} {
  let closest:
    | { left: StationGeometry; right: StationGeometry; distance: number }
    | undefined;

  stations.forEach((left, leftIndex) => {
    stations.slice(leftIndex + 1).forEach((right) => {
      const distance = getPointDistance(left, right);

      if (!closest || distance < closest.distance) {
        closest = { left, right, distance };
      }
    });
  });

  if (!closest) {
    throw new Error("No station pair available");
  }

  return closest;
}

function getPointDistance(
  left: Pick<StationGeometry, "x" | "y">,
  right: Pick<StationGeometry, "x" | "y">,
): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function findNonAdjacentEdgeCrossings(
  stations: StationGeometry[],
  edges: EdgeGeometry[],
): Array<{
  left: EdgeGeometry;
  right: EdgeGeometry;
}> {
  const stationByKey = new Map(stations.map((station) => [station.key, station]));
  const drawableEdges = edges.filter(
    (edge) => stationByKey.has(edge.source) && stationByKey.has(edge.target),
  );
  const crossings: Array<{ left: EdgeGeometry; right: EdgeGeometry }> = [];

  drawableEdges.forEach((left, leftIndex) => {
    drawableEdges.slice(leftIndex + 1).forEach((right) => {
      if (
        left.source === right.source ||
        left.source === right.target ||
        left.target === right.source ||
        left.target === right.target
      ) {
        return;
      }

      const leftSource = stationByKey.get(left.source)!;
      const leftTarget = stationByKey.get(left.target)!;
      const rightSource = stationByKey.get(right.source)!;
      const rightTarget = stationByKey.get(right.target)!;

      if (segmentsStrictlyCross(leftSource, leftTarget, rightSource, rightTarget)) {
        crossings.push({ left, right });
      }
    });
  });

  return crossings;
}

function segmentsStrictlyCross(
  a: Pick<StationGeometry, "x" | "y">,
  b: Pick<StationGeometry, "x" | "y">,
  c: Pick<StationGeometry, "x" | "y">,
  d: Pick<StationGeometry, "x" | "y">,
): boolean {
  const abC = crossProduct(a, b, c);
  const abD = crossProduct(a, b, d);
  const cdA = crossProduct(c, d, a);
  const cdB = crossProduct(c, d, b);
  const epsilon = 0.0001;

  if (
    Math.abs(abC) <= epsilon ||
    Math.abs(abD) <= epsilon ||
    Math.abs(cdA) <= epsilon ||
    Math.abs(cdB) <= epsilon
  ) {
    return false;
  }

  return abC * abD < 0 && cdA * cdB < 0;
}

function crossProduct(
  origin: Pick<StationGeometry, "x" | "y">,
  target: Pick<StationGeometry, "x" | "y">,
  point: Pick<StationGeometry, "x" | "y">,
): number {
  return (
    (target.x - origin.x) * (point.y - origin.y) -
    (target.y - origin.y) * (point.x - origin.x)
  );
}

describe("DeparturePatternModal settings", () => {
  it.each([
    { lineId: "line:IDFM:C01737", label: "Transilien H", transportType: "train" },
    { lineId: "line:IDFM:C01731", label: "Transilien R", transportType: "train" },
    { lineId: "line:IDFM:C01739", label: "Transilien J", transportType: "train" },
    { lineId: "line:IDFM:C01730", label: "Transilien P", transportType: "train" },
    { lineId: "line:IDFM:C01742", label: "RER A", transportType: "rer" },
    { lineId: "line:IDFM:C01728", label: "RER D", transportType: "rer" },
  ])(
    "keeps $label full-line geometry readable from VueFlow node coordinates",
    async ({ lineId, label, transportType }) => {
      const wrapper = await mountRealLineGeometry(lineId, transportType);
      const stations = readStationGeometry(wrapper);
      const cityZones = readCityZoneGeometry(wrapper);
      const edges = readEdgeGeometry(wrapper);
      const closest = getClosestStationPair(stations);
      const crossings = findNonAdjacentEdgeCrossings(stations, edges);

      expectReadableStationCoordinates(stations);
      expectCityZonesDoNotShareStationNameCoordinates({
        label,
        cityZones,
        stations,
      });
      expect(
        closest.distance,
        `${label}: closest stations are ${closest.left.label} (${closest.left.x}, ${closest.left.y}) and ${closest.right.label} (${closest.right.x}, ${closest.right.y})`,
      ).toBeGreaterThanOrEqual(86);
      expect(
        crossings.map(
          ({ left, right }) => {
            const leftSource = stations.find((station) => station.key === left.source);
            const leftTarget = stations.find((station) => station.key === left.target);
            const rightSource = stations.find((station) => station.key === right.source);
            const rightTarget = stations.find((station) => station.key === right.target);

            return `${label}: ${left.source} (${leftSource?.x}, ${leftSource?.y})->${left.target} (${leftTarget?.x}, ${leftTarget?.y}) crosses ${right.source} (${rightSource?.x}, ${rightSource?.y})->${right.target} (${rightTarget?.x}, ${rightTarget?.y})`;
          },
        ),
      ).toEqual([]);

      wrapper.unmount();
    },
    20000,
  );

  it("keeps Transilien P nested mini-forks readable", async () => {
    const wrapper = await mountRealLineGeometry("line:IDFM:C01730", "train");
    const stations = readStationGeometry(wrapper);
    const changis = findStationGeometry(stations, "Changis - Saint-Jean");
    const isles = findStationGeometry(stations, "Isles - Armentières - Congis");
    const miniForkGap = Math.abs(isles.y - changis.y);

    expect(
      isles.y,
      "Transilien P: La Ferté-Milon mini branch should sit above the Château-Thierry branch",
    ).toBeLessThan(changis.y);
    expect(
      miniForkGap,
      `Transilien P: nested mini-fork gap should leave room for station labels, got ${miniForkGap}`,
    ).toBeGreaterThanOrEqual(120);

    wrapper.unmount();
  });

  it("anchors Transilien P Gare de l'Est before its three geographic arms", async () => {
    const wrapper = await mountRealLineGeometry("line:IDFM:C01730", "train");
    const stations = readStationGeometry(wrapper);
    const gare = findStationGeometry(stations, "Gare de l'Est");
    const chelles = findStationGeometry(stations, "Chelles - Gournay");
    const tournan = findStationGeometry(stations, "Tournan");
    const verneuil = stations.find((station) =>
      station.label.startsWith("Verneuil"),
    );
    const coulommiers = findStationGeometry(stations, "Coulommiers");
    const provins = findStationGeometry(stations, "Provins");

    expect(verneuil, "Verneuil-l'Étang should be present on the Provins arm").toBeDefined();
    if (!verneuil) {
      wrapper.unmount();
      return;
    }

    expect([chelles, tournan, verneuil].every((station) => station.x > gare.x)).toBe(true);
    expect(coulommiers.x).toBeGreaterThan(gare.x);
    expect(provins.x).toBeGreaterThan(gare.x);
    expect(tournan.y).toBeLessThan(verneuil.y);

    wrapper.unmount();
  });

  it("keeps RER D lasso alternatives inside the southern corridor", async () => {
    const wrapper = await mountRealLineGeometry("line:IDFM:C01728", "rer");
    const stations = readStationGeometry(wrapper);
    const villeneuve = findStationGeometry(stations, "Villeneuve-Saint-Georges");
    const risOrangis = findStationGeometry(stations, "Ris-Orangis");
    const grandBourg = findStationGeometry(stations, "Grand Bourg");
    const evryValDeSeine = findStationGeometry(stations, "Évry - Val de Seine");
    const viryChatillon = findStationGeometry(stations, "Viry-Châtillon");
    const corbeil = findStationGeometry(stations, "Corbeil-Essonnes");

    expect(
      risOrangis.y,
      "RER D: Ris-Orangis should stay below the main trunk instead of crossing over it",
    ).toBeGreaterThan(villeneuve.y);
    expect(
      evryValDeSeine.y,
      "RER D: Évry - Val de Seine should stay below the main trunk instead of crossing over it",
    ).toBeGreaterThan(villeneuve.y);
    expect(
      risOrangis.y,
      "RER D: Ris-Orangis should stay on the lower Viry-Corbeil corridor",
    ).toBeGreaterThanOrEqual(viryChatillon.y);
    expect(
      grandBourg.y,
      "RER D: Grand Bourg should stay on the lower Viry-Corbeil corridor",
    ).toBeGreaterThanOrEqual(viryChatillon.y);
    expect(
      evryValDeSeine.y,
      "RER D: Evry - Val de Seine should stay on the lower Viry-Corbeil corridor",
    ).toBeGreaterThanOrEqual(corbeil.y);

    wrapper.unmount();
  });

  it("places simple RER A forks as balanced opposite branches", async () => {
    const wrapper = await mountRealLineGeometry("line:IDFM:C01742", "rer");
    const stations = readStationGeometry(wrapper);
    const nanterrePrefecture = findStationGeometry(stations, "Nanterre Préfecture");
    const houilles = findStationGeometry(stations, "Houilles - Carrières-sur-Seine");
    const nanterreUniversite = findStationGeometry(stations, "Nanterre Université");
    const saintGermain = findStationGeometry(stations, "Saint-Germain-en-Laye");
    const cergyPrefecture = findStationGeometry(stations, "Cergy Préfecture");
    const poissy = findStationGeometry(stations, "Poissy");
    const vincennes = findStationGeometry(stations, "Vincennes");
    const valDeFontenay = findStationGeometry(stations, "Val de Fontenay");
    const fontenaySousBois = findStationGeometry(stations, "Fontenay-sous-Bois");
    const westForkOffset = Math.abs(houilles.y - nanterrePrefecture.y);
    const eastForkOffset = Math.abs(valDeFontenay.y - vincennes.y);
    const poissyOffsetFromUpper = Math.abs(poissy.y - cergyPrefecture.y);

    expect(
      saintGermain.x,
      "RER A: Saint-Germain-en-Laye branch should extend left from Nanterre Préfecture",
    ).toBeLessThan(nanterrePrefecture.x);
    expectBalancedFork({
      label: "RER A west fork",
      junction: nanterrePrefecture,
      upper: houilles,
      lower: nanterreUniversite,
    });
    expect(
      westForkOffset,
      `RER A: west fork offset should stay close to the east fork proportion, got west=${westForkOffset} east=${eastForkOffset}`,
    ).toBeLessThanOrEqual(eastForkOffset + 1);
    expect(
      poissyOffsetFromUpper,
      `RER A: Poissy branch should be lower than the upper branch enough for labels, got offset=${poissyOffsetFromUpper}`,
    ).toBeGreaterThanOrEqual(westForkOffset * 0.45);
    expect(
      poissyOffsetFromUpper,
      `RER A: Poissy branch should remain a nested upper derivation, got offset=${poissyOffsetFromUpper} west=${westForkOffset}`,
    ).toBeLessThan(westForkOffset);
    expect(
      Math.abs(poissy.y - cergyPrefecture.y),
      "RER A: Poissy branch should stay visually closer to the upper Cergy branch than to the lower Saint-Germain branch",
    ).toBeLessThan(Math.abs(poissy.y - saintGermain.y));
    expectBalancedFork({
      label: "RER A east fork",
      junction: vincennes,
      upper: valDeFontenay,
      lower: fontenaySousBois,
    });

    wrapper.unmount();
  });

  it("hides the minimap when showMiniMap is false", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: {
            template: '<div class="vue-flow"><slot /></div>',
          },
          Controls: true,
          PatternFlowMiniMap: {
            template: '<div data-testid="pattern-minimap"></div>',
          },
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    expect(wrapper.find('[data-testid="pattern-minimap"]').exists()).toBe(false);
    await flushPromises();
    wrapper.unmount();
  });

  it("renders estimated vehicles for each guided rail mode without adding them to the minimap", async () => {
    const now = Date.now();
    const vehiclePattern: DepartureCallingPattern = {
      ...pattern,
      lineTopology: [
        {
          id: "pattern-main",
          label: "Station A - Station B",
          topologySource: "server",
          stops: [
            {
              id: "station-a",
              label: "Station A",
              station: {
                id: "station-a",
                label: "Station A",
                monitoringRef: "STIF:StopPoint:Q:1:",
                scheduleStopAreaRef: "station-a",
              },
            },
            {
              id: "station-b",
              label: "Station B",
              station: {
                id: "station-b",
                label: "Station B",
                monitoringRef: "STIF:StopPoint:Q:2:",
                scheduleStopAreaRef: "station-b",
              },
            },
          ],
        },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/vehicles")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            available: true,
            lineId: "line:IDFM:C01384",
            source: "idfm-siri-estimated-timetable",
            positionKind: "estimated",
            generatedAt: new Date(now).toISOString(),
            complete: true,
            pollAfterMs: 60_000,
            journeys: [
              {
                snapshotId: "metro-14-estimate-1",
                identityQuality: "inferred",
                confidence: "medium",
                patternId: "pattern-main",
                destination: "Station B",
                calls: [
                  {
                    stationId: "station-a",
                    order: 1,
                    departureAt: new Date(now - 30_000).toISOString(),
                    timeQuality: "estimated",
                    vehicleAtStop: false,
                    cancelled: false,
                  },
                  {
                    stationId: "station-b",
                    order: 2,
                    arrivalAt: new Date(now + 30_000).toISOString(),
                    timeQuality: "estimated",
                    vehicleAtStop: false,
                    cancelled: false,
                  },
                ],
              },
            ],
          }),
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ places: [], records: [] }),
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const metroBoard: TransitBoardConfig = {
      ...board,
      line: {
        ...board.line,
        ref: "STIF:Line::C01384:",
        shortName: "14",
        longName: "Métro 14",
        mode: "metro",
      },
    };
    const minimapNodeCount = ref(0);
    let renderedFlowNodes: Array<{
      type?: string;
      position?: { x: number; y: number };
      zIndex?: number;
      data?: { layoutX?: number; layoutY?: number };
    }> = [];
    let vehicleNodeComponentIsReactive = true;
    const VehicleGeometryFlowStub = defineComponent({
      name: "VueFlow",
      props: {
        nodes: { type: Array, default: () => [] },
        nodeTypes: { type: Object, default: () => ({}) },
      },
      setup(props, { slots }) {
        return () => {
          renderedFlowNodes = props.nodes as typeof renderedFlowNodes;
          return h(
            "div",
            { class: "vue-flow" },
            renderedFlowNodes.flatMap((node) => {
              const nodeComponent = (
                props.nodeTypes as Record<string, Parameters<typeof h>[0]>
              )[node.type ?? ""];
              if (node.type === "idfm-realtime-vehicles:vehicle") {
                vehicleNodeComponentIsReactive = isReactive(nodeComponent);
              }
              return nodeComponent
                ? [h(nodeComponent, { data: node.data })]
                : slots[`node-${node.type}`]?.({ data: node.data }) ?? [];
            }),
          );
        };
      },
    });
    const PatternFlowMiniMapStub = defineComponent({
      name: "PatternFlowMiniMap",
      props: { nodes: { type: Array, default: () => [] } },
      setup(props) {
        minimapNodeCount.value = (props.nodes as unknown[]).length;
        return () => h("div", { "data-testid": "pattern-minimap" });
      },
    });
    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board: metroBoard,
        pattern: vehiclePattern,
        lineId: "14",
        transportType: "metro",
        realtimeVehicleVisualizationEnabled: true,
        showMiniMap: true,
        smartTrafficDetection: false,
        transferBundleBackendCacheEnabled: false,
        transferBundleLocalCacheEnabled: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VehicleGeometryFlowStub,
          Controls: true,
          PatternFlowMiniMap: PatternFlowMiniMapStub,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();
    await nextTick();

    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/api/lines/metro/14/vehicles"),
      ),
    ).toBe(true);
    expect(wrapper.get(".pattern-flow-vehicle img").attributes("src")).toBe(
      "/images/mp14_train_top.webp",
    );

    await wrapper.setProps({
      board: {
        ...metroBoard,
        line: { ...metroBoard.line, mode: "rer" },
      },
      transportType: "rer",
    });
    await flushPromises();
    await nextTick();
    expect(
      wrapper.get(".pattern-flow-vehicle img").attributes("src"),
    ).toContain("rer_mi84.webp");

    await wrapper.setProps({
      board: {
        ...metroBoard,
        line: { ...metroBoard.line, mode: "tram" },
      },
      transportType: "tram",
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.get(".pattern-flow-vehicle img").attributes("src")).toBe(
      "/images/mp14_train_top.webp",
    );

    await wrapper.setProps({
      board: {
        ...metroBoard,
        line: { ...metroBoard.line, shortName: "J", mode: "train" },
      },
      lineId: "J",
      transportType: "transilien",
    });
    await flushPromises();
    await nextTick();
    expect(
      wrapper.get(".pattern-flow-vehicle img").attributes("src"),
    ).toContain("rer_mi84.webp");

    expect(wrapper.find(".pattern-flow-plugin-status--live").exists()).toBe(
      true,
    );
    expect(minimapNodeCount.value).toBe(2);
    const vehicleNode = renderedFlowNodes.find(
      (node) => node.type === "idfm-realtime-vehicles:vehicle",
    );
    const stationNodes = renderedFlowNodes.filter(
      (node) => node.type === "station",
    );
    expect(vehicleNode?.zIndex).toBeGreaterThan(0);
    expect(vehicleNodeComponentIsReactive).toBe(false);
    expect((vehicleNode?.position?.y ?? 0) + 14).toBeCloseTo(
      (stationNodes[0]?.position?.y ?? Number.NaN) + 15,
      5,
    );
    expect((vehicleNode?.position?.x ?? 0) + 36).toBeGreaterThan(
      Math.min(
        stationNodes[0]?.data?.layoutX ?? Number.NaN,
        stationNodes[1]?.data?.layoutX ?? Number.NaN,
      ),
    );
    expect((vehicleNode?.position?.x ?? 0) + 36).toBeLessThan(
      Math.max(
        stationNodes[0]?.data?.layoutX ?? Number.NaN,
        stationNodes[1]?.data?.layoutX ?? Number.NaN,
      ),
    );

    wrapper.unmount();
  });

  it("uses rounded curve edges when the setting is enabled", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const VueFlowEdgeTypeStub = defineComponent({
      name: "VueFlow",
      props: {
        edges: {
          type: Array,
          default: () => [],
        },
      },
      setup(props) {
        return () =>
          h(
            "div",
            { class: "vue-flow" },
            (props.edges as Array<{ id: string; type?: string }>).map((edge) =>
              h(
                "span",
                {
                  class: "flow-edge-type",
                  "data-edge-id": edge.id,
                  "data-type": edge.type,
                },
                edge.type,
              ),
            ),
          );
      },
    });

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern,
        patternRoundedCurves: true,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowEdgeTypeStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    expect(
      wrapper
        .findAll(".flow-edge-type")
        .map((edge) => edge.attributes("data-type")),
    ).toEqual(expect.arrayContaining(["default"]));

    await flushPromises();
    wrapper.unmount();
  });

  it("shows NeTEx distances only after enabling the distance switch", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const VueFlowStub = defineComponent({
      name: "VueFlow",
      props: {
        edges: {
          type: Array,
          default: () => [],
        },
      },
      template: `
        <div class="vue-flow">
          <span
            v-for="edge in edges"
            :key="edge.id"
            class="edge-label"
          >{{ edge.label }}</span>
          <slot />
        </div>
      `,
    });
    const geocodedPattern: DepartureCallingPattern = {
      ...pattern,
      calls: [
        ...pattern.calls,
        {
          id: "station-c",
          label: "Station C",
          current: false,
          served: true,
        },
      ],
      lineTopology: [
        {
          id: "netex-sequence",
          label: "Séquence NeTEx",
          topologySource: "server",
          stops: [
            createRouteStop("station-a", "Station A", 652146, 6862288),
            createRouteStop("station-b", "Station B", 652646, 6862288),
            createRouteStop("station-c", "Station C", 653846, 6862288),
          ],
        },
      ],
    };

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: geocodedPattern,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });
    const distanceSwitch = wrapper.get(
      '[role="switch"][aria-label="Afficher les distances entre les stations"]',
    );

    expect(distanceSwitch.attributes("aria-checked")).toBe("false");
    expect(wrapper.findAll(".edge-label").every((label) => !label.text())).toBe(
      true,
    );

    await distanceSwitch.trigger("click");

    expect(distanceSwitch.attributes("aria-checked")).toBe("true");
    expect(wrapper.findAll(".edge-label").map((label) => label.text())).toEqual(
      expect.arrayContaining(["499 m", "1,2 km"]),
    );

    await flushPromises();
    wrapper.unmount();
  });

  it("spaces realistic mode stations from NeTEx distances without forcing labels", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const VueFlowPositionStub = defineComponent({
      name: "VueFlow",
      props: {
        edges: {
          type: Array,
          default: () => [],
        },
        nodes: {
          type: Array,
          default: () => [],
        },
      },
      setup(props) {
        return () =>
          h("div", { class: "vue-flow" }, [
            ...(props.nodes as Array<{
              data?: { label?: string };
              position?: { x: number };
              type?: string;
            }>)
              .filter((node) => node.type === "station")
              .map((node) =>
                h(
                  "span",
                  {
                    class: "station-position",
                    "data-label": node.data?.label,
                    "data-x": String(node.position?.x ?? 0),
                  },
                  node.data?.label,
                ),
              ),
            ...(props.edges as Array<{ id: string; label?: string }>).map(
              (edge) =>
                h(
                  "span",
                  { key: edge.id, class: "edge-label" },
                  edge.label ?? "",
                ),
            ),
          ]);
      },
    });
    const geocodedPattern: DepartureCallingPattern = {
      ...pattern,
      calls: [
        ...pattern.calls,
        {
          id: "station-c",
          label: "Station C",
          current: false,
          served: true,
        },
      ],
      lineTopology: [
        {
          id: "netex-sequence",
          label: "Séquence NeTEx",
          topologySource: "server",
          stops: [
            createRouteStop("station-a", "Station A", 652146, 6862288),
            createRouteStop("station-b", "Station B", 652646, 6862288),
            createRouteStop("station-c", "Station C", 653846, 6862288),
          ],
        },
      ],
    };

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: geocodedPattern,
        compactMode: "realistic",
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowPositionStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });
    const positionByLabel = new Map(
      wrapper.findAll(".station-position").map((station) => [
        station.attributes("data-label"),
        Number(station.attributes("data-x")),
      ]),
    );
    const shortGap =
      (positionByLabel.get("Station B") ?? 0) -
      (positionByLabel.get("Station A") ?? 0);
    const longGap =
      (positionByLabel.get("Station C") ?? 0) -
      (positionByLabel.get("Station B") ?? 0);

    expect(wrapper.find(".pattern-flow-shell--realistic").exists()).toBe(true);
    expect(wrapper.find(".pattern-flow-shell--compact").exists()).toBe(false);
    expect(wrapper.findAll(".edge-label").every((label) => !label.text())).toBe(
      true,
    );
    expect(longGap).toBeGreaterThan(shortGap);
    expect(longGap / shortGap).toBeGreaterThan(2.2);
    expect(longGap / shortGap).toBeLessThan(2.6);

    await flushPromises();
    wrapper.unmount();
  });

  it("orients nested off-route branches away from the served terminus", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const VueFlowPositionStub = defineComponent({
      name: "VueFlow",
      props: {
        nodes: {
          type: Array,
          default: () => [],
        },
      },
      setup(props) {
        return () =>
          h(
            "div",
            { class: "vue-flow" },
            (props.nodes as Array<{
              data?: { label?: string };
              position?: { x: number; y: number };
              type?: string;
            }>)
              .filter((node) => node.type === "station")
              .map((node) =>
                h(
                  "span",
                  {
                    class: "station-position",
                    "data-label": node.data?.label,
                    "data-x": String(node.position?.x ?? 0),
                    "data-y": String(node.position?.y ?? 0),
                  },
                  node.data?.label,
                ),
              ),
          );
      },
    });
    const branchPattern: DepartureCallingPattern = {
      ...pattern,
      destination: "Montparnasse",
      calls: [
        createCall("rambouillet", "Rambouillet", "Rambouillet", true),
        createCall("saint-cyr", "Saint-Cyr", "Saint-Cyr"),
        createCall("montparnasse", "Montparnasse", "Paris"),
      ],
      lineTopology: [
        {
          id: "active-spine",
          label: "Active spine",
          topologySource: "server",
          stops: [
            createRouteStop("rambouillet", "Rambouillet", 0, 0),
            createRouteStop("saint-cyr", "Saint-Cyr", 1, 0),
            createRouteStop("montparnasse", "Montparnasse", 2, 0),
          ],
        },
        {
          id: "secondary-trunk",
          label: "Secondary trunk",
          topologySource: "server",
          stops: [
            createRouteStop("saint-cyr", "Saint-Cyr", 1, 0),
            createRouteStop("fontenay", "Fontenay", 0, 0),
            createRouteStop("plaisir-les-clayes", "Plaisir Les Clayes", -1, 0),
            createRouteStop("plaisir-grignon", "Plaisir - Grignon", -2, 0),
          ],
        },
        {
          id: "plaisir-dreux",
          label: "Plaisir - Dreux",
          branchLayout: {
            kind: "same-direction-fork",
            junctionStationId: "plaisir-grignon",
            terminalStationId: "dreux",
            trunkStationId: "plaisir-les-clayes",
            direction: "forward",
            side: "upper",
          },
          topologySource: "server",
          stops: [
            createRouteStop("plaisir-grignon", "Plaisir - Grignon", -2, 0),
            createRouteStop("dreux", "Dreux", -3, -1),
          ],
        },
        {
          id: "plaisir-mantes",
          label: "Plaisir - Mantes",
          branchLayout: {
            kind: "same-direction-fork",
            junctionStationId: "plaisir-grignon",
            terminalStationId: "mantes",
            trunkStationId: "plaisir-les-clayes",
            direction: "forward",
            side: "lower",
          },
          topologySource: "server",
          stops: [
            createRouteStop("plaisir-grignon", "Plaisir - Grignon", -2, 0),
            createRouteStop("mantes", "Mantes-la-Jolie", -3, 1),
          ],
        },
      ],
    };

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: branchPattern,
        compactMode: "compact",
        patternCompactForkGap: 220,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowPositionStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });
    const positionByLabel = new Map(
      wrapper.findAll(".station-position").map((station) => [
        station.attributes("data-label"),
        {
          x: Number(station.attributes("data-x")),
          y: Number(station.attributes("data-y")),
        },
      ]),
    );
    const saintCyr = positionByLabel.get("Saint-Cyr");
    const montparnasse = positionByLabel.get("Montparnasse");
    const plaisir = positionByLabel.get("Plaisir - Grignon");
    const dreux = positionByLabel.get("Dreux");
    const mantes = positionByLabel.get("Mantes-la-Jolie");

    expect(saintCyr).toBeDefined();
    expect(montparnasse).toBeDefined();
    expect(plaisir).toBeDefined();
    expect(dreux).toBeDefined();
    expect(mantes).toBeDefined();
    expect(montparnasse!.x).toBeGreaterThan(saintCyr!.x);
    expect(plaisir!.x).toBeLessThan(saintCyr!.x);
    expect(dreux!.x).toBeLessThan(plaisir!.x);
    expect(mantes!.x).toBeLessThan(plaisir!.x);
    expect(dreux!.y).not.toBe(mantes!.y);
    expect(Math.abs(dreux!.y - mantes!.y)).toBe(220);

    await flushPromises();
    wrapper.unmount();
  });

  it("keeps the full-line common spine fixed while compressing a longer alternative", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const VueFlowPositionStub = defineComponent({
      name: "VueFlow",
      props: {
        nodes: {
          type: Array,
          default: () => [],
        },
      },
      setup(props) {
        return () =>
          h(
            "div",
            { class: "vue-flow" },
            (props.nodes as Array<{
              data?: { label?: string };
              position?: { x: number; y: number };
              type?: string;
            }>)
              .filter((node) => node.type === "station")
              .map((node) =>
                h(
                  "span",
                  {
                    class: "station-position",
                    "data-label": node.data?.label,
                    "data-x": String(node.position?.x ?? 0),
                    "data-y": String(node.position?.y ?? 0),
                  },
                  node.data?.label,
                ),
              ),
          );
      },
    });
    const fullLinePattern: DepartureCallingPattern = {
      ...pattern,
      destination: "Gare Saint-Lazare",
      calls: [
        createCall("asnieres", "Asnieres-sur-Seine", "City", true),
        createCall("houilles", "Houilles - Carrieres-sur-Seine", "City"),
        createCall("sartrouville", "Sartrouville", "City"),
        createCall("right-d", "Right D", "City"),
        createCall("bois-colombes", "Bois-Colombes", "City"),
        createCall("colombes", "Colombes", "City"),
        createCall("saint-lazare", "Gare Saint-Lazare", "Paris"),
      ],
      lineTopology: [
        {
          id: "structural-trunk",
          label: "Structural trunk",
          topologySource: "server",
          stops: [
            createRouteStop("asnieres", "Asnieres-sur-Seine", 2, 0),
            createRouteStop("houilles", "Houilles - Carrieres-sur-Seine", 3, 0),
            createRouteStop("sartrouville", "Sartrouville", 4, 0),
            createRouteStop("right-c", "Right C", 4, 0),
            createRouteStop("right-d", "Right D", 5, 0),
          ],
        },
        {
          id: "terminal-branch",
          label: "Terminal branch",
          topologySource: "server",
          stops: [
            createRouteStop("asnieres", "Asnieres-sur-Seine", 2, 0),
            createRouteStop("saint-lazare", "Gare Saint-Lazare", 3, 1),
          ],
        },
        {
          id: "parallel-alternative",
          label: "Parallel alternative",
          topologySource: "server",
          stops: [
            createRouteStop("asnieres", "Asnieres-sur-Seine", 2, 0),
            createRouteStop("bois-colombes", "Bois-Colombes", 2, -1),
            createRouteStop("colombes", "Colombes", 2, -2),
            createRouteStop("houilles", "Houilles - Carrieres-sur-Seine", 3, 0),
          ],
        },
      ],
      lineTopologyLayout: {
        loops: [
          {
            id: "loop:common-spine",
            kind: "cycle",
            anchorStationIds: ["asnieres", "houilles"],
            segmentIds: [],
            stationIds: ["asnieres", "houilles", "sartrouville", "right-c", "right-d"],
            laneHints: [
              {
                id: "common",
                role: "common",
                anchorStationIds: ["asnieres", "houilles"],
                segmentIds: [],
                stationIds: ["asnieres", "houilles", "sartrouville", "right-c", "right-d"],
                lane: 0,
                side: "center",
              },
              {
                id: "alternative",
                role: "alternative",
                anchorStationIds: ["asnieres", "houilles"],
                segmentIds: [],
                stationIds: ["asnieres", "bois-colombes", "colombes", "houilles"],
                lane: 1,
                side: "lower",
              },
            ],
          },
        ],
      },
    };

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        embedded: true,
        fullLine: true,
        open: true,
        board,
        pattern: fullLinePattern,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowPositionStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });
    const positionByLabel = new Map(
      wrapper.findAll(".station-position").map((station) => [
        station.attributes("data-label"),
        {
          x: Number(station.attributes("data-x")),
          y: Number(station.attributes("data-y")),
        },
      ]),
    );
    const asnieres = positionByLabel.get("Asnieres-sur-Seine");
    const houilles = positionByLabel.get("Houilles - Carrieres-sur-Seine");
    const sartrouville = positionByLabel.get("Sartrouville");
    const boisColombes = positionByLabel.get("Bois-Colombes");
    const colombes = positionByLabel.get("Colombes");
    const saintLazare = positionByLabel.get("Gare Saint-Lazare");

    expect(asnieres).toBeDefined();
    expect(houilles).toBeDefined();
    expect(sartrouville).toBeDefined();
    expect(boisColombes).toBeDefined();
    expect(colombes).toBeDefined();
    expect(saintLazare).toBeDefined();
    expect(saintLazare!.x).toBeLessThan(asnieres!.x);
    expect(asnieres!.x).toBeLessThan(houilles!.x);
    expect(houilles!.x).toBeLessThan(sartrouville!.x);
    expect(saintLazare!.y).toBe(asnieres!.y);
    expect(asnieres!.y).toBe(houilles!.y);
    expect(houilles!.y).toBe(sartrouville!.y);
    expect(
      houilles!.x - asnieres!.x,
      "the longer alternative must not expand the common Asnieres-Houilles interval",
    ).toBe(138);
    expect(boisColombes!.x).toBeGreaterThan(asnieres!.x);
    expect(boisColombes!.x).toBeLessThan(colombes!.x);
    expect(boisColombes!.x).toBeLessThan(houilles!.x);
    expect(colombes!.x).toBeLessThan(houilles!.x);
    expect(boisColombes!.y).toBeGreaterThan(asnieres!.y);
    expect(colombes!.y).toBe(boisColombes!.y);

    await flushPromises();
    wrapper.unmount();
  });

  it("keeps the Transilien J common spine compact around Asnieres and Houilles", async () => {
    const wrapper = await mountRealLineGeometry("line:IDFM:C01739", "train");
    const stations = readStationGeometry(wrapper);
    const findByPrefix = (prefix: string) =>
      stations.find((station) => station.label.startsWith(prefix));
    const paris = findByPrefix("Gare Saint-Lazare");
    const asnieres = findByPrefix("Asni");
    const houilles = findByPrefix("Houilles");
    const sartrouville = findByPrefix("Sartrouville");
    const boisColombes = findByPrefix("Bois-Colombes");
    const colombes = findByPrefix("Colombes");
    const leStade = findByPrefix("Le Stade");
    const argenteuil = findByPrefix("Argenteuil");
    const mantes = findByPrefix("Mantes-la-Jolie");

    expect(paris).toBeDefined();
    expect(asnieres).toBeDefined();
    expect(houilles).toBeDefined();
    expect(sartrouville).toBeDefined();
    expect(boisColombes).toBeDefined();
    expect(colombes).toBeDefined();
    expect(leStade).toBeDefined();
    expect(argenteuil).toBeDefined();
    expect(mantes).toBeDefined();

    expect(paris!.x).toBeLessThan(asnieres!.x);
    expect(asnieres!.x).toBeLessThan(houilles!.x);
    expect(houilles!.x).toBeLessThan(sartrouville!.x);
    expect(houilles!.x - asnieres!.x).toBe(138);
    expect(boisColombes!.x).toBeGreaterThan(asnieres!.x);
    expect(boisColombes!.x).toBeLessThan(colombes!.x);
    expect(colombes!.x).toBeLessThan(leStade!.x);
    expect(leStade!.x).toBeLessThan(argenteuil!.x);
    expect(argenteuil!.x).toBeLessThan(mantes!.x);
    expect(boisColombes!.y).not.toBe(asnieres!.y);

    wrapper.unmount();
  }, 20000);

  it("places topology loop corridors as parallel lanes between placed anchors", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const VueFlowPositionStub = defineComponent({
      name: "VueFlow",
      props: {
        nodes: {
          type: Array,
          default: () => [],
        },
      },
      setup(props) {
        return () =>
          h(
            "div",
            { class: "vue-flow" },
            (props.nodes as Array<{
              data?: { label?: string };
              position?: { x: number; y: number };
              type?: string;
            }>)
              .filter((node) => node.type === "station")
              .map((node) =>
                h(
                  "span",
                  {
                    class: "station-position",
                    "data-label": node.data?.label,
                    "data-x": String(node.position?.x ?? 0),
                    "data-y": String(node.position?.y ?? 0),
                  },
                  node.data?.label,
                ),
              ),
          );
      },
    });
    const loopPattern: DepartureCallingPattern = {
      ...pattern,
      destination: "Anchor D",
      calls: [
        createCall("anchor-a", "Anchor A", "City", true),
        createCall("spine-b", "Spine B", "City"),
        createCall("spine-c", "Spine C", "City"),
        createCall("anchor-d", "Anchor D", "City"),
      ],
      lineTopology: [
        {
          id: "main-spine",
          label: "Main spine",
          topologySource: "server",
          stops: [
            createRouteStop("anchor-a", "Anchor A", 0, 0),
            createRouteStop("spine-b", "Spine B", 1, 0),
            createRouteStop("spine-c", "Spine C", 2, 0),
            createRouteStop("anchor-d", "Anchor D", 3, 0),
          ],
        },
        {
          id: "upper-loop-corridor",
          label: "Upper loop corridor",
          topologySource: "server",
          stops: [
            createRouteStop("anchor-a", "Anchor A", 0, 0),
            createRouteStop("upper-1", "Upper 1", 1, 1),
            createRouteStop("upper-2", "Upper 2", 2, 1),
            createRouteStop("anchor-d", "Anchor D", 3, 0),
          ],
        },
        {
          id: "lower-loop-corridor",
          label: "Lower loop corridor",
          topologySource: "server",
          stops: [
            createRouteStop("anchor-a", "Anchor A", 0, 0),
            createRouteStop("lower-1", "Lower 1", 1, -1),
            createRouteStop("lower-2", "Lower 2", 2, -1),
            createRouteStop("anchor-d", "Anchor D", 3, 0),
          ],
        },
      ],
      lineTopologyLayout: {
        loops: [
          {
            id: "loop:upper",
            kind: "cycle",
            anchorStationIds: ["anchor-a", "anchor-d"],
            segmentIds: ["upper-loop-corridor"],
            stationIds: [
              "anchor-a",
              "upper-1",
              "upper-2",
              "anchor-d",
              "spine-c",
              "spine-b",
            ],
          },
          {
            id: "loop:lower",
            kind: "cycle",
            anchorStationIds: ["anchor-a", "anchor-d"],
            segmentIds: ["lower-loop-corridor"],
            stationIds: [
              "anchor-a",
              "lower-1",
              "lower-2",
              "anchor-d",
              "spine-c",
              "spine-b",
            ],
          },
        ],
      },
    };

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: loopPattern,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowPositionStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });
    const positionByLabel = new Map(
      wrapper.findAll(".station-position").map((station) => [
        station.attributes("data-label"),
        {
          x: Number(station.attributes("data-x")),
          y: Number(station.attributes("data-y")),
        },
      ]),
    );
    const anchorA = positionByLabel.get("Anchor A");
    const spineB = positionByLabel.get("Spine B");
    const anchorD = positionByLabel.get("Anchor D");
    const upperOne = positionByLabel.get("Upper 1");
    const upperTwo = positionByLabel.get("Upper 2");
    const lowerOne = positionByLabel.get("Lower 1");
    const lowerTwo = positionByLabel.get("Lower 2");

    expect(anchorA).toBeDefined();
    expect(spineB).toBeDefined();
    expect(anchorD).toBeDefined();
    expect(upperOne).toBeDefined();
    expect(upperTwo).toBeDefined();
    expect(lowerOne).toBeDefined();
    expect(lowerTwo).toBeDefined();
    expect(upperOne!.y).toBeLessThan(spineB!.y);
    expect(upperTwo!.y).toBeLessThan(spineB!.y);
    expect(lowerOne!.y).toBeGreaterThan(spineB!.y);
    expect(lowerTwo!.y).toBeGreaterThan(spineB!.y);
    expect(upperOne!.x).toBeGreaterThan(anchorA!.x);
    expect(upperTwo!.x).toBeLessThan(anchorD!.x);
    expect(lowerOne!.x).toBeGreaterThan(anchorA!.x);
    expect(lowerTwo!.x).toBeLessThan(anchorD!.x);

    await flushPromises();
    wrapper.unmount();
  });

  it("renders grouped city zones from line topology", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const cityPattern: DepartureCallingPattern = {
      ...pattern,
      calls: [
        createCall("station-a", "Station A", "Paris", true),
        createCall("station-b", "Station B", "Paris"),
        createCall("station-c", "Station C", "Clamart"),
        createCall("station-d", "Station D", "Chatillon"),
      ],
      lineTopology: [
        {
          id: "city-sequence",
          label: "Sequence villes",
          topologySource: "server",
          stops: [
            createRouteStop("station-a", "Station A", 652146, 6862288, "Paris"),
            createRouteStop("station-b", "Station B", 652646, 6862288, "Paris"),
            createRouteStop(
              "station-c",
              "Station C",
              653146,
              6862288,
              "Clamart",
            ),
            createRouteStop(
              "station-d",
              "Station D",
              653646,
              6862288,
              "Chatillon",
            ),
          ],
        },
      ],
    };

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: cityPattern,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowNodeStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    const cityZones = wrapper.findAll(".pattern-flow-city-zone");

    expect(cityZones.map((zone) => zone.text())).toEqual([
      "Paris",
      "Clamart",
      "Chatillon",
    ]);
    expect(cityZones.filter((zone) => zone.text() === "Paris")).toHaveLength(1);

    await flushPromises();
    wrapper.unmount();
  });

  it("merges adjacent city zones across segmented topology sequences", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const cityPattern: DepartureCallingPattern = {
      ...pattern,
      calls: [
        createCall("station-a", "Station A", "Paris", true),
        createCall("station-b", "Station B", "Paris"),
        createCall("station-c", "Station C", "Paris"),
        createCall("station-d", "Station D", "Clamart"),
      ],
      lineTopology: [
        {
          id: "segment-a-b",
          label: "Station A - Station B",
          topologySource: "server",
          stops: [
            createRouteStop("station-a", "Station A", 652146, 6862288, "Paris"),
            createRouteStop("station-b", "Station B", 652646, 6862288, "Paris"),
          ],
        },
        {
          id: "segment-b-c",
          label: "Station B - Station C",
          topologySource: "server",
          stops: [
            createRouteStop("station-b", "Station B", 652646, 6862288, "Paris"),
            createRouteStop("station-c", "Station C", 653146, 6862288, "Paris"),
          ],
        },
        {
          id: "segment-c-d",
          label: "Station C - Station D",
          topologySource: "server",
          stops: [
            createRouteStop("station-c", "Station C", 653146, 6862288, "Paris"),
            createRouteStop(
              "station-d",
              "Station D",
              653646,
              6862288,
              "Clamart",
            ),
          ],
        },
      ],
    };

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: cityPattern,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowNodeStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    const cityZones = wrapper.findAll(".pattern-flow-city-zone");

    expect(cityZones.map((zone) => zone.text())).toEqual([
      "Paris",
      "Clamart",
    ]);
    expect(cityZones.filter((zone) => zone.text() === "Paris")).toHaveLength(1);

    await flushPromises();
    wrapper.unmount();
  });

  it("hides city zones when showCityZones is false", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const cityPattern: DepartureCallingPattern = {
      ...pattern,
      calls: [
        createCall("station-a", "Station A", "Paris", true),
        createCall("station-b", "Station B", "Paris"),
      ],
    };

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: cityPattern,
        showCityZones: false,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowNodeStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    expect(wrapper.findAll(".pattern-flow-city-zone")).toHaveLength(0);

    await flushPromises();
    wrapper.unmount();
  });

  it("compresses stations into city nodes with aggregated transfers and states", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const metro4: TransferLineOption = {
      id: "metro-4",
      label: "4",
      family: "METRO",
    };
    const tram6: TransferLineOption = {
      id: "tram-6",
      label: "T6",
      family: "TRAM",
    };
    const cityPattern: DepartureCallingPattern = {
      ...pattern,
      destination: "Station sans ville",
      calls: [
        {
          ...createCall("antony-1", "Antony Centre", "Antony", true),
          time: "2026-08-29T10:00:00+02:00",
          transferLines: [metro4],
        },
        {
          ...createCall("antony-2", "Antony Gare", " antony "),
          served: false,
        },
        {
          ...createCall("antony-3", "Antony Sud", " Antóný "),
          transferLines: [tram6],
        },
        createCall("antony-4", "Antony Centre 2", "Antony"),
        createCall("antony-5", "Antony Gare 2", "Antony"),
        createCall("sceaux-1", "Sceaux Gare", "Sceaux"),
        createCall("sceaux-2", "Sceaux Centre", " SCEAUX "),
        createCall("station-without-city", "Station sans ville", ""),
      ],
      lineTopology: [
        {
          id: "city-compression-sequence",
          label: "Antony - Sceaux",
          topologySource: "server",
          stops: [
            createRouteStop("antony-1", "Antony Centre", 652146, 6862288, "Antony"),
            createRouteStop("antony-2", "Antony Gare", 652246, 6862288, " antony "),
            createRouteStop(
              "antony-3",
              "Antony Sud",
              652346,
              6862288,
              " Antóný ",
            ),
            createRouteStop("antony-4", "Antony Centre 2", 652446, 6862288, "Antony"),
            createRouteStop("antony-5", "Antony Gare 2", 652546, 6862288, "Antony"),
            createRouteStop("sceaux-1", "Sceaux Gare", 652946, 6862288, "Sceaux"),
            createRouteStop("sceaux-2", "Sceaux Centre", 653046, 6862288, " SCEAUX "),
            createRouteStop("station-without-city", "Station sans ville", 653446, 6862288),
          ],
        },
      ],
    };
    let miniMapNodes: Array<{ id: string; type?: string; data?: { label?: string } }> = [];
    const PatternFlowMiniMapStub = defineComponent({
      name: "PatternFlowMiniMap",
      props: {
        nodes: {
          type: Array,
          default: () => [],
        },
      },
      setup(props) {
        return () => {
          miniMapNodes = props.nodes as Array<{
            id: string;
            type?: string;
            data?: { label?: string };
          }>;

          return h("div", { "data-testid": "pattern-minimap" });
        };
      },
    });

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: cityPattern,
        showMiniMap: true,
        transferBundleBackendCacheEnabled: false,
        transferBundleLocalCacheEnabled: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowGeometryStub,
          Controls: true,
          PatternFlowMiniMap: PatternFlowMiniMapStub,
          LineIconBadge: true,
          MaterialCombobox: PatternModeComboboxStub,
          StationTransferDetails: StationTransferDetailsStub,
          Handle: true,
        },
      },
    });

    const cityModeOptions = wrapper.findAll('[data-mode-id="cities"]');
    expect(cityModeOptions.length).toBeGreaterThan(0);
    expect(cityModeOptions[0]?.text()).toBe("Vue villes");

    await cityModeOptions[0]!.trigger("click");
    await flushPromises();

    expect(wrapper.find(".pattern-flow-shell--cities").exists()).toBe(true);
    expect(wrapper.find(".pattern-flow-shell--compact").exists()).toBe(true);
    expect(wrapper.findAll(".pattern-flow-city-zone")).toHaveLength(0);

    const stationNodes = wrapper.findAll(".pattern-flow-station");
    const stationLabels = stationNodes.map((node) =>
      node.attributes("data-station-label"),
    );
    expect(stationLabels).toEqual([
      "Antony",
      "Sceaux",
      "Station sans ville",
    ]);
    expect(wrapper.findAll('[data-station-label="Antony"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-station-label="Sceaux"]')).toHaveLength(1);
    expect(
      wrapper.find('[data-station-label="Antony"]')?.attributes("data-city-node"),
    ).toBe("true");
    expect(
      wrapper.find('[data-station-label="Antony"]')?.attributes("data-mixed-served"),
    ).toBe("true");
    expect(
      wrapper.find('[data-station-label="Antony"]')?.attributes("title"),
    ).toBe("Ville partiellement desservie");
    expect(wrapper.find('[data-station-label="Antony"]').text()).toContain(
      "10:00",
    );
    expect(wrapper.findAll(".pattern-flow-station__transfers--inline")).toHaveLength(0);

    const antonyNode = wrapper.find('[data-station-label="Antony"]');
    await antonyNode.trigger("mouseenter");
    await nextTick();
    const transferTooltip = wrapper.find(".station-transfer-details-test");
    expect(transferTooltip.exists()).toBe(true);
    expect(transferTooltip.text()).toContain("Antony");
    expect(transferTooltip.text()).toContain("4");
    expect(transferTooltip.text()).toContain("T6");
    expect(transferTooltip.text()).not.toContain("Antony Centre");
    expect(transferTooltip.text()).not.toContain("Antony Gare");

    const edges = readEdgeGeometry(wrapper);
    const uniqueEdges = new Set(
      edges.map((edge) => [edge.source, edge.target].sort().join("--")),
    );
    expect(uniqueEdges).toHaveLength(2);
    expect(edges.every((edge) => edge.source !== edge.target)).toBe(true);
    expect(miniMapNodes).toHaveLength(3);
    expect(miniMapNodes.every((node) => node.type === "station")).toBe(true);
    expect(miniMapNodes.map((node) => node.data?.label)).toEqual([
      "Antony",
      "Sceaux",
      "Station sans ville",
    ]);

    await wrapper.setProps({
      pattern: {
        ...cityPattern,
        departureId: "dep-other",
      },
    });
    await flushPromises();
    expect(wrapper.find(".pattern-flow-shell--cities").exists()).toBe(false);
    expect(wrapper.find(".pattern-flow-shell--compact").exists()).toBe(true);

    wrapper.unmount();
  });

  it("keeps compressed branch arms and edge geometry", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const branchPattern: DepartureCallingPattern = {
      ...pattern,
      calls: [
        createCall("root-1", "Antony Nord", "Antony", true),
        createCall("root-2", "Antony Sud", " antony "),
        createCall("main-1", "Sceaux", "Sceaux"),
        createCall("main-2", "Bourg-la-Reine", "Bourg-la-Reine"),
        createCall("upper-1", "Clamart", "Clamart"),
        createCall("upper-2", "Meudon", "Meudon"),
        createCall("lower-1", "Bagneux", "Bagneux"),
        createCall("lower-2", "Massy", "Massy"),
      ],
      lineTopology: [
        {
          id: "main-arm",
          label: "Main arm",
          topologySource: "server",
          stops: [
            createRouteStop("root-1", "Antony Nord", 652146, 6862288, "Antony"),
            createRouteStop("root-2", "Antony Sud", 652246, 6862288, " antony "),
            createRouteStop("main-1", "Sceaux", 652646, 6862288, "Sceaux"),
            createRouteStop(
              "main-2",
              "Bourg-la-Reine",
              653146,
              6862288,
              "Bourg-la-Reine",
            ),
          ],
        },
        {
          id: "upper-arm",
          label: "Upper arm",
          topologySource: "server",
          branchLayout: {
            kind: "same-direction-fork",
            junctionStationId: "root-1",
            terminalStationId: "upper-2",
            trunkStationId: "main-1",
            direction: "forward",
            side: "upper",
          },
          stops: [
            createRouteStop("root-1", "Antony Nord", 652146, 6862288, "Antony"),
            createRouteStop("upper-1", "Clamart", 652646, 6862888, "Clamart"),
            createRouteStop("upper-2", "Meudon", 653146, 6862888, "Meudon"),
          ],
        },
        {
          id: "lower-arm",
          label: "Lower arm",
          topologySource: "server",
          branchLayout: {
            kind: "same-direction-fork",
            junctionStationId: "root-2",
            terminalStationId: "lower-2",
            trunkStationId: "main-1",
            direction: "forward",
            side: "lower",
          },
          stops: [
            createRouteStop("root-2", "Antony Sud", 652246, 6862288, " antony "),
            createRouteStop("lower-1", "Bagneux", 652646, 6861688, "Bagneux"),
            createRouteStop("lower-2", "Massy", 653146, 6861688, "Massy"),
          ],
        },
      ],
    };

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: branchPattern,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowGeometryStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: PatternModeComboboxStub,
          Handle: true,
        },
      },
    });

    await wrapper.find('[data-mode-id="cities"]').trigger("click");
    await flushPromises();

    const stationLabels = wrapper.findAll(".pattern-flow-station").map((node) =>
      node.attributes("data-station-label"),
    );
    expect(stationLabels).toEqual([
      "Antony",
      "Sceaux",
      "Bourg-la-Reine",
      "Clamart",
      "Meudon",
      "Bagneux",
      "Massy",
    ]);
    expect(wrapper.findAll('[data-station-label="Antony"]')).toHaveLength(1);

    const geometry = readStationGeometry(wrapper);
    const upper = findStationGeometry(geometry, "Meudon");
    const lower = findStationGeometry(geometry, "Massy");
    expect(upper.y).not.toBe(lower.y);

    const uniqueEdges = new Set(
      readEdgeGeometry(wrapper).map((edge) =>
        [edge.source, edge.target].sort().join("--"),
      ),
    );
    expect(uniqueEdges).toHaveLength(6);
    expect(readEdgeGeometry(wrapper).every((edge) => edge.source !== edge.target)).toBe(
      true,
    );

    wrapper.unmount();
  });

  it("keeps non-degenerate compressed loop corridors", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const loopPattern: DepartureCallingPattern = {
      ...pattern,
      calls: [
        createCall("left", "Saint-Denis", "Saint-Denis", true),
        createCall("anchor-1", "Paris Nord", "Paris"),
        createCall("anchor-2", "Paris Sud", " paris "),
        createCall("main-mid", "Clamart", "Clamart"),
        createCall("right", "Sceaux", "Sceaux"),
        createCall("terminal", "Versailles", "Versailles"),
        createCall("upper", "Meudon", "Meudon"),
        createCall("lower", "Antony", "Antony"),
      ],
      lineTopology: [
        {
          id: "loop-main",
          label: "Main corridor",
          topologySource: "server",
          stops: [
            createRouteStop("left", "Saint-Denis", 651146, 6862288, "Saint-Denis"),
            createRouteStop("anchor-1", "Paris Nord", 652146, 6862288, "Paris"),
            createRouteStop("anchor-2", "Paris Sud", 652246, 6862288, " paris "),
            createRouteStop("main-mid", "Clamart", 652646, 6862288, "Clamart"),
            createRouteStop("right", "Sceaux", 653146, 6862288, "Sceaux"),
            createRouteStop("terminal", "Versailles", 654146, 6862288, "Versailles"),
          ],
        },
        {
          id: "loop-upper",
          label: "Upper corridor",
          topologySource: "server",
          stops: [
            createRouteStop("anchor-1", "Paris Nord", 652146, 6862288, "Paris"),
            createRouteStop("upper", "Meudon", 652646, 6862888, "Meudon"),
            createRouteStop("right", "Sceaux", 653146, 6862288, "Sceaux"),
          ],
        },
        {
          id: "loop-lower",
          label: "Lower corridor",
          topologySource: "server",
          stops: [
            createRouteStop("anchor-2", "Paris Sud", 652246, 6862288, " paris "),
            createRouteStop("lower", "Antony", 652646, 6861688, "Antony"),
            createRouteStop("right", "Sceaux", 653146, 6862288, "Sceaux"),
          ],
        },
      ],
      lineTopologyLayout: {
        loops: [
          {
            id: "parallel-city-loop",
            kind: "parallel",
            anchorStationIds: ["anchor-1", "right"],
            segmentIds: ["loop-upper", "loop-lower"],
            stationIds: ["anchor-1", "upper", "right", "lower"],
            laneHints: [
              {
                id: "upper-lane",
                role: "alternative",
                anchorStationIds: ["anchor-1", "right"],
                segmentIds: ["loop-upper"],
                stationIds: ["anchor-1", "upper", "right"],
                lane: -1,
                side: "upper",
              },
              {
                id: "lower-lane",
                role: "alternative",
                anchorStationIds: ["anchor-2", "right"],
                segmentIds: ["loop-lower"],
                stationIds: ["anchor-2", "lower", "right"],
                lane: 1,
                side: "lower",
              },
            ],
          },
        ],
      },
    };

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: loopPattern,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowGeometryStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: PatternModeComboboxStub,
          Handle: true,
        },
      },
    });

    await wrapper.find('[data-mode-id="cities"]').trigger("click");
    await flushPromises();

    expect(wrapper.findAll('[data-station-label="Paris"]')).toHaveLength(1);
    const geometry = readStationGeometry(wrapper);
    const upper = findStationGeometry(geometry, "Meudon");
    const lower = findStationGeometry(geometry, "Antony");
    expect(upper.y).not.toBe(lower.y);

    const uniqueEdges = new Set(
      readEdgeGeometry(wrapper).map((edge) =>
        [edge.source, edge.target].sort().join("--"),
      ),
    );
    expect(uniqueEdges).toHaveLength(8);
    expect(readEdgeGeometry(wrapper).every((edge) => edge.source !== edge.target)).toBe(
      true,
    );

    wrapper.unmount();
  });

  it("projects traffic to city nodes while keeping source stations in the calendar", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 1, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const trafficPattern: DepartureCallingPattern = {
      ...pattern,
      calls: [
        createCall("antony-centre", "Antony Centre", "Antony", true),
        createCall("antony-gare", "Antony Gare", " antony "),
        createCall("sceaux-gare", "Sceaux Gare", "Sceaux"),
        createCall("sceaux-centre", "Sceaux Centre", " SCEAUX "),
      ],
      lineTopology: [
        {
          id: "traffic-city-sequence",
          label: "Traffic cities",
          topologySource: "server",
          stops: [
            createRouteStop("antony-centre", "Antony Centre", 652146, 6862288, "Antony"),
            createRouteStop("antony-gare", "Antony Gare", 652646, 6862288, " antony "),
            createRouteStop("sceaux-gare", "Sceaux Gare", 653146, 6862288, "Sceaux"),
            createRouteStop("sceaux-centre", "Sceaux Centre", 653646, 6862288, " SCEAUX "),
          ],
        },
      ],
    };
    const trafficReport: TrafficLineReport = {
      lineRef: "line:test",
      status: "disrupted",
      disruptions: [
        {
          id: "city-source-interruption",
          title: "Interruption Antony Sceaux",
          message: [
            "Période : toute la journée",
            "Dates : du 1er au 7 août",
            "- Antony Centre <> Sceaux Centre : trafic interrompu",
          ].join("\\n"),
          kind: "works",
          applicationPeriods: [
            {
              begin: "20260801T000000",
              end: "20260807T235959",
            },
          ],
          impactedLineRefs: ["line:test"],
          impactedStopNames: [],
        },
      ],
    };
    type CapturedCalendar = {
      days: Array<{
        events: Array<{
          interruptedStationKeys: string[];
        }>;
        interruptedStationLabels: string[];
      }>;
    };
    let capturedCalendar: CapturedCalendar | undefined;
    const PatternTrafficCalendarSurfaceStub = defineComponent({
      name: "PatternTrafficCalendarSurface",
      props: {
        calendar: {
          type: Object,
          default: () => ({ days: [] }),
        },
      },
      setup(props) {
        return () => {
          capturedCalendar = props.calendar as CapturedCalendar;
          return h("div", { "data-testid": "pattern-traffic-calendar-stub" });
        };
      },
    });

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: trafficPattern,
        trafficReport,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowTrafficStub,
          Controls: true,
          PatternFlowMiniMap: true,
          PatternTrafficCalendarSurface: PatternTrafficCalendarSurfaceStub,
          LineIconBadge: true,
          MaterialCombobox: PatternModeComboboxStub,
          Handle: true,
        },
      },
    });

    await wrapper.find('[data-mode-id="cities"]').trigger("click");
    await flushPromises();

    expect(wrapper.findAll('[data-station-label="Antony"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-station-label="Sceaux"]')).toHaveLength(1);
    expect(
      wrapper.findAll(".pattern-flow-station--traffic-interruption"),
    ).toHaveLength(2);
    expect(wrapper.find(".pattern-flow-edge--traffic-interruption").exists()).toBe(
      true,
    );
    expect(wrapper.find(".pattern-flow-traffic-marker--interruption").exists()).toBe(
      true,
    );

    const impactedDays = capturedCalendar?.days.filter(
      (day) => day.events.length > 0,
    );
    expect(impactedDays?.length).toBeGreaterThan(0);
    const sourceLabels = impactedDays?.flatMap(
      (day) => day.interruptedStationLabels,
    );
    expect(sourceLabels).toContain("Antony Gare");
    expect(sourceLabels).toContain("Sceaux Gare");
    expect(sourceLabels).not.toContain("Antony");
    expect(sourceLabels).not.toContain("Sceaux");
    expect(impactedDays?.some((day) =>
      day.events.some((event) =>
        event.interruptedStationKeys.includes("antonygare") &&
        event.interruptedStationKeys.includes("sceauxgare"),
      ),
    )).toBe(true);

    wrapper.unmount();
  });

  it("represents an interruption internal to one city on its node without walking", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 1, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const internalCityPattern: DepartureCallingPattern = {
      ...pattern,
      calls: [
        createCall("antony-a", "Antony A", "Antony", true),
        createCall("antony-b", "Antony B", " antony "),
        createCall("antony-c", "Antony C", "ANTONY"),
      ],
      lineTopology: [
        {
          id: "internal-city-sequence",
          label: "Antony internal",
          topologySource: "server",
          stops: [
            createRouteStop("antony-a", "Antony A", 652146, 6862288, "Antony"),
            createRouteStop("antony-b", "Antony B", 652646, 6862288, " antony "),
            createRouteStop("antony-c", "Antony C", 653146, 6862288, "ANTONY"),
          ],
        },
      ],
    };
    const trafficReport: TrafficLineReport = {
      lineRef: "line:test",
      status: "disrupted",
      disruptions: [
        {
          id: "internal-city-interruption",
          title: "Interruption interne à Antony",
          message: "Antony A <> Antony C : trafic interrompu",
          kind: "works",
          applicationPeriods: [
            {
              begin: "20260801T000000",
              end: "20260801T235959",
            },
          ],
          impactedLineRefs: ["line:test"],
          impactedStopNames: [],
        },
      ],
    };

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: internalCityPattern,
        trafficReport,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowTrafficStub,
          Controls: true,
          PatternFlowMiniMap: true,
          PatternTrafficCalendarSurface: true,
          LineIconBadge: true,
          MaterialCombobox: PatternModeComboboxStub,
          Handle: true,
        },
      },
    });

    await wrapper.find('[data-mode-id="cities"]').trigger("click");
    await flushPromises();

    expect(wrapper.findAll(".pattern-flow-station")).toHaveLength(1);
    expect(wrapper.find('[data-station-label="Antony"]')).toBeDefined();
    expect(
      wrapper.findAll(".pattern-flow-station--traffic-interruption"),
    ).toHaveLength(1);
    expect(wrapper.findAll(".pattern-flow-traffic-walking")).toHaveLength(0);
    expect(wrapper.find(".pattern-flow-traffic-marker--interruption").exists()).toBe(
      true,
    );

    wrapper.unmount();
  });

  it("passes only station nodes to the minimap", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    let miniMapNodes: Array<{ type?: string }> = [];
    const PatternFlowMiniMapStub = defineComponent({
      name: "PatternFlowMiniMap",
      props: {
        nodes: {
          type: Array,
          default: () => [],
        },
      },
      setup(props) {
        miniMapNodes = props.nodes as Array<{ type?: string }>;

        return () => h("div", { "data-testid": "pattern-minimap" });
      },
    });
    const cityPattern: DepartureCallingPattern = {
      ...pattern,
      calls: [
        createCall("station-a", "Station A", "Paris", true),
        createCall("station-b", "Station B", "Paris"),
        createCall("station-c", "Station C", "Clamart"),
      ],
      lineTopology: [
        {
          id: "city-sequence",
          label: "Sequence villes",
          stops: [
            createRouteStop("station-a", "Station A", 652146, 6862288, "Paris"),
            createRouteStop("station-b", "Station B", 652646, 6862288, "Paris"),
            createRouteStop(
              "station-c",
              "Station C",
              653146,
              6862288,
              "Clamart",
            ),
          ],
        },
      ],
    };

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: cityPattern,
        showMiniMap: true,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowNodeStub,
          Controls: true,
          PatternFlowMiniMap: PatternFlowMiniMapStub,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    expect(miniMapNodes).toHaveLength(3);
    expect(miniMapNodes.every((node) => node.type === "station")).toBe(true);

    await flushPromises();
    wrapper.unmount();
  });

  it("renders the transport mode logo before the line badge", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));
    const tramBoard: TransitBoardConfig = {
      ...board,
      line: {
        ...board.line,
        shortName: "T6",
        longName: "Tram T6",
        mode: "tram",
      },
    };

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board: tramBoard,
        pattern,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowNodeStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });
    const lineContainer = wrapper.get(".pattern-board__line");
    const children = Array.from(lineContainer.element.children);

    expect(children[0]?.classList.contains("pattern-board__mode-icon")).toBe(
      true,
    );
    expect(children[0]?.textContent).toContain("TRAM");
    expect(children[1]?.tagName.toLowerCase()).toBe("line-icon-badge-stub");

    await flushPromises();
    wrapper.unmount();
  });

  it("loads smart traffic by default and opens the disruption popup from an impacted edge", async () => {
    const trafficPattern: DepartureCallingPattern = {
      ...pattern,
      calls: [
        createCall("station-a", "Station A", "Paris", true),
        createCall("station-b", "Station B", "Paris"),
        createCall("station-c", "Station C", "Paris"),
        createCall("station-d", "Station D", "Paris"),
      ],
      lineTopology: [
        {
          id: "traffic-sequence",
          label: "Traffic sequence",
          stops: [
            createRouteStop("station-a", "Station A", 652146, 6862288),
            createRouteStop("station-b", "Station B", 652646, 6862288),
            createRouteStop("station-c", "Station C", 653146, 6862288),
            createRouteStop("station-d", "Station D", 653646, 6862288),
          ],
        },
      ],
    };
    const trafficResponse: TrafficResponse = {
      configured: true,
      generatedAt: "2026-06-25T12:00:00.000Z",
      source: "prim-line-reports",
      lines: [
        {
          lineRef: "line:test",
          status: "disrupted",
          disruptions: [
            {
              id: "traffic-a-b",
              title:
                "Jusqu'au 24 juillet inclus, le trafic est interrompu entre Station A et Station C.",
              message: "Le trafic est perturbe sur le reste de la ligne.",
              kind: "incident",
              applicationPeriods: [],
              impactedLineRefs: ["line:test"],
              impactedStopNames: [],
            },
          ],
        },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/traffic")) {
        return {
          ok: true,
          json: async () => trafficResponse,
        };
      }

      return {
        ok: true,
        json: async () => ({ places: [], records: [] }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: trafficPattern,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowTrafficStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/traffic"),
    );
    expect(
      wrapper.find(".pattern-flow-edge--traffic-interruption").exists(),
    ).toBe(true);
    expect(
      wrapper.find(".pattern-flow-edge--traffic-disturbance").exists(),
    ).toBe(true);
    expect(
      wrapper.find(".pattern-flow-station--traffic-interruption").exists(),
    ).toBe(true);

    const walkingTimes = wrapper.findAll(".pattern-flow-traffic-walking");
    expect(walkingTimes.length).toBeGreaterThan(0);
    expect(
      walkingTimes.every((walkingTime) => walkingTime.text().includes("min")),
    ).toBe(true);

    const interruptionMarker = wrapper.get(
      ".pattern-flow-traffic-marker--interruption",
    );

    expect(interruptionMarker.text()).toContain("Trafic interrompu");
    expect(interruptionMarker.text()).toContain("Reprise le 24 juillet");
    expect(interruptionMarker.text()).not.toContain("Trafic perturbé");

    expect(interruptionMarker.element.tagName.toLowerCase()).toBe("div");
    expect(wrapper.find(".pattern-flow-traffic-popup").exists()).toBe(false);

    await interruptionMarker.trigger("click");

    expect(wrapper.find(".pattern-flow-traffic-popup").exists()).toBe(false);

    const detailsButton = interruptionMarker.get(
      ".pattern-flow-traffic-marker__details",
    );

    expect(detailsButton.element.tagName.toLowerCase()).toBe("button");
    expect(detailsButton.text()).toContain("Details");

    await detailsButton.trigger("click");

    expect(wrapper.find(".pattern-flow-traffic-popup").exists()).toBe(true);
    expect(wrapper.text()).toContain("Jusqu'au 24 juillet inclus");

    await wrapper.get(".pattern-flow-traffic-popup__close").trigger("click");

    expect(wrapper.find(".pattern-flow-traffic-popup").exists()).toBe(false);

    await wrapper
      .get(".pattern-flow-edge--traffic-interruption")
      .trigger("click");

    expect(wrapper.text()).toContain("Jusqu'au 24 juillet inclus");
    expect(wrapper.text()).toContain("Le trafic est perturbe");

    wrapper.unmount();
  });

  it("unifies replacement-bus cards without changing impacted stations or edges", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 2, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const mountFixture = (unifyReplacementBusMarkers: boolean) =>
      mount(DeparturePatternModal, {
        props: {
          open: true,
          board,
          pattern: createFiveStationTrafficPattern(),
          showMiniMap: false,
          showCityZones: true,
          showInterruptionWalkingTimes: true,
          unifyReplacementBusMarkers,
          trafficReport: createReplacementBusTrafficReport(),
        },
        global: {
          stubs: {
            Teleport: true,
            VueFlow: VueFlowPositionedStub,
            Controls: true,
            PatternFlowMiniMap: true,
            LineIconBadge: true,
            MaterialCombobox: true,
            Handle: true,
          },
        },
      });

    const unifiedWrapper = mountFixture(true);
    await flushPromises();
    const separateWrapper = mountFixture(false);
    await flushPromises();

    const unifiedMarkers = unifiedWrapper.findAll(
      ".pattern-flow-traffic-marker--interruption",
    );
    const separateMarkers = separateWrapper.findAll(
      ".pattern-flow-traffic-marker--interruption",
    );

    expect(unifiedMarkers).toHaveLength(1);
    expect(unifiedMarkers[0]?.text()).toContain("Bus de remplacement");
    expect(unifiedMarkers[0]?.text()).toContain("Reprise le 7 août");
    expect(separateMarkers).toHaveLength(3);

    expect(
      unifiedWrapper.findAll(".pattern-flow-station--traffic-interruption"),
    ).toHaveLength(
      separateWrapper.findAll(".pattern-flow-station--traffic-interruption")
        .length,
    );
    expect(
      unifiedWrapper.findAll(".pattern-flow-edge--traffic-interruption"),
    ).toHaveLength(
      separateWrapper.findAll(".pattern-flow-edge--traffic-interruption")
        .length,
    );

    const unifiedRects = readPositionedFlowRects(unifiedWrapper);
    const unifiedMarkerRects = unifiedRects.filter(
      (rect) => rect.type === "traffic-marker",
    );
    const unifiedObstacleRects = unifiedRects.filter((rect) =>
      ["station", "station-title", "city-zone", "traffic-walking"].includes(
        rect.type,
      ),
    );

    expect(
      unifiedWrapper.findAll(".pattern-flow-traffic-marker--above"),
    ).toHaveLength(1);
    unifiedMarkerRects.forEach((marker) => {
      unifiedObstacleRects.forEach((obstacle) => {
        expect(
          rectanglesOverlap(marker, obstacle, 12),
          `${marker.id} overlaps ${obstacle.id}`,
        ).toBe(false);
      });
    });
    expectTrafficMarkerConnectorsToBeVerticalAndAttached(unifiedWrapper);

    const defaultLayerRects = readPositionedFlowRects(unifiedWrapper);
    const defaultCardRects = defaultLayerRects.filter(
      (rect) => rect.type === "traffic-marker",
    );
    const defaultConnectorRects = defaultLayerRects.filter(
      (rect) => rect.type === "traffic-marker-connector",
    );
    expect(defaultCardRects.length).toBe(defaultConnectorRects.length);
    expect(defaultCardRects.every((rect) => rect.zIndex === 100)).toBe(true);
    expect(
      defaultConnectorRects.every((rect) => rect.zIndex === 90),
    ).toBe(true);

    const hoveredMarker = unifiedWrapper.get(
      ".pattern-flow-traffic-marker",
    );
    const hoveredMarkerGeometry = hoveredMarker.element.closest(
      ".flow-node-geometry",
    );
    const hoveredMarkerId = hoveredMarkerGeometry?.getAttribute(
      "data-flow-node-id",
    );
    expect(hoveredMarkerId).toBeTruthy();

    await hoveredMarker.trigger("mouseenter");
    const hoveredLayerRects = readPositionedFlowRects(unifiedWrapper);
    const hoveredConnector = hoveredLayerRects.find(
      (rect) =>
        rect.id ===
        hoveredMarkerId?.replace("traffic-marker:", "traffic-marker-connector:"),
    );
    expect(hoveredConnector?.zIndex).toBe(110);
    expect(
      hoveredLayerRects
        .filter(
          (rect) =>
            rect.type === "traffic-marker-connector" &&
            rect.id !== hoveredConnector?.id,
        )
        .every((rect) => rect.zIndex === 90),
    ).toBe(true);

    await hoveredMarker.trigger("mouseleave");
    expect(
      readPositionedFlowRects(unifiedWrapper)
        .filter((rect) => rect.type === "traffic-marker-connector")
        .every((rect) => rect.zIndex === 90),
    ).toBe(true);

    unifiedWrapper.unmount();
    separateWrapper.unmount();
  });

  it("unifies five source alerts when their pulsed station sets are identical", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 27, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: createThreeStationTrafficPattern(),
        showMiniMap: false,
        unifyReplacementBusMarkers: true,
        trafficReport: createFiveDuplicateReplacementBusTrafficReport(),
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowPositionedStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    const markers = wrapper.findAll(".pattern-flow-traffic-marker");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.text()).toContain("Bus de remplacement");

    const markerRects = readPositionedFlowRects(wrapper).filter(
      (rect) => rect.type === "traffic-marker",
    );
    expect(markerRects).toHaveLength(1);
    expectTrafficMarkerConnectorsToBeVerticalAndAttached(wrapper);

    wrapper.unmount();
  });

  it("exposes rendered info-card geometry through the debug query mode", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 27, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const originalUrl = window.location.href;
    window.history.pushState({}, "", `${window.location.pathname}?debugInfoCards=1`);

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: createThreeStationTrafficPattern(),
        showMiniMap: false,
        unifyReplacementBusMarkers: true,
        trafficReport: createFiveDuplicateReplacementBusTrafficReport(),
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowPositionedStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    const tools = window.__departurePatternModalInfoCardsDebugTools;
    expect(tools).toBeDefined();
    const infos = tools?.getInfoCardInfos() ?? [];
    expect(infos).toHaveLength(1);
    expect(infos[0]).toMatchObject({
      position: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      segmentIds: expect.any(Array),
      text: expect.objectContaining({ detailLabel: expect.any(String) }),
      intersection: expect.objectContaining({
        vertical: true,
        connectorTouchesSegment: true,
      }),
    });
    expect(tools?.checkDuplicateInfoCards()).toMatchObject({
      hasDuplicates: false,
      duplicateCount: 0,
    });
    expect(wrapper.find("[data-info-cards-debug]").text()).toContain(
      '"infoCards"',
    );

    wrapper.unmount();
    window.history.replaceState({}, "", originalUrl);
    delete window.__departurePatternModalInfoCardsDebugTools;
    delete window.__departurePatternModalDebugTools;
  });

  it("unifies duplicate interruption info cards with the same text, end date and stations", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: createThreeStationTrafficPattern(),
        showMiniMap: false,
        unifyReplacementBusMarkers: true,
        trafficReport: createFiveDuplicateInterruptionTrafficReport(),
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowPositionedStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    const interruptionMarkers = wrapper
      .findAll(".pattern-flow-traffic-marker")
      .filter((marker) => marker.text().includes("Trafic interrompu"));
    expect(interruptionMarkers).toHaveLength(1);

    wrapper.unmount();
  });

  it("recenters and pulses the affected segment three times from the eye action", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 2, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: createFiveStationTrafficPattern(),
        showMiniMap: false,
        trafficReport: createReplacementBusTrafficReport(),
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowPositionedStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    const focusButton = wrapper.get(".pattern-flow-traffic-marker__focus");
    expect(focusButton.attributes("aria-label")).toContain("stations");

    await focusButton.trigger("click");
    expect(vueFlowSetViewportMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(620 + 500);
    expect(
      wrapper.findAll(".pattern-flow-station--traffic-focus").length,
    ).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(1_500);
    expect(
      wrapper.findAll(".pattern-flow-station--traffic-focus").length,
    ).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(1_500);
    expect(
      wrapper.findAll(".pattern-flow-station--traffic-focus").length,
    ).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(900);
    expect(wrapper.findAll(".pattern-flow-station--traffic-focus")).toHaveLength(
      0,
    );

    wrapper.unmount();
  });

  it("uses the large bus-card design for replacement buses on disturbed segments", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 2, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: createThreeStationTrafficPattern(),
        showMiniMap: false,
        trafficReport: createReplacementBusDisturbanceTrafficReport(),
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowPositionedStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    const marker = wrapper.get(".pattern-flow-traffic-marker--disturbance");
    expect(marker.classes()).toContain("pattern-flow-traffic-marker--large");
    expect(marker.text()).toContain("Bus de remplacement");
    expect(marker.find(".pattern-flow-traffic-marker__focus").exists()).toBe(
      true,
    );

    const markerRect = readPositionedFlowRects(wrapper).find(
      (rect) => rect.type === "traffic-marker",
    );
    expect(markerRect?.width).toBe(340);
    expect(markerRect?.height).toBe(124);

    wrapper.unmount();
  });

  it("keeps replacement-bus cards above branch lanes without covering geometry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 2, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: createTransilienJBranchPattern(),
        showMiniMap: false,
        showCityZones: true,
        showInterruptionWalkingTimes: true,
        trafficReport: createTransilienJBranchTrafficReport(),
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowPositionedStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    const markers = wrapper.findAll(".pattern-flow-traffic-marker");
    expect(markers.length).toBeGreaterThanOrEqual(2);
    expect(
      markers.some((marker) =>
        marker.classes().includes("pattern-flow-traffic-marker--above"),
      ),
    ).toBe(true);

    const rects = readPositionedFlowRects(wrapper);
    const markerRects = rects.filter((rect) => rect.type === "traffic-marker");
    const obstacleRects = rects.filter((rect) =>
      ["station", "station-title", "city-zone", "traffic-walking"].includes(
        rect.type,
      ),
    );

    markerRects.forEach((marker) => {
      obstacleRects.forEach((obstacle) => {
        expect(
          rectanglesOverlap(marker, obstacle, 12),
          `${marker.id} overlaps ${obstacle.id}`,
        ).toBe(false);
      });
    });
    markerRects.forEach((left, leftIndex) => {
      markerRects.slice(leftIndex + 1).forEach((right) => {
        expect(
          rectanglesOverlap(left, right, 12),
          `${left.id} overlaps ${right.id}`,
        ).toBe(false);
      });
    });
    expectTrafficMarkerConnectorsToBeVerticalAndAttached(wrapper);

    wrapper.unmount();
  });

  it("places a non-bus interruption above an upper branch when lower rows exist", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 2, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: createTransilienJBranchPattern(),
        showMiniMap: false,
        trafficReport: createTopBranchInterruptionTrafficReport(),
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowPositionedStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    const markers = wrapper.findAll(".pattern-flow-traffic-marker--interruption");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.classes()).toContain(
      "pattern-flow-traffic-marker--above",
    );
    expectTrafficMarkerConnectorsToBeVerticalAndAttached(wrapper);

    wrapper.unmount();
  });

  it("places the lowest replacement-bus branch below while keeping other branches above", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 2, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: createThreeBranchReplacementBusPattern(),
        showMiniMap: false,
        showCityZones: true,
        showInterruptionWalkingTimes: true,
        trafficReport: createThreeBranchReplacementBusTrafficReport(),
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowPositionedStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    const markers = wrapper.findAll(".pattern-flow-traffic-marker--interruption");
    expect(markers).toHaveLength(3);
    expect(
      markers.filter((marker) =>
        marker.classes().includes("pattern-flow-traffic-marker--above"),
      ),
    ).toHaveLength(2);
    expect(
      markers.filter((marker) =>
        marker.classes().includes("pattern-flow-traffic-marker--below"),
      ),
    ).toHaveLength(1);

    const belowMarker = markers.find((marker) =>
      marker.classes().includes("pattern-flow-traffic-marker--below"),
    );
    expect(belowMarker).toBeDefined();
    expectTrafficMarkerConnectorsToBeVerticalAndAttached(wrapper);

    const rects = readPositionedFlowRects(wrapper);
    const belowGeometry = belowMarker?.element.closest(".flow-node-geometry");
    const belowId = belowGeometry?.getAttribute("data-flow-node-id") ?? "";
    const belowConnector = rects.find(
      (rect) =>
        rect.id === belowId.replace(
          "traffic-marker:",
          "traffic-marker-connector:",
        ),
    );
    expect(belowConnector).toBeDefined();

    wrapper.unmount();
  });

  it("keeps future interruptions out of the current line state before the work starts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: createThreeStationTrafficPattern(),
        showMiniMap: false,
        trafficReport: {
          lineRef: "line:test",
          status: "planned",
          disruptions: [
            {
              id: "upcoming-a-c",
              title: "Travaux prevus",
              message:
                "Le trafic sera interrompu entre Station A et Station C.",
              kind: "works",
              applicationPeriods: [
                {
                  begin: "20260710T120000",
                  end: "20260711T120000",
                },
              ],
              impactedLineRefs: ["line:test"],
              impactedStopNames: [],
            },
          ],
        },
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowTrafficStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    expect(wrapper.find(".pattern-flow-traffic-marker--interruption").exists()).toBe(
      false,
    );
    expect(
      wrapper.find(".pattern-flow-edge--traffic-interruption").exists(),
    ).toBe(false);

    const toggle = wrapper.get(".pattern-traffic-calendar-toggle");
    expect(toggle.text()).toContain("Trafic");
    expect(toggle.text()).toContain("1");
    expect(toggle.classes()).not.toContain(
      "pattern-traffic-calendar-toggle--urgent",
    );

    wrapper.unmount();
  });

  it("keeps traffic warnings hidden before the ten-day window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: createThreeStationTrafficPattern(),
        showMiniMap: false,
        trafficReport: {
          lineRef: "line:test",
          status: "planned",
          disruptions: [
            {
              id: "later-a-c",
              title: "Travaux prevus",
              message:
                "Le trafic sera interrompu entre Station A et Station C.",
              kind: "works",
              applicationPeriods: [
                {
                  begin: "20260712T120000",
                  end: "20260713T120000",
                },
              ],
              impactedLineRefs: ["line:test"],
              impactedStopNames: [],
            },
          ],
        },
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowTrafficStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    expect(wrapper.find(".pattern-flow-traffic-marker").exists()).toBe(false);
    expect(wrapper.find(".pattern-flow-edge--traffic").exists()).toBe(false);
    expect(wrapper.find(".pattern-traffic-calendar-toggle").exists()).toBe(true);

    wrapper.unmount();
  });

  it("honors a custom traffic warning lookahead on the pattern modal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: createThreeStationTrafficPattern(),
        showMiniMap: false,
        trafficWarningLookaheadDays: 14,
        trafficReport: {
          lineRef: "line:test",
          status: "planned",
          disruptions: [
            {
              id: "custom-lookahead-a-c",
              title: "Travaux prevus",
              message:
                "Le trafic sera interrompu entre Station A et Station C.",
              kind: "works",
              applicationPeriods: [
                {
                  begin: "20260712T120000",
                  end: "20260713T120000",
                },
              ],
              impactedLineRefs: ["line:test"],
              impactedStopNames: [],
            },
          ],
        },
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowTrafficStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    expect(wrapper.find(".pattern-flow-traffic-marker").exists()).toBe(false);
    expect(wrapper.find(".pattern-flow-edge--traffic").exists()).toBe(false);
    expect(wrapper.get(".pattern-traffic-calendar-toggle").text()).toContain(
      "J-11",
    );

    wrapper.unmount();
  });

  it("opens the future traffic calendar and focuses the selected interrupted zone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: createThreeStationTrafficPattern(),
        showMiniMap: false,
        trafficReport: {
          lineRef: "line:test",
          status: "planned",
          disruptions: [
            {
              id: "future-a-c",
              title: "Travaux prevus",
              message:
                "Le trafic sera interrompu entre Station A et Station C.",
              kind: "works",
              applicationPeriods: [
                {
                  begin: "20260720T120000",
                  end: "20260721T120000",
                },
              ],
              impactedLineRefs: ["line:test"],
              impactedStopNames: [],
            },
          ],
        },
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowTrafficStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    expect(wrapper.find(".pattern-flow-traffic-marker").exists()).toBe(false);

    const toggle = wrapper.get(".pattern-traffic-calendar-toggle");
    expect(toggle.text()).toContain("Trafic");
    expect(toggle.text()).toContain("1");
    expect(toggle.text()).toContain("J-19");
    expect(toggle.classes()).not.toContain(
      "pattern-traffic-calendar-toggle--urgent",
    );

    await toggle.trigger("click");
    await flushPromises();

    expect(
      wrapper.find(".pattern-traffic-calendar-tooltip__panel").exists(),
    ).toBe(false);
    expect(
      wrapper.findAll("[data-testid='pattern-traffic-calendar']"),
    ).toHaveLength(1);
    await wrapper
      .get("[data-testid='pattern-traffic-calendar-expand']")
      .trigger("click");
    await flushPromises();
    expect(
      wrapper.findAll("[data-testid='pattern-traffic-calendar']"),
    ).toHaveLength(1);
    expect(wrapper.find(".pattern-traffic-calendar--expanded").exists()).toBe(
      true,
    );
    await wrapper
      .get(".pattern-traffic-calendar-modal .icon-button")
      .trigger("click");
    await flushPromises();
    expect(wrapper.find(".pattern-traffic-calendar--expanded").exists()).toBe(
      false,
    );
    expect(
      wrapper.findAll("[data-testid='pattern-traffic-calendar']"),
    ).toHaveLength(1);
    expect(
      wrapper.get("[data-testid='pattern-traffic-calendar']").classes(),
    ).not.toContain(
      "pattern-traffic-calendar--expanded",
    );


    await wrapper.get("[data-date='2026-07-20']").trigger("click");
    await nextTick();

    expect(wrapper.find(".loading-clock").exists()).toBe(true);

    await flushPromises();

    expect(wrapper.get(".pattern-flow-traffic-marker").text()).toContain(
      "Trafic interrompu",
    );
    expect(vueFlowSetViewportMock).toHaveBeenCalled();
    expect(vueFlowFitViewMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ padding: 0.18 }),
    );

    const incident = wrapper.get(
      "[data-testid='pattern-traffic-calendar-friendly-incident']",
    );
    expect(incident.attributes("role")).toBe("button");
    vueFlowSetViewportMock.mockClear();
    await incident.trigger("click");
    await nextTick();

    expect(vueFlowSetViewportMock).toHaveBeenCalledTimes(1);
    expect(vueFlowSetViewportMock).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: expect.any(Number) }),
      { duration: 620 },
    );
    expect(wrapper.find(".pattern-flow-station--traffic-focus").exists()).toBe(
      false,
    );

    await vi.advanceTimersByTimeAsync(620);
    await vi.advanceTimersByTimeAsync(499);
    await nextTick();
    expect(wrapper.find(".pattern-flow-station--traffic-focus").exists()).toBe(
      false,
    );

    await vi.advanceTimersByTimeAsync(1);
    await nextTick();
    expect(
      wrapper
        .findAll(".pattern-flow-station--traffic-focus")
        .map((station) => station.attributes("data-station-key"))
        .sort(),
    ).toEqual(["stationa", "stationb", "stationc"]);

    await vi.advanceTimersByTimeAsync(900);
    await nextTick();
    expect(wrapper.find(".pattern-flow-station--traffic-focus").exists()).toBe(
      false,
    );

    await vi.advanceTimersByTimeAsync(599);
    await nextTick();
    expect(wrapper.find(".pattern-flow-station--traffic-focus").exists()).toBe(
      false,
    );

    await vi.advanceTimersByTimeAsync(1);
    await nextTick();
    expect(
      wrapper
        .findAll(".pattern-flow-station--traffic-focus")
        .map((station) => station.attributes("data-station-key"))
        .sort(),
    ).toEqual(["stationa", "stationb", "stationc"]);

    await vi.advanceTimersByTimeAsync(900);
    await nextTick();
    expect(wrapper.find(".pattern-flow-station--traffic-focus").exists()).toBe(
      false,
    );
    expect(vueFlowSetViewportMock).toHaveBeenCalledTimes(1);
    expect(wrapper.find(".loading-clock").exists()).toBe(false);
    await wrapper.get(".pattern-traffic-calendar__today").trigger("click");
    await flushPromises();
    expect(wrapper.find(".pattern-flow-traffic-marker").exists()).toBe(false);
    expect(
      wrapper.get("[data-date='2026-07-01']").attributes("aria-selected"),
    ).toBe("true");


    wrapper.unmount();
  });

  it("fits the whole VueFlow line when one calendar day has multiple interrupted zones", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ places: [], records: [] }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: createFourStationTrafficPattern(),
        showMiniMap: false,
        trafficReport: {
          lineRef: "line:test",
          status: "planned",
          disruptions: [
            {
              id: "future-a-b",
              title: "Travaux secteur ouest",
              message:
                "Le trafic sera interrompu entre Station A et Station B.",
              kind: "works",
              applicationPeriods: [
                {
                  begin: "20260720T120000",
                  end: "20260721T120000",
                },
              ],
              impactedLineRefs: ["line:test"],
              impactedStopNames: [],
            },
            {
              id: "future-c-d",
              title: "Travaux secteur est",
              message:
                "Le trafic sera interrompu entre Station C et Station D.",
              kind: "works",
              applicationPeriods: [
                {
                  begin: "20260720T180000",
                  end: "20260721T120000",
                },
              ],
              impactedLineRefs: ["line:test"],
              impactedStopNames: [],
            },
          ],
        },
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowTrafficStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();
    await wrapper.get(".pattern-traffic-calendar-toggle").trigger("click");
    await flushPromises();
    await wrapper.get("[data-date='2026-07-20']").trigger("click");
    await flushPromises();

    expect(vueFlowFitViewMock).toHaveBeenCalledWith(
      expect.objectContaining({ padding: 0.18 }),
    );
    expect(vueFlowSetViewportMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("shows same-day traffic restart as a relative delay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 1, 50, 0));

    const trafficPattern: DepartureCallingPattern = {
      ...pattern,
      calls: [
        createCall("station-a", "Station A", "Paris", true),
        createCall("champigny", "Champigny", "Saint-Maur-des-Fosses"),
        createCall("station-c", "Station C", "Paris"),
      ],
      lineTopology: [
        {
          id: "traffic-sequence",
          label: "Traffic sequence",
          stops: [
            createRouteStop("station-a", "Station A", 652146, 6862288),
            createRouteStop("champigny", "Champigny", 652646, 6862288),
            createRouteStop("station-c", "Station C", 653146, 6862288),
          ],
        },
      ],
    };
    const trafficResponse: TrafficResponse = {
      configured: true,
      generatedAt: "2026-07-08T00:00:00.000Z",
      source: "prim-line-reports",
      lines: [
        {
          lineRef: "line:test",
          status: "disrupted",
          disruptions: [
            {
              id: "champigny-non-served",
              title: "Arret(s) non desservi(s)",
              message:
                "La gare de Champigny n'est pas desservie jusqu'a 02h45 et le trafic est perturbe sur le reste de la ligne.",
              kind: "incident",
              applicationPeriods: [
                {
                  begin: "20260708T002400",
                  end: "20260708T030000",
                },
              ],
              impactedLineRefs: ["line:test"],
              impactedStopNames: [],
            },
          ],
        },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/traffic")) {
        return {
          ok: true,
          json: async () => trafficResponse,
        };
      }

      return {
        ok: true,
        json: async () => ({ places: [], records: [] }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: trafficPattern,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowTrafficStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    const interruptionMarker = wrapper.get(
      ".pattern-flow-traffic-marker--interruption",
    );

    expect(interruptionMarker.text()).toContain("Trafic interrompu");
    expect(interruptionMarker.text()).toContain(
      "Reprise dans 55 minutes (02h45)",
    );
    expect(interruptionMarker.text()).not.toContain("Reprise le 8 juillet");

    wrapper.unmount();
  });

  it("keeps textual traffic ranges above daily technical periods", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 7, 4, 0, 0));

    const trafficPattern: DepartureCallingPattern = {
      ...pattern,
      calls: [
        createCall("gare-de-lyon", "Gare de Lyon", "Paris", true),
        createCall("nation", "Nation", "Paris"),
        createCall("vincennes", "Vincennes", "Vincennes"),
      ],
      lineTopology: [
        {
          id: "traffic-sequence",
          label: "Traffic sequence",
          stops: [
            createRouteStop("gare-de-lyon", "Gare de Lyon", 652146, 6862288),
            createRouteStop("nation", "Nation", 652646, 6862288),
            createRouteStop("vincennes", "Vincennes", 653146, 6862288),
          ],
        },
      ],
    };
    const trafficResponse: TrafficResponse = {
      configured: true,
      generatedAt: "2026-07-07T00:00:00.000Z",
      source: "prim-line-reports",
      lines: [
        {
          lineRef: "line:test",
          status: "disrupted",
          disruptions: [
            {
              id: "nation-long-works",
              title: "RER A : Nation du 29/06 au 30/08",
              message:
                "Periode : toute la journee. Dates : du lundi 29 juin au dimanche 30 aout. La gare de Nation n'est pas desservie. Elle restera accessible via les lignes de metro. Motif : travaux.",
              kind: "works",
              applicationPeriods: [
                {
                  begin: "20260707T030000",
                  end: "20260708T030000",
                },
              ],
              impactedLineRefs: ["line:test"],
              impactedStopNames: [],
            },
          ],
        },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/traffic")) {
        return {
          ok: true,
          json: async () => trafficResponse,
        };
      }

      return {
        ok: true,
        json: async () => ({ places: [], records: [] }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: trafficPattern,
        showMiniMap: false,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowTrafficStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    const interruptionMarker = wrapper.get(
      ".pattern-flow-traffic-marker--interruption",
    );

    expect(interruptionMarker.text()).toContain("Trafic interrompu");
    expect(interruptionMarker.text()).toContain("Reprise le 31 août");
    expect(interruptionMarker.text()).not.toContain("Reprise dans");
    expect(interruptionMarker.text()).not.toContain("03h00");

    wrapper.unmount();
  });

  it("keeps disturbed traffic visible when reduceMotion disables animation", async () => {
    const trafficPattern: DepartureCallingPattern = {
      ...pattern,
      calls: [
        createCall("station-a", "Station A", "Paris", true),
        createCall("station-b", "Station B", "Paris"),
      ],
      lineTopology: [
        {
          id: "disturbed-sequence",
          label: "Disturbed sequence",
          stops: [
            createRouteStop("station-a", "Station A", 652146, 6862288),
            createRouteStop("station-b", "Station B", 652646, 6862288),
          ],
        },
      ],
    };

    const wrapper = mount(DeparturePatternModal, {
      props: {
        open: true,
        board,
        pattern: trafficPattern,
        reduceMotion: true,
        showMiniMap: false,
        trafficReport: {
          lineRef: "line:test",
          status: "disrupted",
          disruptions: [
            {
              id: "disturbed-a-b",
              title: "Service perturbe",
              message: "Service perturbe entre Station A et Station B.",
              kind: "incident",
              applicationPeriods: [],
              impactedLineRefs: ["line:test"],
              impactedStopNames: [],
            },
          ],
        },
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: VueFlowTrafficStub,
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();

    expect(wrapper.find(".pattern-flow-shell--reduce-motion").exists()).toBe(
      true,
    );
    expect(
      wrapper.find(".pattern-flow-edge--traffic-disturbance").exists(),
    ).toBe(true);

    wrapper.unmount();
  });
});

function createThreeStationTrafficPattern(): DepartureCallingPattern {
  return {
    ...pattern,
    calls: [
      createCall("station-a", "Station A", "Paris", true),
      createCall("station-b", "Station B", "Paris"),
      createCall("station-c", "Station C", "Paris"),
    ],
    lineTopology: [
      {
        id: "traffic-sequence",
        label: "Traffic sequence",
        stops: [
          createRouteStop("station-a", "Station A", 652146, 6862288),
          createRouteStop("station-b", "Station B", 652646, 6862288),
          createRouteStop("station-c", "Station C", 653146, 6862288),
        ],
      },
    ],
  };
}

function createFourStationTrafficPattern(): DepartureCallingPattern {
  return {
    ...pattern,
    calls: [
      createCall("station-a", "Station A", "Paris", true),
      createCall("station-b", "Station B", "Paris"),
      createCall("station-c", "Station C", "Paris"),
      createCall("station-d", "Station D", "Paris"),
    ],
    lineTopology: [
      {
        id: "traffic-sequence",
        label: "Traffic sequence",
        stops: [
          createRouteStop("station-a", "Station A", 652146, 6862288),
          createRouteStop("station-b", "Station B", 652646, 6862288),
          createRouteStop("station-c", "Station C", 653146, 6862288),
          createRouteStop("station-d", "Station D", 653646, 6862288),
        ],
      },
    ],
  };
}

function createFiveStationTrafficPattern(): DepartureCallingPattern {
  return {
    ...pattern,
    calls: [
      createCall("station-a", "Station A", "Paris", true),
      createCall("station-b", "Station B", "Paris"),
      createCall("station-c", "Station C", "Paris"),
      createCall("station-d", "Station D", "Paris"),
      createCall("station-e", "Station E", "Paris"),
    ],
    lineTopology: [
      {
        id: "traffic-sequence",
        label: "Traffic sequence",
        stops: [
          createRouteStop("station-a", "Station A", 652146, 6862288),
          createRouteStop("station-b", "Station B", 652646, 6862288),
          createRouteStop("station-c", "Station C", 653146, 6862288),
          createRouteStop("station-d", "Station D", 653646, 6862288),
          createRouteStop("station-e", "Station E", 654146, 6862288),
        ],
      },
    ],
  };
}

function createReplacementBusTrafficReport(): TrafficLineReport {
  return {
    lineRef: "line:test",
    status: "disrupted",
    disruptions: [
      {
        id: "rer-b-summer-replacement-bus",
        title: "Grands travaux d'été",
        message: [
          "Période : toute la journée",
          "Dates : du 1er juillet au 7 août",
          "- Station A <> Station C : trafic interrompu",
          "- Station B <> Station D : trafic interrompu",
          "- Station C <> Station E : trafic interrompu",
          "Bus de remplacement prévu sur les tronçons interrompus.",
        ].join("\n"),
        kind: "works",
        applicationPeriods: [
          {
            begin: "20260701T000000",
            end: "20260807T235959",
          },
        ],
        impactedLineRefs: ["line:test"],
        impactedStopNames: [],
      },
    ],
  };
}

function createFiveDuplicateReplacementBusTrafficReport(): TrafficLineReport {
  const baseReport = createReplacementBusTrafficReport();
  const baseDisruption = baseReport.disruptions[0];
  if (!baseDisruption) return baseReport;

  return {
    ...baseReport,
    disruptions: Array.from({ length: 5 }, (_, index) => ({
      ...baseDisruption,
      id: `rer-j-27-august-duplicate-${index}`,
    })),
  };
}

function createFiveDuplicateInterruptionTrafficReport(): TrafficLineReport {
  const disruption = {
    id: "rer-c-duplicate-interruption-0",
    title: "Travaux",
    message: [
      "Période : toute la journée",
      "Dates : du 1er juillet au 7 août",
      "Station A <> Station C : trafic interrompu",
    ].join("\n"),
    kind: "works" as const,
    applicationPeriods: [
      {
        begin: "20260701T000000",
        end: "20260807T235959",
      },
    ],
    impactedLineRefs: ["line:test"],
    impactedStopNames: [],
  };

  return {
    lineRef: "line:test",
    status: "disrupted",
    disruptions: Array.from({ length: 5 }, (_, index) => ({
      ...disruption,
      id: `rer-c-duplicate-interruption-${index}`,
    })),
  };
}

function createReplacementBusDisturbanceTrafficReport(): TrafficLineReport {
  return {
    lineRef: "line:test",
    status: "disrupted",
    disruptions: [
      {
        id: "replacement-bus-disturbance",
        title: "Offre réduite",
        message: [
          "Période : toute la journée",
          "Dates : du 1er juillet au 7 août",
          "- Station A <> Station C : offre de transport réduite",
          "Bus de remplacement prévu sur le tronçon.",
        ].join("\n"),
        kind: "incident",
        applicationPeriods: [
          {
            begin: "20260701T000000",
            end: "20260807T235959",
          },
        ],
        impactedLineRefs: ["line:test"],
        impactedStopNames: [],
      },
    ],
  };
}

function createThreeBranchReplacementBusPattern(): DepartureCallingPattern {
  return {
    ...pattern,
    calls: [
      createCall("branch-root", "Branch Root", "Paris", true),
      createCall("top-a", "Top A", "Top City"),
      createCall("top-b", "Top B", "Top City"),
      createCall("middle-a", "Middle A", "Middle City"),
      createCall("middle-b", "Middle B", "Middle City"),
      createCall("bottom-a", "Bottom A", "Bottom City"),
      createCall("bottom-b", "Bottom B", "Bottom City"),
    ],
    lineTopology: [
      {
        id: "replacement-top-branch",
        label: "Top replacement branch",
        stops: [
          createRouteStop("branch-root", "Branch Root", 652146, 6862288),
          createRouteStop("top-a", "Top A", 652646, 6862288),
          createRouteStop("top-b", "Top B", 653146, 6862288),
        ],
      },
      {
        id: "replacement-middle-branch",
        label: "Middle replacement branch",
        stops: [
          createRouteStop("branch-root", "Branch Root", 652146, 6862288),
          createRouteStop("middle-a", "Middle A", 652646, 6861688),
          createRouteStop("middle-b", "Middle B", 653146, 6861688),
        ],
      },
      {
        id: "replacement-bottom-branch",
        label: "Bottom replacement branch",
        stops: [
          createRouteStop("branch-root", "Branch Root", 652146, 6862288),
          createRouteStop("bottom-a", "Bottom A", 652646, 6861088),
          createRouteStop("bottom-b", "Bottom B", 653146, 6861088),
        ],
      },
    ],
  };
}

function createThreeBranchReplacementBusTrafficReport(): TrafficLineReport {
  return {
    lineRef: "line:test",
    status: "disrupted",
    disruptions: [
      {
        id: "three-branch-replacement-bus",
        title: "Travaux d'été",
        message: [
          "Période : toute la journée",
          "Dates : du 1er juillet au 7 août",
          "- Top A <> Top B : trafic interrompu",
          "- Middle A <> Middle B : trafic interrompu",
          "- Bottom A <> Bottom B : trafic interrompu",
          "Bus de remplacement prévu sur les tronçons interrompus.",
        ].join("\n"),
        kind: "works",
        applicationPeriods: [
          {
            begin: "20260701T000000",
            end: "20260807T235959",
          },
        ],
        impactedLineRefs: ["line:test"],
        impactedStopNames: [],
      },
    ],
  };
}

function createTransilienJBranchPattern(): DepartureCallingPattern {
  return {
    ...pattern,
    calls: [
      createCall("eragny-neuville", "Eragny Neuville", "Eragny", true),
      createCall("saint-ouen", "Saint-Ouen-l'Aumône", "Saint-Ouen"),
      createCall("pontoise", "Pontoise", "Pontoise"),
      createCall("osny", "Osny", "Osny"),
      createCall(
        "conflans",
        "Conflans-Sainte-Honorine",
        "Conflans-Sainte-Honorine",
      ),
      createCall("maurecourt", "Maurecourt", "Maurecourt"),
      createCall("andresy", "Andrésy", "Andrésy"),
      createCall("chanteloup", "Chanteloup-les-Vignes", "Chanteloup"),
    ],
    lineTopology: [
      {
        id: "j-main-branch",
        label: "J main branch",
        stops: [
          createRouteStop(
            "eragny-neuville",
            "Eragny Neuville",
            652146,
            6862288,
          ),
          createRouteStop(
            "saint-ouen",
            "Saint-Ouen-l'Aumône",
            652646,
            6862288,
          ),
          createRouteStop("pontoise", "Pontoise", 653146, 6862288),
          createRouteStop("osny", "Osny", 653646, 6862288),
        ],
      },
      {
        id: "j-south-branch",
        label: "J south branch",
        stops: [
          createRouteStop(
            "eragny-neuville",
            "Eragny Neuville",
            652146,
            6862288,
          ),
          createRouteStop(
            "conflans",
            "Conflans-Sainte-Honorine",
            652646,
            6861688,
          ),
          createRouteStop("maurecourt", "Maurecourt", 653146, 6861688),
          createRouteStop("andresy", "Andrésy", 653646, 6861688),
        ],
      },
      {
        id: "j-west-branch",
        label: "J west branch",
        stops: [
          createRouteStop(
            "conflans",
            "Conflans-Sainte-Honorine",
            652646,
            6861688,
          ),
          createRouteStop(
            "chanteloup",
            "Chanteloup-les-Vignes",
            653146,
            6861088,
          ),
        ],
      },
    ],
  };
}

function createTransilienJBranchTrafficReport(): TrafficLineReport {
  return {
    lineRef: "line:test",
    status: "disrupted",
    disruptions: [
      {
        id: "transilien-j-branch-buses",
        title: "Travaux d'été",
        message: [
          "Période : toute la journée",
          "Dates : du 1er juillet au 7 août",
          "- Eragny Neuville <> Pontoise : trafic interrompu",
          "- Conflans-Sainte-Honorine <> Andrésy : trafic interrompu",
          "Bus de remplacement prévu sur les branches.",
        ].join("\n"),
        kind: "works",
        applicationPeriods: [
          {
            begin: "20260701T000000",
            end: "20260807T235959",
          },
        ],
        impactedLineRefs: ["line:test"],
        impactedStopNames: [],
      },
    ],
  };
}

function createTopBranchInterruptionTrafficReport(): TrafficLineReport {
  return {
    lineRef: "line:test",
    status: "disrupted",
    disruptions: [
      {
        id: "transilien-j-top-branch-interruption",
        title: "Interruption branche haute",
        message: [
          "Période : toute la journée",
          "Dates : du 1er juillet au 7 août",
          "- Eragny Neuville <> Pontoise : trafic interrompu",
        ].join("\n"),
        kind: "works",
        applicationPeriods: [
          {
            begin: "20260701T000000",
            end: "20260807T235959",
          },
        ],
        impactedLineRefs: ["line:test"],
        impactedStopNames: [],
      },
    ],
  };
}

function createCall(
  id: string,
  label: string,
  city: string,
  current = false,
) {
  return {
    id,
    label,
    city,
    current,
    served: true,
  };
}

function createRouteStop(
  id: string,
  label: string,
  projectedX: number,
  projectedY: number,
  city?: string,
) {
  return {
    id,
    label,
    city,
    projectedX,
    projectedY,
    station: {
      id,
      label,
      city,
      monitoringRef: id,
    },
  };
}

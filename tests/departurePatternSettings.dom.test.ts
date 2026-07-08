import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeparturePatternModal from "../src/features/service-pattern/DeparturePatternModal.vue";
import { buildLinePatternViewFromTopology } from "../server/services/servicePattern/buildLinePatternView";
import { getLineTopology } from "../server/services/topology/getLineTopology";
import type {
  DepartureCallingPattern,
  TransitBoardConfig,
} from "../src/types/transit";
import type { TrafficResponse } from "../src/features/traffic";

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
  emits: ["edge-click"],
  setup(props, { emit, slots }) {
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

afterEach(() => {
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
      "Transilien P: La Ferté-Milon mini branch should sit below the Château-Thierry branch",
    ).toBeGreaterThan(changis.y);
    expect(
      miniForkGap,
      `Transilien P: nested mini-fork gap should leave room for station labels, got ${miniForkGap}`,
    ).toBeGreaterThanOrEqual(120);

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

  it("extends a full-line common spine before parallel alternatives", async () => {
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
    const saintLazare = positionByLabel.get("Gare Saint-Lazare");

    expect(asnieres).toBeDefined();
    expect(houilles).toBeDefined();
    expect(sartrouville).toBeDefined();
    expect(boisColombes).toBeDefined();
    expect(saintLazare).toBeDefined();
    expect(saintLazare!.x).toBeLessThan(asnieres!.x);
    expect(asnieres!.x).toBeLessThan(houilles!.x);
    expect(houilles!.x).toBeLessThan(sartrouville!.x);
    expect(saintLazare!.y).toBe(asnieres!.y);
    expect(asnieres!.y).toBe(houilles!.y);
    expect(houilles!.y).toBe(sartrouville!.y);
    expect(boisColombes!.x).toBeGreaterThan(asnieres!.x);
    expect(boisColombes!.x).toBeLessThan(houilles!.x);
    expect(boisColombes!.y).toBeGreaterThan(asnieres!.y);

    await flushPromises();
    wrapper.unmount();
  });

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

  it("shows upcoming traffic warning markers ten days before the work starts", async () => {
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

    const marker = wrapper.get(".pattern-flow-traffic-marker--interruption");

    expect(marker.text()).toContain("Interruption prevue");
    expect(marker.text()).toContain("Debute le");
    expect(marker.text()).not.toContain("Trafic interrompu");
    expect(
      wrapper.find(".pattern-flow-edge--traffic-interruption").exists(),
    ).toBe(true);

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

    expect(wrapper.get(".pattern-flow-traffic-marker").text()).toContain(
      "Interruption prevue",
    );

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

import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeparturePatternModal from "../src/features/service-pattern/DeparturePatternModal.vue";
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DeparturePatternModal settings", () => {
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
              title: "Trafic interrompu",
              message:
                "Trafic interrompu entre Station A et Station C et perturbe sur le reste de la ligne. Reprise estimee : 00:00.",
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

    await wrapper
      .get(".pattern-flow-edge--traffic-interruption")
      .trigger("click");

    expect(wrapper.text()).toContain("Trafic interrompu");
    expect(wrapper.text()).toContain("Reprise estimee");

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

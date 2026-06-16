import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeparturePatternModal from "../src/features/service-pattern/DeparturePatternModal.vue";
import type {
  DepartureCallingPattern,
  TransitBoardConfig,
} from "../src/types/transit";

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

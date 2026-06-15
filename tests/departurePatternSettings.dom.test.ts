import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
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
});

function createRouteStop(
  id: string,
  label: string,
  projectedX: number,
  projectedY: number,
) {
  return {
    id,
    label,
    projectedX,
    projectedY,
    station: {
      id,
      label,
      monitoringRef: id,
    },
  };
}

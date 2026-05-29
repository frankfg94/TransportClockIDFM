import { flushPromises, mount } from "@vue/test-utils";
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
});

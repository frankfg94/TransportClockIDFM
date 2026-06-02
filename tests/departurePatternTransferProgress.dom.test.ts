import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import DeparturePatternModal from "../src/features/service-pattern/DeparturePatternModal.vue";
import type {
  DepartureCallingPattern,
  TransitBoardConfig,
} from "../src/types/transit";

const hydrationMockState = vi.hoisted(() => ({
  resolve: undefined as (() => void) | undefined,
}));

vi.mock("../src/features/service-pattern/patternTransfers", () => ({
  hydrateDeparturePatternTransfers: vi.fn(
    async (
      _board: TransitBoardConfig,
      pattern: DepartureCallingPattern,
      _client: unknown,
      options?: {
        onProgress?: (progress: {
          completed: number;
          failed: number;
          pending: number;
          total: number;
        }) => void;
      },
    ) => {
      options?.onProgress?.({
        completed: 2,
        failed: 0,
        pending: 3,
        total: 5,
      });

      await new Promise<void>((resolve) => {
        hydrationMockState.resolve = resolve;
      });

      return pattern;
    },
  ),
}));

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
  hydrationMockState.resolve?.();
  hydrationMockState.resolve = undefined;
});

describe("DeparturePatternModal transfer progress", () => {
  it("shows a determinate progress bar while transfers are hydrating", async () => {
    const wrapper = mount(DeparturePatternModal, {
      props: {
        embedded: true,
        open: true,
        board,
        pattern,
      },
      global: {
        stubs: {
          Teleport: true,
          VueFlow: {
            template: '<div class="vue-flow"><slot /></div>',
          },
          Controls: true,
          PatternFlowMiniMap: true,
          LineIconBadge: true,
          MaterialCombobox: true,
          Handle: true,
        },
      },
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.text()).toContain("Chargement des correspondances");
    expect(wrapper.text()).toContain("2/5");
    expect(
      wrapper
        .find(".pattern-flow-transfer-loader__track i")
        .attributes("style"),
    ).toContain("width: 40%");

    hydrationMockState.resolve?.();
    await flushPromises();
    wrapper.unmount();
  });
});

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import DeparturePatternModal from "../src/features/service-pattern/DeparturePatternModal.vue";
import { hydrateDeparturePatternTransfers } from "../src/features/service-pattern/patternTransfers";
import type {
  DepartureCallingPattern,
  TransitBoardConfig,
} from "../src/types/transit";

const hydrationMockState = vi.hoisted(() => ({
  progress: {
    completed: 2,
    failed: 0,
    pending: 3,
    total: 5,
  },
  resolves: [] as Array<() => void>,
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
      options?.onProgress?.(hydrationMockState.progress);

      await new Promise<void>((resolve) => {
        hydrationMockState.resolves.push(resolve);
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
  hydrationMockState.resolves.splice(0).forEach((resolve) => resolve());
  hydrationMockState.progress = {
    completed: 2,
    failed: 0,
    pending: 3,
    total: 5,
  };
  vi.useRealTimers();
});

describe("DeparturePatternModal transfer progress", () => {
  it("shows a determinate progress bar while transfers are hydrating", async () => {
    const wrapper = mount(DeparturePatternModal, {
      props: {
        embedded: true,
        open: true,
        board,
        pattern,
        smartTrafficDetection: false,
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

    hydrationMockState.resolves.splice(0).forEach((resolve) => resolve());
    await flushPromises();
    wrapper.unmount();
  });

  it("offers a retry when transfer loading stays at zero for thirty seconds", async () => {
    vi.useFakeTimers();
    hydrationMockState.progress = {
      completed: 0,
      failed: 0,
      pending: 13,
      total: 13,
    };
    const hydrateMock = vi.mocked(hydrateDeparturePatternTransfers);
    hydrateMock.mockClear();

    const wrapper = mount(DeparturePatternModal, {
      props: {
        embedded: true,
        open: true,
        board,
        pattern,
        smartTrafficDetection: false,
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
    expect(wrapper.text()).toContain("0/13");
    expect(wrapper.text()).not.toContain("Réessayer");

    await vi.advanceTimersByTimeAsync(30_000);
    await nextTick();

    expect(wrapper.text()).toContain("Correspondances bloquées");
    expect(wrapper.text()).toContain("Réessayer");

    await wrapper
      .find(".pattern-flow-transfer-loader__retry")
      .trigger("click");
    await flushPromises();

    expect(hydrateMock).toHaveBeenCalledTimes(2);

    hydrationMockState.resolves.splice(0).forEach((resolve) => resolve());
    await flushPromises();
    wrapper.unmount();
  });
});

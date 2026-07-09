import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, reactive } from "vue";
import {
  createDefaultTransitPresetState,
  createTransitPlace,
  loadTransitPresetState,
  saveTransitPresetState,
} from "../src/storage/transitPreferences";
import { transitBoards } from "../src/config/transitBoards";
import type { TransitBoardConfig } from "../src/types/transit";

let route: {
  path: string;
  query: Record<string, string | undefined>;
};
let router: {
  push: ReturnType<typeof vi.fn>;
  replace: ReturnType<typeof vi.fn>;
};

afterEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("nuxt/app");
  vi.doUnmock("vuedraggable");
  vi.doUnmock("../src/components/StationBoardModal.vue");
  vi.doUnmock("../src/components/TransitBoard.vue");
  vi.doUnmock("../src/features/app-settings");
  vi.doUnmock("../src/features/weather");
  vi.doUnmock("../src/services/idfm");
});

describe("dashboard presets", () => {
  it("normalizes the home URL and switches to an empty work dashboard", async () => {
    installDashboardMocks({});
    const { default: App } = await import("../src/App.vue");
    const wrapper = mount(App, { attachTo: document.body });

    await flushPromises();

    expect(router.replace).toHaveBeenCalled();
    expect(route.query.place).toBe("home");

    await wrapper.get(".place-switcher__trigger").trigger("click");
    const workButton = wrapper
      .findAll(".place-switcher__item")
      .find((button) => button.text().includes("Travail"));

    expect(workButton).toBeTruthy();
    await workButton?.trigger("click");
    await flushPromises();

    expect(router.push).toHaveBeenCalled();
    expect(route.query.place).toBe("work");
    expect(wrapper.text()).toContain("Aucune station suivie pour le moment");
  });

  it("switches places with desktop arrows and horizontal swipe", async () => {
    installDashboardMocks({});
    const { default: App } = await import("../src/App.vue");
    const wrapper = mount(App, { attachTo: document.body });

    await flushPromises();
    expect(wrapper.find(".place-swipe-arrow--previous").exists()).toBe(false);
    expect(wrapper.find(".place-swipe-arrow--next").exists()).toBe(true);

    await wrapper.get(".place-swipe-arrow--next").trigger("click");
    await flushPromises();

    expect(route.query.place).toBe("work");
    expect(wrapper.find(".place-swipe-arrow--previous").exists()).toBe(true);
    expect(wrapper.find(".place-swipe-arrow--next").exists()).toBe(false);

    const shell = wrapper.get(".place-swipe-shell");
    await shell.trigger("pointerdown", {
      button: 0,
      clientX: 340,
      clientY: 20,
      pointerId: 1,
    });
    await shell.trigger("pointermove", {
      clientX: 80,
      clientY: 22,
      pointerId: 1,
    });
    await shell.trigger("pointerup", {
      clientX: 80,
      clientY: 22,
      pointerId: 1,
    });
    await flushPromises();

    expect(route.query.place).toBe("work");

    await shell.trigger("pointerdown", {
      button: 0,
      clientX: 80,
      clientY: 20,
      pointerId: 1,
    });
    await shell.trigger("pointermove", {
      clientX: 340,
      clientY: 22,
      pointerId: 1,
    });
    await shell.trigger("pointerup", {
      clientX: 340,
      clientY: 22,
      pointerId: 1,
    });
    await flushPromises();

    expect(route.query.place).toBe("home");
  });

  it("keeps custom presets between home and work for arrow navigation", async () => {
    const state = createTransitPlace(
      createDefaultTransitPresetState(transitBoards),
      "Sport",
      transitBoards,
    ).state;
    saveTransitPresetState(state);
    installDashboardMocks({});
    const { default: App } = await import("../src/App.vue");
    const wrapper = mount(App, { attachTo: document.body });

    await flushPromises();
    await wrapper.get(".place-swipe-arrow--next").trigger("click");
    await flushPromises();

    expect(route.query.place).toBe("sport");
    expect(wrapper.find(".place-swipe-arrow--previous").exists()).toBe(true);
    expect(wrapper.find(".place-swipe-arrow--next").exists()).toBe(true);

    await wrapper.get(".place-swipe-arrow--next").trigger("click");
    await flushPromises();

    expect(route.query.place).toBe("work");
    expect(wrapper.find(".place-swipe-arrow--previous").exists()).toBe(true);
    expect(wrapper.find(".place-swipe-arrow--next").exists()).toBe(false);
  });

  it("uses dropdown-only mode without swipe controls", async () => {
    installDashboardMocks({}, { placePresetNavigationMode: "dropdown" });
    const { default: App } = await import("../src/App.vue");
    const wrapper = mount(App, { attachTo: document.body });

    await flushPromises();

    expect(wrapper.find(".place-switcher__trigger").exists()).toBe(true);
    expect(wrapper.find(".place-swipe-arrow--next").exists()).toBe(false);
    expect(wrapper.find(".place-swipe-shell--enabled").exists()).toBe(false);
  });

  it("uses swipe-only mode without the topbar dropdown", async () => {
    installDashboardMocks({}, { placePresetNavigationMode: "swipe" });
    const { default: App } = await import("../src/App.vue");
    const wrapper = mount(App, { attachTo: document.body });

    await flushPromises();

    expect(wrapper.find(".place-switcher__trigger").exists()).toBe(false);
    expect(wrapper.find(".place-swipe-arrow--next").exists()).toBe(true);
    expect(wrapper.find(".place-swipe-shell--enabled").exists()).toBe(true);
  });

  it("loads home traffic chips for custom bus boards without adding them to the traffic page", async () => {
    const state = createDefaultTransitPresetState(transitBoards);
    const busBoard = createBusBoard();
    const home = state.places.find((place) => place.id === "home");

    home?.preferences.customBoards.push(busBoard);
    home?.preferences.visibleBoardIds.push(busBoard.id);
    saveTransitPresetState(state);
    installDashboardMocks({});
    vi.stubGlobal("__IDFM_API_KEY_CONFIGURED__", true);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/traffic")) {
        return {
          ok: true,
          json: async () => ({
            configured: true,
            generatedAt: "2026-07-09T08:00:00.000Z",
            lines: [],
            source: "prim-line-reports",
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({ available: true }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);
    const { default: App } = await import("../src/App.vue");
    const wrapper = mount(App, { attachTo: document.body });

    await vi.waitFor(() => {
      const trafficCall = fetchMock.mock.calls.find(([input]) =>
        String(input).includes("/api/traffic"),
      );

      expect(trafficCall).toBeTruthy();
      expect(String(trafficCall?.[0])).toContain("C01074");
    });

    wrapper.unmount();
  });

  it("routes a home traffic chip to the precise shared alert URL", async () => {
    installDashboardMocks({});
    vi.stubGlobal("__IDFM_API_KEY_CONFIGURED__", true);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/traffic")) {
        return {
          ok: true,
          json: async () => ({
            configured: true,
            generatedAt: "2026-07-09T08:00:00.000Z",
            lines: [
              {
                lineRef: "line:IDFM:C01743",
                status: "disrupted",
                disruptions: [
                  {
                    id: "rer-b-work",
                    title: "Travaux nocturnes",
                    message: "Le trafic est interrompu entre deux gares.",
                    kind: "works",
                    applicationPeriods: [],
                    impactedLineRefs: ["line:IDFM:C01743"],
                    impactedStopNames: [],
                  },
                ],
              },
            ],
            source: "prim-line-reports",
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({ available: true }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);
    const { default: App } = await import("../src/App.vue");
    const wrapper = mount(App, { attachTo: document.body });

    await vi.waitFor(() => {
      expect(wrapper.find(".mock-traffic").exists()).toBe(true);
    });

    await wrapper.get(".mock-traffic").trigger("click");

    expect(router.push).toHaveBeenLastCalledWith({
      path: "/traffic",
      query: expect.objectContaining({
        alertId: "rer-b-work",
        lineName: "RER B",
        lineRef: "line:IDFM:C01743",
        lineShortName: "B",
        place: "home",
        trafficTab: "current",
      }),
    });

    wrapper.unmount();
  });

  it("creates a custom place from the switcher and navigates to it", async () => {
    installDashboardMocks({});
    const { default: App } = await import("../src/App.vue");
    const wrapper = mount(App, { attachTo: document.body });

    await flushPromises();
    await wrapper.get(".place-switcher__trigger").trigger("click");
    await wrapper.get(".place-switcher__item--add").trigger("click");
    await flushPromises();

    const input = document.body.querySelector<HTMLInputElement>(
      ".place-name-form input",
    );
    expect(input).toBeTruthy();
    input!.value = "Studio";
    input!.dispatchEvent(new Event("input"));
    await flushPromises();

    const createButton = Array.from(document.body.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Creer"));
    expect(createButton).toBeTruthy();
    createButton!.dispatchEvent(new Event("click"));
    await flushPromises();

    expect(route.query.place).toBe("studio");
    const state = loadTransitPresetState([]);
    expect(state.places.some((place) => place.id === "studio")).toBe(true);
    expect(wrapper.text()).toContain("Aucune station suivie pour le moment");
  });

  it("opens the fullscreen station panel from a station name and display query", async () => {
    installDashboardMocks({
      display: "home-card",
      fullscreen: "La Croix de Berny",
    });
    const { default: App } = await import("../src/App.vue");
    mount(App, { attachTo: document.body });

    await flushPromises();

    const panel = document.body.querySelector(".fullscreen-station-panel");

    expect(panel).toBeTruthy();
    expect(panel?.classList.contains("fullscreen-station-panel--home-card")).toBe(
      true,
    );
    expect(panel?.textContent).toContain("La Croix de Berny");
  });

  it("opens the fullscreen station panel from a station id query", async () => {
    installDashboardMocks({
      fullscreen: "stop_area:IDFM:69813",
      fullscreenDisplay: "double-stop",
    });
    const { default: App } = await import("../src/App.vue");
    mount(App, { attachTo: document.body });

    await flushPromises();

    const panel = document.body.querySelector(".fullscreen-station-panel");

    expect(panel).toBeTruthy();
    expect(
      panel?.classList.contains("fullscreen-station-panel--double-stop"),
    ).toBe(true);
    expect(panel?.textContent).toContain("La Croix de Berny");
  });

  it("syncs fullscreen panel open and close actions with the route query", async () => {
    installDashboardMocks({});
    const { default: App } = await import("../src/App.vue");
    const wrapper = mount(App, { attachTo: document.body });

    await flushPromises();
    await wrapper.get(".mock-fullscreen").trigger("click");
    await flushPromises();

    expect(route.query.fullscreen).toBe("t10-les-peintres");
    expect(route.query.fullscreenDisplay).toBe("all-directions");
    expect(document.body.querySelector(".fullscreen-station-panel")).toBeTruthy();

    const closeButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Fermer le panneau",
    );

    expect(closeButton).toBeTruthy();
    closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(route.query.fullscreen).toBeUndefined();
    expect(route.query.fullscreenDisplay).toBeUndefined();
    expect(document.body.querySelector(".fullscreen-station-panel")).toBeFalsy();
  });

  it("scrolls to the newly added station and highlights its card", async () => {
    const scrollTo = vi.fn();
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      if (this.dataset.boardId === "added-board") {
        return {
          bottom: 2_200,
          height: 600,
          left: 0,
          right: 520,
          top: 1_600,
          width: 520,
          x: 0,
          y: 1_600,
          toJSON: () => ({}),
        } as DOMRect;
      }

      return {
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
    const originalGetBoundingClientRect =
      HTMLElement.prototype.getBoundingClientRect;
    const originalDocumentScrollHeight = Object.getOwnPropertyDescriptor(
      document.documentElement,
      "scrollHeight",
    );
    const originalBodyScrollHeight = Object.getOwnPropertyDescriptor(
      document.body,
      "scrollHeight",
    );
    vi.stubGlobal("scrollTo", scrollTo);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("scrollY", 120);
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: getBoundingClientRect,
    });
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 2_600,
    });
    Object.defineProperty(document.body, "scrollHeight", {
      configurable: true,
      value: 2_600,
    });
    const addedBoard = createBoard("added-board", "stop_area:added");

    try {
      installDashboardMocks({});
      const { default: App } = await import("../src/App.vue");
      const wrapper = mount(App, { attachTo: document.body });

      await flushPromises();

      (
        wrapper.vm as unknown as {
          addCustomBoard: (board: TransitBoardConfig) => void;
        }
      ).addCustomBoard(addedBoard);
      await flushPromises();
      await wait(450);
      await wrapper.vm.$nextTick();

      expect(scrollTo).toHaveBeenLastCalledWith(
        expect.objectContaining({
          behavior: "smooth",
          top: 1_624,
        }),
      );
      expect(
        wrapper.get('[data-board-id="added-board"]').classes(),
      ).toContain("board-drag-item--new");

      await wait(500);
      await wrapper.vm.$nextTick();

      expect(
        wrapper.get('[data-board-id="added-board"]').classes(),
      ).not.toContain("board-drag-item--new");
    } finally {
      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value: originalGetBoundingClientRect,
      });

      if (originalDocumentScrollHeight) {
        Object.defineProperty(
          document.documentElement,
          "scrollHeight",
          originalDocumentScrollHeight,
        );
      } else {
        delete (document.documentElement as { scrollHeight?: unknown })
          .scrollHeight;
      }

      if (originalBodyScrollHeight) {
        Object.defineProperty(
          document.body,
          "scrollHeight",
          originalBodyScrollHeight,
        );
      } else {
        delete (document.body as { scrollHeight?: unknown }).scrollHeight;
      }
    }
  });
});

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function installDashboardMocks(
  query: Record<string, string | undefined>,
  appSettings: Record<string, unknown> = {},
): void {
  route = reactive({
    path: "/",
    query: { ...query },
  });
  router = {
    push: vi.fn(async (location: { query?: Record<string, string> }) => {
      route.query = { ...(location.query ?? {}) };
    }),
    replace: vi.fn(async (location: { query?: Record<string, string> }) => {
      route.query = { ...(location.query ?? {}) };
    }),
  };

  vi.stubGlobal("__IDFM_API_KEY_CONFIGURED__", false);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ available: true }))),
  );
  vi.doMock("nuxt/app", () => ({
    useRoute: () => route,
    useRouter: () => router,
  }));
  vi.doMock("vuedraggable", () => ({
    default: defineComponent({
      props: ["modelValue"],
      template:
        '<section class="boards-grid"><div v-for="element in modelValue" :key="element.id"><slot name="item" :element="element" /></div></section>',
    }),
  }));
  vi.doMock("../src/features/weather", () => ({
    WeatherExperience: defineComponent({
      template: "<div />",
    }),
  }));
  vi.doMock("../src/features/app-settings", () => ({
    filterTerminalOnly: <T,>(items: T[]) => items,
    fullscreenStationPanelDesignOptions: [
      { id: "all-directions", label: "Toutes directions" },
      { id: "double-stop", label: "Double arret" },
      { id: "home-card", label: "Carte station" },
    ],
    requestTemporaryAlarmWakeLock: vi.fn(),
    useAppSettings: () => {
      const settings = reactive({
        value: {
          wakeDeviceOnAlarm: false,
          showPatternMiniMap: true,
          showPatternCityZones: true,
          compactLinePlanMode: "auto",
          richTransferTooltips: true,
          smartTrafficDetection: true,
          transferBundleRetentionDays: 15,
          transferBundleRequestConcurrency: 1,
          transferBundleRequestSpacingMs: 0,
          transferBundleLocalCacheEnabled: true,
          transferBundleBackendCacheEnabled: true,
          transferResolverMode: "auto",
          placePresetNavigationMode: "dropdown-swipe",
          reduceMotion: false,
          fullscreenStationPanelDesign: "all-directions",
          fullscreenStationPanelDarkTheme: false,
          ...appSettings,
        },
      });

      return {
        settings,
        updateSettings: vi.fn((patch: Record<string, unknown>) => {
          Object.assign(settings.value, patch);
        }),
        resetSettings: vi.fn(),
        effectiveMaxDeparturesPerDirection: { value: undefined },
      };
    },
  }));
  vi.doMock("../src/components/TransitBoard.vue", () => ({
    default: defineComponent({
      props: ["board", "trafficAlert"],
      emits: ["open-fullscreen-panel", "open-traffic"],
      template: `
        <article class="mock-board">
          {{ board.title }}
          <button
            v-if="trafficAlert"
            class="mock-traffic"
            type="button"
            @click="$emit('open-traffic', trafficAlert)"
          >
            {{ trafficAlert.label }}
          </button>
          <button
            class="mock-fullscreen"
            type="button"
            @click="$emit('open-fullscreen-panel', board)"
          >
            Plein ecran
          </button>
        </article>
      `,
    }),
  }));
  vi.doMock("../src/services/idfm", () => ({
    fetchBoardDepartures: vi.fn(async (board: TransitBoardConfig) => ({
      departures: [],
      directionGroups: board.directionGroups.map((group) => ({
        id: group.id,
        label: group.label,
        subtitle: group.subtitle,
        departures: [],
        serviceEnded: false,
      })),
    })),
    fetchDirectionGroupsForStation: vi.fn(async () => []),
  }));
}

function createBoard(id: string, stopAreaRef: string): TransitBoardConfig {
  return {
    id,
    title: "Station test",
    city: "Test",
    line: {
      ref: "line:test",
      shortName: "T",
      longName: "Ligne test",
      mode: "tram",
      color: "#0064ff",
      textColor: "#ffffff",
    },
    monitoringPoints: [{ ref: "stop:test", label: "Tous quais" }],
    directionGroups: [],
    schedule: {
      lineRef: "line:test",
      stopAreaRef,
    },
    maxDepartures: 8,
  };
}

function createBusBoard(): TransitBoardConfig {
  return {
    id: "bus-74-la-fourche",
    title: "La Fourche",
    city: "Paris",
    line: {
      ref: "line:IDFM:C01074",
      shortName: "74",
      longName: "Bus 74",
      mode: "bus",
      color: "#6b7280",
      textColor: "#ffffff",
    },
    monitoringPoints: [{ ref: "stop_area:IDFM:bus-74", label: "La Fourche" }],
    directionGroups: [],
    schedule: {
      lineRef: "line:IDFM:C01074",
      stopAreaRef: "stop_area:IDFM:bus-74",
    },
    maxDepartures: 8,
  };
}

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import TransitBoard from "../src/components/TransitBoard.vue";
import type {
  Departure,
  DirectionDepartureGroup,
  TransitBoardConfig,
  TransitMode,
} from "../src/types/transit";

describe("TransitBoard departure metadata", () => {
  it.each([
    ["loading", "Chargement de la desserte"],
    ["unavailable", "Desserte non confirmée"],
  ] as const)("makes the %s service state explicit instead of showing an empty row", (serviceTypeStatus, text) => {
    const departure: Departure = {
      id: "service-state", lineRef: "line:test", monitoringRef: "stop:test", stopName: "Station test",
      destination: "Destination", monitoringLabel: "Tous quais", vehicleAtStop: false,
      expectedDepartureTime: new Date(Date.now() + 300_000).toISOString(), serviceTypeStatus,
    };
    const wrapper = mount(TransitBoard, {
      props: { board: createBoard(), departures: [departure], directionGroups: [createDirectionGroup(departure)], collapsedDirectionIds: [], loading: false },
      global: { stubs: { LineIconBadge: true } },
    });
    expect(wrapper.get(".departure__meta").text()).toBe(text);
    expect(wrapper.find(".departure__section").exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([
    ["Tous quais", false],
    ["Quai 2", true],
  ] as const)("hides the unavailable metro fallback for a known destination and preserves quay metadata (%s)", (monitoringLabel, hasMeta) => {
    const departure = createServiceDeparture({
      monitoringLabel,
      serviceType: "inconnu",
      serviceTypeStatus: "unavailable",
    });
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard("metro"),
        departures: [departure],
        directionGroups: [createDirectionGroup(departure)],
        collapsedDirectionIds: [],
        loading: false,
      },
      global: { stubs: { LineIconBadge: true } },
    });

    expect(wrapper.find(".departure__meta").exists()).toBe(hasMeta);
    if (hasMeta) {
      const meta = wrapper.get(".departure__meta");
      expect(meta.text()).toBe("Quai 2");
      expect(meta.text()).not.toContain("·");
    }
    expect(wrapper.text()).not.toContain("Desserte non confirmée");
    expect(wrapper.get(".departure__main strong").text()).toBe("Mairie de Montreuil");
    expect(wrapper.get(".departure__time strong").text()).not.toBe("--");
    expect(wrapper.find(".departure-pattern-button").exists()).toBe(true);
    expect(wrapper.find(".departure__main--service-detail").exists()).toBe(false);

    wrapper.unmount();
  });

  it("keeps the metro fallback when the destination is still unknown and updates it when the direction changes", async () => {
    const departure = createServiceDeparture({
      destination: "Destination inconnue",
      serviceType: "inconnu",
      serviceTypeStatus: "unavailable",
    });
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard("metro"),
        departures: [departure],
        directionGroups: [createDirectionGroup(departure)],
        collapsedDirectionIds: [],
        loading: false,
      },
      global: { stubs: { LineIconBadge: true } },
    });

    expect(wrapper.get(".departure__meta").text()).toBe("Desserte non confirmée");

    const updatedDeparture = { ...departure, destination: "Mairie de Montreuil" };
    await wrapper.setProps({
      departures: [updatedDeparture],
      directionGroups: [createDirectionGroup(updatedDeparture)],
    });

    expect(wrapper.find(".departure__meta").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Desserte non confirmée");
    wrapper.unmount();
  });

  it("keeps metro loading and confirmed service details visible", () => {
    const loadingDeparture = createServiceDeparture({ serviceTypeStatus: "loading" });
    const loadingWrapper = mount(TransitBoard, {
      props: {
        board: createBoard("metro"),
        departures: [loadingDeparture],
        directionGroups: [createDirectionGroup(loadingDeparture)],
        collapsedDirectionIds: [],
        loading: false,
      },
      global: { stubs: { LineIconBadge: true } },
    });
    expect(loadingWrapper.get(".departure__meta").text()).toBe("Chargement de la desserte");
    loadingWrapper.unmount();

    const confirmedDeparture = createServiceDeparture({
      id: "metro-confirmed-service",
      serviceType: "semi-direct",
      serviceSection: "west",
      remainingStopCount: 4,
    });
    const confirmedWrapper = mount(TransitBoard, {
      props: {
        board: createBoard("metro"),
        departures: [confirmedDeparture],
        directionGroups: [createDirectionGroup(confirmedDeparture)],
        collapsedDirectionIds: [],
        loading: false,
      },
      global: { stubs: { LineIconBadge: true } },
    });
    const meta = confirmedWrapper.get(".departure__meta");
    expect(meta.text()).toContain("Semi direct");
    expect(meta.get(".departure__section").text()).toBe("(tronçon ouest)");
    expect(meta.find("small").exists()).toBe(true);
    confirmedWrapper.unmount();
  });

  it.each(["rer", "train"] as const)("preserves unavailable and confirmed service labels on %s departures", async (mode) => {
    const unavailable = createServiceDeparture({
      id: `${mode}-unavailable`,
      serviceType: "inconnu",
      serviceTypeStatus: "unavailable",
    });
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(mode),
        departures: [unavailable],
        directionGroups: [createDirectionGroup(unavailable)],
        collapsedDirectionIds: [],
        loading: false,
      },
      global: { stubs: { LineIconBadge: true } },
    });
    expect(wrapper.get(".departure__meta").text()).toBe("Desserte non confirmée");

    for (const [serviceType, label] of [
      ["omnibus", "Toutes stations"],
      ["direct", "Direct"],
      ["semi-direct", "Semi direct"],
    ] as const) {
      const confirmed = createServiceDeparture({
        id: `${mode}-${serviceType}`,
        serviceType,
        serviceSection: serviceType === "semi-direct" ? "east" : undefined,
      });
      await wrapper.setProps({
        departures: [confirmed],
        directionGroups: [createDirectionGroup(confirmed)],
      });
      const meta = wrapper.get(".departure__meta");
      expect(meta.text()).toContain(label);
      if (serviceType === "semi-direct") {
        expect(meta.get(".departure__section").text()).toBe("(tronçon est)");
      }
    }

    wrapper.unmount();
  });

  it.each([
    ["north", "(tronçon nord)"], ["south", "(tronçon sud)"],
    ["east", "(tronçon est)"], ["west", "(tronçon ouest)"],
  ] as const)("adds a separate muted %s section immediately after the semi-direct label", (serviceSection, text) => {
    const departure: Departure = {
      id: "geographic-section", lineRef: "line:test", monitoringRef: "stop:test", stopName: "Station test",
      destination: "Destination", monitoringLabel: "Tous quais", vehicleAtStop: false,
      expectedDepartureTime: new Date(Date.now() + 300_000).toISOString(), serviceType: "semi-direct", serviceSection,
    };
    const wrapper = mount(TransitBoard, {
      props: { board: createBoard(), departures: [departure], directionGroups: [createDirectionGroup(departure)], collapsedDirectionIds: [], loading: false },
      global: { stubs: { LineIconBadge: true } },
    });
    const meta = wrapper.get(".departure__meta");
    expect(meta.get(".departure__section").text()).toBe(text);
    expect(meta.findAll("span").map((span) => span.text())).toEqual(["Semi direct", text]);
    wrapper.unmount();
  });

  it.each(["omnibus", "direct", "inconnu"] as const)("does not show a leftover section on an %s train", (serviceType) => {
    const departure: Departure = {
      id: "no-section", lineRef: "line:test", monitoringRef: "stop:test", stopName: "Station test",
      destination: "Destination", monitoringLabel: "Tous quais", vehicleAtStop: false,
      expectedDepartureTime: new Date(Date.now() + 300_000).toISOString(), serviceType, serviceSection: "north",
    };
    const wrapper = mount(TransitBoard, {
      props: { board: createBoard(), departures: [departure], directionGroups: [createDirectionGroup(departure)], collapsedDirectionIds: [], loading: false },
      global: { stubs: { LineIconBadge: true } },
    });
    expect(wrapper.find(".departure__section").exists()).toBe(false);
    wrapper.unmount();
  });

  it("keeps the section visible in the compact row alongside the separate pattern action", async () => {
    const media = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(max-width: 1024px)", media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    const departure: Departure = {
      id: "compact-section", lineRef: "line:test", monitoringRef: "stop:test", stopName: "Station test",
      destination: "Destination", monitoringLabel: "Tous quais", vehicleAtStop: false,
      expectedDepartureTime: new Date(Date.now() + 300_000).toISOString(), serviceType: "semi-direct", serviceSection: "west",
    };
    const wrapper = mount(TransitBoard, {
      props: { board: createBoard(), departures: [departure], directionGroups: [createDirectionGroup(departure)], collapsedDirectionIds: [], loading: false },
      global: { stubs: { LineIconBadge: true } },
    });
    try {
      await nextTick();
      expect(wrapper.get("div.departure__main .departure__section").text()).toBe("(tronçon ouest)");
      await wrapper.get('[aria-label="Afficher la desserte"]').trigger("click");
      expect(wrapper.emitted("show-pattern")?.[0]).toEqual([{
        board: createBoard(), directionGroup: createDirectionGroup(departure), departure,
      }]);
    } finally {
      wrapper.unmount();
      media.mockRestore();
    }
  });

  it("omits the unavailable metro fallback in the compact mobile row without hiding its action", async () => {
    const media = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(max-width: 1024px)", media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    const departure = createServiceDeparture({
      serviceType: "inconnu",
      serviceTypeStatus: "unavailable",
    });
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard("metro"),
        departures: [departure],
        directionGroups: [createDirectionGroup(departure)],
        collapsedDirectionIds: [],
        loading: false,
      },
      global: { stubs: { LineIconBadge: true } },
    });
    try {
      await nextTick();
      expect(wrapper.find(".departure__meta").exists()).toBe(false);
      expect(wrapper.find(".departure__main--service-detail").exists()).toBe(false);
      expect(wrapper.get(".departure__main strong").text()).toBe("Mairie de Montreuil");
      const patternButton = wrapper.get(".departure-pattern-button");
      await patternButton.trigger("click");
      expect(wrapper.emitted("show-pattern")?.[0]).toEqual([{
        board: createBoard("metro"),
        directionGroup: createDirectionGroup(departure),
        departure,
      }]);
    } finally {
      wrapper.unmount();
      media.mockRestore();
    }
  });

  it("keeps the imminent label in expanded rows while the summary shows zero", () => {
    const departure: Departure = {
      id: "departure-now",
      lineRef: "line:test",
      monitoringRef: "stop:test",
      stopName: "Station test",
      destination: "Saint-Remy",
      monitoringLabel: "Tous quais",
      expectedDepartureTime: new Date().toISOString(),
      vehicleAtStop: false,
    };
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(),
        collapsedDirectionIds: [],
        departures: [departure],
        directionGroups: [createDirectionGroup(departure)],
        loading: false,
      },
      global: {
        stubs: {
          LineIconBadge: true,
        },
      },
    });

    expect(wrapper.find(".last-service__time strong").text()).toBe("0");
    expect(wrapper.find(".departure__time strong").text()).toBe("Imminent");

    wrapper.unmount();
  });

  it("keeps cached departures visible during a Navitia cooldown", async () => {
    const departure: Departure = {
      id: "departure-cached",
      lineRef: "line:test",
      monitoringRef: "stop:test",
      stopName: "Station test",
      destination: "Saint-Remy",
      monitoringLabel: "Tous quais",
      expectedDepartureTime: new Date(Date.now() + 5 * 60_000).toISOString(),
      vehicleAtStop: false,
    };
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(),
        collapsedDirectionIds: [],
        departures: [departure],
        directionGroups: [createDirectionGroup(departure)],
        loading: false,
        rateLimited: true,
      },
      global: {
        stubs: {
          LineIconBadge: true,
        },
      },
    });

    expect(wrapper.find(".departures li").exists()).toBe(true);
    expect(wrapper.find(".notice--rate-limited").exists()).toBe(false);

    await wrapper.setProps({ departures: [], directionGroups: [] });

    expect(wrapper.find(".departures li").exists()).toBe(false);
    expect(wrapper.find(".notice--rate-limited").text()).toContain("momentanément indisponibles");

    wrapper.unmount();
  });

  it("uses the aimed departure fallback when a bus has no expected timestamp", () => {
    const aimedDepartureTime = new Date(Date.now() + 25 * 60_000).toISOString();
    const departure: Departure = {
      id: "departure-aimed-only",
      lineRef: "line:test",
      monitoringRef: "stop:test",
      stopName: "Station test",
      destination: "Saint-Remy",
      monitoringLabel: "Tous quais",
      aimedDepartureTime,
      vehicleAtStop: false,
    };
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(),
        collapsedDirectionIds: [],
        departures: [departure],
        directionGroups: [createDirectionGroup(departure)],
        loading: false,
      },
      global: {
        stubs: {
          LineIconBadge: true,
        },
      },
    });

    expect(wrapper.find(".last-service__time strong").text()).not.toBe("--");
    expect(wrapper.find(".departure__time strong").text()).not.toBe("--");
    expect(wrapper.find(".departure__time span").text()).not.toBe("--:--");

    wrapper.unmount();
  });

  it("shows the service pattern instead of platform metadata", () => {
    const departure: Departure = {
      id: "departure-1",
      lineRef: "line:test",
      monitoringRef: "stop:test",
      stopName: "Station test",
      destination: "Saint-Remy",
      monitoringLabel: "Tous quais",
      platform: "1",
      expectedDepartureTime: new Date(Date.now() + 5 * 60_000).toISOString(),
      vehicleAtStop: false,
      serviceType: "semi-direct",
    };
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(),
        collapsedDirectionIds: [],
        departures: [departure],
        directionGroups: [createDirectionGroup(departure)],
        loading: false,
      },
      global: {
        stubs: {
          LineIconBadge: true,
        },
      },
    });
    const metaText = wrapper.find(".departure__meta").text();

    expect(metaText).toContain("Semi direct");
    expect(metaText).not.toContain("Quai 1");
    expect(metaText).not.toContain("Tous quais");

    wrapper.unmount();
  });

  it("emits fullscreen panel opening from the station actions menu", async () => {
    const departure: Departure = {
      id: "departure-panel",
      lineRef: "line:test",
      monitoringRef: "stop:test",
      stopName: "Station test",
      destination: "Saint-Remy",
      monitoringLabel: "Tous quais",
      expectedDepartureTime: new Date(Date.now() + 5 * 60_000).toISOString(),
      vehicleAtStop: false,
    };
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(),
        collapsedDirectionIds: [],
        departures: [departure],
        directionGroups: [createDirectionGroup(departure)],
        loading: false,
      },
      global: {
        stubs: {
          LineIconBadge: true,
        },
      },
    });

    await wrapper.find('[aria-label="Actions de la station"]').trigger("click");
    await nextTick();

    const fullscreenButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>(
        ".board-actions__menu button",
      ),
    ).find((button) => button.textContent?.includes("Affichage panneau"));

    expect(fullscreenButton).toBeTruthy();
    fullscreenButton?.click();
    await nextTick();

    expect(wrapper.emitted("open-fullscreen-panel")?.[0]).toEqual([
      createBoard(),
    ]);

    wrapper.unmount();
  });

  it("renders the upcoming interruption traffic chip", async () => {
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(),
        collapsedDirectionIds: [],
        departures: [],
        directionGroups: [],
        loading: false,
        trafficAlert: {
          label: "Interruption dans 4 jours",
          target: {
            alertId: "future-work",
            lineRef: "line:test",
            trafficTab: "upcoming",
          },
          tone: "upcoming",
        },
      },
      global: {
        stubs: {
          LineIconBadge: true,
        },
      },
    });

    const chip = wrapper.get(".board-traffic-chip");

    expect(chip.text()).toBe("Interruption dans 4 jours");
    expect(chip.classes()).toContain("board-traffic-chip--upcoming");

    await chip.trigger("click");

    expect(wrapper.emitted("open-traffic")?.[0]).toEqual([
      {
        label: "Interruption dans 4 jours",
        target: {
          alertId: "future-work",
          lineRef: "line:test",
          trafficTab: "upcoming",
        },
        tone: "upcoming",
      },
    ]);

    wrapper.unmount();
  });

  it("reveals the loading label before a traffic alert can pop in", async () => {
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(),
        collapsedDirectionIds: [],
        departures: [],
        directionGroups: [],
        loading: true,
      },
      global: {
        stubs: {
          LineIconBadge: true,
        },
      },
    });

    expect(wrapper.find(".board-loading-notice__text").exists()).toBe(true);

    await wrapper.setProps({
      loading: false,
      trafficAlert: {
        label: "Perturbation",
        target: {
          alertId: "incident-1",
          lineRef: "line:test",
          trafficTab: "current",
        },
        tone: "orange",
      },
    });

    expect(wrapper.find(".board-loading-notice__text").exists()).toBe(false);
    expect(wrapper.get(".board-traffic-chip").classes()).toContain(
      "board-traffic-chip--orange",
    );

    wrapper.unmount();
  });

  it("animates the card height when departures replace the loading notice", async () => {
    const departure: Departure = {
      id: "departure-height-transition",
      lineRef: "line:test",
      monitoringRef: "stop:test",
      stopName: "Station test",
      destination: "Saint-Remy",
      monitoringLabel: "Tous quais",
      expectedDepartureTime: new Date(Date.now() + 5 * 60_000).toISOString(),
      vehicleAtStop: false,
    };
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(),
        collapsedDirectionIds: [],
        departures: [],
        directionGroups: [],
        loading: true,
      },
      global: {
        stubs: {
          LineIconBadge: true,
        },
      },
    });
    const boardElement = wrapper.get(".board").element as HTMLElement;
    const heightSpy = vi
      .spyOn(boardElement, "getBoundingClientRect")
      .mockReturnValueOnce({ height: 180 } as DOMRect)
      .mockReturnValueOnce({ height: 460 } as DOMRect);

    await wrapper.setProps({
      loading: false,
      departures: [departure],
      directionGroups: [createDirectionGroup(departure)],
    });
    await nextTick();

    expect(wrapper.get(".board").classes()).toContain(
      "board--height-transitioning",
    );

    wrapper.unmount();
    heightSpy.mockRestore();
  });
});

function createBoard(mode: TransitMode = "rer"): TransitBoardConfig {
  return {
    id: "board-test",
    title: "Station test",
    city: "Test",
    line: {
      ref: "line:test",
      shortName: "T",
      longName: "Ligne test",
      mode,
      color: "#0064ff",
      textColor: "#ffffff",
    },
    monitoringPoints: [{ ref: "stop:test", label: "Tous quais" }],
    directionGroups: [],
    maxDepartures: 4,
  };
}

function createServiceDeparture(overrides: Partial<Departure> = {}): Departure {
  return {
    id: "service-display",
    lineRef: "line:test",
    monitoringRef: "stop:test",
    stopName: "Station test",
    destination: "Mairie de Montreuil",
    monitoringLabel: "Tous quais",
    vehicleAtStop: false,
    expectedDepartureTime: new Date(Date.now() + 300_000).toISOString(),
    ...overrides,
  };
}

function createDirectionGroup(
  departure: Departure,
): DirectionDepartureGroup {
  return {
    id: "south",
    label: "Sud",
    departures: [departure],
    serviceEnded: false,
  };
}

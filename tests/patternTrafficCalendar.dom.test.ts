import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import LoadingClock from "../src/components/LoadingClock.vue";
import PatternTrafficCalendar from "../src/features/service-pattern/PatternTrafficCalendar.vue";
import type {
  PatternTrafficCalendarDay,
  PatternTrafficCalendarEvent,
  PatternTrafficCalendarMonth,
} from "../src/features/service-pattern/trafficCalendar";
import type { TrafficDisruption } from "../src/features/traffic";

describe("PatternTrafficCalendar", () => {
  it("renders only the selected month and selects normal future days", async () => {
    const calendar = createCalendar();
    const wrapper = mount(PatternTrafficCalendar, {
      props: {
        calendar,
        selectedDateKey: "2026-07-16",
        hasNext: true,
      },
    });

    expect(wrapper.findAll(".pattern-traffic-calendar__day")).toHaveLength(31);
    expect(wrapper.find("[data-date='2026-06-30']").exists()).toBe(false);
    expect(wrapper.find("[data-date='2026-08-01']").exists()).toBe(false);
    expect(
      wrapper
        .get("[data-testid='pattern-traffic-calendar-previous']")
        .find("svg.lucide-chevron-left")
        .exists(),
    ).toBe(true);
    expect(
      wrapper
        .get("[data-testid='pattern-traffic-calendar-next']")
        .find("svg.lucide-chevron-right")
        .exists(),
    ).toBe(true);
    expect(
      wrapper
        .get("[data-testid='pattern-traffic-calendar-expand']")
        .find("svg.lucide-maximize-2")
        .exists(),
    ).toBe(true);
    expect(
      wrapper
        .get("[data-date='2026-07-16']")
        .attributes("aria-selected"),
    ).toBe("true");
    expect(
      wrapper.get("[data-date='2026-07-14']").attributes("disabled"),
    ).toBeDefined();

    await wrapper.get("[data-date='2026-07-20']").trigger("click");
    expect(wrapper.emitted("select")?.[0]?.[0]).toMatchObject({
      dateKey: "2026-07-20",
      events: [],
    });

    await wrapper.get("[data-testid='pattern-traffic-calendar-next']").trigger(
      "click",
    );
    expect(wrapper.emitted("next")).toHaveLength(1);

    await wrapper.get("[data-testid='pattern-traffic-calendar-expand']").trigger(
      "click",
    );
    expect(wrapper.emitted("expand")).toHaveLength(1);
  });

  it("exposes scrollable impact details to mouse, keyboard and touch users", async () => {
    const calendar = createCalendar();
    const wrapper = mount(PatternTrafficCalendar, {
      props: {
        calendar,
        selectedDateKey: "2026-07-16",
      },
    });
    const impactedDay = wrapper.get("[data-date='2026-07-18']");

    expect(impactedDay.attributes("aria-describedby")).toBe(
      "traffic-calendar-tooltip-2026-07-18",
    );
    await impactedDay.trigger("focusin");
    const tooltip = document.body.querySelector("[data-testid='pattern-traffic-calendar-tooltip']");
    expect(tooltip?.getAttribute("role")).toBe("tooltip");
    expect(tooltip?.textContent).toContain("Station A");
    expect(tooltip?.textContent).toContain("Station B");
    expect(
      tooltip?.querySelector(
        ".pattern-traffic-calendar-tooltip__scroll",
      ),
    ).not.toBeNull();

    await wrapper
      .get("[data-tooltip-date='2026-07-18']")
      .trigger("pointerup", { pointerType: "touch" });
    expect(
      document.body.querySelector("[data-testid='pattern-traffic-calendar-tooltip']"),
    ).not.toBeNull();
    wrapper.unmount();
  });

  it("waits for one second of continuous hover before opening details", async () => {
    vi.useFakeTimers();

    try {
      const wrapper = mount(PatternTrafficCalendar, {
        props: {
          calendar: createCalendar(),
          selectedDateKey: "2026-07-16",
        },
      });
      const tooltipTrigger = wrapper.get(
        "[data-tooltip-date='2026-07-18']",
      );

      await tooltipTrigger.trigger("pointerenter", { pointerType: "mouse" });
      expect(
        document.body.querySelector("[data-testid='pattern-traffic-calendar-tooltip']"),
      ).toBeNull();

      vi.advanceTimersByTime(999);
      await wrapper.vm.$nextTick();
      expect(
        document.body.querySelector("[data-testid='pattern-traffic-calendar-tooltip']"),
      ).toBeNull();

      vi.advanceTimersByTime(1);
      await wrapper.vm.$nextTick();
      expect(
        document.body.querySelector("[data-testid='pattern-traffic-calendar-tooltip']"),
      ).not.toBeNull();

      await tooltipTrigger.trigger("pointerleave", { pointerType: "mouse" });
      vi.advanceTimersByTime(120);
      await wrapper.vm.$nextTick();
      expect(
        document.body.querySelector("[data-testid='pattern-traffic-calendar-tooltip']"),
      ).toBeNull();
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders persistent details in expanded mode", () => {
    const wrapper = mount(PatternTrafficCalendar, {
      props: {
        calendar: createCalendar(),
        selectedDateKey: "2026-07-18",
        selectedDisruptions: [disruption],
        expanded: true,
      },
    });

    expect(
      wrapper.get("[data-testid='pattern-traffic-calendar-selected-summary']"),
    ).toBeTruthy();
    expect(
      wrapper.find("[data-testid='pattern-traffic-calendar-expand']").exists(),
    ).toBe(false);
    expect(wrapper.text()).toContain("Travaux test");
  });

  it("renders a concise user-friendly list for multiple daily incidents", () => {
    const calendar = createCalendar();
    const selectedDay = calendar.days.find(
      (day) => day.dateKey === "2026-07-18",
    )!;
    const slowdown = createDisruption({
      id: "slowdown",
      title: "Ralentissements entre Alésia et Olympiades",
      message: "Un long message opérationnel qui ne doit pas remplir la carte.",
      kind: "incident",
    });
    const crowding = createDisruption({
      id: "crowding",
      title: "Affluence élevée à Porte d'Ivry",
      kind: "incident",
    });
    const signalingWorks = createDisruption({
      id: "signaling-works",
      title: "Travaux de signalisation à Maison Blanche",
      kind: "works",
    });

    selectedDay.events = [
      createCalendarEvent(
        slowdown,
        new Date(2026, 6, 18, 7),
        new Date(2026, 6, 18, 11),
      ),
      createCalendarEvent(
        crowding,
        new Date(2026, 6, 17, 0),
        new Date(2026, 6, 19, 0),
      ),
      createCalendarEvent(
        signalingWorks,
        new Date(2026, 6, 18, 9),
        new Date(2026, 6, 18, 16),
      ),
    ];
    selectedDay.impactCount = 3;

    const wrapper = mount(PatternTrafficCalendar, {
      props: {
        calendar,
        selectedDateKey: selectedDay.dateKey,
        userFriendlySummary: true,
      },
    });
    const summary = wrapper.get(
      "[data-testid='pattern-traffic-calendar-selected-summary']",
    );
    const incidents = summary.findAll(
      "[data-testid='pattern-traffic-calendar-friendly-incident']",
    );

    expect(summary.text()).toContain("18 juillet");
    expect(summary.text()).toContain("3 impacts");
    expect(summary.text()).toContain("Sélectionné");
    expect(incidents).toHaveLength(3);
    expect(incidents[0].find("svg.lucide-triangle-alert").exists()).toBe(true);
    expect(incidents[1].find("svg.lucide-users-round").exists()).toBe(true);
    expect(incidents[2].find("svg.lucide-wrench").exists()).toBe(true);
    expect(summary.text()).toContain("De 07:00 à 11:00");
    expect(summary.text()).toContain("Toute la journée");
    expect(summary.text()).toContain("De 09:00 à 16:00");
    expect(summary.text()).not.toContain("long message opérationnel");
    expect(summary.find(".traffic-disruption").exists()).toBe(false);
  });
});

describe("LoadingClock", () => {
  it("exposes future and past time-travel directions accessibly", async () => {
    const wrapper = mount(LoadingClock, {
      props: { direction: "future" },
    });

    expect(wrapper.classes()).toContain("loading-clock--future");
    expect(wrapper.attributes("role")).toBe("status");
    expect(wrapper.attributes("aria-label")).toBeTruthy();

    await wrapper.setProps({ direction: "past" });
    expect(wrapper.classes()).toContain("loading-clock--past");

    await wrapper.setProps({ overlay: true });
    expect(wrapper.classes()).toContain("loading-clock--overlay");
    expect(wrapper.text()).toContain("Retour vers une date antérieure");
  });
});

const disruption: TrafficDisruption = {
  id: "works",
  title: "Travaux test",
  kind: "works",
  applicationPeriods: [
    { begin: "20260718T090000", end: "20260718T120000" },
  ],
  impactedLineRefs: [],
  impactedStopNames: ["Station A"],
};

function createDisruption(
  overrides: Partial<TrafficDisruption> & Pick<TrafficDisruption, "id" | "title">,
): TrafficDisruption {
  return {
    kind: "unknown",
    applicationPeriods: [],
    impactedLineRefs: [],
    impactedStopNames: [],
    ...overrides,
  };
}

function createCalendarEvent(
  eventDisruption: TrafficDisruption,
  start: Date,
  end?: Date,
): PatternTrafficCalendarEvent {
  return {
    id: `${eventDisruption.id}:${start.getTime()}`,
    disruption: eventDisruption,
    period: {},
    start,
    end,
    impactAnalysis: {
      segments: [],
      stationImpacts: {},
      edgeImpacts: {},
    },
    kind: "disturbance",
    interruptedStationKeys: [],
    disturbedStationKeys: [],
    affectedEdgeKeys: [],
    affectedSegmentLabels: [],
    fallbackStationKeys: [],
  };
}

function createCalendar(): PatternTrafficCalendarMonth {
  const gridStart = new Date(2026, 5, 29);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(date.getDate() + index);
    const dateKey = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    const base: PatternTrafficCalendarDay = {
      id: `traffic-calendar:${dateKey}`,
      date,
      dateKey,
      inCurrentMonth: date.getMonth() === 6,
      isToday: dateKey === "2026-07-16",
      isPast: dateKey < "2026-07-16",
      events: [],
      impactCount: 0,
      interruptedStationLabels: [],
      disturbedStationLabels: [],
      affectedSegmentLabels: [],
    };

    if (dateKey === "2026-07-18") {
      return {
        ...base,
        events: [
          {
            id: "works:1",
            disruption,
            period: disruption.applicationPeriods[0],
            start: new Date(2026, 6, 18, 9),
            end: new Date(2026, 6, 18, 12),
            impactAnalysis: {
              segments: [],
              stationImpacts: {},
              edgeImpacts: {},
            },
            kind: "interruption" as const,
            interruptedStationKeys: ["a"],
            disturbedStationKeys: ["b"],
            affectedEdgeKeys: [],
            affectedSegmentLabels: ["Station A → Station B"],
            fallbackStationKeys: [],
          },
        ],
        impactCount: 1,
        interruptedStationLabels: ["Station A"],
        disturbedStationLabels: ["Station B"],
        affectedSegmentLabels: ["Station A → Station B"],
        durationMinutes: 180,
        severity: {
          level: "medium" as const,
          score: 7,
          affectedStationCount: 2,
          stationContributions: [],
        },
      };
    }

    return base;
  });

  return {
    monthStart: new Date(2026, 6, 1),
    days,
  };
}


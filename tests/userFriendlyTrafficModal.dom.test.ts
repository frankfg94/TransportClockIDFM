import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrafficAlertModalData } from "../src/features/traffic";

afterEach(() => {
  document.body.innerHTML = "";
  vi.resetModules();
  vi.doUnmock("../src/i18n");
});

function mockFrenchI18n(): void {
  vi.doMock("../src/i18n", () => ({
    useI18n: () => ({
      d: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat("fr-FR", options).format(new Date(value)),
      t: (key: string, params?: Record<string, string>) => {
        if (key === "app.trafficModalReplacementBus") {
          return "Bus de remplacement";
        }
        if (key === "app.trafficModalEvening") {
          return "En soirée";
        }
        if (key === "app.trafficModalUntilDate") {
          return "Jusqu’au " + params?.date;
        }
        if (key === "app.trafficModalUntilLabel") {
          return "Jusqu’à " + params?.label;
        }
        if (key === "app.trafficModalTimeRange") {
          return params?.start + " - " + params?.end;
        }
        if (key === "app.trafficModalUntilEndOfService") {
          return params?.start + " - fin de service";
        }
        if (key === "app.trafficModalFromTime") {
          return "À partir de " + params?.time;
        }

        return key;
      },
    }),
  }));
}

describe("UserFriendlyTrafficModal", () => {
  it("shows the Metro 4 works reason with a works icon and deduplicated copy", async () => {
    mockFrenchI18n();
    const { default: UserFriendlyTrafficModal } =
      await import("../src/components/UserFriendlyTrafficModal.vue");
    const alert: TrafficAlertModalData = {
      label: "Interruption",
      tone: "red",
      disruption: {
        id: "metro-4-july-works",
        title:
          "Jusqu'au 24 juillet inclus, le trafic est interrompu entre Montparnasse Bienvenue et Les Halles en raison de travaux.",
        message:
          "Trafic interrompu\nMétro 4 : Travaux - Trafic interrompu\nMétro 4 : Travaux - Trafic interrompu",
        kind: "works",
        applicationPeriods: [{ begin: "20260706T044500", end: "20260724T235900" }],
        impactedLineRefs: ["line:IDFM:C01374"],
        impactedStopNames: ["Gare Montparnasse (Paris)", "Les Halles (Paris)"],
      },
    };
    const wrapper = mount(UserFriendlyTrafficModal, {
      attachTo: document.body,
      props: { alert, open: true },
    });

    const summaryItem = wrapper.get(".pattern-traffic-friendly-summary__item");
    expect(summaryItem.classes()).toContain("pattern-traffic-friendly-summary__item--works");
    expect(summaryItem.classes()).toContain("pattern-traffic-friendly-summary__item--critical");
    expect(summaryItem.get("strong").text()).toBe("Travaux");
    expect(wrapper.get(".pattern-traffic-friendly-summary__incident-icon svg").classes()).toContain(
      "lucide-wrench",
    );
    expect(wrapper.get(".traffic-alert-modal__detail").text()).toContain(
      "Jusqu'au 24 juillet inclus, le trafic est interrompu entre Montparnasse Bienvenue et Les Halles en raison de travaux.",
    );
    expect(
      wrapper
        .get(".traffic-alert-modal__detail")
        .text()
        .match(/Métro 4 : Travaux - Trafic interrompu/gu),
    ).toHaveLength(1);

    wrapper.unmount();
  });

  it("renders one intelligent tile per RER E date set and keeps the raw announcement", async () => {
    mockFrenchI18n();
    const { default: UserFriendlyTrafficModal } =
      await import("../src/components/UserFriendlyTrafficModal.vue");
    const announcement = [
      "Travaux sur les nouveaux quais de la ligne 15 dans le cadre du Grand Paris Express.",
      "Période : toute la journée",
      "Dates : du 20 juillet au 24 juillet",
      "- Nanterre-la-Folie <> Tournan : offre de transport réduite de 5h20 à 8h45 en direction de Paris et de 16h à 19h30 en direction de Tournan",
      "A noter :",
      "- Rosny-Bois-Perrier non desservie dans les 2 sens du 1/08 au 7/08 : bus de remplacement",
    ].join("\n");
    const alert: TrafficAlertModalData = {
      label: "Travaux sur le réseau ferroviaire",
      tone: "red",
      disruption: {
        id: "rer-e-summer-works",
        title: "RER E : Grands travaux d'été 2026",
        message: announcement,
        kind: "works",
        applicationPeriods: [{ begin: "20260720T000000", end: "20260807T235900" }],
        impactedLineRefs: ["line:IDFM:C01728"],
        impactedStopNames: ["Rosny-Bois-Perrier"],
      },
    };
    const wrapper = mount(UserFriendlyTrafficModal, {
      attachTo: document.body,
      props: {
        alert,
        open: true,
        smartFormattingEnabled: true,
      },
    });

    const tiles = wrapper.findAll(".traffic-alert-modal__date-tile");
    expect(tiles).toHaveLength(2);
    expect(tiles[0].text()).toContain("20 juil.");
    expect(tiles[0].text()).toContain("24 juil.");
    expect(tiles[0].text()).toContain("05:20 - 08:45");
    expect(tiles[0].text()).toContain("16:00 - 19:30");
    expect(tiles[0].get("svg").classes()).toContain("lucide-calendar-days");
    expect(tiles[1].classes()).toContain("traffic-alert-modal__date-tile--replacement-bus");
    expect(tiles[1].text()).toContain("Rosny-Bois-Perrier non desservie");
    expect(tiles[1].text()).toContain("Bus de remplacement");
    expect(tiles[1].text()).toContain("1 août");
    expect(tiles[1].text()).toContain("7 août");
    expect(tiles[1].get("svg").classes()).toContain("lucide-bus-front");
    expect(wrapper.get(".traffic-alert-modal__detail").text()).toContain(announcement);

    await wrapper.setProps({ smartFormattingEnabled: false });
    expect(wrapper.findAll(".traffic-alert-modal__date-tile")).toHaveLength(0);
    expect(wrapper.get(".traffic-alert-modal__detail").text()).toContain(
      "Dates : du 20 juillet au 24 juillet",
    );

    wrapper.unmount();
  });

  it("renders evening and end-only periods from the shared calendar date sets", async () => {
    mockFrenchI18n();
    const { default: UserFriendlyTrafficModal } =
      await import("../src/components/UserFriendlyTrafficModal.vue");
    const ligneU: TrafficAlertModalData = {
      label: "Travaux sur le réseau ferroviaire",
      tone: "red",
      disruption: {
        id: "ligne-u-evening",
        title: "Ligne U : La Défense <-> La Verrière 20-23/07",
        message: [
          "Période : en semaine, en soirée.",
          "Dates : du lundi 20 au jeudi 23 juillet.",
          "Un service de bus de remplacement est mis en place.",
        ].join("\n"),
        kind: "works",
        applicationPeriods: [{ begin: "20260720T220000", end: "20260724T020000" }],
        impactedLineRefs: [],
        impactedStopNames: [],
      },
    };
    const wrapper = mount(UserFriendlyTrafficModal, {
      attachTo: document.body,
      props: {
        alert: ligneU,
        open: true,
        smartFormattingEnabled: true,
      },
    });

    expect(wrapper.get(".traffic-alert-modal__date-tile").text()).toContain("En soirée");
    expect(wrapper.get(".traffic-alert-modal__date-tile-evening svg").classes()).toContain(
      "lucide-moon-star",
    );

    await wrapper.setProps({
      alert: {
        label: "Travaux de rénovation",
        tone: "red",
        disruption: {
          id: "metro-13-until",
          title: "Métro 13 : Travaux de rénovation - Trafic interrompu",
          message:
            "Jusqu'au dimanche 26 juillet inclus, le terminus sud de la ligne 13 est reporté en raison de travaux.",
          kind: "works",
          applicationPeriods: [{ begin: "20260718T050000", end: "20260727T020000" }],
          impactedLineRefs: [],
          impactedStopNames: [],
        },
      },
    });
    const metroTile = wrapper.get(".traffic-alert-modal__date-tile");
    expect(metroTile.text()).toContain("Jusqu’au 26 juil.");
    expect(metroTile.text()).not.toContain("→");

    await wrapper.setProps({
      alert: {
        label: "Travaux",
        tone: "red",
        disruption: {
          id: "tram-t2-until",
          title: "Tramway T2 : Travaux - Trafic interrompu",
          message: "Jusqu'au 23 août inclus, le trafic est interrompu. Bus de remplacement.",
          kind: "works",
          applicationPeriods: [{ begin: "20260722T050000", end: "20260824T020000" }],
          impactedLineRefs: [],
          impactedStopNames: [],
        },
      },
    });
    const t2Tile = wrapper.get(".traffic-alert-modal__date-tile");
    expect(t2Tile.text()).toContain("Jusqu’au 23 août");
    expect(t2Tile.text()).toContain("Bus de remplacement");

    await wrapper.setProps({
      alert: {
        label: "Dégradations par un tiers",
        tone: "red",
        disruption: {
          id: "tram-t1-estimated-end",
          title: "Trafic interrompu",
          message: [
            "Reprise des circulations envisagée en fin d'été 2026.",
            "Bus de remplacement entre Les Courtilles et Villeneuve-la-Garenne.",
          ].join("\n"),
          kind: "works",
          applicationPeriods: [{ begin: "20260722T000000", end: "20260921T235900" }],
          impactedLineRefs: [],
          impactedStopNames: [],
        },
      },
    });
    const t1Tile = wrapper.get(".traffic-alert-modal__date-tile");
    expect(t1Tile.text()).toContain("Jusqu’à fin d’été 2026");
    expect(t1Tile.text()).toContain("Bus de remplacement");

    wrapper.unmount();
  });
  it("renders deduplicated metadata and explicit years from the shared date sets", async () => {
    mockFrenchI18n();
    const { default: UserFriendlyTrafficModal } =
      await import("../src/components/UserFriendlyTrafficModal.vue");
    const rerC: TrafficAlertModalData = {
      label: "Travaux sur le réseau ferroviaire",
      tone: "red",
      disruption: {
        id: "rer-c-dourdan-evenings",
        title: "RER C : entre Dourdan et Paris Austerlitz du 06/07 au 31/07",
        message: [
          "Période : Les soirées.",
          "Dates : du lundi 6 au vendredi 31 juillet.",
          "À partir de 22h20, les trains sont terminus Brétigny.",
          "Un service de bus de remplacement est mis en place.",
        ].join("\n"),
        kind: "works",
        applicationPeriods: [{ begin: "20260706T222000", end: "20260801T020000" }],
        impactedLineRefs: [],
        impactedStopNames: [],
      },
    };
    const wrapper = mount(UserFriendlyTrafficModal, {
      attachTo: document.body,
      props: { alert: rerC, open: true, smartFormattingEnabled: true },
    });

    const rerCTiles = wrapper.findAll(".traffic-alert-modal__date-tile");
    expect(rerCTiles).toHaveLength(1);
    expect(rerCTiles[0].text()).toContain("Entre Dourdan et Paris Austerlitz");
    expect(rerCTiles[0].text()).not.toContain("RER C");
    expect(rerCTiles[0].text()).toContain("En soirée");
    expect(rerCTiles[0].text()).toContain("Bus de remplacement");
    expect(rerCTiles[0].text()).toContain("À partir de 22:20");

    await wrapper.setProps({
      alert: {
        label: "Travaux de rénovation",
        tone: "red",
        disruption: {
          id: "metro-8-republique",
          title: "Métro 8 : Travaux de rénovation - Arrêt non desservi",
          message:
            "Du 22 juillet 2026 au 22 avril 2027 inclus, l'arrêt ne sera pas desservi à République en raison de travaux de rénovation.",
          kind: "works",
          applicationPeriods: [{ begin: "20260722T000000", end: "20270422T235900" }],
          impactedLineRefs: [],
          impactedStopNames: [],
        },
      },
    });

    const metroTile = wrapper.get(".traffic-alert-modal__date-tile");
    expect(metroTile.text()).toContain("Travaux de rénovation");
    expect(metroTile.text()).not.toContain("Métro 8");
    expect(metroTile.text()).not.toContain("inclus, l'arrêt");
    expect(metroTile.text()).toContain("2026");
    expect(metroTile.text()).toContain("2027");

    wrapper.unmount();
  });
});

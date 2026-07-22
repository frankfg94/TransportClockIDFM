import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrafficDisruption } from "../src/features/traffic/types";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../src/i18n");
});

function mockFrenchI18n(): void {
  vi.doMock("../src/i18n", () => ({
    useI18n: () => ({
      d: (
        value: Date | number | string,
        options?: Intl.DateTimeFormatOptions,
      ) => new Intl.DateTimeFormat("fr-FR", options).format(new Date(value)),
      t: (key: string, params?: Record<string, string | number>) => {
        const messages: Record<string, string> = {
          "traffic.affectedStops": "Arrets concernes:",
          "traffic.hideDisruptionDetails": "Reduire",
          "traffic.showDisruptionDetails": "Voir le detail",
          "traffic.period.range": `${params?.begin} -> ${params?.end}`,
        };

        return messages[key] ?? key;
      },
    }),
  }));
}

const longDisruption: TrafficDisruption = {
  id: "long-rer-works",
  title: "Travaux de modernisation du RER",
  message: [
    "Le trafic est interrompu entre plusieurs gares pendant la soiree.",
    "Un service de remplacement dessert toutes les gares intermediaires.",
    "Cette annonce contient volontairement une description assez longue pour verifier la presentation condensee et son ouverture sans perdre les informations utiles aux voyageurs.",
  ].join("\n"),
  kind: "works",
  applicationPeriods: [{ begin: "20260723T220000", end: "20260724T020000" }],
  impactedLineRefs: ["line:IDFM:RER"],
  impactedStopNames: ["Gare A", "Gare B", "Gare C", "Gare D", "Gare E"],
};

describe("UserFriendlyTraffic", () => {
  it("keeps long traffic copy condensed until the user opens it", async () => {
    mockFrenchI18n();
    const { default: UserFriendlyTraffic } =
      await import("../src/components/UserFriendlyTraffic.vue");
    const wrapper = mount(UserFriendlyTraffic, {
      props: {
        collapsible: true,
        compact: true,
        disruption: longDisruption,
      },
    });

    const toggle = wrapper.get(".user-friendly-traffic__toggle");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".user-friendly-traffic__detail").exists()).toBe(false);
    expect(wrapper.get(".user-friendly-traffic__preview").text()).toContain(
      "Le trafic est interrompu",
    );

    await toggle.trigger("click");

    expect(toggle.attributes("aria-expanded")).toBe("true");
    const detail = wrapper.get(".user-friendly-traffic__detail");
    expect(detail.text()).toContain("informations utiles aux voyageurs");
    expect(detail.element.textContent).toContain(
      "Travaux de modernisation du RER\n\nLe trafic est interrompu",
    );
  });

  it("opens and marks a disruption targeted by a deep link", async () => {
    mockFrenchI18n();
    const { default: UserFriendlyTraffic } =
      await import("../src/components/UserFriendlyTraffic.vue");
    const wrapper = mount(UserFriendlyTraffic, {
      props: {
        collapsible: true,
        compact: true,
        disruption: longDisruption,
        highlighted: true,
      },
    });

    expect(wrapper.classes()).toContain("user-friendly-traffic--highlighted");
    expect(wrapper.classes()).toContain("traffic-disruption--target");
    expect(
      wrapper.get(".user-friendly-traffic__toggle").attributes("aria-expanded"),
    ).toBe("true");
  });
});

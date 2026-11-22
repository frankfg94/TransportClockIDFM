import { flushPromises, mount } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import type { GreenMapReference } from "../shared/natureInCity";
import NatureVerdictPanel from "../src/features/nearby-stations/NatureVerdictPanel.vue";
import type { NeighborhoodFact } from "../src/features/nearby-stations/neighborhood/contracts";

vi.mock("../src/features/nearby-stations/NeighborhoodGreeneryMap.vue", () => ({
  __esModule: true,
  default: { props: ["reference"], template: '<div data-testid="layer">{{ reference.scope }}</div>' },
}));

it("opens the shared fullscreen panel, switches the requested nature data and closes on Escape", async () => {
  const address: GreenMapReference = { scope: "address", lat: 48.8, lon: 2.26, version: "012345678901234567890123" };
  const park: GreenMapReference = { scope: "park", id: "park-1" };
  const forest: GreenMapReference = { scope: "woodland", id: "forest", lat: 48.8, lon: 2.25, version: address.version };
  const base = { category: "nature-leisure", family: "nature", polarity: "neutral", priority: 1,
    evidence: { proof: "derived", observedAt: 0 } } as const;
  const facts: NeighborhoodFact[] = [
    { ...base, id: "address", kind: "external", greenMap: address },
    { ...base, id: "backend:green-site-park-1", kind: "external", greenMap: park, label: "Parc à environ 14 min à pied · 34 ha" },
    { ...base, id: "transit", kind: "woodlandTransit", greenMap: forest, labelValues: { name: "Forêt", minutes: 7 },
      travel: { journey: { durationSeconds: 420, sections: [{ type: "public_transport", durationSeconds: 420 }] } } },
    { ...base, id: "walk", kind: "woodlandWalking", greenMap: forest, labelValues: { name: "Forêt", minutes: 25 } },
  ];
  const wrapper = mount(NatureVerdictPanel, { props: { facts }, attachTo: document.body });
  try {
    await wrapper.get("button").trigger("click");
    await flushPromises();
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.classList).toContain("verdict-panel-fullscreen");
    const options = [...dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(options).toHaveLength(3);
    expect(options[0]?.parentElement?.textContent).toContain("≈ 14 min");
    expect(options[1]?.parentElement?.textContent).toContain("25 min");
    expect(options[1]?.parentElement?.textContent).toContain("7 min · direct");
    expect(options[0]?.checked).toBe(true);
    const layer = dialog.querySelector('[data-testid="layer"]');
    options[1]?.click();
    await flushPromises();
    expect(dialog.querySelector('[data-testid="layer"]')).toBe(layer);
    expect(layer?.textContent).toBe("woodland");
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector('[data-testid="layer"]')).toBeNull();
    wrapper.vm.show(address);
    await flushPromises();
    expect(document.body.querySelector('[data-testid="layer"]')?.textContent).toBe("address");
    expect(wrapper.emitted("update:focus")).toEqual([
      ["nature:park:park-1"], ["nature:woodland:forest"], [undefined], ["nature:address"],
    ]);
    expect(wrapper.emitted("prepare")).toEqual([["nature:park:park-1"], ["nature:woodland:forest"], ["nature:address"]]);
  } finally {
    wrapper.unmount();
  }
});

it("restores a shared zone after its facts arrive, independently of their order", async () => {
  const park: GreenMapReference = { scope: "park", id: "green-sceaux" };
  const fact: NeighborhoodFact = { id: "sceaux", kind: "external", category: "nature-leisure", family: "parks",
    polarity: "neutral", priority: 1, label: "Domaine de Sceaux", greenMap: park,
    evidence: { proof: "derived", observedAt: 0 } };
  const wrapper = mount(NatureVerdictPanel, {
    props: { facts: [], focus: "nature:park:old-sceaux",
      transit: { datetime: "20261121T090000", version: "test", probeJourneys: async () => [], loadPaths: async () => [],
        spaces: [{ id: "green-sceaux", parkAliases: ["old-sceaux"] }] } }, attachTo: document.body,
  });
  try {
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    await wrapper.setProps({ facts: [{ ...fact, id: "other", label: "Autre parc", greenMap: { scope: "park", id: "other" } }, fact] });
    await flushPromises();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector("input:checked")?.parentElement?.textContent).toContain("Domaine de Sceaux");
    expect(wrapper.emitted("prepare")).toEqual([["nature:park:green-sceaux"]]);
    expect(wrapper.emitted("update:focus")).toBeUndefined();
    await wrapper.setProps({ focus: undefined });
    await flushPromises();
    expect(document.body.querySelector('[data-testid="layer"]')).toBeNull();
  } finally {
    wrapper.unmount();
  }
});

it("renders the shared travel times in focus and highlights walking below 20 minutes", async () => {
  const facts: NeighborhoodFact[] = ["first", "second"].map(id => ({
    id, kind: "external", category: "nature-leisure", family: "parks", polarity: id === "first" ? "positive" : "neutral", priority: 1,
    markerEmphasis: id === "first" ? "strong" : undefined, tooltip: "Détail du fact",
    label: id, greenMap: { scope: "park", id }, evidence: { proof: "derived", observedAt: 0 },
  }));
  const journey = { durationSeconds: 720, sections: [{ type: "public_transport", durationSeconds: 660 }] };
  const probeJourneys = vi.fn();
  const wrapper = mount(NatureVerdictPanel, { attachTo: document.body, props: {
    facts, focus: "nature:park:second", origin: { lon: 2.25, lat: 48.8 },
    transit: { datetime: "20261121T090000", version: "test", probeJourneys, loadPaths: async () => [],
      journeys: new Map([["first", journey], ["second", journey]]), walkingMinutes: new Map([["first", 1199 / 60], ["second", 20]]) },
  } });
  try {
    await flushPromises();
    expect([...document.querySelectorAll(".nature-map-choice")].map(row => row.textContent))
      .toEqual([expect.stringContaining("12 min · direct"), expect.stringContaining("12 min · direct")]);
    expect(document.querySelector("input:checked")?.parentElement?.textContent).toContain("second");
    const [first, second] = [...document.querySelectorAll(".nature-map-row")];
    expect(first?.querySelector(".nature-map-choice__duration--primary")?.textContent).toContain("20 min");
    expect(first?.querySelector(".nature-map-choice__duration--primary")?.textContent).not.toContain("direct");
    expect(second?.querySelector(".nature-map-choice__duration--primary")?.textContent).toContain("12 min · direct");
    const badge = first?.querySelector<HTMLButtonElement>("button");
    expect(badge?.textContent?.trim()).toBe("++");
    badge?.click();
    await flushPromises();
    expect(first?.querySelector(".nature-map-row__fact-details")?.textContent).toContain("Détail du fact");
  } finally {
    wrapper.unmount();
    expect(probeJourneys).not.toHaveBeenCalled();
  }
});

it("sorts bonuses and penalties by displayed strength before neutral choices", async () => {
  const facts: NeighborhoodFact[] = [
    { id: "neutral", polarity: "neutral" }, { id: "penalty", polarity: "negative" },
    { id: "strong", polarity: "positive", markerEmphasis: "strong" }, { id: "exceptional", polarity: "positive", emphasis: "exceptional" },
  ].map(({ id, ...details }) => ({ id, kind: "external", category: "nature-leisure", family: id, priority: 1,
    label: id, greenMap: { scope: "park", id }, evidence: { proof: "derived", observedAt: 0 }, ...details } as NeighborhoodFact));
  const wrapper = mount(NatureVerdictPanel, { props: { facts, focus: "nature:park:neutral" }, attachTo: document.body });
  try {
    await flushPromises();
    expect([...document.querySelectorAll(".nature-map-choice__name")].map(choice => choice.textContent?.trim()))
      .toEqual(["exceptional", "strong", "penalty", "neutral"]);
    expect(document.querySelector("input:checked")?.parentElement?.textContent).toContain("neutral");
  } finally {
    wrapper.unmount();
  }
});

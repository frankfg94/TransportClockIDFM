import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { describe, expect, it } from "vitest";
import Fact from "../src/features/nearby-stations/NearbyNeighborhoodScoreFact.vue";
import LineIconBadge from "../src/components/LineIconBadge.vue";
import { buildTransportFactsContext } from "../src/features/nearby-stations/neighborhood/verdict-transport-facts/context";
import { buildTransportDiversityFacts } from "../src/features/nearby-stations/neighborhood/verdict-transport-facts/transportDiversity";
import { buildLastServiceFacts } from "../src/features/nearby-stations/neighborhood/verdict-transport-facts/lastServices";
import type { GlobalMapLine } from "../src/features/transport-map/contracts/manifest";
import type { NeighborhoodFact, NeighborhoodScoreInput } from "../src/features/nearby-stations/neighborhood";

function line(id: string, mode: GlobalMapLine["mode"]): GlobalMapLine {
  return { id, code: id, label: id, mode, index: 1, color: "#5146ff", textColor: "#fff", aliases: [], stationIds: [], geometryIds: [] };
}
function input(lines: GlobalMapLine[]): NeighborhoodScoreInput {
  return { places: [], placesLoaded: false, stationsLoaded: true, stations: [{
    id: "station", lines, memberStations: [], distanceMeters: 100, insideRadius: true,
    station: { id: "station", name: "Reference", lineIds: lines.map(line => line.id), memberStationIds: [], lon: 2.3, lat: 48.8 } as never,
  }] };
}
function render(fact: NeighborhoodFact) {
  return mount(defineComponent({ components: { Fact }, setup() { return { fact, open: ref(false) }; },
    template: '<Fact :fact="fact" :open="open" @toggle="open = !open" />',
  }));
}
describe("Verdict transport fact details", () => {
  it("reuses the existing commercial line-name resolver for opaque IDFM codes", () => {
    const opaque = line("IDFM:C01743", "RER");
    const fact = buildLastServiceFacts({ ...input([opaque]), lastServiceByLine: new Map([[opaque.id, { seconds: 87000 }]]) }).neutralFacts[0]!;
    const wrapper = render(fact);
    expect(wrapper.get('[data-testid="last-service-line"]').text()).toContain("RER B");
    expect(wrapper.getComponent(LineIconBadge).props("line")).toMatchObject({ label: "B", family: "RER" });
    wrapper.unmount();
  });
  it("opens and closes the exact counted structural lines with real line icons and mode groups", async () => {
    const lines = [line("4", "METRO"), line("B", "RER"), line("N", "TRANSILIEN"), line("T6", "TRAM"), line("C1", "CABLE")];
    const fact = buildTransportDiversityFacts(buildTransportFactsContext(input(lines))).positiveFacts[0]!;
    const wrapper = render(fact);
    const trigger = wrapper.get("button");
    expect(trigger.text()).toContain("5 lignes structurantes");
    await trigger.trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(wrapper.findAll('[data-testid="structural-line"]')).toHaveLength(5);
    expect(wrapper.findAllComponents(LineIconBadge)).toHaveLength(5);
    expect(wrapper.get('[data-structural-mode="TRAIN"]').text()).toContain("Transilien");
    expect(wrapper.findAll("[data-structural-mode]").map(group => group.attributes("data-structural-mode"))).toEqual(["METRO", "RER", "TRAIN", "TRAM", "CABLE"]);
    await trigger.trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("false");
    wrapper.unmount();
  });
  it.each([2, 1, 0])("shows %i available service endings, unknown rows and next-day times", async available => {
    const lines = [line("4", "METRO"), line("T6", "TRAM")];
    const observations = new Map(lines.map((line, index) => [line.id, index < available ? { seconds: 90000, stopName: "Reference" } : undefined]));
    const fact = buildLastServiceFacts({ ...input(lines), lastServiceByLine: observations }).neutralFacts[0]!;
    const wrapper = render(fact);
    await wrapper.get("button").trigger("click");
    expect(wrapper.get("button").text()).toContain(`${available}/2`);
    expect(wrapper.findAll('[data-testid="last-service-line"]')).toHaveLength(2);
    expect(wrapper.findAllComponents(LineIconBadge)).toHaveLength(2);
    expect(wrapper.text().match(/01:00 \(lendemain\)/gu) ?? []).toHaveLength(available);
    expect(wrapper.text().match(/Horaire indisponible/gu) ?? []).toHaveLength(2 - available);
    wrapper.unmount();
  });
});

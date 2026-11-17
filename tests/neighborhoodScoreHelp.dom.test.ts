import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NearbyNeighborhoodScoreCard from "../src/features/nearby-stations/NearbyNeighborhoodScoreCard.vue";
import { aggregateNeighborhoodScore } from "../src/features/nearby-stations/neighborhood/score";
import { buildNeighborhoodScore } from "../src/features/nearby-stations/neighborhood";
import { EDUCATION_SCORE_RULES } from "../src/features/nearby-stations/neighborhood/criteria/education";
import { qualifyPersonalJourney, PERSONAL_JOURNEY_SCORES } from "../src/features/nearby-stations/neighborhood/personalJourneys";

describe("score help", () => {
  it("distinguishes measured personal bonus, neutral and penalty", () => {
    const thresholds = { positiveBelowMinutes: 30, neutralThroughMinutes: 45 };
    expect(qualifyPersonalJourney(29, thresholds).kind).toBe("bonus");
    expect(qualifyPersonalJourney(30, thresholds).kind).toBe("neutral");
    expect(qualifyPersonalJourney(46, thresholds).kind).toBe("penalty");
    expect(PERSONAL_JOURNEY_SCORES).toEqual({ bonus: 10, neutral: 5, penalty: 0 });
  });

  it("renormalizes scored categories and keeps a measured zero in the denominator", () => {
    const input = { places: [], placesLoaded: true, stations: [], stationsLoaded: false, generatedAt: 1 };
    const categories = buildNeighborhoodScore(input).categories.map(category => ({
      ...category,
      available: category.id === "daily-life" || category.id === "health",
      score: category.id === "daily-life" ? 10 : category.id === "health" ? 0 : undefined,
    }));
    const result = aggregateNeighborhoodScore(categories, input);
    expect(result.score).toBeCloseTo(6.25);
    expect(result.coverageRatio).toBeCloseTo(0.36);
    expect(result.availableCategoryCount).toBe(2);
  });

  it("opens during partial loading, reports active weight and uses the scoring threshold, then closes with Escape", async () => {
    const result = buildNeighborhoodScore({ places: [], placesLoaded: false, stations: [], stationsLoaded: true, generatedAt: 1 });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const wrapper = mount(NearbyNeighborhoodScoreCard, { attachTo: host, props: {
      result, directoryUrl: "/nearby-stations", criteria: [{ id: "daily-life", status: "loading", confidence: 0, reasons: [], datasets: [] }],
    }, global: { stubs: { NuxtLink: true } } });
    const button = wrapper.get("button[aria-label='Comment fonctionne la note ?']");
    (button.element as HTMLButtonElement).focus();
    await button.trigger("click");
    await wrapper.vm.$nextTick();
    const dialog = document.querySelector<HTMLElement>("[role=dialog][aria-label='Comment fonctionne la note ?']")!;
    expect(dialog).toBeTruthy();
    expect(document.activeElement).toBe(dialog);
    expect(dialog.textContent).toContain("27 % des poids prévus");
    expect(dialog.textContent).toContain("poids actuel : 100 %");
    expect(dialog.textContent).toContain("non évaluée");
    expect(dialog.textContent).toContain(`pour ${EDUCATION_SCORE_RULES.target} établissements`);
    expect(dialog.textContent).toContain("En cours");
    const details = dialog.querySelector("details")!;
    expect(details.textContent).toContain("Base sans signal");
    expect(details.textContent).toContain("Contribution à cette étape : 1,5");
    expect(details.textContent).toContain("Fréquences");
    const refreshed = buildNeighborhoodScore({ places: [], placesLoaded: true, stations: [], stationsLoaded: true, generatedAt: 2 });
    await wrapper.setProps({ result: refreshed, criteria: [{ id: "daily-life", status: "ready", confidence: 1, reasons: [], datasets: [] }] });
    expect(dialog.textContent).toContain("63 % des poids prévus");
    expect(dialog.textContent).toContain("note calculée : 2");
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(document.querySelector("[role=dialog][aria-label='Comment fonctionne la note ?']")).toBeNull();
    expect(document.activeElement).toBe(button.element);
    wrapper.unmount();
    host.remove();
  });
});

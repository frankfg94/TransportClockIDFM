import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";
import type { NearbyWalkingLoadProgress } from "../src/features/nearby-stations/useNearbyWalkingRoutes";
import NearbyPlacesDirectoryOverlay from "../src/features/nearby-stations/NearbyPlacesDirectoryOverlay.vue";
import NearbyWalkingProgressIndicator from "../src/features/nearby-stations/NearbyWalkingProgressIndicator.vue";

const places: NearbyPlace[] = [
  { id: "cafe", name: "Café République", lon: 2.3, lat: 48.81, category: "food", kind: "cafe", distanceMeters: 300, address: "12 rue de Paris" },
  { id: "market", name: "Marché Central", lon: 2.31, lat: 48.82, category: "shop", kind: "supermarket", distanceMeters: 720 },
  { id: "museum", name: "Musée local", lon: 2.32, lat: 48.83, category: "culture", kind: "museum", distanceMeters: 1_100 },
];

function mountOverlay(overrides: Record<string, unknown> = {}) {
  return mount(NearbyPlacesDirectoryOverlay, {
    attachTo: document.body,
    props: {
      open: true,
      origin: { lon: 2.3, lat: 48.81, label: "12 rue de Paris" },
      places,
      walkingMinutes: 15,
      ...overrides,
    },
    global: {
      stubs: {
        Teleport: true,
        NearbyStationsMap: {
          props: ["variant", "places", "selectedPlaceId"],
          emits: ["selectPlace", "placeContextMenu"],
          template: "<div data-testid='directory-map' :data-variant='variant' :data-count='places.length' :data-selected='selectedPlaceId'><button class='mock-map-place' @click='$emit(\"selectPlace\", \"cafe\")' @contextmenu='$emit(\"placeContextMenu\", \"cafe\", $event.currentTarget)'>select</button></div>",
        },
      },
    },
  });
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: query.includes("max-width") ? false : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  document.documentElement.style.overflow = "";
  document.documentElement.style.scrollbarGutter = "";
  document.body.style.overflow = "";
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("NearbyPlacesDirectoryOverlay", () => {
  it("renders only supplied data, groups it and filters locally without fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mountOverlay();
    await flushPromises();

    expect(wrapper.get("[role='dialog']").attributes("aria-modal")).toBe("true");
    expect(wrapper.findAll(".nearby-directory__place")).toHaveLength(3);
    expect(wrapper.get(".nearby-directory__toolbar").text()).toContain("3 lieux dont 1 commerces à moins de 15 minutes à pied");
    expect(wrapper.findAll(".nearby-directory__group h3 > button")[0]?.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("[data-testid='directory-map']").attributes("data-variant")).toBe("places-preview");
    expect(document.body.style.overflow).toBe("hidden");

    await wrapper.get("input[type='search']").setValue("cafe");
    expect(wrapper.findAll(".nearby-directory__place")).toHaveLength(1);
    expect(wrapper.text()).toContain("Café République");
    expect(fetchMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("uses the shared place icon for each directory row", async () => {
    const wrapper = mountOverlay({
      places: [
        ...places,
        { id: "bakery", name: "La Tradition", lon: 2.305, lat: 48.815, category: "shop", kind: "bakery", distanceMeters: 350 },
      ],
    });
    await flushPromises();

    expect(wrapper.get("[data-place-id='bakery'] .nearby-directory__place-icon svg").classes()).toContain("lucide-croissant");
    expect(wrapper.get("[data-place-id='market'] .nearby-directory__place-icon svg").classes()).toContain("lucide-shopping-cart");
    expect(wrapper.get("[data-place-id='cafe'] .nearby-directory__place-icon svg").classes()).toContain("lucide-utensils");
    wrapper.unmount();
  });

  it("uses dedicated nature, school and sports icons in the directory", async () => {
    const wrapper = mountOverlay({
      places: [
        ...places,
        { id: "square", name: "Square des Lilas", lon: 2.305, lat: 48.815, category: "attraction", kind: "square", distanceMeters: 350 },
        { id: "school", name: "École maternelle du Centre", lon: 2.306, lat: 48.816, category: "service", kind: "school", distanceMeters: 360 },
        { id: "gym", name: "Gymnase municipal", lon: 2.307, lat: 48.817, category: "attraction", kind: "sports_centre", distanceMeters: 370 },
      ],
    });
    await flushPromises();

    expect(wrapper.get("[data-place-id='square'] .nearby-directory__place-icon svg").classes()).toContain("lucide-tree-pine");
    expect(wrapper.get("[data-place-id='school'] .nearby-directory__place-icon svg").classes()).toContain("lucide-school");
    expect(wrapper.get("[data-place-id='gym'] .nearby-directory__place-icon svg").classes()).toContain("lucide-dumbbell");
    expect(wrapper.findAll(".nearby-directory__group-title").some((title) => title.text() === "Espaces verts")).toBe(true);
    expect(wrapper.get(".nearby-directory__toolbar").text()).toContain("6 lieux dont 1 commerces à moins de 15 minutes à pied");
    wrapper.unmount();
  });

  it("uses routed walking duration for the ten-minute directory and preview map", async () => {
    const wrapper = mountOverlay({
      walkingMinutes: 10,
      walkingRoutes: {
        market: {
          id: "market",
          provider: "idfm-navitia",
          distanceMeters: 720,
          durationSeconds: 900,
          coordinates: [{ lon: 2.3, lat: 48.81 }, { lon: 2.31, lat: 48.82 }],
        },
      },
    });
    await flushPromises();

    expect(wrapper.findAll(".nearby-directory__place").map((item) => item.attributes("data-place-id")))
      .toEqual(["cafe"]);
    expect(wrapper.get("[data-testid='directory-map']").attributes("data-count")).toBe("1");
    expect(wrapper.text()).not.toContain("Marché Central");
    wrapper.unmount();
  });

  it("requests walking metrics for every accordion as soon as the directory opens", async () => {
    const wrapper = mountOverlay();
    await flushPromises();

    const initialRequests = wrapper.emitted("requestGroupWalkingRoutes") ?? [];
    const groupButtons = wrapper.findAll(".nearby-directory__group h3 > button");
    expect(initialRequests.length).toBe(groupButtons.length);
    expect(initialRequests[0]?.[1]).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "market" }),
    ]));
    expect(initialRequests.some((request) => (request[1] as NearbyPlace[]).some((place) => place.id === "cafe"))).toBe(true);
    expect(initialRequests.some((request) => (request[1] as NearbyPlace[]).some((place) => place.id === "museum"))).toBe(true);

    expect(groupButtons.length).toBeGreaterThan(2);
    await groupButtons[2]!.trigger("click");
    await flushPromises();

    const allRequests = wrapper.emitted("requestGroupWalkingRoutes") ?? [];
    expect(allRequests.length).toBe(initialRequests.length);
    wrapper.unmount();
  });

  it("renders an animated indeterminate circle without shifting the commerce count", async () => {
    const wrapper = mountOverlay({
      loadingGroupIds: new Set(["food-shopping"]),
    });
    await flushPromises();

    const progress = wrapper.get(".nearby-directory__group-progress");
    expect(progress.attributes("role")).toBe("status");
    expect(progress.attributes("aria-label")).toBe("Chargement des commerces et lieux…");
    expect(progress.classes()).toContain("nearby-directory__group-progress--active");
    expect(progress.find(".nearby-directory__group-progress-bar").exists()).toBe(true);
    expect(wrapper.findComponent(NearbyWalkingProgressIndicator).exists()).toBe(true);
    expect(wrapper.get(".nearby-directory__group-count").text()).toBe("1");
    wrapper.unmount();
  });

  it("fills the circle, shows a check and keeps it visible briefly after loading", async () => {
    const progress: Record<string, NearbyWalkingLoadProgress> = {
      "food-shopping": { completed: 1, total: 1, remaining: 0 },
    };
    const wrapper = mountOverlay({ walkingProgress: progress });
    await flushPromises();

    const indicator = wrapper.get(".nearby-directory__group-progress");
    expect(indicator.classes()).toContain("nearby-directory__group-progress--complete");
    expect(indicator.attributes("aria-label")).toBe("Temps de marche calculés");
    expect(indicator.find(".nearby-directory__group-progress-check").exists()).toBe(true);
    expect(indicator.find(".nearby-directory__group-progress-check").attributes("width")).toBe("8");
    expect(indicator.find(".nearby-directory__group-progress-bar").attributes("style")).toContain("stroke-dasharray");
    wrapper.unmount();
  });

  it("emits radius, retry and close actions", async () => {
    const wrapper = mountOverlay({ error: "Unavailable" });
    await wrapper.get(".nearby-directory__radius button").trigger("click");
    expect(wrapper.emitted("update:walkingMinutes")?.[0]).toEqual([5]);
    await wrapper.get(".nearby-directory__state button").trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);
    await wrapper.get(".nearby-directory__close").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("keeps the export action inside the closed more-actions menu", async () => {
    const wrapper = mountOverlay();
    expect(wrapper.find(".nearby-directory__more-menu").exists()).toBe(false);
    expect(wrapper.find(".nearby-directory__export-trigger").exists()).toBe(false);

    await wrapper.get(".nearby-directory__more-trigger").trigger("click");
    expect(wrapper.get(".nearby-directory__more-menu").attributes("role")).toBe("menu");
    expect(wrapper.get(".nearby-directory__export-trigger").text()).toContain("Exporter");

    document.body.click();
    await nextTick();
    expect(wrapper.find(".nearby-directory__more-menu").exists()).toBe(false);
    wrapper.unmount();
  });

  it("exports the free-radius place data and locks the paid radius", async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn((_value: Blob | MediaSource) => "blob:nearby-directory");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    try {
      const wrapper = mountOverlay();
      await wrapper.get(".nearby-directory__more-trigger").trigger("click");
      await wrapper.get(".nearby-directory__export-trigger").trigger("click");

      expect(createObjectURL).toHaveBeenCalledOnce();
      const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
      const exportedHtml = await blob.text();
      expect(exportedHtml).toContain('data-radius="15" disabled aria-disabled="true"');
      expect(exportedHtml).toContain("Café République");
      expect(exportedHtml).toContain("12 rue de Paris");
      expect(exportedHtml).not.toContain("Musée local");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:nearby-directory");
      wrapper.unmount();
    } finally {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
    }
  });

  it("keeps every eligible commerce in the same category", async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn((_value: Blob | MediaSource) => "blob:nearby-directory-multiple");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    try {
      const wrapper = mountOverlay({
        places: [
          ...places,
          { id: "cafe-2", name: "Café Central", lon: 2.305, lat: 48.815, category: "food", kind: "cafe", distanceMeters: 500 },
        ],
        walkingRoutes: {
          "cafe-2": {
            id: "cafe-2",
            provider: "straight-line",
            distanceMeters: 500,
            durationSeconds: 900,
            coordinates: [{ lon: 2.3, lat: 48.81 }, { lon: 2.305, lat: 48.815 }],
          },
        },
      });
      await wrapper.get(".nearby-directory__more-trigger").trigger("click");
      await wrapper.get(".nearby-directory__export-trigger").trigger("click");

      const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
      const exportedHtml = await blob.text();
      expect(exportedHtml).toContain("Café République");
      expect(exportedHtml).toContain("Café Central");
      expect(exportedHtml).toContain('data-group-count>2</span>');
      wrapper.unmount();
    } finally {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
    }
  });

  it("makes the exported search and 5/10-minute radius controls interactive", async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn((_value: Blob | MediaSource) => "blob:nearby-directory-controls");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    try {
      const wrapper = mountOverlay({ walkingMinutes: 5 });
      await wrapper.get(".nearby-directory__more-trigger").trigger("click");
      await wrapper.get(".nearby-directory__export-trigger").trigger("click");
      const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
      const exportedHtml = await blob.text();
      const exportedDocument = new DOMParser().parseFromString(exportedHtml, "text/html");
      const exportedRoot = exportedDocument.querySelector("main.nearby-directory-export");
      const exportedScript = Array.from(exportedDocument.querySelectorAll("script")).at(-1);
      expect(exportedRoot).not.toBeNull();
      expect(exportedScript).not.toBeUndefined();
      document.body.append(exportedRoot!);
      new Function(exportedScript?.textContent ?? "")();

      const groupToggle = exportedRoot!.querySelector("[data-group-toggle]") as HTMLButtonElement;
      const groupContent = exportedRoot!.querySelector("[data-group-content]") as HTMLElement;
      expect(groupToggle.getAttribute("aria-expanded")).toBe("true");
      expect(groupContent.hidden).toBe(false);
      expect(Array.from(exportedRoot!.querySelectorAll("[data-group-content]")).every((content) => !(content as HTMLElement).hidden)).toBe(true);
      groupToggle.click();
      expect(groupToggle.getAttribute("aria-expanded")).toBe("false");
      expect(groupContent.hidden).toBe(true);
      groupToggle.click();
      expect(groupToggle.getAttribute("aria-expanded")).toBe("true");
      expect(groupContent.hidden).toBe(false);

      const search = exportedRoot!.querySelector("input[type='search']") as HTMLInputElement;
      const cafe = exportedRoot!.querySelector("[data-place-id='cafe']") as HTMLElement;
      const market = exportedRoot!.querySelector("[data-place-id='market']") as HTMLElement;
      search.value = "cafe";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      expect(cafe.hidden).toBe(false);
      search.value = "";
      search.dispatchEvent(new Event("input", { bubbles: true }));

      await (exportedRoot!.querySelector("[data-radius='10']") as HTMLButtonElement).click();
      expect(market.hidden).toBe(false);
      await (exportedRoot!.querySelector("[data-radius='5']") as HTMLButtonElement).click();
      expect(market.hidden).toBe(true);

      exportedRoot!.remove();
      wrapper.unmount();
    } finally {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
    }
  });

  it("collapses the exported accordions by default on mobile", async () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query.includes("max-width: 700px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn((_value: Blob | MediaSource) => "blob:nearby-directory-mobile");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    try {
      const wrapper = mountOverlay();
      await wrapper.get(".nearby-directory__more-trigger").trigger("click");
      await wrapper.get(".nearby-directory__export-trigger").trigger("click");
      const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
      const exportedHtml = await blob.text();
      const exportedDocument = new DOMParser().parseFromString(exportedHtml, "text/html");
      const exportedRoot = exportedDocument.querySelector("main.nearby-directory-export");
      const exportedScript = Array.from(exportedDocument.querySelectorAll("script")).at(-1);
      document.body.append(exportedRoot!);
      new Function(exportedScript?.textContent ?? "")();

      expect(exportedRoot!.querySelector(".nearby-directory-export__open-app")).toBeNull();
      expect(Array.from(exportedRoot!.querySelectorAll("[data-group-toggle]"))
        .every((toggle) => toggle.getAttribute("aria-expanded") === "false")).toBe(true);
      expect(Array.from(exportedRoot!.querySelectorAll("[data-group-content]"))
        .every((content) => (content as HTMLElement).hidden)).toBe(true);

      exportedRoot!.remove();
      wrapper.unmount();
    } finally {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
    }
  });

  it("selects and deselects a place and clears a selection hidden by the radius", async () => {
    const wrapper = mountOverlay();
    const firstPlace = wrapper.get("[data-place-id='cafe']");
    await firstPlace.trigger("click");
    expect(firstPlace.classes()).toContain("nearby-directory__place--selected");
    expect(wrapper.get("[data-testid='directory-map']").attributes("data-selected")).toBe("cafe");
    await firstPlace.trigger("click");
    expect(firstPlace.classes()).not.toContain("nearby-directory__place--selected");

    await wrapper.get("[data-place-id='museum']").trigger("click");
    await wrapper.setProps({ walkingMinutes: 5 });
    expect(wrapper.get("[data-testid='directory-map']").attributes("data-selected")).toBeUndefined();
    wrapper.unmount();
  });

  it("relays commerce context menus from the directory row and preview map", async () => {
    const wrapper = mountOverlay();

    await wrapper.get("[data-place-id='cafe']").trigger("contextmenu");
    await wrapper.get(".mock-map-place").trigger("contextmenu");

    expect(wrapper.emitted("placeContextMenu")).toEqual([
      ["cafe", expect.any(HTMLElement)],
      ["cafe", expect.any(HTMLElement)],
    ]);
    wrapper.unmount();
  });

  it("opens the mobile map after selecting a place and closes on Escape", async () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    const wrapper = mountOverlay();
    await wrapper.findAll(".nearby-directory__place")[0]!.trigger("click");
    await flushPromises();
    expect(wrapper.get(".nearby-directory__map-section").classes()).toContain("nearby-directory__map-section--open");
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();

    await wrapper.get("[role='dialog']").trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("exposes the desktop splitter and filters a subcategory from the global panel", async () => {
    const wrapper = mountOverlay({
      places: [
        ...places,
        { id: "fast-food", name: "Quick", lon: 2.305, lat: 48.815, category: "food", kind: "fast_food", distanceMeters: 350 },
      ],
    });

    const splitter = wrapper.get("[role='separator']");
    expect(splitter.attributes("aria-valuenow")).toBe("60");
    await splitter.trigger("keydown", { key: "ArrowRight" });
    expect(splitter.attributes("aria-valuenow")).toBe("64");

    await wrapper.get(".nearby-directory__filter-trigger").trigger("click");
    expect(wrapper.get(".nearby-directory__subcategory-panel").text()).toContain("Restauration rapide");
    const fastFoodLabel = wrapper.findAll(".nearby-directory__subcategory-panel label")
      .find((label) => label.text().includes("Restauration rapide"));
    expect(fastFoodLabel).toBeDefined();
    await fastFoodLabel!.get("input").setValue(false);
    expect(wrapper.findAll("[data-place-id='fast-food']")).toHaveLength(0);
    expect(wrapper.get("[data-place-id='cafe'] + a.nearby-directory__place-google").attributes("href")).toContain("Caf%C3%A9");
    wrapper.unmount();
  });

  it("does not drop the selected place when its detailed route metric arrives", async () => {
    const wrapper = mountOverlay();
    const firstPlace = wrapper.get("[data-place-id='cafe']");
    await firstPlace.trigger("click");

    await wrapper.setProps({
      walkingRoutes: {
        cafe: {
          id: "cafe",
          provider: "idfm-navitia",
          distanceMeters: 2_000,
          durationSeconds: 1_500,
          coordinates: [{ lon: 2.3, lat: 48.81 }, { lon: 2.31, lat: 48.82 }],
        },
      },
    });

    expect(wrapper.get("[data-place-id='cafe']").classes()).toContain("nearby-directory__place--selected");
    expect(wrapper.get("[data-place-id='cafe']").text()).toContain("25 min");
    wrapper.unmount();
  });
});

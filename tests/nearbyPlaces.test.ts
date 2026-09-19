import { describe, expect, it, vi } from "vitest";
import {
  buildNearbyPlacesQuery,
  loadNearbyPlaces,
  normalizeOverpassPlaces,
} from "../server/services/places/overpass";
import { createCurrentPlacesProvider } from "../src/services/places/currentPlacesProvider";
import { mergeNearbyPlaces } from "../src/features/nearby-stations/nearbyPlaces";
import { classifyPlacesRankingCategory } from "../src/services/places/compiledPlaces";
import {
  countNearbyPlaces,
  isNearbyPlaceCommerce,
  isNearbyPlaceVisibleInDirectory,
  isNearbyPlaceVisibleForGlobalLine,
  isNearbyPlaceVisibleOnMap,
  nearbyPlaceDisplayName,
  nearbyPlaceMarkerIconId,
  nearbyPlaceTypeKey,
  resolveNearbyPlaceGroupId,
} from "../src/features/nearby-stations/nearbyPlacePresentation";

describe("nearby OpenStreetMap places", () => {
  it("keeps every place returned by the Overpass fallback", async () => {
    const elements = Array.from({ length: 161 }, (_, index) => ({
      type: "node",
      id: 900000 + index,
      lat: 48.850001 + index * 0.000001,
      lon: 2.350001,
      tags: {
        name: `Commerce ${index}`,
        shop: "supermarket",
      },
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ elements }), {
        headers: { "content-type": "application/json" },
        status: 200,
      })),
    );

    await expect(loadNearbyPlaces(48.85, 2.35, 600)).resolves.toHaveLength(161);
  });

  it("queries named shops, amenities and visitor attractions around the map", () => {
    const query = buildNearbyPlacesQuery(48.8102, 2.2978, 600);
    expect(query).toContain("around:600,48.8102,2.2978");
    expect(query).toContain('["shop"]');
    expect(query).toContain("museum");
    expect(query).toContain("restaurant");
    expect(query).toContain('["leisure"');
    expect(query).toContain('["sport"]');
    expect(query).toContain("post_office");
    expect(query).toContain('["place"');
    expect(query).toContain('nwr(around:600,48.8102,2.2978)["sport"];');
  });

  it("normalizes node and building-centre POIs and keeps the closest unique place", () => {
    const places = normalizeOverpassPlaces([
      { type: "node", id: 1, lat: 48.8103, lon: 2.2979, tags: { name: "Intermarché", shop: "supermarket", "addr:street": "Rue Chateaubriand" } },
      { type: "way", id: 2, center: { lat: 48.811, lon: 2.298 }, tags: { name: "Musée local", tourism: "museum" } },
    ], { lat: 48.8102, lon: 2.2978 });

    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({ name: "Intermarché", category: "shop", kind: "supermarket" });
    expect(places[1]).toMatchObject({ name: "Musée local", category: "culture" });
    expect(places[0]!.distanceMeters).toBeLessThan(places[1]!.distanceMeters);
  });

  it("uses a shop brand when OpenStreetMap has no display name", () => {
    const places = normalizeOverpassPlaces([
      {
        type: "node",
        id: 3,
        lat: 48.8103,
        lon: 2.2979,
        tags: { brand: "La Vie Claire", shop: "health_food" },
      },
    ], { lat: 48.8102, lon: 2.2978 });

    expect(places[0]).toMatchObject({ name: "La Vie Claire", category: "shop", kind: "health_food" });
  });

  it("keeps unnamed sport features with a generic translated label", () => {
    const places = normalizeOverpassPlaces([{
      type: "way",
      id: 7,
      center: { lat: 48.8103, lon: 2.2979 },
      tags: { leisure: "pitch", sport: "tennis" },
    }], { lat: 48.8102, lon: 2.2978 });

    expect(places[0]).toMatchObject({
      name: "",
      genericNameKey: "nearbyStations.genericPlaceNames.tennisCourt",
      category: "attraction",
      kind: "tennis",
    });
    expect(nearbyPlaceDisplayName(places[0]!, (key) => key === "nearbyStations.genericPlaceNames.tennisCourt"
      ? "Terrain de tennis"
      : key)).toBe("Terrain de tennis");
  });

  it("normalizes named leisure and sport features for the directory and score", () => {
    const places = normalizeOverpassPlaces([
      {
        type: "way",
        id: 4,
        center: { lat: 48.8103, lon: 2.2979 },
        tags: { name: "Tennis Club local", leisure: "sports_centre", sport: "tennis" },
      },
      {
        type: "way",
        id: 5,
        center: { lat: 48.8104, lon: 2.298 },
        tags: { name: "Parc local", leisure: "park" },
      },
    ], { lat: 48.8102, lon: 2.2978 });

    expect(places).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Tennis Club local", category: "attraction", kind: "tennis" }),
      expect.objectContaining({ name: "Parc local", category: "attraction", kind: "park" }),
    ]));
    expect(resolveNearbyPlaceGroupId(places.find((place) => place.kind === "park")!)).toBe("green-spaces");
  });

  it("keeps OSM sport values in the leisure group instead of dropping them into other", () => {
    const place = normalizeOverpassPlaces([{
      type: "node",
      id: 6,
      lat: 48.8105,
      lon: 2.2981,
      tags: { name: "Stade local", sport: "soccer" },
    }], { lat: 48.8102, lon: 2.2978 })[0]!;

    expect(resolveNearbyPlaceGroupId(place)).toBe("toys-leisure");
    expect(nearbyPlaceTypeKey(place)).toBe("nearbyStations.placeTypes.sports");
  });

  it("uses specific translations for frequent OSM facility kinds before service fallback", () => {
    const cases = [
      ["social_facility", "nearbyStations.placeTypes.socialFacility"],
      ["parking_space", "nearbyStations.placeTypes.parkingSpace"],
      ["post_box", "nearbyStations.placeTypes.postBox"],
      ["place_of_worship", "nearbyStations.placeTypes.placeOfWorship"],
      ["bus_station", "nearbyStations.placeTypes.busStation"],
      ["convenience;gas", "nearbyStations.placeTypes.convenience"],
    ] as const;

    for (const [kind, expected] of cases) {
      expect(nearbyPlaceTypeKey({ category: "service", kind })).toBe(expected);
    }
  });

  it("uses semantic icons for nature, education, sport and culture POIs", () => {
    expect(nearbyPlaceMarkerIconId({ name: "Square des Lilas", category: "attraction", kind: "place" })).toBe("tree-pine");
    expect(nearbyPlaceMarkerIconId({ name: "Lycée Jean Moulin", category: "service", kind: "school" })).toBe("school");
    expect(nearbyPlaceMarkerIconId({ name: "Gymnase municipal", category: "attraction", kind: "sports_centre" })).toBe("dumbbell");
    expect(nearbyPlaceMarkerIconId({ name: "Bibliothèque de quartier", category: "culture", kind: "library" })).toBe("book-open");
  });

  it("uses specific icons for everyday facilities and health places", () => {
    expect(nearbyPlaceMarkerIconId({ category: "service", kind: "bench" })).toBe("armchair");
    expect(nearbyPlaceMarkerIconId({ category: "service", kind: "parking_space" })).toBe("circle-parking");
    expect(nearbyPlaceMarkerIconId({ category: "service", kind: "bank" })).toBe("banknote");
    expect(nearbyPlaceMarkerIconId({ category: "service", kind: "atm" })).toBe("wallet-cards");
    expect(nearbyPlaceMarkerIconId({ category: "service", kind: "veterinary" })).toBe("dog");
    expect(nearbyPlaceMarkerIconId({ category: "shop", kind: "books" })).toBe("book-open");
    expect(nearbyPlaceMarkerIconId({ category: "shop", kind: "cheese" })).toBe("milk");
    expect(nearbyPlaceMarkerIconId({ category: "shop", kind: "florist" })).toBe("flower-2");
    expect(nearbyPlaceMarkerIconId({ category: "service", kind: "post_box" })).toBe("mailbox");
    expect(nearbyPlaceMarkerIconId({ category: "service", kind: "doctors" })).toBe("cross");
  });

  it("keeps benches opt-in and removes waste baskets from every place surface", () => {
    const bench = { category: "service" as const, kind: "bench" };
    const wasteBasket = { category: "service" as const, kind: "waste_basket" };
    const shop = { category: "shop" as const, kind: "supermarket" };

    expect(isNearbyPlaceVisibleInDirectory(bench)).toBe(false);
    expect(isNearbyPlaceVisibleInDirectory(wasteBasket)).toBe(false);
    expect(isNearbyPlaceVisibleInDirectory(shop)).toBe(true);
    expect(isNearbyPlaceVisibleOnMap(bench)).toBe(false);
    expect(isNearbyPlaceVisibleOnMap(bench, true)).toBe(true);
    expect(isNearbyPlaceVisibleOnMap({ category: "service", kind: "parking" })).toBe(false);
    expect(isNearbyPlaceVisibleOnMap({ category: "service", kind: "parking" }, false, true)).toBe(true);
    expect(isNearbyPlaceVisibleOnMap(wasteBasket, true)).toBe(false);
  });

  it("keeps line-wide nearby results focused on places instead of transit fixtures", () => {
    expect(isNearbyPlaceVisibleForGlobalLine({ category: "service", kind: "shelter" })).toBe(false);
    expect(isNearbyPlaceVisibleForGlobalLine({ category: "attraction", kind: "information", name: "SNCF" })).toBe(false);
    expect(isNearbyPlaceVisibleForGlobalLine({ category: "service", kind: "vending_machine", name: "SNCF Voyageurs" })).toBe(false);
    expect(isNearbyPlaceVisibleForGlobalLine({ category: "shop", kind: "supermarket", name: "Lidl" })).toBe(true);
    expect(isNearbyPlaceVisibleForGlobalLine({ category: "attraction", kind: "park", name: "Square" })).toBe(true);
  });

  it("keeps the global line mode limited to weekend activities and excludes street infrastructure", () => {
    const excluded = [
      ["fountain", "service"],
      ["bench", "service"],
      ["recycling", "service"],
      ["recycling_centre", "service"],
      ["waste_disposal", "service"],
      ["parking", "service"],
      ["charging_station", "service"],
      ["post_office", "service"],
      ["doctors", "service"],
      ["police", "security"],
    ] as const;
    for (const [kind, category] of excluded) {
      expect(isNearbyPlaceVisibleForGlobalLine({ kind, category })).toBe(false);
    }
    expect(isNearbyPlaceVisibleForGlobalLine({ kind: "restaurant", category: "food" })).toBe(true);
    expect(isNearbyPlaceVisibleForGlobalLine({ kind: "sports_centre", category: "attraction", rankingCategory: "sports-leisure" })).toBe(true);
    expect(isNearbyPlaceVisibleForGlobalLine({ kind: "cinema", category: "culture" })).toBe(true);
    expect(isNearbyPlaceVisibleForGlobalLine({ kind: "park", category: "attraction", tags: { leisure: "park" } })).toBe(true);
  });

  it("counts all visible places and commercial venues separately for the directory summary", () => {
    expect(countNearbyPlaces([
      { category: "shop" },
      { category: "food" },
      { category: "attraction" },
      { category: "shop" },
    ])).toEqual({ total: 4, commerce: 3 });
  });

  it("classifies food venues as commerce across legacy and compiled records", () => {
    expect(isNearbyPlaceCommerce({ category: "food", kind: "restaurant" })).toBe(true);
    expect(isNearbyPlaceCommerce({ category: "food", kind: "cafe" })).toBe(true);
    expect(isNearbyPlaceCommerce({ category: "food", kind: "bar" })).toBe(true);
    expect(isNearbyPlaceCommerce({ category: "service", kind: "restaurant", tags: { amenity: "restaurant" } })).toBe(true);
    expect(isNearbyPlaceCommerce({ category: "attraction", kind: "hotel" })).toBe(false);
    expect(classifyPlacesRankingCategory({ amenity: "restaurant" })).toBe("commerce");
    expect(classifyPlacesRankingCategory({ amenity: "cafe" })).toBe("commerce");
    expect(classifyPlacesRankingCategory({ amenity: "bar" })).toBe("commerce");
  });

  it("merges neighborhood and city collections into one nearest canonical record", () => {
    const cityPlace = {
      id: "node:shared",
      name: "Commerce partagé",
      lon: 2.3,
      lat: 48.81,
      category: "shop" as const,
      kind: "supermarket",
      distanceMeters: 540,
    };
    const neighborhoodPlace = { ...cityPlace, distanceMeters: 120 };
    const additionalPlace = {
      id: "node:neighborhood-only",
      name: "Commerce retrouvé",
      lon: 2.301,
      lat: 48.811,
      category: "shop" as const,
      kind: "bakery",
      distanceMeters: 180,
    };

    expect(mergeNearbyPlaces([cityPlace], [neighborhoodPlace, additionalPlace])).toEqual([
      neighborhoodPlace,
      additionalPlace,
    ]);
  });

  it("keeps current destination and nearby API details behind the PlacesProvider port", async () => {
    const searchDestinationPoints = vi.fn(async () => [{
      id: "station:chatelet",
      lon: 2.3469765,
      lat: 48.861745,
      label: "Châtelet - Les Halles",
      type: "station" as const,
    }, {
      id: "poi:fnac",
      lon: 2.3469,
      lat: 48.8617,
      label: "Fnac",
      type: "place" as const,
      kind: "shop" as const,
      category: "shop" as const,
    }]);
    const autocomplete = vi.fn(async () => [{
      id: "place:chatelet",
      lon: 2.3469,
      lat: 48.8617,
      label: "Châtelet les Halles",
      type: "place" as const,
    }]);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      provider: "openstreetmap-overpass",
      places: [{
        id: "node:1",
        name: "Café test",
        lon: 2.3,
        lat: 48.81,
        category: "food",
        kind: "cafe",
        distanceMeters: 140,
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = createCurrentPlacesProvider({
      fetcher,
      geocoder: { autocomplete, geocode: autocomplete },
      searchDestinationPoints,
    });

    await expect(provider.searchDestinations("Châtelet les Halles", {
      includeStations: true,
      includePlaces: true,
      count: 8,
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "station:chatelet" }),
      expect.objectContaining({ id: "poi:fnac", kind: "shop", category: "shop" }),
      expect.objectContaining({ id: "place:chatelet" }),
    ]));
    await expect(provider.searchNearby({
      origin: { lon: 2.2978, lat: 48.8102 },
      radiusMeters: 2_500,
    })).resolves.toEqual([expect.objectContaining({ name: "Café test" })]);

    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("radius=2000"), expect.any(Object));
    expect(searchDestinationPoints).toHaveBeenCalledTimes(1);
    expect(autocomplete).toHaveBeenCalledTimes(1);
  });
});

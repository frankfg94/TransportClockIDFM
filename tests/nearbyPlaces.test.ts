import { describe, expect, it, vi } from "vitest";
import { buildNearbyPlacesQuery, normalizeOverpassPlaces } from "../server/services/places/overpass";
import { createCurrentPlacesProvider } from "../src/services/places/currentPlacesProvider";
import {
  countNearbyPlaces,
  nearbyPlaceMarkerIconId,
  nearbyPlaceTypeKey,
  resolveNearbyPlaceGroupId,
} from "../src/features/nearby-stations/nearbyPlacePresentation";

describe("nearby OpenStreetMap places", () => {
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

  it("uses semantic icons for nature, education, sport and culture POIs", () => {
    expect(nearbyPlaceMarkerIconId({ name: "Square des Lilas", category: "attraction", kind: "place" })).toBe("tree-pine");
    expect(nearbyPlaceMarkerIconId({ name: "Lycée Jean Moulin", category: "service", kind: "school" })).toBe("school");
    expect(nearbyPlaceMarkerIconId({ name: "Gymnase municipal", category: "attraction", kind: "sports_centre" })).toBe("dumbbell");
    expect(nearbyPlaceMarkerIconId({ name: "Bibliothèque de quartier", category: "culture", kind: "library" })).toBe("book-open");
  });

  it("counts all visible places and shops separately for the directory summary", () => {
    expect(countNearbyPlaces([
      { category: "shop" },
      { category: "food" },
      { category: "attraction" },
      { category: "shop" },
    ])).toEqual({ total: 4, commerce: 2 });
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

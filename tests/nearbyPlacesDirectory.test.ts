import { describe, expect, it } from "vitest";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";
import {
  filterAndGroupNearbyPlaces,
  nearbyPlaceGoogleMapsUrl,
  nearbyPlaceIsWithinWalkingMinutes,
  nearbyPlaceWalkingDistanceMeters,
  nearbyPlaceWalkingMinutes,
  normalizeNearbyPlaceText,
  resolveNearbyPlaceGroupId,
  walkingMinutesToMeters,
} from "../src/features/nearby-stations/nearbyPlacePresentation";

function place(overrides: Partial<NearbyPlace> = {}): NearbyPlace {
  return {
    id: overrides.id ?? "place:1",
    name: overrides.name ?? "Café des Arts",
    lon: overrides.lon ?? 2.3,
    lat: overrides.lat ?? 48.81,
    category: overrides.category ?? "food",
    kind: overrides.kind ?? "cafe",
    distanceMeters: overrides.distanceMeters ?? 320,
    address: overrides.address,
  };
}

describe("nearby place directory presentation", () => {
  it("converts the three walking presets with the shared 80 m/min convention", () => {
    expect(walkingMinutesToMeters(5)).toBe(400);
    expect(walkingMinutesToMeters(10)).toBe(800);
    expect(walkingMinutesToMeters(15)).toBe(1_200);
    expect(nearbyPlaceWalkingMinutes(place({ distanceMeters: 81 }))).toBe(2);
    expect(nearbyPlaceWalkingDistanceMeters(place({ distanceMeters: 320 }), {
      distanceMeters: 714,
      durationSeconds: 300,
    })).toBe(714);
    expect(nearbyPlaceWalkingMinutes(place({ distanceMeters: 320 }), {
      distanceMeters: 714,
      durationSeconds: 1_201,
    })).toBe(21);
    expect(nearbyPlaceWalkingMinutes(place({ distanceMeters: 320 }), undefined)).toBe(4);
  });

  it("uses the routed duration when deciding whether a place fits in ten minutes", () => {
    const maréchalLeclerc = place({
      id: "maréchal-leclerc",
      name: "Maréchal Leclerc",
      distanceMeters: 700,
    });

    expect(nearbyPlaceIsWithinWalkingMinutes(maréchalLeclerc, {
      distanceMeters: 700,
      durationSeconds: 900,
    }, 10)).toBe(false);
    expect(nearbyPlaceIsWithinWalkingMinutes(maréchalLeclerc, {
      distanceMeters: 700,
      durationSeconds: 600,
    }, 10)).toBe(true);
  });

  it("normalizes accents, case and punctuation for local search", () => {
    expect(normalizeNearbyPlaceText("  Beauté & CAFÉ—Paris  ")).toBe("beaute cafe paris");
  });

  it("filters before grouping and searches name, address, type and group labels", () => {
    const places = [
      place({ id: "cafe", name: "Café République", address: "Rue d'Alésia", distanceMeters: 250 }),
      place({ id: "museum", name: "Musée local", category: "culture", kind: "museum", distanceMeters: 650 }),
      place({ id: "far", name: "Café lointain", distanceMeters: 1_300 }),
    ];
    const groups = filterAndGroupNearbyPlaces({
      places,
      radiusMeters: 800,
      query: "musee",
      typeLabel: (entry) => entry.kind === "museum" ? "Musée" : "Café",
      groupLabel: (group) => group.id === "culture-leisure" ? "Culture et loisirs" : group.id,
      locale: "fr",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe("culture-leisure");
    expect(groups[0]?.places.map((entry) => entry.id)).toEqual(["museum"]);
  });

  it("keeps an explicitly selected place visible if its detailed route crosses the radius", () => {
    const selected = place({ id: "selected", distanceMeters: 300 });
    const groups = filterAndGroupNearbyPlaces({
      places: [selected],
      radiusMeters: 400,
      query: "",
      typeLabel: () => "Café",
      groupLabel: (group) => group.id,
      walkingDistance: () => 650,
      includePlaceIds: new Set([selected.id]),
    });

    expect(groups.flatMap((group) => group.places).map((entry) => entry.id)).toEqual(["selected"]);
  });

  it("sorts every returned place exactly once and keeps unknown kinds in Other", () => {
    const places = Array.from({ length: 160 }, (_, index) => place({
      id: `unknown:${index}`,
      name: `Lieu ${String(159 - index).padStart(3, "0")}`,
      category: "shop",
      kind: `unknown_${index}`,
      distanceMeters: index + 1,
    }));
    const groups = filterAndGroupNearbyPlaces({
      places,
      radiusMeters: 1_200,
      query: "",
      typeLabel: () => "Commerce",
      groupLabel: (group) => group.id,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe("other");
    expect(groups[0]?.places).toHaveLength(160);
    expect(new Set(groups[0]?.places.map((entry) => entry.id)).size).toBe(160);
    expect(resolveNearbyPlaceGroupId(place({ category: "shop", kind: "unlisted" }))).toBe("other");
  });

  it("routes the payload's specialist shop kinds to dedicated groups", () => {
    expect(resolveNearbyPlaceGroupId(place({ category: "shop", kind: "garden_centre" }))).toBe("home-garden");
    expect(resolveNearbyPlaceGroupId(place({ category: "shop", kind: "toys" }))).toBe("toys-leisure");
    expect(resolveNearbyPlaceGroupId(place({ category: "shop", kind: "car_repair" }))).toBe("auto-mobility");
    expect(resolveNearbyPlaceGroupId(place({ category: "shop", kind: "alcohol" }))).toBe("food-shopping");
    expect(resolveNearbyPlaceGroupId(place({ category: "shop", kind: "tobacco" }))).toBe("food-shopping");
    expect(resolveNearbyPlaceGroupId(place({ category: "shop", kind: "stationery" }))).toBe("daily-services");
    expect(resolveNearbyPlaceGroupId(place({ category: "shop", kind: "pet" }))).toBe("toys-leisure");
    expect(resolveNearbyPlaceGroupId(place({ category: "shop", kind: "vape" }))).toBe("food-shopping");
    expect(resolveNearbyPlaceGroupId(place({ category: "shop", kind: "bed" }))).toBe("home-garden");
    expect(resolveNearbyPlaceGroupId(place({ category: "shop", kind: "travel_agency" }))).toBe("daily-services");
    expect(resolveNearbyPlaceGroupId(place({ category: "shop", kind: "funeral_directors" }))).toBe("daily-services");
    expect(resolveNearbyPlaceGroupId(place({ category: "shop", kind: "haberdashery" }))).toBe("fashion-accessories");
  });

  it("builds a Google Maps query from the place name and address", () => {
    const url = nearbyPlaceGoogleMapsUrl(place({
      name: "Jardiland",
      address: "2 Rue Georges Méliès, Cormeilles-en-Parisis",
    }));

    expect(url).toBe(
      "https://www.google.com/maps/search/?api=1&query=Jardiland%2C%202%20Rue%20Georges%20M%C3%A9li%C3%A8s%2C%20Cormeilles-en-Parisis",
    );
  });

  it("adds the origin city when a place has only a street address", () => {
    const url = nearbyPlaceGoogleMapsUrl(place({
      name: "King Jouet",
      address: "8 avenue de la République",
    }), { city: "Cormeilles-en-Parisis" });

    expect(decodeURIComponent(url)).toContain("King Jouet, 8 avenue de la République, Cormeilles-en-Parisis");
  });
});

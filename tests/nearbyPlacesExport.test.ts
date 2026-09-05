import { describe, expect, it } from "vitest";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";
import {
  buildNearbyPlacesExportHtml,
  type NearbyPlacesExportCopy,
  type NearbyPlacesExportPayload,
  type NearbyPlacesExportSection,
} from "../src/features/nearby-stations/nearbyPlacesExport";

const copy: NearbyPlacesExportCopy = {
  locale: "fr",
  eyebrow: "À proximité",
  title: "Commerces & lieux autour de moi",
  searchLabel: "Rechercher",
  searchPlaceholder: "Rechercher…",
  summary: "1 lieu à moins de 10 minutes",
  summaryTemplate: "{count} lieu à moins de {minutes} minutes",
  resultsLabel: "Résultats",
  loading: "Chargement",
  error: "Erreur",
  noSubcategoryResults: "Aucun lieu dans cette sous-catégorie.",
  openInGoogleMaps: "Ouvrir dans Google Maps",
  radiusLabel: "Rayon de marche",
  fiveMinutes: "5 min",
  tenMinutes: "10 min",
  fifteenMinutes: "15 min",
  premiumRequired: "Version payante requise",
};

const places: NearbyPlace[] = [
  { id: "cafe", name: "Café République", lon: 2.3, lat: 48.81, category: "food", kind: "cafe", distanceMeters: 300, address: "12 rue de Paris" },
  { id: "far", name: "Lieu à 15 minutes", lon: 2.31, lat: 48.82, category: "culture", kind: "museum", distanceMeters: 1_100 },
];

const payload: NearbyPlacesExportPayload = {
  places,
  walkingMinutes: 15,
  originCity: "Clamart",
  query: "",
  selectedPlaceId: "cafe",
  walkingRoutes: {
    cafe: undefined,
    far: undefined,
  },
  walkingProgress: {
    "food-shopping": { completed: 1, total: 1, remaining: 0 },
  },
  loadingGroupIds: ["food-shopping"],
  initialPreloadGroupCount: 2,
  loading: false,
};

const sections: NearbyPlacesExportSection[] = [
  {
    id: "restaurants-cafes",
    label: "Restaurants & cafés",
    icon: "utensils",
    tone: "orange",
    expanded: true,
    places: [
      {
        id: "cafe",
        name: "Café République",
        type: "Café",
        address: "12 rue de Paris",
        distanceMeters: 300,
        walkingMinutes: 4,
        walkingTime: "4 min à pied",
        googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Caf%C3%A9",
        selected: true,
      },
    ],
  },
  {
    id: "culture-leisure",
    label: "Culture & loisirs",
    icon: "culture",
    tone: "purple",
    expanded: false,
    places: [
      {
        id: "far",
        name: "Lieu à 15 minutes",
        type: "Musée",
        distanceMeters: 1_100,
        walkingMinutes: 14,
        walkingTime: "14 min à pied",
        googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Lieu",
        selected: false,
      },
    ],
  },
];

describe("buildNearbyPlacesExportHtml", () => {
  it("exports the free dataset and locks the 15-minute radius", () => {
    const html = buildNearbyPlacesExportHtml(
      copy,
      payload,
      sections,
    );

    expect(html).toContain('data-radius="15" disabled aria-disabled="true"');
    expect(html).toContain("nearby-directory-export__lock-icon");
    expect(html).toContain("nearby-directory-export__group-toggle");
    expect(html).toContain("nearby-directory-export__group-icon-svg");
    expect(html).toContain("nearby-directory-export__place-icon-svg");
    expect(html).toContain("nearby-directory-export__chevron");
    expect(html).toContain("nearby-directory-export__group--orange");
    expect(html).toContain('nearby-directory-export__place-type">Café</span>');
    expect(html).not.toContain("12 rue de Paris</span>");
    expect(html).toContain("max-width: none");
    expect(html).toContain("grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr))");
    expect(html).toContain("grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr))");
    expect(html).toContain("@media (max-width: 420px)");
    expect(html).toContain("max-height: 40px");
    expect(html).toContain("height: 32px");
    expect(html).toContain("transition: grid-template-rows 220ms ease");
    expect(html).toContain("prefers-reduced-motion: reduce");
    expect(html).toContain("Version payante requise");
    expect(html).not.toContain("Ouvrir l’application");
    expect(html).not.toContain("Export sécurisé");
    expect(html).not.toContain("L’export contient les données disponibles");
    expect(html).toContain("Café République");
    expect(html).toContain("12 rue de Paris");
    expect(html).toContain('"id":"cafe"');
    expect(html).not.toContain("Lieu à 15 minutes");
    expect(html).not.toContain('"id":"far"');
    expect(html).not.toContain("2.31");
  });

  it("does not allow an unsafe map URL into the exported markup", () => {
    const unsafeSections = sections.map((section) => ({
      ...section,
      places: section.places.map((place) => ({
        ...place,
        googleMapsUrl: "javascript:alert('xss')",
      })),
    }));
    const html = buildNearbyPlacesExportHtml(copy, payload, unsafeSections);

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("alert");
  });

  it("keeps the full free dataset when the source view is currently set to 5 minutes", () => {
    const nearbyTenMinutePlace: NearbyPlace = {
      id: "market",
      name: "Marché Central",
      lon: 2.31,
      lat: 48.82,
      category: "shop",
      kind: "supermarket",
      distanceMeters: 720,
    };
    const html = buildNearbyPlacesExportHtml(
      copy,
      { ...payload, places: [places[0]!, nearbyTenMinutePlace], walkingMinutes: 5 },
      [
        sections[0]!,
        {
          id: "food-shopping",
          label: "Alimentation",
          icon: "basket",
          tone: "green",
          expanded: true,
          places: [{
            id: "market",
            name: "Marché Central",
            type: "Supermarché",
            distanceMeters: 720,
            walkingMinutes: 9,
            walkingTime: "9 min à pied",
            googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=March%C3%A9",
            selected: false,
          }],
        },
      ],
    );

    expect(html).toContain("Marché Central");
    expect(html).toContain('data-radius="5" class="is-active"');
    expect(html).toContain('data-radius="10"');
    expect(html).toContain('data-summary-template="{count} lieu à moins de {minutes} minutes"');
  });
});

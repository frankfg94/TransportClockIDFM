import { describe, expect, it } from "vitest";
import {
  GLOBAL_MAP_MARKERS_STORAGE_KEY,
  GLOBAL_MAP_MARKERS_STORAGE_VERSION,
  loadGlobalMapMarkers,
  normalizeGlobalMapMarker,
  persistGlobalMapMarkers,
} from "../src/features/line-map/globalMapMarkers";

function createStorage(): Storage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => { values.clear(); },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage & { values: Map<string, string> };
}

describe("global map markers storage", () => {
  it("normalizes valid markers and rejects invalid coordinates or names", () => {
    expect(normalizeGlobalMapMarker({
      id: "marker:home",
      name: "  Maison  ",
      address: "  Châtenay-Malabry ",
      lon: "2.27",
      lat: 48.766,
      icon: "home",
    })).toEqual({
      id: "marker:home",
      name: "Maison",
      address: "Châtenay-Malabry",
      lon: 2.27,
      lat: 48.766,
      icon: "home",
    });
    expect(normalizeGlobalMapMarker({ name: "", lon: 2.27, lat: 48.766 })).toBeUndefined();
    expect(normalizeGlobalMapMarker({ name: "Bad", lon: 181, lat: 48.766 })).toBeUndefined();
  });

  it("persists a versioned payload and ignores unsupported versions", () => {
    const storage = createStorage();
    const marker = {
      id: "marker:home",
      name: "Maison",
      lon: 2.27,
      lat: 48.766,
      icon: "home" as const,
    };

    persistGlobalMapMarkers([marker], storage);
    expect(JSON.parse(storage.getItem(GLOBAL_MAP_MARKERS_STORAGE_KEY) ?? "null")).toEqual({
      version: GLOBAL_MAP_MARKERS_STORAGE_VERSION,
      markers: [marker],
    });
    expect(loadGlobalMapMarkers(storage)).toEqual([marker]);

    storage.setItem(GLOBAL_MAP_MARKERS_STORAGE_KEY, JSON.stringify({ version: 99, markers: [marker] }));
    expect(loadGlobalMapMarkers(storage)).toEqual([]);
  });

  it("deduplicates marker ids while loading", () => {
    const storage = createStorage();
    storage.setItem(GLOBAL_MAP_MARKERS_STORAGE_KEY, JSON.stringify({
      version: GLOBAL_MAP_MARKERS_STORAGE_VERSION,
      markers: [
        { id: "marker:home", name: "Maison", lon: 2.27, lat: 48.766, icon: "home" },
        { id: "marker:home", name: "Autre nom", lon: 2.28, lat: 48.767, icon: "pin" },
      ],
    }));

    expect(loadGlobalMapMarkers(storage)).toEqual([{
      id: "marker:home",
      name: "Maison",
      lon: 2.27,
      lat: 48.766,
      icon: "home",
    }]);
  });

  it("round-trips a custom marker color", () => {
    const storage = createStorage();
    const marker = {
      id: "marker:orange",
      name: "Restaurant",
      lon: 2.27,
      lat: 48.766,
      icon: "restaurant" as const,
      color: "#ff7a00",
    };

    persistGlobalMapMarkers([marker], storage);

    expect(loadGlobalMapMarkers(storage)).toEqual([marker]);
  });

  it("round-trips hidden markers and dynamically selected Lucide icons", () => {
    const storage = createStorage();
    const marker = {
      id: "marker:hidden",
      name: "Repère masqué",
      lon: 2.27,
      lat: 48.766,
      icon: "AlarmClock" as const,
      isHidden: true,
    };

    expect(normalizeGlobalMapMarker(marker)).toEqual(marker);
    persistGlobalMapMarkers([marker], storage);
    expect(loadGlobalMapMarkers(storage)).toEqual([marker]);
  });
});

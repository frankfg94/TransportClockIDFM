import { describe, expect, it } from "vitest";
import {
  ADDRESS_BOOK_STORAGE_KEY,
  ADDRESS_BOOK_STORAGE_VERSION,
  LEGACY_GLOBAL_MAP_MARKERS_STORAGE_KEY,
  LEGACY_GLOBAL_MAP_MARKERS_STORAGE_VERSION,
  loadAddressBookState,
  normalizeAddressBookEntries,
  toAddressBookPoint,
} from "../src/features/address-book/addressBook";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

describe("address book storage", () => {
  it("keeps only one primary address and never promotes a marker", () => {
    const entries = normalizeAddressBookEntries([
      { id: "home", kind: "address", name: "Maison", lon: 2.2, lat: 48.8, icon: "home", isPrimary: true },
      { id: "work", kind: "address", name: "Travail", lon: 2.3, lat: 48.9, icon: "work", isPrimary: true },
      { id: "marker", kind: "marker", name: "Repère", lon: 2.4, lat: 48.7, icon: "pin", isPrimary: true },
    ]);

    expect(entries.filter((entry) => entry.isPrimary).map((entry) => entry.id)).toEqual(["home"]);
    expect(entries.find((entry) => entry.id === "marker")?.isPrimary).toBeUndefined();
  });

  it("keeps hidden entries and accepts canonical Lucide icon names", () => {
    const entries = normalizeAddressBookEntries([
      { id: "home", kind: "address", name: "Maison", lon: 2.2, lat: 48.8, icon: "MapPin", isHidden: true },
      { id: "marker", kind: "marker", name: "Repère", lon: 2.4, lat: 48.7, icon: "AlarmClock", isHidden: true },
      { id: "invalid", kind: "marker", name: "Invalide", lon: 2.5, lat: 48.6, icon: "map-pin" },
    ]);

    expect(entries.find((entry) => entry.id === "home")).toEqual(expect.objectContaining({
      icon: "MapPin",
      isHidden: true,
    }));
    expect(entries.find((entry) => entry.id === "marker")).toEqual(expect.objectContaining({
      icon: "AlarmClock",
      isHidden: true,
    }));
    expect(entries.find((entry) => entry.id === "invalid")?.icon).toBe("pin");
  });

  it("migrates the legacy global marker payload into address-book entries", () => {
    const storage = createStorage();
    storage.setItem(LEGACY_GLOBAL_MAP_MARKERS_STORAGE_KEY, JSON.stringify({
      version: LEGACY_GLOBAL_MAP_MARKERS_STORAGE_VERSION,
      markers: [{ id: "marker:home", name: "Maison", lon: 2.27, lat: 48.766, icon: "home" }],
    }));

    expect(loadAddressBookState(storage)).toEqual({
      migratedLegacy: true,
      state: {
        version: ADDRESS_BOOK_STORAGE_VERSION,
        entries: [{
          id: "marker:home",
          kind: "marker",
          name: "Maison",
          lon: 2.27,
          lat: 48.766,
          icon: "home",
        }],
      },
    });
  });

  it("normalizes a saved address as an autocomplete point", () => {
    const entry = normalizeAddressBookEntries([{
      id: "home",
      kind: "address",
      name: "Chez moi",
      address: "16 avenue de la République",
      city: "Paris",
      postcode: "75011",
      lon: 2.38,
      lat: 48.86,
      icon: "home",
      isPrimary: true,
    }])[0]!;

    expect(toAddressBookPoint(entry)).toEqual(expect.objectContaining({
      id: "home",
      label: "Chez moi",
      address: "16 avenue de la République",
      type: "address",
      provider: "address-book",
      addressBookPrimary: true,
    }));
  });

  it("keeps a safe custom marker color", () => {
    const entries = normalizeAddressBookEntries([{
      id: "favorite",
      kind: "marker",
      name: "Restaurant",
      lon: 2.38,
      lat: 48.86,
      icon: "restaurant",
      color: "#FF7A00",
    }]);

    expect(entries[0]?.color).toBe("#ff7a00");
    expect(normalizeAddressBookEntries([{
      id: "unsafe",
      kind: "marker",
      name: "Unsafe",
      lon: 2.38,
      lat: 48.86,
      icon: "pin",
      color: "red; background: url(evil)",
    }])[0]?.color).toBeUndefined();
  });

  it("reads the current versioned payload", () => {
    const storage = createStorage();
    storage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify({
      version: ADDRESS_BOOK_STORAGE_VERSION,
      entries: [{ id: "home", kind: "address", name: "Maison", lon: 2, lat: 48, icon: "home" }],
    }));

    expect(loadAddressBookState(storage).state.entries[0]?.name).toBe("Maison");
  });
});

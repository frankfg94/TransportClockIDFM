import { computed, effectScope, type ComputedRef } from "vue";
import { useLocalStorage } from "@vueuse/core";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";

export const ADDRESS_BOOK_STORAGE_KEY = "transport-clock.address-book.v1";
export const ADDRESS_BOOK_STORAGE_VERSION = 1 as const;
export const DEFAULT_ADDRESS_BOOK_MARKER_COLOR = "#5146ff";

/** Legacy key kept only for the one-time import and compatibility mirror. */
export const LEGACY_GLOBAL_MAP_MARKERS_STORAGE_KEY = "transport-clock.global-map-reperes.v1";
export const LEGACY_GLOBAL_MAP_MARKERS_STORAGE_VERSION = 1 as const;

export const ADDRESS_BOOK_MARKER_ICONS = [
  "pin",
  "home",
  "work",
  "shopping",
  "restaurant",
  "coffee",
  "star",
  "parking",
  "school",
  "hospital",
] as const;

export type AddressBookEntryKind = "address" | "marker";
/**
 * Quick-pick aliases are kept for backwards compatibility. Entries selected
 * from the full Lucide catalogue use the canonical export name (for example
 * `MapPin`).
 */
export type AddressBookMarkerIcon = string;

const DYNAMIC_MARKER_ICON_NAME = /^[A-Z][A-Za-z0-9]*$/;

export function normalizeAddressBookMarkerIcon(value: unknown): AddressBookMarkerIcon {
  const icon = typeof value === "string" ? value.trim() : "";
  if (!icon) return "pin";
  if ((ADDRESS_BOOK_MARKER_ICONS as readonly string[]).includes(icon)) return icon;
  return DYNAMIC_MARKER_ICON_NAME.test(icon) ? icon : "pin";
}

export interface AddressBookEntry {
  id: string;
  kind: AddressBookEntryKind;
  /** User-facing name, used as the nickname when one was provided. */
  name: string;
  address?: string;
  city?: string;
  postcode?: string;
  lon: number;
  lat: number;
  icon: AddressBookMarkerIcon;
  color?: string;
  isPrimary?: boolean;
  isHidden?: boolean;
}

export type AddressBookEntryInput = Omit<AddressBookEntry, "id" | "isPrimary"> & {
  id?: string;
  isPrimary?: boolean;
};

export interface AddressBookStorageState {
  version: typeof ADDRESS_BOOK_STORAGE_VERSION;
  entries: AddressBookEntry[];
}

export interface LoadedAddressBookState {
  state: AddressBookStorageState;
  migratedLegacy: boolean;
}

let entrySequence = 0;

export function createAddressBookEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `address-book-${crypto.randomUUID()}`;
  }
  entrySequence += 1;
  return `address-book-${Date.now()}-${entrySequence}`;
}

export function normalizeAddressBookColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const color = value.trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : undefined;
}

export function normalizeAddressBookEntry(value: unknown): AddressBookEntry | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<AddressBookEntry>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const lon = typeof candidate.lon === "number" ? candidate.lon : Number(candidate.lon);
  const lat = typeof candidate.lat === "number" ? candidate.lat : Number(candidate.lat);
  if (
    !name ||
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    lon < -180 ||
    lon > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    return undefined;
  }

  const kind: AddressBookEntryKind = candidate.kind === "marker" ? "marker" : "address";
  const icon = normalizeAddressBookMarkerIcon(candidate.icon);
  const color = normalizeAddressBookColor(candidate.color);
  const id = typeof candidate.id === "string" && candidate.id.trim()
    ? candidate.id.trim()
    : createAddressBookEntryId();
  const address = typeof candidate.address === "string" ? candidate.address.trim() : "";
  const city = typeof candidate.city === "string" ? candidate.city.trim() : "";
  const postcode = typeof candidate.postcode === "string" ? candidate.postcode.trim() : "";
  const isHidden = candidate.isHidden === true;

  return {
    id,
    kind,
    name,
    ...(address ? { address } : {}),
    ...(city ? { city } : {}),
    ...(postcode ? { postcode } : {}),
    lon,
    lat,
    icon,
    ...(color ? { color } : {}),
    ...(kind === "address" && candidate.isPrimary === true ? { isPrimary: true } : {}),
    ...(isHidden ? { isHidden: true } : {}),
  };
}

export function normalizeAddressBookEntries(values: unknown): AddressBookEntry[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  let primaryFound = false;
  return values
    .map(normalizeAddressBookEntry)
    .filter((entry): entry is AddressBookEntry => Boolean(entry))
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      if (entry.isPrimary) {
        if (primaryFound) {
          entry.isPrimary = false;
        } else {
          primaryFound = true;
        }
      }
      return true;
    });
}

export function loadAddressBookState(storage?: Storage): LoadedAddressBookState {
  const target = storage ?? getBrowserStorage();
  if (!target) return { state: emptyAddressBookState(), migratedLegacy: false };

  try {
    const currentRaw = target.getItem(ADDRESS_BOOK_STORAGE_KEY);
    if (currentRaw) {
      const parsed = JSON.parse(currentRaw) as unknown;
      const values = extractCurrentEntries(parsed);
      return {
        state: {
          version: ADDRESS_BOOK_STORAGE_VERSION,
          entries: normalizeAddressBookEntries(values),
        },
        migratedLegacy: false,
      };
    }

    const legacyRaw = target.getItem(LEGACY_GLOBAL_MAP_MARKERS_STORAGE_KEY);
    if (!legacyRaw) return { state: emptyAddressBookState(), migratedLegacy: false };
    const legacyEntries = readLegacyMarkers(legacyRaw);
    return {
      state: {
        version: ADDRESS_BOOK_STORAGE_VERSION,
        entries: legacyEntries,
      },
      migratedLegacy: legacyEntries.length > 0,
    };
  } catch {
    return { state: emptyAddressBookState(), migratedLegacy: false };
  }
}

export function persistAddressBookState(
  entries: readonly AddressBookEntry[],
  storage?: Storage,
): void {
  const target = storage ?? getBrowserStorage();
  if (!target) return;
  try {
    const state: AddressBookStorageState = {
      version: ADDRESS_BOOK_STORAGE_VERSION,
      entries: normalizeAddressBookEntries(entries.map((entry) => ({ ...entry }))),
    };
    target.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private browsing or a locked WebView.
  }
}

export function toAddressBookPoint(entry: AddressBookEntry): GeocoderPoint {
  return {
    id: entry.id,
    lon: entry.lon,
    lat: entry.lat,
    label: entry.name,
    ...(entry.address ? { address: entry.address } : {}),
    ...(entry.isPrimary ? { addressBookPrimary: true } : {}),
    ...(entry.city ? { city: entry.city } : {}),
    ...(entry.postcode ? { postcode: entry.postcode } : {}),
    provider: "address-book",
    type: "address",
  };
}

interface AddressBookStateApi {
  entries: ComputedRef<AddressBookEntry[]>;
  primaryAddress: ComputedRef<AddressBookEntry | undefined>;
  addEntry: (input: AddressBookEntryInput) => AddressBookEntry;
  updateEntry: (input: AddressBookEntry) => boolean;
  removeEntry: (id: string) => boolean;
  setPrimary: (id: string) => boolean;
  getEntry: (id: string) => AddressBookEntry | undefined;
  reloadFromStorage: () => void;
}

let singleton: { scope: ReturnType<typeof effectScope>; api: AddressBookStateApi } | undefined;

/**
 * Shared address-book state. A detached scope keeps the VueUse storage
 * watcher alive while SettingsPage and the map are mounted at different times.
 */
export function useAddressBook(): AddressBookStateApi {
  if (!singleton) singleton = createAddressBookState();
  singleton.api.reloadFromStorage();
  return singleton.api;
}

/** Useful for DOM tests and for a future account/session reset. */
export function resetAddressBookState(): void {
  singleton?.scope.stop();
  singleton = undefined;
}

function createAddressBookState(): { scope: ReturnType<typeof effectScope>; api: AddressBookStateApi } {
  const scope = effectScope(true);
  const api = scope.run(() => {
    const target = getBrowserStorage();
    const loaded = loadAddressBookState(target);
    const storage = useLocalStorage<AddressBookStorageState>(
      ADDRESS_BOOK_STORAGE_KEY,
      loaded.state,
      { deep: true },
    );

    if (loaded.migratedLegacy && target) {
      storage.value = loaded.state;
      try {
        target.removeItem(LEGACY_GLOBAL_MAP_MARKERS_STORAGE_KEY);
      } catch {
        // The new VueUse-backed value remains authoritative when cleanup fails.
      }
    }

    const entries = computed(() => normalizeAddressBookEntries(storage.value?.entries));
    const primaryAddress = computed(() => entries.value.find((entry) => entry.isPrimary));
    let lastRaw = target?.getItem(ADDRESS_BOOK_STORAGE_KEY) ?? null;

    function replaceEntries(nextEntries: readonly AddressBookEntry[]): void {
      const normalized = normalizeAddressBookEntries(nextEntries.map((entry) => ({ ...entry })));
      storage.value = {
        version: ADDRESS_BOOK_STORAGE_VERSION,
        entries: normalized,
      };
      lastRaw = target?.getItem(ADDRESS_BOOK_STORAGE_KEY) ?? null;
    }

    function reloadFromStorage(): void {
      if (!target) return;
      const raw = target.getItem(ADDRESS_BOOK_STORAGE_KEY);
      if (raw === lastRaw) return;
      const loadedCurrent = loadAddressBookState(target).state;
      storage.value = loadedCurrent;
      lastRaw = raw;
    }

    function addEntry(input: AddressBookEntryInput): AddressBookEntry {
      const entry = normalizeAddressBookEntry({ ...input, id: input.id ?? createAddressBookEntryId() });
      if (!entry) throw new Error("invalid-address-book-entry");
      const next = entry.isPrimary && entry.kind === "address"
        ? entries.value.map((candidate) => ({ ...candidate, isPrimary: false }))
        : entries.value.slice();
      replaceEntries([...next, entry]);
      return entry;
    }

    function updateEntry(input: AddressBookEntry): boolean {
      if (!entries.value.some((entry) => entry.id === input.id)) return false;
      const normalized = normalizeAddressBookEntry(input);
      if (!normalized) return false;
      const next = entries.value.map((entry) => entry.id === normalized.id ? normalized : entry);
      replaceEntries(normalized.isPrimary ? next.map((entry) => ({
        ...entry,
        isPrimary: entry.id === normalized.id && entry.kind === "address",
      })) : next);
      return true;
    }

    function removeEntry(id: string): boolean {
      const next = entries.value.filter((entry) => entry.id !== id);
      if (next.length === entries.value.length) return false;
      replaceEntries(next);
      return true;
    }

    function setPrimary(id: string): boolean {
      const targetEntry = entries.value.find((entry) => entry.id === id);
      if (!targetEntry || targetEntry.kind !== "address") return false;
      replaceEntries(entries.value.map((entry) => ({
        ...entry,
        isPrimary: entry.id === id,
      })));
      return true;
    }

    function getEntry(id: string): AddressBookEntry | undefined {
      return entries.value.find((entry) => entry.id === id);
    }

    return {
      entries,
      primaryAddress,
      addEntry,
      updateEntry,
      removeEntry,
      setPrimary,
      getEntry,
      reloadFromStorage,
    } satisfies AddressBookStateApi;
  });

  if (!api) throw new Error("address-book-state-unavailable");
  return { scope, api };
}

function emptyAddressBookState(): AddressBookStorageState {
  return { version: ADDRESS_BOOK_STORAGE_VERSION, entries: [] };
}

function extractCurrentEntries(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const candidate = value as { version?: unknown; entries?: unknown };
  return candidate.version === ADDRESS_BOOK_STORAGE_VERSION && Array.isArray(candidate.entries)
    ? candidate.entries
    : [];
}

function readLegacyMarkers(raw: string): AddressBookEntry[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const values = parsed && typeof parsed === "object" && "markers" in parsed
      ? (parsed as { markers?: unknown }).markers
      : parsed;
    if (!Array.isArray(values)) return [];
    return normalizeAddressBookEntries(values.map((value) => {
      if (!value || typeof value !== "object") return value;
      return { ...(value as Record<string, unknown>), kind: "marker" };
    }));
  } catch {
    return [];
  }
}

function getBrowserStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

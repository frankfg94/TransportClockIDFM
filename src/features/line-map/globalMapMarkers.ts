import { computed, type ComputedRef } from "vue";
import {
  ADDRESS_BOOK_MARKER_ICONS,
  DEFAULT_ADDRESS_BOOK_MARKER_COLOR,
  LEGACY_GLOBAL_MAP_MARKERS_STORAGE_KEY,
  LEGACY_GLOBAL_MAP_MARKERS_STORAGE_VERSION,
  normalizeAddressBookColor,
  normalizeAddressBookMarkerIcon,
  useAddressBook,
  type AddressBookEntryKind,
  type AddressBookMarkerIcon,
} from "../address-book/addressBook";

export const GLOBAL_MAP_MARKERS_STORAGE_KEY = LEGACY_GLOBAL_MAP_MARKERS_STORAGE_KEY;
export const GLOBAL_MAP_MARKERS_STORAGE_VERSION = LEGACY_GLOBAL_MAP_MARKERS_STORAGE_VERSION;
export const DEFAULT_GLOBAL_MAP_MARKER_COLOR = DEFAULT_ADDRESS_BOOK_MARKER_COLOR;
export const GLOBAL_MAP_MARKER_ICONS = ADDRESS_BOOK_MARKER_ICONS;
export type GlobalMapMarkerIcon = AddressBookMarkerIcon;

export interface GlobalMapMarker {
  id: string;
  name: string;
  address?: string;
  lon: number;
  lat: number;
  icon: GlobalMapMarkerIcon;
  color?: string;
  isHidden?: boolean;
}

interface StoredGlobalMapMarkers {
  version: typeof GLOBAL_MAP_MARKERS_STORAGE_VERSION;
  markers: unknown;
}

let markerSequence = 0;

export function normalizeGlobalMapMarker(value: unknown): GlobalMapMarker | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<GlobalMapMarker>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const lon = typeof candidate.lon === "number" ? candidate.lon : Number(candidate.lon);
  const lat = typeof candidate.lat === "number" ? candidate.lat : Number(candidate.lat);
  const icon = normalizeAddressBookMarkerIcon(candidate.icon);
  const color = normalizeAddressBookColor(candidate.color);
  if (!name || !Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    return undefined;
  }

  const id = typeof candidate.id === "string" && candidate.id.trim()
    ? candidate.id.trim()
    : createGlobalMapMarkerId();
  const address = typeof candidate.address === "string" ? candidate.address.trim() : "";
  const isHidden = candidate.isHidden === true;
  return {
    id,
    name,
    ...(address ? { address } : {}),
    lon,
    lat,
    icon,
    ...(color ? { color } : {}),
    ...(isHidden ? { isHidden: true } : {}),
  };
}

export function loadGlobalMapMarkers(storage?: Storage): GlobalMapMarker[] {
  const target = storage ?? getBrowserStorage();
  if (!target) return [];
  try {
    const raw = target.getItem(GLOBAL_MAP_MARKERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredGlobalMapMarkers | unknown;
    const values = parsed && typeof parsed === "object" && "version" in parsed && "markers" in parsed
      ? (parsed as StoredGlobalMapMarkers).version === GLOBAL_MAP_MARKERS_STORAGE_VERSION
        ? (parsed as StoredGlobalMapMarkers).markers
        : []
      : parsed;
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    return values
      .map(normalizeGlobalMapMarker)
      .filter((marker): marker is GlobalMapMarker => Boolean(marker))
      .filter((marker) => {
        if (seen.has(marker.id)) return false;
        seen.add(marker.id);
        return true;
      });
  } catch {
    return [];
  }
}

export function persistGlobalMapMarkers(markers: readonly GlobalMapMarker[], storage?: Storage): void {
  const target = storage ?? getBrowserStorage();
  if (!target) return;
  try {
    const payload: StoredGlobalMapMarkers = {
      version: GLOBAL_MAP_MARKERS_STORAGE_VERSION,
      markers: markers.map((marker) => ({ ...marker })),
    };
    target.setItem(GLOBAL_MAP_MARKERS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be unavailable in private browsing or a locked WebView.
  }
}

export function createGlobalMapMarkerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `marker-${crypto.randomUUID()}`;
  }
  markerSequence += 1;
  return `marker-${Date.now()}-${markerSequence}`;
}

export function useGlobalMapMarkers(): {
  markers: ComputedRef<GlobalMapMarker[]>;
  markerById: ComputedRef<Record<string, GlobalMapMarker>>;
  addMarker: (marker: Omit<GlobalMapMarker, "id">) => GlobalMapMarker;
  updateMarker: (marker: GlobalMapMarker) => boolean;
  removeMarker: (id: string) => boolean;
} {
  const addressBook = useAddressBook();
  const markers = computed(() => addressBook.entries.value
    .filter((entry) => !entry.isHidden)
    .map(toGlobalMapMarker));
  const markerById = computed(() => Object.fromEntries(markers.value.map((marker) => [marker.id, marker])));

  function addMarker(input: Omit<GlobalMapMarker, "id">): GlobalMapMarker {
    const marker = normalizeGlobalMapMarker({ ...input, id: createGlobalMapMarkerId() });
    if (!marker) throw new Error("invalid-global-map-marker");
    addressBook.addEntry({ ...marker, kind: "marker" });
    persistLegacyMarkerMirror(addressBook.entries.value);
    return marker;
  }

  function updateMarker(input: GlobalMapMarker): boolean {
    const marker = normalizeGlobalMapMarker(input);
    if (!marker) return false;
    const existing = addressBook.getEntry(marker.id);
    if (!existing) return false;
    const updated = addressBook.updateEntry({
      ...marker,
      kind: existing.kind,
      ...(existing.city ? { city: existing.city } : {}),
      ...(existing.postcode ? { postcode: existing.postcode } : {}),
      ...(marker.color ? { color: marker.color } : existing.color ? { color: existing.color } : {}),
      ...(existing.isPrimary ? { isPrimary: true } : {}),
      ...(marker.isHidden || existing.isHidden ? { isHidden: true } : {}),
    });
    if (updated) persistLegacyMarkerMirror(addressBook.entries.value);
    return updated;
  }

  function removeMarker(id: string): boolean {
    const removed = addressBook.removeEntry(id);
    if (removed) persistLegacyMarkerMirror(addressBook.entries.value);
    return removed;
  }

  return { markers, markerById, addMarker, updateMarker, removeMarker };
}

function toGlobalMapMarker(entry: {
  id: string;
  name: string;
  address?: string;
  lon: number;
  lat: number;
  icon: GlobalMapMarkerIcon;
  color?: string;
  isHidden?: boolean;
}): GlobalMapMarker {
  return {
    id: entry.id,
    name: entry.name,
    ...(entry.address ? { address: entry.address } : {}),
    lon: entry.lon,
    lat: entry.lat,
    icon: entry.icon,
    ...(entry.color ? { color: entry.color } : {}),
    ...(entry.isHidden ? { isHidden: true } : {}),
  };
}

function persistLegacyMarkerMirror(
  entries: readonly ({
    kind: AddressBookEntryKind;
    id: string;
    name: string;
    address?: string;
    lon: number;
    lat: number;
    icon: GlobalMapMarkerIcon;
    color?: string;
    isHidden?: boolean;
  })[],
): void {
  persistGlobalMapMarkers(
    entries
      .filter((entry) => entry.kind === "marker")
      .map(toGlobalMapMarker),
  );
}

function getBrowserStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

import { defineAsyncComponent, type Component } from "vue";
import {
  Briefcase,
  Coffee,
  Cross,
  Home,
  MapPin,
  ParkingSquare,
  ShoppingBag,
  School,
  Star,
  Utensils,
} from "lucide-vue-next";
import type { GlobalMapMarkerIcon } from "./globalMapMarkers";

export const GLOBAL_MAP_MARKER_ICON_COMPONENTS: Readonly<Record<GlobalMapMarkerIcon, Component>> = {
  pin: MapPin,
  home: Home,
  work: Briefcase,
  shopping: ShoppingBag,
  restaurant: Utensils,
  coffee: Coffee,
  star: Star,
  parking: ParkingSquare,
  school: School,
  hospital: Cross,
};

export interface GlobalMapMarkerIconOption {
  name: GlobalMapMarkerIcon;
  label: string;
  component: Component;
}

type LucideIconLibrary = Readonly<Record<string, Component>>;

let iconLibraryPromise: Promise<LucideIconLibrary> | undefined;
const asyncIconComponents = new Map<string, Component>();

/** Loads the complete Lucide catalogue only when a non-quick icon is needed. */
export function loadGlobalMapMarkerIconLibrary(): Promise<LucideIconLibrary> {
  if (!iconLibraryPromise) {
    iconLibraryPromise = import("lucide-vue-next")
      .then((module) => Object.fromEntries(
        Object.entries(module.icons).filter(([, component]) => typeof component === "function"),
      ) as LucideIconLibrary)
      .catch((error: unknown) => {
        iconLibraryPromise = undefined;
        throw error;
      });
  }
  return iconLibraryPromise;
}

export async function loadGlobalMapMarkerIconOptions(): Promise<GlobalMapMarkerIconOption[]> {
  const library = await loadGlobalMapMarkerIconLibrary();
  return Object.entries(library)
    .sort(([left], [right]) => left.localeCompare(right, "en-US"))
    .map(([name, component]) => ({
      name,
      label: humanizeGlobalMapMarkerIconName(name),
      component,
    }));
}

export function humanizeGlobalMapMarkerIconName(name: string): string {
  return name
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns a stable component and falls back to MapPin for invalid values. */
export function resolveGlobalMapMarkerIcon(icon: GlobalMapMarkerIcon): Component {
  const quickIcon = GLOBAL_MAP_MARKER_ICON_COMPONENTS[icon];
  if (quickIcon) return quickIcon;

  const cached = asyncIconComponents.get(icon);
  if (cached) return cached;

  const asyncIcon = defineAsyncComponent({
    loader: async () => {
      const library = await loadGlobalMapMarkerIconLibrary();
      return library[icon] ?? GLOBAL_MAP_MARKER_ICON_COMPONENTS.pin;
    },
    loadingComponent: GLOBAL_MAP_MARKER_ICON_COMPONENTS.pin,
    errorComponent: GLOBAL_MAP_MARKER_ICON_COMPONENTS.pin,
    suspensible: false,
  });
  asyncIconComponents.set(icon, asyncIcon);
  return asyncIcon;
}

import type { Component } from "vue";
import {
  Apple,
  BookOpen,
  Car,
  Cross,
  Croissant,
  Dumbbell,
  Drama,
  Ear,
  Film,
  Glasses,
  Ham,
  Landmark,
  Laptop,
  Scissors,
  School,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Utensils,
  WashingMachine,
  TreePine,
  Skull,
} from "lucide-vue-next";
import { useI18n, type TranslationKey } from "../../i18n";
import {
  nearbyPlaceHasKnownType,
  nearbyPlaceMarkerIconId,
  nearbyPlaceTypeKey,
  type NearbyPlaceMarkerIconId,
  type NearbyPlacePresentationSource,
} from "./nearbyPlacePresentation";

export interface NearbyPlacePresenterInput extends NearbyPlacePresentationSource {
  id?: string;
  label?: string;
  name?: string;
}

export interface NearbyPlacePresentation {
  name: string;
  typeKey: TranslationKey;
  typeLabel: string;
  iconId: NearbyPlaceMarkerIconId;
  icon: Component;
}

// This is the single provider-independent mapping from a presentation id to
// an actual UI icon. NearbyStationsMap and the global map search only consume
// the presenter result and never maintain their own icon tables.
const PLACE_ICON_COMPONENTS: Readonly<Record<NearbyPlaceMarkerIconId, Component>> = {
  car: Car,
  "washing-machine": WashingMachine,
  film: Film,
  ear: Ear,
  sparkles: Sparkles,
  drama: Drama,
  glasses: Glasses,
  skull: Skull,
  "shopping-bag": ShoppingBag,
  apple: Apple,
  scissors: Scissors,
  laptop: Laptop,
  cross: Cross,
  "shopping-cart": ShoppingCart,
  shirt: Shirt,
  croissant: Croissant,
  ham: Ham,
  utensils: Utensils,
  landmark: Landmark,
  "tree-pine": TreePine,
  school: School,
  dumbbell: Dumbbell,
  "book-open": BookOpen,
};

export function useNearbyPlacePresenter() {
  const { t } = useI18n();

  function presentPlace(place: NearbyPlacePresenterInput): NearbyPlacePresentation {
    const iconId = nearbyPlaceMarkerIconId(place);
    const typeKey = nearbyPlaceHasKnownType(place)
      ? nearbyPlaceTypeKey(place)
      : "globalMap.search.unknownPlaceType";

    return {
      name: place.name?.trim() || place.label?.trim() || place.id || t("globalMap.search.placeType"),
      typeKey,
      typeLabel: t(typeKey),
      iconId,
      icon: PLACE_ICON_COMPONENTS[iconId],
    };
  }

  return { presentPlace };
}

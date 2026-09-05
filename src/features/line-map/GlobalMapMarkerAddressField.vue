<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { LoaderCircle, MapPin, Search, Store, TrainFront } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import { createIgnTransportMapGeocoder } from "../../services/geocoding/ign";

const props = withDefaults(defineProps<{
  open: boolean;
  point?: Pick<GeocoderPoint, "lon" | "lat">;
  address?: string;
  label?: string;
  placeholder?: string;
  search?: (query: string, signal?: AbortSignal) => Promise<GeocoderPoint[]>;
  geocode?: (query: string, signal?: AbortSignal) => Promise<GeocoderPoint[]>;
  reverseGeocode?: (
    point: Pick<GeocoderPoint, "lon" | "lat">,
    signal?: AbortSignal,
  ) => Promise<GeocoderPoint[]>;
}>(), {
  address: "",
  label: "",
  placeholder: "",
});

const emit = defineEmits<{
  "update:address": [address: string];
  "update:point": [point: GeocoderPoint | undefined];
  "resolved-address": [address: string];
}>();

const { t } = useI18n();
const geocoder = createIgnTransportMapGeocoder();
const query = ref(props.address);
const suggestions = ref<GeocoderPoint[]>([]);
const selectedPoint = ref<GeocoderPoint>();
const loading = ref(false);
const resolvingCoordinates = ref(false);
const error = ref("");
const inputContainer = ref<HTMLElement>();
const suggestionsStyle = ref<Record<string, string>>({});
let timer: number | undefined;
let requestController: AbortController | undefined;
let reverseController: AbortController | undefined;
let requestToken = 0;
let reverseToken = 0;
let pointSignature = "";

watch(
  () => [props.open, props.point?.lon, props.point?.lat, props.address] as const,
  ([open, lon, lat, externalAddress], previous) => {
    if (!open || lon === undefined || lat === undefined) return;

    const nextSignature = `${lon}:${lat}`;
    const opening = previous?.[0] !== true;
    if (nextSignature !== pointSignature || opening) {
      pointSignature = nextSignature;
      query.value = externalAddress?.trim() ?? "";
      selectedPoint.value = undefined;
      suggestions.value = [];
      error.value = "";
      void resolveReadableAddress({ lon, lat });
      return;
    }

    if (externalAddress !== undefined && externalAddress !== query.value) {
      query.value = externalAddress;
    }
  },
  { immediate: true },
);

function searchPoints(value: string, signal?: AbortSignal): Promise<GeocoderPoint[]> {
  if (props.search) return props.search(value, signal);
  return geocoder.autocomplete
    ? geocoder.autocomplete(value, signal)
    : geocoder.geocode(value, signal);
}

function resolvePoints(value: string, signal?: AbortSignal): Promise<GeocoderPoint[]> {
  return props.geocode
    ? props.geocode(value, signal)
    : geocoder.geocode(value, signal);
}

async function resolveReadableAddress(point: Pick<GeocoderPoint, "lon" | "lat">): Promise<void> {
  const reverseGeocode = props.reverseGeocode ?? geocoder.reverseGeocode;
  if (query.value.trim() || !reverseGeocode) return;

  const token = ++reverseToken;
  reverseController?.abort();
  const controller = new AbortController();
  reverseController = controller;
  resolvingCoordinates.value = true;

  try {
    const result = (await reverseGeocode(point, controller.signal))[0];
    if (token !== reverseToken || controller.signal.aborted) return;
    const label = result?.label?.trim();
    if (!label || pointSignature !== `${point.lon}:${point.lat}` || query.value.trim()) return;
    query.value = label;
    emit("update:address", label);
    emit("resolved-address", label);
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") return;
    // The exact clicked coordinates remain the safe fallback when reverse
    // geocoding is unavailable.
  } finally {
    if (token === reverseToken) resolvingCoordinates.value = false;
  }
}

function scheduleSuggestions(): void {
  reverseToken += 1;
  reverseController?.abort();
  resolvingCoordinates.value = false;
  emit("update:address", query.value);
  selectedPoint.value = undefined;
  emit("update:point", undefined);
  suggestions.value = [];
  error.value = "";
  if (timer !== undefined) window.clearTimeout(timer);

  const value = query.value.trim();
  if (value.length < 3) return;
  timer = window.setTimeout(() => void loadSuggestions(value), 220);
}

async function loadSuggestions(value: string): Promise<void> {
  const token = ++requestToken;
  requestController?.abort();
  const controller = new AbortController();
  requestController = controller;
  loading.value = true;
  try {
    const results = await searchPoints(value, controller.signal);
    if (token === requestToken) {
      suggestions.value = results;
      if (results.length > 0) {
        await nextTick();
        updateSuggestionsPosition();
      } else {
        suggestionsStyle.value = {};
      }
    }
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") return;
    if (token === requestToken) error.value = t("nearbyStations.errors.geocodingUnavailable");
  } finally {
    if (token === requestToken) loading.value = false;
  }
}

async function resolveAddress(): Promise<GeocoderPoint | undefined> {
  const value = query.value.trim();
  if (!value) {
    emit("update:point", undefined);
    return undefined;
  }

  const selected = selectedPoint.value;
  if (selected && normalizeAddress(selected.label) === normalizeAddress(value)) return selected;

  const token = ++requestToken;
  requestController?.abort();
  const controller = new AbortController();
  requestController = controller;
  loading.value = true;
  error.value = "";
  try {
    const result = (await resolvePoints(value, controller.signal))[0];
    if (token !== requestToken || controller.signal.aborted) return undefined;
    if (!result) {
      error.value = t("nearbyStations.errors.addressNotFound");
      return undefined;
    }
    select(result);
    return result;
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") return undefined;
    if (token === requestToken) error.value = t("nearbyStations.errors.geocodingUnavailable");
    return undefined;
  } finally {
    if (token === requestToken) loading.value = false;
  }
}

function select(point: GeocoderPoint): void {
  selectedPoint.value = point;
  query.value = point.label ?? query.value;
  suggestions.value = [];
  suggestionsStyle.value = {};
  error.value = "";
  emit("update:address", query.value);
  emit("update:point", point);
}

function updateSuggestionsPosition(): void {
  if (!suggestions.value.length || !inputContainer.value || typeof window === "undefined") return;

  const rect = inputContainer.value.getBoundingClientRect();
  const viewportGutter = 8;
  const width = Math.min(rect.width, Math.max(0, window.innerWidth - viewportGutter * 2));
  const left = Math.min(
    Math.max(viewportGutter, rect.left),
    Math.max(viewportGutter, window.innerWidth - viewportGutter - width),
  );
  const estimatedHeight = Math.min(220, suggestions.value.length * 52 + 12);
  const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportGutter);
  const spaceAbove = Math.max(0, rect.top - viewportGutter);
  const openAbove = spaceBelow < Math.min(estimatedHeight, 140) && spaceAbove > spaceBelow;

  suggestionsStyle.value = {
    position: "fixed",
    left: `${left}px`,
    right: "auto",
    width: `${width}px`,
    zIndex: "1200",
    ...(openAbove
      ? {
          top: "auto",
          bottom: `${window.innerHeight - rect.top + 2}px`,
          maxHeight: `${Math.max(40, Math.min(220, spaceAbove))}px`,
        }
      : {
          top: `${rect.bottom + 2}px`,
          bottom: "auto",
          maxHeight: `${Math.max(40, Math.min(220, spaceBelow))}px`,
        }),
  };
}

function normalizeAddress(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

defineExpose({ resolveAddress });

onMounted(() => {
  window.addEventListener("resize", updateSuggestionsPosition);
  window.addEventListener("scroll", updateSuggestionsPosition, true);
});

onBeforeUnmount(() => {
  if (timer !== undefined) window.clearTimeout(timer);
  requestController?.abort();
  reverseController?.abort();
  window.removeEventListener("resize", updateSuggestionsPosition);
  window.removeEventListener("scroll", updateSuggestionsPosition, true);
});
</script>

<template>
  <div class="global-map-marker-address-field" role="search">
    <label v-if="label">{{ label }}</label>
    <div ref="inputContainer" class="global-map-marker-address-field__input">
      <Search :size="17" aria-hidden="true" />
      <input
        v-model="query"
        type="search"
        autocomplete="street-address"
        :placeholder="placeholder || t('globalMap.markers.addressPlaceholder')"
        :aria-label="label || t('globalMap.markers.addressLabel')"
        @input="scheduleSuggestions"
        @keydown.enter.prevent="void resolveAddress()"
      />
      <LoaderCircle v-if="loading || resolvingCoordinates" class="global-map-marker-address-field__spinner" :size="16" aria-hidden="true" />
    </div>
    <Teleport to="body">
      <ul v-if="suggestions.length" :style="suggestionsStyle" class="global-map-marker-address-field__suggestions">
        <li v-for="suggestion in suggestions" :key="suggestion.id ?? `${suggestion.lon}:${suggestion.lat}`">
          <button type="button" @click="select(suggestion)">
            <TrainFront v-if="suggestion.type === 'station'" :size="15" aria-hidden="true" />
            <Store v-else-if="suggestion.type === 'place'" :size="15" aria-hidden="true" />
            <MapPin v-else :size="15" aria-hidden="true" />
            <span>
              <strong>{{ suggestion.label }}</strong>
              <small v-if="suggestion.type === 'station'">{{ t("nearbyStations.travel.stationType") }}</small>
              <small v-else-if="suggestion.type === 'place'">{{ t("nearbyStations.travel.placeType") }}</small>
              <small v-else-if="suggestion.city">{{ suggestion.city }}</small>
            </span>
          </button>
        </li>
      </ul>
    </Teleport>
    <small v-if="error" class="global-map-marker-address-field__error" role="alert">{{ error }}</small>
  </div>
</template>

<style scoped>
.global-map-marker-address-field { display: grid; gap: 6px; position: relative; }
.global-map-marker-address-field > label { color: #475569; font-size: .76rem; font-weight: 850; }
.global-map-marker-address-field__input { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.16); border-radius: 9px; display: flex; gap: 8px; min-height: 42px; padding: 0 10px; }
.global-map-marker-address-field__input:focus-within { border-color: #5146ff; box-shadow: 0 0 0 3px rgba(81,70,255,.12); }
.global-map-marker-address-field__input > svg { color: #5146ff; flex: 0 0 auto; }
.global-map-marker-address-field input { background: transparent; border: 0; color: #18233f; font: inherit; min-width: 0; outline: 0; width: 100%; }
.global-map-marker-address-field__suggestions { background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 10px; box-shadow: 0 10px 25px rgba(15,23,42,.16); left: 0; list-style: none; margin: 2px 0 0; max-height: 220px; overflow: auto; padding: 5px; position: fixed; right: auto; top: 0; z-index: 1200; }
.global-map-marker-address-field__suggestions button { align-items: center; background: transparent; border: 0; border-radius: 8px; color: #18233f; display: flex; gap: 8px; justify-content: flex-start; min-height: 0; padding: 8px; text-align: left; width: 100%; }
.global-map-marker-address-field__suggestions button:hover { background: #f1f0ff; color: #18233f; transform: none; }
.global-map-marker-address-field__suggestions span { display: grid; justify-items: start; min-width: 0; text-align: left; width: 100%; }
.global-map-marker-address-field__suggestions strong { display: block; font-size: .76rem; overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
.global-map-marker-address-field__suggestions small, .global-map-marker-address-field__error { color: #64748b; font-size: .66rem; text-align: left; }
.global-map-marker-address-field__error { color: #b42318; }
.global-map-marker-address-field__spinner { animation: global-map-marker-address-spin 850ms linear infinite; }
@keyframes global-map-marker-address-spin { to { transform: rotate(360deg); } }
</style>

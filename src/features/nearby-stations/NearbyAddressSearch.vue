<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { LoaderCircle, MapPin, Search, Store, TrainFront } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import { createIgnTransportMapGeocoder } from "./geocoding";

const props = defineProps<{
  modelValue?: GeocoderPoint;
  label?: string;
  placeholder?: string;
  search?: (query: string, signal?: AbortSignal) => Promise<GeocoderPoint[]>;
  reverseGeocode?: (
    point: Pick<GeocoderPoint, "lon" | "lat">,
    signal?: AbortSignal,
  ) => Promise<GeocoderPoint[]>;
  /** Resolve a device/coordinate-only origin into a readable address for display. */
  humanizeCoordinates?: boolean;
  /** Keep place/POI suggestions optional for consumers that only want addresses. */
  autocompletePlaces?: boolean;
  /** User-saved address suggestions, already ordered by the caller. */
  savedSuggestions?: readonly GeocoderPoint[];
}>();
const emit = defineEmits<{ "update:modelValue": [point: GeocoderPoint] }>();
const { t } = useI18n();
const geocoder = createIgnTransportMapGeocoder();
const query = ref(props.modelValue?.label ?? "");
const suggestions = ref<GeocoderPoint[]>([]);
const focused = ref(false);
const loading = ref(false);
const error = ref("");
const resolvingCoordinates = ref(false);
let timer: number | undefined;
let controller: AbortController | undefined;
let reverseController: AbortController | undefined;
let token = 0;
let reverseToken = 0;
let blurTimer: number | undefined;

function searchPoints(value: string, signal?: AbortSignal): Promise<GeocoderPoint[]> {
  if (props.search) return props.search(value, signal);
  return geocoder.autocomplete
    ? geocoder.autocomplete(value, signal)
    : geocoder.geocode(value, signal);
}

function filterSuggestions(points: GeocoderPoint[]): GeocoderPoint[] {
  return props.autocompletePlaces === false
    ? points.filter((point) => point.type !== "place")
    : points;
}

function normalizedSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .trim();
}

function isMatchingSavedSuggestion(point: GeocoderPoint, value: string): boolean {
  const normalized = normalizedSearchValue(value);
  if (!normalized) return true;
  return [point.label, point.address, point.city, point.postcode]
    .filter((candidate): candidate is string => Boolean(candidate))
    .some((candidate) => normalizedSearchValue(candidate).includes(normalized));
}

function savedSuggestionsFor(value: string): GeocoderPoint[] {
  return props.savedSuggestions
    ?.filter((point) => isMatchingSavedSuggestion(point, value))
    .slice(0, 8)
    ?? [];
}

function mergeSuggestions(local: GeocoderPoint[], remote: GeocoderPoint[]): GeocoderPoint[] {
  const seen = new Set<string>();
  return [...local, ...filterSuggestions(remote)].filter((point) => {
    const key = point.id ?? `${point.lon}:${point.lat}:${point.label ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

watch(() => props.modelValue?.label, (label) => {
  if (label && label !== query.value) query.value = label;
});

watch(
  () => [
    props.modelValue?.id,
    props.modelValue?.lon,
    props.modelValue?.lat,
    props.modelValue?.label,
    props.modelValue?.provider,
    props.humanizeCoordinates,
  ],
  () => { void humanizeCoordinateLabel(); },
);

function isCoordinateOnlyLabel(value?: string): boolean {
  const parts = value?.trim().split(",").map((part) => Number(part.trim()));
  return parts?.length === 2
    && parts.every((part) => Number.isFinite(part))
    && Math.abs(parts[0]!) <= 90
    && Math.abs(parts[1]!) <= 180;
}

function shouldHumanizeCoordinates(point?: GeocoderPoint): boolean {
  if (!props.humanizeCoordinates || !point) return false;
  return point.provider === "device" || isCoordinateOnlyLabel(point.label);
}

function cancelCoordinateResolution(): void {
  reverseToken += 1;
  reverseController?.abort();
  reverseController = undefined;
  resolvingCoordinates.value = false;
}

function samePoint(left?: GeocoderPoint, right?: GeocoderPoint): boolean {
  return Boolean(left && right && left.lon === right.lon && left.lat === right.lat);
}

async function humanizeCoordinateLabel(): Promise<void> {
  const point = props.modelValue;
  const reverseGeocode = props.reverseGeocode ?? geocoder.reverseGeocode;
  if (!point || !shouldHumanizeCoordinates(point) || !reverseGeocode) return;

  const requestToken = ++reverseToken;
  reverseController?.abort();
  const currentController = new AbortController();
  reverseController = currentController;
  resolvingCoordinates.value = true;

  try {
    const result = (await reverseGeocode(
      { lon: point.lon, lat: point.lat },
      currentController.signal,
    ))[0];
    if (requestToken !== reverseToken || currentController.signal.aborted) return;
    const label = result?.label?.trim();
    if (label && samePoint(props.modelValue, point)) query.value = label;
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") return;
    // The coordinate label remains a valid fallback when reverse-geocoding is unavailable.
  } finally {
    if (requestToken === reverseToken) resolvingCoordinates.value = false;
  }
}

function scheduleSuggestions(): void {
  cancelCoordinateResolution();
  if (timer !== undefined) window.clearTimeout(timer);
  const value = query.value.trim();
  suggestions.value = savedSuggestionsFor(value);
  if (value.length < 3) {
    return;
  }
  timer = window.setTimeout(() => void loadSuggestions(value), 220);
}

async function loadSuggestions(value: string): Promise<void> {
  const requestToken = ++token;
  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  error.value = "";
  try {
    const results = await searchPoints(value, controller.signal);
    if (requestToken === token) suggestions.value = mergeSuggestions(savedSuggestionsFor(value), results);
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") return;
    if (requestToken === token) {
      suggestions.value = savedSuggestionsFor(value);
      if (suggestions.value.length === 0) error.value = t("nearbyStations.errors.geocodingUnavailable");
    }
  } finally {
    if (requestToken === token) loading.value = false;
  }
}

async function submit(): Promise<void> {
  const value = query.value.trim();
  const local = savedSuggestionsFor(value);
  if (value.length < 3 && local.length === 0) return;
  const results = value.length >= 3
    ? filterSuggestions(await searchPoints(value).catch(() => []))
    : [];
  const point = local[0] ?? results[0] ?? suggestions.value[0];
  if (point) select(point);
  else error.value = t("nearbyStations.errors.addressNotFound");
}

function select(point: GeocoderPoint): void {
  cancelCoordinateResolution();
  query.value = point.label ?? query.value;
  suggestions.value = [];
  error.value = "";
  emit("update:modelValue", point);
}

function handleFocus(): void {
  if (blurTimer !== undefined) window.clearTimeout(blurTimer);
  focused.value = true;
  if (timer !== undefined) window.clearTimeout(timer);
  suggestions.value = savedSuggestionsFor(query.value.trim());
}

function handleBlur(): void {
  blurTimer = window.setTimeout(() => {
    focused.value = false;
    suggestions.value = [];
  }, 120);
}

onMounted(() => { void humanizeCoordinateLabel(); });

onBeforeUnmount(() => {
  if (timer !== undefined) window.clearTimeout(timer);
  if (blurTimer !== undefined) window.clearTimeout(blurTimer);
  controller?.abort();
  reverseController?.abort();
});
</script>

<template>
  <form class="nearby-address-search" role="search" @submit.prevent="submit">
    <label v-if="label">{{ label }}</label>
    <div class="nearby-address-search__field">
      <Search :size="17" aria-hidden="true" />
      <input
        v-model="query"
        type="search"
        autocomplete="street-address"
        :placeholder="placeholder ?? t('nearbyStations.addressPlaceholder')"
        :aria-label="label ?? t('nearbyStations.addressLabel')"
        @input="scheduleSuggestions"
        @focus="handleFocus"
        @blur="handleBlur"
      />
      <LoaderCircle v-if="loading || resolvingCoordinates" class="nearby-address-search__spin" :size="16" aria-hidden="true" />
    </div>
    <ul v-if="suggestions.length" class="nearby-address-search__suggestions">
      <li v-for="suggestion in suggestions" :key="suggestion.id ?? `${suggestion.lon}:${suggestion.lat}`">
        <button type="button" @click="select(suggestion)">
          <TrainFront v-if="suggestion.type === 'station'" :size="15" aria-hidden="true" />
          <Store v-else-if="suggestion.type === 'place'" :size="15" aria-hidden="true" />
          <MapPin v-else :size="15" aria-hidden="true" />
          <span>
            <strong>{{ suggestion.label }}</strong>
            <small v-if="suggestion.provider === 'address-book'">
              {{ t("nearbyStations.travel.savedAddress") }}<template v-if="suggestion.address"> · {{ suggestion.address }}</template><template v-if="suggestion.addressBookPrimary"> · {{ t("addressBook.primary") }}</template>
            </small>
            <small v-else-if="suggestion.type === 'station'">{{ t("nearbyStations.travel.stationType") }}</small>
            <small v-else-if="suggestion.type === 'place'">{{ t("nearbyStations.travel.placeType") }}</small>
            <small v-else-if="suggestion.address">{{ suggestion.address }}</small>
            <small v-else-if="suggestion.city">{{ suggestion.city }}</small>
          </span>
        </button>
      </li>
    </ul>
    <small v-if="error" class="nearby-address-search__error" role="alert">{{ error }}</small>
  </form>
</template>

<style scoped>
.nearby-address-search { display: grid; gap: 6px; position: relative; }
.nearby-address-search > label { color: #64748b; font-size: .7rem; font-weight: 850; }
.nearby-address-search__field { align-items: center; background: #fff; border: 1px solid rgba(81,70,255,.2); border-radius: 10px; display: flex; gap: 8px; min-height: 42px; padding: 0 10px; }
.nearby-address-search__field:focus-within { border-color: #5146ff; box-shadow: 0 0 0 3px rgba(81,70,255,.12); }
.nearby-address-search__field svg { color: #5146ff; flex: 0 0 auto; }
.nearby-address-search input { background: transparent; border: 0; color: #18233f; font: inherit; min-width: 0; outline: 0; width: 100%; }
.nearby-address-search__suggestions { background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 10px; box-shadow: 0 10px 25px rgba(15,23,42,.16); left: 0; list-style: none; margin: 2px 0 0; max-height: 220px; overflow: auto; padding: 5px; position: absolute; right: 0; top: 100%; z-index: 40; }
.nearby-address-search__suggestions button { align-items: center; background: transparent; border: 0; border-radius: 8px; color: #18233f; display: flex; gap: 8px; justify-content: flex-start; padding: 8px; text-align: left; width: 100%; }
.nearby-address-search__suggestions button:hover { background: #f1f0ff; }
.nearby-address-search__suggestions span { display: grid; justify-items: start; min-width: 0; text-align: left; width: 100%; }
.nearby-address-search__suggestions strong { display: block; font-size: .76rem; overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
.nearby-address-search__suggestions small, .nearby-address-search__error { color: #64748b; font-size: .66rem; text-align: left; }
.nearby-address-search__error { color: #b42318; }
.nearby-address-search__spin { animation: nearby-address-spin 850ms linear infinite; }
@keyframes nearby-address-spin { to { transform: rotate(360deg); } }
</style>

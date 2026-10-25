<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useI18n } from "../../../i18n";
import type { GeocoderPoint } from "../contracts/geocoder";
import { createPlaceAutocompleteSearch, usePlaceAutocomplete, type PlaceSearch } from "./usePlaceAutocomplete";
const props = defineProps<{ id: string; modelValue: string; search?: PlaceSearch }>();
const emit = defineEmits<{ "update:modelValue": [value: string]; select: [point: GeocoderPoint] }>();
const { t } = useI18n();
const defaultSearch = createPlaceAutocompleteSearch();
const { results, loading, error, search, reset } = usePlaceAutocomplete(
  () => props.search ?? defaultSearch,
);
const open = ref(false);
const active = ref(-1);
watch(() => props.modelValue, () => { reset(); open.value = false; });
function input(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
  // The parent model update is synchronous; start after its watcher resets old results.
  void nextTick(() => {
    active.value = -1;
    open.value = true;
    search(props.modelValue);
  });
}
function select(point: GeocoderPoint) {
  emit("update:modelValue", point.label ?? point.address ?? props.modelValue);
  emit("select", point);
  open.value = false;
  reset();
}
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape") { open.value = false; reset(); return; }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    open.value = true;
    const count = results.value.length;
    const step = event.key === "ArrowDown" ? 1 : -1;
    active.value = !count ? -1 : active.value < 0
      ? (step > 0 ? 0 : count - 1)
      : (active.value + step + count) % count;
  }
  if (event.key === "Enter" && open.value && active.value >= 0 && results.value[active.value]) {
    event.preventDefault();
    select(results.value[active.value]!);
  }
}
</script>
<template>
  <div class="place-autocomplete">
    <input :id="id" :value="modelValue" required autocomplete="off" role="combobox"
      aria-autocomplete="list" :aria-expanded="open" :aria-controls="`${id}-suggestions`"
      :aria-activedescendant="open && active >= 0 ? `${id}-option-${active}` : undefined"
      @input="input" @keydown="keydown" @blur="open = false" />
    <div v-if="open" class="place-autocomplete__results">
      <ul :id="`${id}-suggestions`" role="listbox" :aria-label="t('globalMap.search.resultsAria')" :aria-busy="loading">
        <li v-for="(point, index) in results" :id="`${id}-option-${index}`" :key="point.id ?? `${point.lon}:${point.lat}:${index}`"
          role="option" :aria-selected="active === index" @pointerdown.prevent="select(point)" @click="select(point)">
          {{ point.label ?? point.address }}<small v-if="point.city">{{ point.city }}</small>
        </li>
      </ul>
      <p v-if="loading" role="status">{{ t('globalMap.search.loading') }}</p>
      <p v-else-if="error" role="alert">{{ t('globalMap.search.placeSearchUnavailable') }}</p>
      <p v-else-if="modelValue.trim().length >= 3 && !results.length" role="status">{{ t('globalMap.search.empty') }}</p>
    </div>
  </div>
</template>
<style scoped>
.place-autocomplete { position: relative; flex: 1; min-width: 0; }
.place-autocomplete input { width: 100%; box-sizing: border-box; min-height: var(--control-height); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); color: var(--ink); background: var(--surface-soft); font: inherit; }
.place-autocomplete__results { position: absolute; top: 100%; left: 0; right: 0; z-index: 20; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); max-height: 20rem; overflow-y: auto; box-shadow: var(--shadow-md); }
input:focus-visible { outline: 3px solid var(--idfm-blue); outline-offset: 2px; }
ul { list-style: none; padding: 0; margin: 0; }
li, p { padding: var(--space-3); margin: 0; }
li { cursor: pointer; }
li[aria-selected="true"], li:hover { background: var(--surface-soft); }
small { display: block; color: var(--muted); }
</style>

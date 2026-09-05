<script setup lang="ts">
import { computed } from "vue";
import { MapPin } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import { globalTransportPlanLineWidth } from "../transport-map/config/globalTransportPlanConfig";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";
import { normalizeCityPatternLabel, type CitiesLinePatternCity } from "./citiesLinePattern";

const props = withDefaults(defineProps<{
  cities: readonly CitiesLinePatternCity[];
  lineColor?: string;
  lineMode?: GlobalMapMode;
  emptyLabel?: string;
  activeFromCity?: string;
}>(), {
  lineColor: "#18233f",
  lineMode: "BUS" as GlobalMapMode,
  emptyLabel: "",
  activeFromCity: "",
});

const { t } = useI18n();
const lineWidth = computed(() => globalTransportPlanLineWidth(props.lineMode));
const activeFromCityKey = computed(() => normalizeCityPatternLabel(props.activeFromCity));
const activeFromCityIndex = computed(() => {
  if (!activeFromCityKey.value) return -1;
  return props.cities.findIndex((city) => normalizeCityPatternLabel(city.name) === activeFromCityKey.value);
});

function isCityMuted(index: number): boolean {
  return activeFromCityIndex.value >= 0 && index < activeFromCityIndex.value;
}

function isCurrentCity(index: number): boolean {
  return index === activeFromCityIndex.value;
}

function isConnectorActive(index: number): boolean {
  return activeFromCityIndex.value >= 0 && index >= activeFromCityIndex.value;
}

function isConnectorMuted(index: number): boolean {
  return activeFromCityIndex.value >= 0 && index < activeFromCityIndex.value;
}
</script>

<template>
  <div
    class="cities-line-pattern"
    :style="{
      '--cities-line-color': lineColor,
      '--cities-line-width': `${lineWidth}px`,
    }"
    data-testid="cities-line-pattern"
  >
    <ol
      v-if="cities.length"
      class="cities-line-pattern__list"
      :aria-label="t('globalMap.sidebar.lineCities')"
    >
      <li
        v-for="(city, index) in cities"
        :key="`${city.name}-${index}`"
        class="cities-line-pattern__item"
        :class="{
          'cities-line-pattern__item--highlighted': city.highlighted,
          'cities-line-pattern__item--muted': isCityMuted(index),
        }"
        :data-highlighted="city.highlighted ? 'true' : undefined"
      >
        <div class="cities-line-pattern__rail" aria-hidden="true">
          <span class="cities-line-pattern__dot" />
          <span
            v-if="index < cities.length - 1"
            class="cities-line-pattern__connector"
            :class="{
              'cities-line-pattern__connector--active': isConnectorActive(index),
              'cities-line-pattern__connector--muted': isConnectorMuted(index),
            }"
          />
        </div>
        <div class="cities-line-pattern__content">
          <strong>{{ city.name }}</strong>
          <small v-if="isCurrentCity(index)" class="cities-line-pattern__current-city">
            <MapPin :size="12" stroke-width="2.5" aria-hidden="true" />
            {{ t("globalMap.sidebar.youAreHere") }}
          </small>
          <small v-if="city.departureStation">
            <b>{{ t("globalMap.sidebar.lineDeparture") }}</b>
            {{ city.departureStation }}
          </small>
          <small v-if="city.terminalStation">
            <b>{{ t("globalMap.sidebar.lineTerminal") }}</b>
            {{ city.terminalStation }}
          </small>
        </div>
      </li>
    </ol>
    <p v-else-if="emptyLabel" class="cities-line-pattern__empty">{{ emptyLabel }}</p>
  </div>
</template>

<style scoped>
.cities-line-pattern { min-width: 0; color: #253452; }
.cities-line-pattern__list { display: grid; gap: 0; list-style: none; margin: 0; padding: 0; }
.cities-line-pattern__item { column-gap: 10px; display: grid; grid-template-columns: 18px minmax(0, 1fr); min-height: 52px; }
.cities-line-pattern__rail { align-items: center; display: flex; flex-direction: column; min-height: 100%; }
.cities-line-pattern__dot { background: var(--cities-line-color); border: 3px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px var(--cities-line-color), 0 2px 5px rgba(24, 41, 76, .16); flex: 0 0 12px; height: 12px; margin-top: 2px; width: 12px; }
.cities-line-pattern__connector { background: color-mix(in srgb, var(--cities-line-color) 42%, #dfe5f0); border-radius: 999px; flex: 1 1 auto; margin-top: 2px; min-height: 20px; width: var(--cities-line-width); }
.cities-line-pattern__connector--muted { background: #d7deea; }
.cities-line-pattern__connector--active { background: var(--cities-line-color); overflow: hidden; position: relative; }
.cities-line-pattern__connector--active::after { background: repeating-linear-gradient(to bottom, rgba(255,255,255,.05) 0 8px, rgba(255,255,255,.72) 8px 13px, rgba(255,255,255,.05) 13px 22px); content: ""; inset: -100% 0; position: absolute; }
.cities-line-pattern__content { min-width: 0; padding: 0 0 15px; }
.cities-line-pattern__item:last-child .cities-line-pattern__content { padding-bottom: 0; }
.cities-line-pattern__content strong,
.cities-line-pattern__content small { display: block; overflow: hidden; text-overflow: ellipsis; }
.cities-line-pattern__content strong { color: #253452; font-size: .78rem; font-weight: 950; white-space: nowrap; }
.cities-line-pattern__content small { color: #8491a9; font-size: .64rem; font-weight: 750; line-height: 1.3; margin-top: 3px; }
.cities-line-pattern__content .cities-line-pattern__current-city { align-items: center; color: var(--cities-line-color); display: inline-flex; gap: 4px; }
.cities-line-pattern__current-city svg { flex: 0 0 auto; }
.cities-line-pattern__content b { color: var(--cities-line-color); font-size: .58rem; font-weight: 950; letter-spacing: .04em; margin-right: 4px; text-transform: uppercase; }
.cities-line-pattern__item--highlighted .cities-line-pattern__dot { box-shadow: 0 0 0 3px color-mix(in srgb, var(--cities-line-color) 22%, transparent), 0 0 0 1px var(--cities-line-color), 0 3px 8px rgba(24, 41, 76, .24); transform: scale(1.2); }
.cities-line-pattern__item--highlighted .cities-line-pattern__content strong { color: var(--cities-line-color); }
.cities-line-pattern__item--muted .cities-line-pattern__dot { background: #cbd5e1; box-shadow: 0 0 0 1px #b8c3d3, 0 2px 5px rgba(24, 41, 76, .1); }
.cities-line-pattern__item--muted .cities-line-pattern__content strong { color: #8b98ad; }
.cities-line-pattern__item--muted .cities-line-pattern__content small { color: #aab4c4; }
.cities-line-pattern__item--muted .cities-line-pattern__content b { color: #8b98ad; }
.cities-line-pattern__empty { color: #8491a9; font-size: .7rem; margin: 0; }
@keyframes cities-line-pattern-wave { to { transform: translateY(50%); } }
@media (prefers-reduced-motion: no-preference) {
  .cities-line-pattern__connector--active::after { animation: cities-line-pattern-wave 1.9s linear infinite; }
}
</style>

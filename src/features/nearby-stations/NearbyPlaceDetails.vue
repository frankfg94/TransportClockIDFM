<script setup lang="ts">
import { computed } from "vue";
import { Footprints, X } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import type { NearbyPlace } from "./nearbyPlaces";
import type { NearbyWalkingRoute } from "./nearbyWalkingRoutes";
import { nearbyPlaceDisplayName, nearbyPlaceTypeKey, nearbyPlaceWalkingMinutes } from "./nearbyPlacePresentation";
import { nearbyOpeningHours } from "./nearbyOpeningHours";

const props = defineProps<{ place: NearbyPlace; route?: NearbyWalkingRoute }>();
defineEmits<{ close: [] }>();
const { t, n, d } = useI18n();
const tags = computed(() => props.place.tags ?? {});
const openingHours = computed(() => nearbyOpeningHours(tags.value.opening_hours ?? ""));
const rawOpeningHours = computed(() => (tags.value.opening_hours ?? "").split(";").map(rule => rule.trim()).filter(Boolean));
function dayLabel(day: number): string {
  return day === 7 ? t("nearbyStations.placeDetails.hoursHolidays") : d(new Date(2026, 0, 5 + day, 12), { weekday: "long" });
}
const website = computed(() => tags.value.website || tags.value["contact:website"]);
const websiteHref = computed(() => {
  try {
    const url = new URL(website.value ?? "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
});
const email = computed(() => tags.value.email || tags.value["contact:email"]);
const format = computed(() => {
  if (props.place.kind === "convenience") return t("nearbyStations.placeDetails.small");
  if (props.place.kind === "supermarket") return t("nearbyStations.placeDetails.medium");
  if (["hypermarket", "department_store", "mall"].includes(props.place.kind)) return t("nearbyStations.placeDetails.large");
  return t("nearbyStations.placeDetails.unknown");
});
</script>

<template>
  <article class="nearby-place-details" data-testid="nearby-place-details" :aria-label="t('nearbyStations.placeDetails.title')">
    <header>
      <h3>{{ nearbyPlaceDisplayName(place, t) }}</h3>
      <button type="button" :aria-label="t('common.actions.close')" @click="$emit('close')"><X :size="18" aria-hidden="true" /></button>
    </header>
    <p><Footprints :size="16" aria-hidden="true" />{{ t('nearbyStations.walkingTime', { minutes: nearbyPlaceWalkingMinutes(place, route) }) }}<span v-if="!route || route.fallback"> · {{ t('nearbyStations.placeDetails.estimatedWalk') }}</span></p>
    <dl>
      <dt>{{ t('nearbyStations.placeDetails.category') }}</dt><dd>{{ t(nearbyPlaceTypeKey(place)) }}</dd>
      <dt>{{ t('nearbyStations.placeDetails.format') }}</dt><dd>{{ format }}</dd>
      <template v-if="place.areaM2"><dt>{{ t('nearbyStations.placeDetails.footprint') }}</dt><dd>{{ n(place.areaM2, { maximumFractionDigits: 0 }) }} m²</dd></template>
      <template v-else-if="['supermarket', 'hypermarket'].includes(place.kind)"><dt>{{ t('nearbyStations.placeDetails.footprint') }}</dt><dd>{{ t('nearbyStations.placeDetails.unknown') }}</dd></template>
      <template v-if="place.address || place.city"><dt>{{ t('nearbyStations.placeDetails.address') }}</dt><dd>{{ [place.address, place.city].filter(Boolean).join(', ') }}</dd></template>
      <dt class="nearby-place-details__hours-title">{{ t('nearbyStations.placeDetails.hours') }}</dt>
      <dd class="nearby-place-details__hours">
        <ul v-if="openingHours" class="nearby-place-details__week">
          <li v-for="day in openingHours" :key="day.day" :class="{ 'nearby-place-details__day--muted': day.state === 'closed' || day.state === 'unknown' }">
            <span class="nearby-place-details__day">{{ dayLabel(day.day) }}</span>
            <span class="nearby-place-details__times">
              <template v-if="day.state === 'hours'"><span v-for="interval in day.intervals" :key="interval">{{ interval }}</span></template>
              <span v-else>{{ day.state === 'closed' ? t('nearbyStations.placeDetails.hoursClosed') : day.state === 'all-day' ? t('nearbyStations.placeDetails.hoursAllDay') : t('nearbyStations.placeDetails.unknown') }}</span>
            </span>
          </li>
        </ul>
        <div v-else-if="rawOpeningHours.length" class="nearby-place-details__hours-raw"><span v-for="(rule, index) in rawOpeningHours" :key="index">{{ rule }}</span></div>
        <span v-else>{{ t('nearbyStations.placeDetails.unknown') }}</span>
      </dd>
      <dt>{{ t('nearbyStations.placeDetails.email') }}</dt><dd><a v-if="email" :href="`mailto:${encodeURIComponent(email)}`">{{ email }}</a><span v-else>{{ t('nearbyStations.placeDetails.unknown') }}</span></dd>
      <dt>{{ t('nearbyStations.placeDetails.website') }}</dt><dd><a v-if="websiteHref" :href="websiteHref" target="_blank" rel="noopener noreferrer">{{ website }}</a><span v-else>{{ website || t('nearbyStations.placeDetails.unknown') }}</span></dd>
      <template v-if="place.brand"><dt>{{ t('nearbyStations.placeDetails.brand') }}</dt><dd>{{ place.brand }}</dd></template>
      <template v-if="place.operator"><dt>{{ t('nearbyStations.placeDetails.operator') }}</dt><dd>{{ place.operator }}</dd></template>
    </dl>
    <small>{{ t('nearbyStations.placeDetails.formatNote') }}</small>
    <details v-if="Object.keys(tags).length">
      <summary>{{ t('nearbyStations.placeDetails.metadata') }}</summary>
      <dl><template v-for="(value, key) in tags" :key="key"><dt>{{ key }}</dt><dd>{{ value }}</dd></template></dl>
    </details>
    <small>{{ place.id }}<template v-if="place.cityCode"> · {{ place.cityCode }}</template></small>
  </article>
</template>

<style scoped>
.nearby-place-details { background: var(--surface, #fff); border-bottom: 2px solid var(--accent, #5146ff); color: var(--ink); padding: 14px; position: sticky; top: 0; z-index: 2; max-height: 80%; overflow: auto; }
header { align-items: flex-start; display: flex; gap: 12px; justify-content: space-between; }
h3 { font-size: 1rem; margin: 0; }
header button { flex: 0 0 auto; padding: 4px; }
p { align-items: center; display: flex; flex-wrap: wrap; font-size: .8rem; gap: 4px; }
dl { display: grid; font-size: .8rem; gap: 6px 12px; grid-template-columns: minmax(80px, .7fr) minmax(0, 1.3fr); }
dt { color: var(--muted); overflow-wrap: anywhere; }
dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
a { color: var(--accent, #5146ff); text-decoration: underline; }
small { color: var(--muted); display: block; font-size: .7rem; margin-top: 8px; }
details { margin-top: 10px; }
.nearby-place-details__hours-title { grid-column: 1 / -1; margin-top: 8px; font-weight: 650; }
.nearby-place-details__hours { grid-column: 1 / -1; white-space: normal; }
.nearby-place-details__week { background: var(--surface-soft, #f7f8fc); border: 1px solid var(--border, #e2e8f0); border-radius: 10px; list-style: none; margin: 0 0 6px; padding: 4px 10px; }
.nearby-place-details__week li { align-items: baseline; display: grid; gap: 8px; grid-template-columns: minmax(0, 1fr) auto; padding: 7px 0; }
.nearby-place-details__week li + li { border-top: 1px solid var(--border, #e2e8f0); }
.nearby-place-details__day { font-weight: 600; text-transform: capitalize; }
.nearby-place-details__times { display: grid; font-variant-numeric: tabular-nums; gap: 3px; text-align: right; }
.nearby-place-details__day--muted .nearby-place-details__times { color: var(--muted); }
.nearby-place-details__hours-raw { display: grid; gap: 6px; }
@media (max-width: 767px) { .nearby-place-details { max-height: none; position: static; } }
</style>

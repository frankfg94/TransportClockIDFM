<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Check, ChevronDown, LoaderCircle, Rocket, Zap } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import MaterialCombobox, { type MaterialComboboxOption } from "../../components/MaterialCombobox.vue";
import { isTurboTransit, turboDurationMinutes, turboFirstTransitDeparture, turboJourneyDurationWithoutInitialWait, turboTime } from "./travelTurbo";
import TravelTurboLines from "./TravelTurboLines.vue";
import type { TravelTurboController } from "./useTravelTurbo";
import type { TravelRoute } from "./useTravelRoutes";

const props = withDefaults(defineProps<{ turbo: TravelTurboController; routes: readonly TravelRoute[]; currentRouteId: string; showLineIcons?: boolean; fillSpace?: boolean }>(), { showLineIcons: true, fillSpace: false });
const emit = defineEmits<{ select: [route: TravelRoute] }>();
const { t, d } = useI18n();
const strategyModel = computed({
  get: () => props.turbo.strategy.value,
  set: (value: string) => {
    if (value === "fastest" || value === "smooth") props.turbo.strategy.value = value;
  },
});
const strategyOptions = computed<MaterialComboboxOption[]>(() => [
  { id: "fastest", label: t("travelTurbo.fastest") },
  { id: "smooth", label: t("travelTurbo.smooth") },
]);
const expanded = ref(false);
const glowId = ref<string>();
const comparison = ref<HTMLElement>();
let timer: ReturnType<typeof setTimeout> | undefined;
const winnerId = computed(() => props.turbo.winnerId.value);
const status = computed(() => props.turbo.status.value);
const trusted = computed(() => status.value === "ready");
const message = computed(() => {
  if (status.value === "loading") return t("travelTurbo.loading");
  if (status.value === "error") return t("travelTurbo.error");
  if (status.value === "unavailable") return t("travelTurbo.unavailable");
  if (trusted.value && winnerId.value === props.currentRouteId) return t("travelTurbo.alreadyOptimal");
  if (status.value === "partial") return t(winnerId.value ? "travelTurbo.partial" : "travelTurbo.incomplete");
  return t("travelTurbo.bestAlignment");
});
const clock = (value?: string) => {
  const time = turboTime(value);
  return time === undefined ? "—" : d(new Date(time), { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
};
const departureIn = (route: TravelRoute) => {
  const departure = turboFirstTransitDeparture(route);
  const reference = turboTime(props.turbo.result.value?.analyzedAt) ?? Date.now();
  return departure === undefined ? "" : t("travelTurbo.departureIn", { minutes: Math.max(0, Math.ceil((departure - reference) / 60_000)) });
};
const durationSeconds = (route: TravelRoute) => turboJourneyDurationWithoutInitialWait(route);
const durationText = (route: TravelRoute) => {
  const minutes = turboDurationMinutes(durationSeconds(route));
  if (minutes < 60) return t("nearbyStations.travel.minutes", { minutes });

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0
    ? t("travelTurbo.durationHours", { hours })
    : t("travelTurbo.durationHoursMinutes", { hours, minutes: String(remainder).padStart(2, "0") });
};

type TurboLineReferences = ReadonlySet<string>;

function normalizeLineReference(value: string): string {
  return value.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/^(?:line:)?idfm:/u, "")
    .replace(/[^a-z0-9]/gu, "");
}

function lineReferences(section: TravelRoute["sections"][number]): TurboLineReferences {
  const references = [section.lineId, section.lineCode, ...(section.lineAliases ?? [])]
    .filter((value): value is string => Boolean(value))
    .map(normalizeLineReference)
    .filter(Boolean);
  if (references.length === 0 && section.lineMode) references.push(`mode:${normalizeLineReference(section.lineMode)}`);
  return new Set(references);
}

function correspondenceLines(route: TravelRoute): TurboLineReferences[] {
  return route.sections.filter(isTurboTransit).map(lineReferences);
}

function sameLine(left: TurboLineReferences, right: TurboLineReferences): boolean {
  for (const reference of left) if (right.has(reference)) return true;
  return false;
}

function correspondenceDistance(left: readonly TurboLineReferences[], right: readonly TurboLineReferences[]): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        current[rightIndex - 1]! + 1,
        previous[rightIndex - 1]! + (sameLine(left[leftIndex - 1]!, right[rightIndex - 1]!) ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}

const currentRoute = computed(() => props.routes.find((route) => route.id === props.currentRouteId));
const turboRoutes = computed(() => {
  const selected = currentRoute.value;
  if (!selected) return [...props.routes];

  const selectedLines = correspondenceLines(selected);
  return props.routes.filter((route) => {
    const routeLines = correspondenceLines(route);
    if ((selectedLines.length === 0) !== (routeLines.length === 0)) return false;
    const distance = correspondenceDistance(selectedLines, routeLines);
    return distance === 0 || (distance === 1 && durationSeconds(route) < durationSeconds(selected));
  });
});
const ordered = computed(() => [...turboRoutes.value].sort((a, b) =>
  durationSeconds(a) - durationSeconds(b) ||
  (turboTime(a.departureDateTime) ?? Infinity) - (turboTime(b.departureDateTime) ?? Infinity) ||
  (turboTime(a.arrivalDateTime) ?? Infinity) - (turboTime(b.arrivalDateTime) ?? Infinity),
));
watch(winnerId, async (id, previous) => {
  if (!id || id === previous) return;
  clearTimeout(timer);
  glowId.value = id;
  timer = setTimeout(() => { glowId.value = undefined; }, 3000);
  await nextTick();
  const list = comparison.value;
  const winner = list?.querySelector<HTMLElement>('[data-turbo-winner="true"]');
  if (list && winner) list.scrollTop = Math.max(0, winner.offsetTop - list.offsetTop - 4);
});
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <section class="travel-turbo" :class="{ 'travel-turbo--fill': fillSpace && expanded, 'travel-turbo--collapsed': !expanded }" :aria-label="t('travelTurbo.title')" :aria-busy="turbo.analyzing.value">
    <div class="travel-turbo__summary">
      <button type="button" class="travel-turbo__action" :aria-expanded="expanded" aria-controls="travel-turbo-content" @click="expanded = !expanded">
        <LoaderCircle v-if="turbo.analyzing.value" :size="15" aria-hidden="true" />
        <Rocket v-else :size="15" aria-hidden="true" />
        {{ t("travelTurbo.title") }} <ChevronDown class="travel-turbo__chevron" :class="{ 'travel-turbo__chevron--expanded': expanded }" :size="13" aria-hidden="true" />
      </button>
      <span role="status">{{ message }}</span>
    </div>
    <Transition name="travel-turbo-accordion">
      <div v-if="expanded" id="travel-turbo-content" class="travel-turbo__body">
        <div class="travel-turbo__body-inner">
          <div class="travel-turbo__choices" :aria-label="t('travelTurbo.strategy')">
            <MaterialCombobox
              v-model="strategyModel"
              :options="strategyOptions"
              :aria-label="t('travelTurbo.strategy')"
              :teleport="true"
            >
              <template #value="{ option }">
                <span class="travel-turbo__strategy-value">
                  <Rocket v-if="option?.id === 'fastest'" :size="14" aria-hidden="true" />
                  <Zap v-else :size="14" aria-hidden="true" />
                  {{ option?.label }}
                </span>
              </template>
              <template #option="{ option }">
                <span class="travel-turbo__strategy-option">
                  <Rocket v-if="option.id === 'fastest'" :size="14" aria-hidden="true" />
                  <Zap v-else :size="14" aria-hidden="true" />
                  {{ option.label }}
                </span>
              </template>
            </MaterialCombobox>
            <small>{{ t("travelTurbo.explanation") }}</small>
          </div>
          <p v-if="turbo.result.value?.currentFeasible === false" class="travel-turbo__source">{{ t("travelTurbo.currentInfeasible") }}</p>
          <div ref="comparison" class="travel-turbo__routes" :aria-label="t('travelTurbo.comparison')">
            <button v-for="route in ordered" :key="route.id" type="button" class="travel-turbo__route"
              :class="{ 'travel-turbo__route--best': route.id === winnerId, 'travel-turbo__route--glow': route.id === glowId }"
              :data-turbo-winner="route.id === winnerId" :aria-pressed="route.id === currentRouteId" @click="emit('select', route)">
              <span class="travel-turbo__times"><strong>{{ clock(route.departureDateTime) }} → {{ clock(route.arrivalDateTime) }}</strong><span>{{ durationText(route) }}</span></span>
              <TravelTurboLines :sections="route.sections" :show-line-icons="showLineIcons" />
              <span class="travel-turbo__route-footer">
                <span v-if="route.id === winnerId" class="travel-turbo__winner">
                  <Check v-if="trusted && route.id === currentRouteId" :size="13" aria-hidden="true" />
                  <Zap v-else-if="turbo.strategy.value === 'smooth'" :size="13" aria-hidden="true" /><Rocket v-else :size="13" aria-hidden="true" />
                  {{ trusted ? (route.id === currentRouteId ? t("travelTurbo.optimal") : t("travelTurbo.title")) : t("travelTurbo.bestFound") }}
                </span>
                <span class="travel-turbo__departure">{{ departureIn(route) }}</span>
              </span>
            </button>
          </div>
          <small v-if="turbo.result.value && status !== 'loading'" class="travel-turbo__source">
            {{ trusted ? t("travelTurbo.realtime") : t("travelTurbo.estimates") }} · {{ clock(turbo.result.value.analyzedAt) }}
          </small>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.travel-turbo { border-bottom: 1px solid var(--border); display: flex; flex-direction: column; flex: 0 1 300px; min-height: 190px; max-height: 55%; overflow: hidden; padding: 10px 12px; color: var(--ink); font-size: .75rem; }
.travel-turbo--fill { flex: 1 1 auto; min-height: 0; max-height: none; }
.travel-turbo--collapsed { flex: 0 0 auto; min-height: 0; max-height: none; }
.travel-turbo__summary, .travel-turbo__choices, .travel-turbo__source { flex-shrink: 0; }
.travel-turbo__summary, .travel-turbo__action, .travel-turbo__strategy-value, .travel-turbo__strategy-option, .travel-turbo__winner { display: flex; align-items: center; gap: 6px; }
.travel-turbo__summary { justify-content: space-between; }
.travel-turbo__summary > span { font-size: .68rem; }
.travel-turbo button { font: inherit; color: inherit; cursor: pointer; }
.travel-turbo__action { border: 1px solid var(--border); background: var(--surface); border-radius: 8px; padding: 6px 8px; }
.travel-turbo__action { font-weight: 700; flex-shrink: 0; }
.travel-turbo__chevron { transition: transform 220ms ease; }
.travel-turbo__chevron--expanded { transform: rotate(180deg); }
.travel-turbo__body { display: grid; flex: 1 1 auto; grid-template-rows: minmax(0, 1fr); min-height: 0; opacity: 1; transition: grid-template-rows 220ms ease, opacity 180ms ease; }
.travel-turbo__body-inner { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.travel-turbo__choices { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.travel-turbo__choices :deep(.material-combobox) { flex: 0 1 260px; min-width: min(260px, 100%); }
.travel-turbo__choices :deep(.material-combobox__trigger) { min-height: 36px; padding: 6px 8px; }
.travel-turbo__choices :deep(.material-combobox__value) { font-size: .75rem; font-weight: 700; }
.travel-turbo__strategy-option { min-width: 0; }
.travel-turbo__choices small { flex-basis: 100%; }
.travel-turbo__routes { display: grid; grid-auto-rows: max-content; align-content: start; gap: 8px; padding: 9px 3px 5px; overflow-y: auto; min-height: 62px; flex: 1 1 auto; }
.travel-turbo .travel-turbo__route { display: grid; align-content: start; justify-content: stretch; gap: 7px; height: auto; min-height: 76px; text-align: left; border: 1px solid var(--border); border-radius: 10px; padding: 11px 12px; background: var(--surface); }
.travel-turbo__route:hover { background: var(--surface-muted); }
.travel-turbo .travel-turbo__route--best { border-color: var(--idfm-blue); }
.travel-turbo__times { display: flex; justify-content: space-between; gap: 8px; }
.travel-turbo__route-footer { align-items: center; display: flex; gap: 6px; min-height: 16px; min-width: 0; }
.travel-turbo__winner { font-size: .68rem; font-weight: 700; min-width: 0; }
.travel-turbo__departure { color: var(--muted, #64748b); font-size: .68rem; font-variant-numeric: tabular-nums; margin-left: auto; white-space: nowrap; }
.travel-turbo__source { display: block; margin-top: 4px; }
.travel-turbo__route--glow { animation: turbo-glow 3s ease-out; }
.travel-turbo-accordion-enter-from, .travel-turbo-accordion-leave-to { grid-template-rows: 0fr; opacity: 0; }
@keyframes turbo-glow { 0%, 100% { box-shadow: 0 0 0 transparent; } 25%, 60% { box-shadow: 0 0 10px color-mix(in srgb, var(--idfm-blue) 30%, transparent); } }
@media (prefers-reduced-motion: reduce) {
  .travel-turbo__chevron, .travel-turbo__body { transition: none; }
  .travel-turbo__route--glow { animation: none; }
}
</style>

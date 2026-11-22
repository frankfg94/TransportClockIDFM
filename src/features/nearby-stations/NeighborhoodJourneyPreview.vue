<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, shallowRef, watch } from "vue";
import { ArrowRight, ChevronDown, Footprints, MapPin } from "lucide-vue-next";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { useI18n } from "../../i18n";
import type { TransportMapNetwork } from "../transport-map/contracts/network";
import type { GlobalMapPath } from "../transport-map/contracts/manifest";
import { createPreviewTransitPathResolver, journeyPreviewRow, type JourneyPreviewRun, type MappedPreviewJourney } from "./neighborhood/journeyPreview";
import type { NeighborhoodJourneyBenchmark } from "./neighborhood/contracts";
import { resolveGlobalTransportItineraryLine } from "../line-map/globalTransportItineraryGeometry";
import { summarizeJourney } from "./neighborhood/journeys";

const props = defineProps<{
  run: JourneyPreviewRun;
  originLabel: string;
  network?: TransportMapNetwork;
  loadDetailPaths?: (lineId: string) => Promise<GlobalMapPath[]>;
  loadPaths: (layer: "core" | "bus") => Promise<GlobalMapPath[]>;
}>();
const NeighborhoodJourneyMap = defineAsyncComponent(() => import("./NeighborhoodJourneyMap.vue"));
const { t } = useI18n();
const prefix = "nearbyStations.neighborhoodScore.journeyPreview" as const;
const destinationId = ref(props.run.destinations[0]?.id ?? "");
const choices = ref<Record<string, number>>({});
const benchmark = computed(() => props.run.benchmarks.find(b => b.id === destinationId.value));
const corePaths = shallowRef<GlobalMapPath[]>([]);
const busPaths = shallowRef<GlobalMapPath[]>([]);
const detailedPaths = shallowRef(new Map<string, GlobalMapPath[]>());
const transitPath = computed(() => props.network && createPreviewTransitPathResolver(props.network, [...corePaths.value, ...busPaths.value, ...[...detailedPaths.value.values()].flat()]));
function mapJourney(b: NeighborhoodJourneyBenchmark): MappedPreviewJourney {
  const choice = choices.value[b.id];
  return {
    row: journeyPreviewRow(b, choice === undefined ? undefined : b.journeys[choice], transitPath.value),
    destination: props.run.destinations.find(d => d.id === b.id),
  };
}
const mapped = computed(() => benchmark.value ? [mapJourney(benchmark.value)] : props.run.benchmarks.map(mapJourney));
const row = computed(() => benchmark.value ? mapped.value[0]?.row : undefined);
const alternatives = computed(() => benchmark.value?.journeys.map(summarizeJourney) ?? []);
const completed = computed(() => props.run.benchmarks.filter(b => b.status !== "loading").length);

watch([benchmark, choices, () => props.network], async (_, __, onCleanup) => {
  if (!props.network || !props.loadDetailPaths) return;
  let stale = false;
  onCleanup(() => { stale = true; });
  const targets = benchmark.value ? [benchmark.value] : props.run.benchmarks;
  const ids = new Set(targets.flatMap(item => {
    const selected = mapJourney(item).row.selectedIndex;
    return (item.journeys[selected]?.sections ?? []).flatMap(section => {
      if (section.type !== "public_transport") return [];
      const line = resolveGlobalTransportItineraryLine(section, props.network!.lines);
      return line ? [line.id] : [];
    });
  }));
  for (const id of ids) {
    if (stale) return;
    if (detailedPaths.value.has(id)) continue;
    const paths = await props.loadDetailPaths(id).catch(() => []);
    if (!stale && paths.length) detailedPaths.value = new Map(detailedPaths.value).set(id, paths);
  }
}, { immediate: true, deep: true });

onMounted(() => {
  void props.loadPaths("core").then(paths => { corePaths.value = paths; }).catch(() => {});
  let busRequest: Promise<void> | undefined;
  watch(() => mapped.value.some(item => item.row.usesBus), needed => {
    if (needed && !busRequest) busRequest = props.loadPaths("bus").then(paths => { busPaths.value = paths; }).catch(() => { busRequest = undefined; });
  }, { immediate: true });
});
</script>

<template>
  <section class="journey-preview" data-testid="verdict-journey-preview" :aria-label="t(`${prefix}.title`)">
    <header class="journey-preview__head">
      <div class="journey-preview__origin">
        <strong>{{ t(`${prefix}.title`) }}</strong>
        <span><MapPin :size="15" aria-hidden="true" />{{ originLabel || t(`${prefix}.origin`) }}</span>
      </div>
      <label class="journey-preview__field">
        <span>{{ t(`${prefix}.destination`) }}</span>
        <span class="journey-preview__select">
          <select v-model="destinationId" data-testid="journey-destination">
            <option value="">{{ t(`${prefix}.allDestinations`) }}</option>
            <option v-for="b in run.benchmarks" :key="b.id" :value="b.id">{{ b.label }}</option>
          </select>
          <ChevronDown :size="16" aria-hidden="true" />
        </span>
      </label>
    </header>
    <NeighborhoodJourneyMap :origin="run.origin" :journeys="mapped" :selected-id="destinationId" @select="destinationId = $event" />
    <div v-if="row" class="journey-preview__result" aria-live="polite" :data-destination="row.id" :data-status="row.status">
      <template v-if="row.summary">
        <div class="journey-preview__metrics">
          <strong>{{ t(`${prefix}.minutes`, { minutes: row.summary.elapsedMinutes }) }}</strong>
          <span v-if="row.summary.walkingMinutes"><Footprints :size="15" aria-hidden="true" />{{ t(`${prefix}.walking`, { minutes: row.summary.walkingMinutes }) }}</span>
          <span v-if="row.legs.length">{{ t(row.summary.transfers > 1 ? `${prefix}.transfers` : row.summary.transfers === 1 ? `${prefix}.oneTransfer` : `${prefix}.direct`, { count: row.summary.transfers }) }}</span>
        </div>
        <div v-if="row.legs.length" class="journey-preview__lines">
          <template v-for="(leg, index) in row.legs" :key="index">
            <ArrowRight v-if="index" :size="13" aria-hidden="true" />
            <LineIconBadge :line="leg.badge" compact eager />
          </template>
        </div>
      </template>
      <span v-else>{{ t(row.status === 'loading' ? `${prefix}.loading` : row.status === 'error' ? `${prefix}.error` : `${prefix}.unavailable`, { destination: row.label }) }}</span>
    </div>
    <p v-else class="journey-preview__progress">{{ t(`${prefix}.pickMarker`) }}</p>
    <details v-if="row?.summary" :key="row.id" class="journey-preview__details">
      <summary>{{ t(`${prefix}.details`) }}</summary>
      <label v-if="alternatives.length > 1" class="journey-preview__field">
        <span>{{ t(`${prefix}.choose`) }}</span>
        <span class="journey-preview__select">
          <select :value="row.selectedIndex" data-testid="journey-alternative" @change="choices[destinationId] = Number(($event.target as HTMLSelectElement).value)">
            <option v-for="(alternative, index) in alternatives" :key="index" :value="index">
              {{ t(`${prefix}.alternative`, { number: index + 1, minutes: alternative.elapsedMinutes, lines: alternative.lines }) }}
            </option>
          </select>
          <ChevronDown :size="16" aria-hidden="true" />
        </span>
      </label>
      <ol v-if="row.legs.length" class="journey-preview__stops">
        <li v-for="(leg, index) in row.legs" :key="index">
          <LineIconBadge :line="leg.badge" compact eager />
          <span>{{ leg.from }} <ArrowRight :size="13" aria-hidden="true" /> {{ leg.to }}</span>
        </li>
      </ol>
      <p v-if="row.summary.initialWaitMinutes">{{ t(`${prefix}.initialWait`, { minutes: row.summary.initialWaitMinutes }) }}</p>
      <p v-if="row.status === 'missingGeometry' || row.status === 'partialGeometry'">{{ t(`${prefix}.${row.status}`) }}</p>
    </details>
    <p v-if="completed < run.benchmarks.length" class="journey-preview__progress" data-testid="verdict-journey-preview-progress">{{ t(`${prefix}.progress`, { completed, total: run.benchmarks.length }) }}</p>
  </section>
</template>

<style scoped>
.journey-preview { margin-bottom: 12px; padding: clamp(12px, 2vw, 20px); display: grid; gap: 12px; min-width: 0; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); color: var(--ink); }
.journey-preview__head, .journey-preview__result, .journey-preview__metrics, .journey-preview__lines { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; }
.journey-preview__head, .journey-preview__result { justify-content: space-between; }
.journey-preview__origin, .journey-preview__field { display: grid; gap: 3px; min-width: 0; }
.journey-preview__origin strong { font-size: 1.05rem; }
.journey-preview__origin span, .journey-preview__metrics span, .journey-preview__stops li, .journey-preview__lines { display: flex; align-items: center; gap: 6px; }
.journey-preview__origin span, .journey-preview__metrics span, .journey-preview__field > span:first-child, .journey-preview__progress, .journey-preview__details p { color: var(--muted); font-size: .83rem; }
.journey-preview__origin svg { flex-shrink: 0; }
.journey-preview__select { display: grid; align-items: center; position: relative; }
.journey-preview__select svg { position: absolute; right: 10px; pointer-events: none; }
.journey-preview select { appearance: none; width: 100%; min-width: 0; min-height: 40px; padding: 6px 32px 6px 12px; border: 1px solid var(--border); border-radius: 8px; color: var(--ink); background: var(--surface); font: inherit; }
.journey-preview__metrics strong { font-size: 1.3rem; font-variant-numeric: tabular-nums; }
.journey-preview__lines { flex-wrap: wrap; color: var(--muted); }
.journey-preview__details { min-width: 0; border-top: 1px solid var(--border); padding-top: 8px; font-size: .87rem; }
.journey-preview__details summary { cursor: pointer; width: fit-content; padding-block: 4px; }
.journey-preview__details .journey-preview__field { margin-top: 8px; max-width: 32rem; }
.journey-preview__stops { display: grid; gap: 6px; list-style: none; margin: 12px 0 0; padding: 0; }
.journey-preview__stops svg { vertical-align: middle; }
.journey-preview__details p { margin: 8px 0 0; }
.journey-preview__progress { margin: 0; }
@media (max-width: 580px) {
  .journey-preview__head { display: grid; gap: 10px; }
  .journey-preview__metrics { gap: 4px 10px; }
}
</style>

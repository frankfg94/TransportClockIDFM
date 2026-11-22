<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { BookUser, Info, Map as MapIcon, Search, Timer } from "lucide-vue-next";
import DraggableBottomSheet from "../../components/DraggableBottomSheet.vue";
import LineCombobox from "../../components/LineCombobox.vue";
import LineIconBadge from "../../components/LineIconBadge.vue";
import LoadingBar from "../../components/LoadingBar.vue";
import { useI18n } from "../../i18n";
import type { LineSearchOption } from "../../types/transit";
import AdressBook from "../address-book/AdressBook.vue";
import GlobalTransportPlanModeIcon from "../line-map/GlobalTransportPlanModeIcon.vue";
import type { TransportStationComparison } from "../line-map/globalTransportPlanItinerary";
import { globalMapLineDisplayLabel } from "../transport-map/overlays/globalMapLinePresentation";
import PlaceAutocompleteInput from "../transport-map/search/PlaceAutocompleteInput.vue";
import { normalizeGlobalMapSearchText } from "../transport-map/search/globalMapSearch";
import type { NearbyJourneySection } from "../nearby-stations/nearbyHeavyTransports";
import { parisDateTime } from "../nearby-stations/travelTurbo";
import { stationAccessDirectLineKey, type StationAccessJourney } from "./stationAccessJourneys";
import type { StationAccessLine } from "./stationAccessTargets";
import StationAccessTimeline from "./StationAccessTimeline.vue";
import { hasTransitRecommendation, rankStationAccessRows, stationAccessComparisonTime, useStationAccessOptimizer, type StationAccessRow } from "./useStationAccessOptimizer";

const GlobalTransportPlanTravel = defineAsyncComponent(() => import("../line-map/GlobalTransportPlanTravel.vue"));
const { t, d, n } = useI18n();
const optimizer = useStationAccessOptimizer();
const {
  originQuery, lineId, line, lines, radiusKm, simulationTime, maxTransfers, departureMode, catalogLoading, catalogIncomplete,
  busy, locating, processed, runOrigin, runStart, rows, selection, selectedRow, error, cardProgress, ultimateProgress,
} = optimizer;
const mobile = useMediaQuery("(max-width: 720px)");
const bookOpen = ref(false);
const sheetOpen = ref(false);
const mobileDetails = ref(false);
const mapPanel = ref<HTMLElement>();
const fitAllVersion = ref(0);
const showNetwork = ref(false);
const focusedStationId = ref<string>();
const optionRouteId = ref<string>();
const showUltimate = ref(false);
const lineQuery = ref("");
const helpOpen = ref(false);
const departureModes = ["now", "zeroWait", "ultimate"] as const;
const ultimateMode = computed(() => departureMode.value === "ultimate");
const canCalculate = computed(() => Boolean(line.value && originQuery.value.trim() && Number(radiusKm.value) > 0));
const clock = (epoch: number) => d(new Date(epoch), { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const minutes = (seconds: number) => t("lineOptimizer.minutes", { value: n(seconds / 60, { maximumFractionDigits: 1 }) });

function lineOption(item: StationAccessLine): LineSearchOption {
  const family = item.mode === "TRAIN" || item.mode === "BIKE" ? "TRANSILIEN" : item.mode;
  const mode = item.mode.toLowerCase() as Lowercase<StationAccessLine["mode"]>;
  const label = item.current?.label || item.code;
  const lineName = item.current ? globalMapLineDisplayLabel(item.current) : label;
  const modeLabel = t(`globalMap.modes.${mode}`);
  return {
    id: item.id, family, label, displayName: `${modeLabel} ${lineName}`,
    ref: item.current?.sourceLineId ?? item.id, navitiaId: item.current?.sourceLineId ?? item.id,
    color: item.current?.color, textColor: item.current?.textColor, iconUrl: item.current?.pictogram ?? undefined,
  };
}
const lineOptions = computed(() => {
  const options = lines.value.map(lineOption);
  const counts = new Map<string, number>();
  for (const option of options) counts.set(option.displayName!, (counts.get(option.displayName!) ?? 0) + 1);
  for (const option of options) {
    if (counts.get(option.displayName!)! > 1) option.displayName += ` · ${option.ref.split(":").at(-1)}`;
  }
  return options.sort((a, b) => a.displayName!.localeCompare(b.displayName!, "fr", { numeric: true }));
});
const searchLines = computed(() => {
  const query = normalizeGlobalMapSearchText(lineQuery.value);
  if (!query) return lineOptions.value;
  const matching = lineOptions.value.filter((item) => {
    const name = normalizeGlobalMapSearchText(item.displayName ?? item.label);
    return name.includes(query) || name.replace(/\s+/gu, "").includes(query) ||
      (item.family === "METRO" && query === `m${item.label}`);
  });
  return matching.sort((a, b) => Number(b.label.toLowerCase() === query) - Number(a.label.toLowerCase() === query));
});
const selectedLine = computed(() => lineOptions.value.find((option) => option.id === line.value?.id));
const ordered = computed(() => rankStationAccessRows(rows.value));
const groups = computed(() => ([false, true] as const).map((future) => {
  const entries = ordered.value.filter(({ target }) => target.future === future);
  const fastest = entries.find(hasTransitRecommendation);
  return { future, entries, fastest };
}).filter(({ entries }) => entries.length));
const ultimate = computed(() => selectedRow.value?.ultimate);
const selectedJourney = computed(() => showUltimate.value && ultimate.value?.state === "ready" ? ultimate.value.journey :
  selectedRow.value?.options.find(({ itinerary }) => itinerary.route.id === optionRouteId.value) ?? selectedRow.value?.options[0]);
const ultimateDate = computed(() => runStart.value === undefined ? "" :
  d(new Date(runStart.value), { day: "numeric", month: "long", timeZone: "Europe/Paris" }));
const mapStations = computed(() => rows.value.map(({ target }) => target));
const mapItineraries = computed(() => rows.value.flatMap(({ target, options }) =>
  options[0] ? [{ stationId: target.id, itinerary: options[0].itinerary }] : []));
const stationComparison = computed<TransportStationComparison | undefined>(() => runOrigin.value && ({
  origin: runOrigin.value,
  mode: line.value?.mode,
  stations: mapStations.value,
  activeId: selection.value,
  itineraries: mapItineraries.value,
  showNetwork: showNetwork.value,
  focusJourney: focusedStationId.value !== undefined && focusedStationId.value === selection.value,
  fitAllVersion: fitAllVersion.value,
}));
const mobileDetailMode = computed(() => mobile.value && mobileDetails.value && Boolean(selectedRow.value));

watch([selection, departureMode, maxTransfers], () => {
  optionRouteId.value = undefined;
  showUltimate.value = false;
});
watch(busy, (loading) => {
  if (!loading && mapItineraries.value.length) fitAllVersion.value++;
});
watch([runOrigin, departureMode], () => { focusedStationId.value = undefined; });
watch(runOrigin, (value) => {
  if (!value) {
    sheetOpen.value = false;
    mobileDetails.value = false;
  } else if (mobile.value && rows.value.length) {
    showResults();
  }
});

function chooseLine(option?: LineSearchOption) {
  if (option) lineId.value = option.id;
}
function chooseStation(id: string) {
  focusedStationId.value = id;
  selection.value = id;
  mobileDetails.value = true;
  sheetOpen.value = true;
}
function showResults() {
  mobileDetails.value = false;
  sheetOpen.value = true;
}
function showMap() {
  sheetOpen.value = false;
  mapPanel.value?.scrollIntoView({ block: "nearest" });
}
function calculate() {
  if (!canCalculate.value) return;
  void optimizer.calculate();
}
function selectUltimate(id: string) {
  focusedStationId.value = id;
  showUltimate.value = true;
  void optimizer.searchUltimate(id);
}
function selectOption(id: string) {
  focusedStationId.value = selection.value;
  showUltimate.value = false;
  optionRouteId.value = id;
}
function arrivalClock(journey: StationAccessJourney) {
  if (journey.kind === "ultimate" && journey.recommendedDeparture !== undefined &&
    parisDateTime(journey.recommendedDeparture).slice(0, 8) !== parisDateTime(journey.arrival).slice(0, 8)) {
    return d(new Date(journey.arrival), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  }
  return clock(journey.arrival);
}
function timingLabel(journey: StationAccessJourney) {
  return journey.timing === "mixed" ? t("stationAccess.mixed") : t(`lineOptimizer.${journey.timing}`);
}
function metrics(journey: StationAccessJourney) {
  return t("stationAccess.metrics", {
    walk: minutes(journey.walkingSeconds), wait: minutes(journey.itinerary.totalWaitSeconds), transfers: journey.transfers,
  });
}
function lineBadge(leg: NearbyJourneySection) {
  return { id: leg.lineId, label: leg.lineCode, mode: leg.lineMode, color: leg.lineColor, textColor: leg.lineTextColor };
}
function otherDirectLines(row: StationAccessRow) {
  const primary = row.options[0]?.itinerary.route.transitSections ?? [];
  const seen = new Set([stationAccessDirectLineKey(primary)]);
  return row.options.slice(1).flatMap(({ itinerary }) => {
    const sections = itinerary.route.transitSections;
    const line = stationAccessDirectLineKey(sections);
    if (!line || seen.has(line)) return [];
    seen.add(line);
    return [sections[0]!];
  });
}
function timeBadge(row: StationAccessRow, fastest?: StationAccessRow) {
  if (!hasTransitRecommendation(row) || !fastest || busy.value) return "";
  const gap = stationAccessComparisonTime(row) - stationAccessComparisonTime(fastest);
  if (gap === 0) return t(departureMode.value === "zeroWait" ? "stationAccess.earliestArrival" : "stationAccess.fastest");
  return gap <= 120_000 ? t("stationAccess.similar") : "";
}
</script>

<template>
  <main class="station-access">
    <header>
      <h1>{{ t("stationAccess.title") }}</h1>
      <p>{{ t("stationAccess.objective") }}</p>
    </header>

    <form class="station-access__form" @submit.prevent="calculate">
      <div class="station-access__field">
        <label for="station-access-origin">{{ t("lineOptimizer.origin") }}</label>
        <div class="station-access__inline">
          <PlaceAutocompleteInput id="station-access-origin" v-model="originQuery" @select="optimizer.selectOrigin" />
          <button type="button" :aria-label="t('lineOptimizer.originBook')" @click="bookOpen = true">
            <BookUser :size="19" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="station-access__field">
        <span id="station-access-line-label">{{ t("stationAccess.line") }}</span>
        <LineCombobox
          :model-value="selectedLine" v-model:query="lineQuery" :options="searchLines" :loading="catalogLoading"
          :disabled="catalogLoading" :placeholder="t('stationAccess.line')" compact show-option-names
          aria-labelledby="station-access-line-label" @update:model-value="chooseLine"
        />
      </div>
      <label class="station-access__field">
        {{ t("stationAccess.radius") }}
        <input v-model.number="radiusKm" type="number" min="0.1" step="0.1" required />
      </label>
      <label class="station-access__field">
        {{ t("lineOptimizer.simulationTime") }}
        <input v-model="simulationTime" type="time" :title="t('lineOptimizer.simulationHint')" />
      </label>
      <label class="station-access__field">
        {{ t("stationAccess.maxTransfers") }}
        <select v-model="maxTransfers">
          <option :value="undefined">{{ t("stationAccess.unlimitedTransfers") }}</option>
          <option v-for="limit in [3, 2, 1]" :key="limit" :value="limit">{{ n(limit) }}</option>
          <option :value="0">{{ t("stationAccess.directOnlyTransfers") }}</option>
        </select>
      </label>
      <button class="station-access__calculate" type="submit" :disabled="busy || catalogLoading || !canCalculate">
        <Search :size="17" aria-hidden="true" /> {{ t("stationAccess.calculate") }}
      </button>
      <div class="station-access__departure">
        <fieldset class="station-access__mode" :aria-label="t('stationAccess.departureMode')">
          <label v-for="mode in departureModes" :key="mode">
            <input v-model="departureMode" type="radio" name="station-access-departure" :value="mode" />
            <span>{{ t(`stationAccess.${mode}`) }}</span>
          </label>
        </fieldset>
        <button class="station-access__mode-info" type="button" :aria-label="t('stationAccess.departureHelp')"
          :aria-expanded="helpOpen" aria-describedby="station-access-mode-tooltip"
          @click="helpOpen = !helpOpen" @blur="helpOpen = false" @keydown.esc.stop="helpOpen = false">
          <Info :size="18" aria-hidden="true" />
        </button>
        <div id="station-access-mode-tooltip" class="station-access__mode-tooltip"
          :class="{ 'station-access__mode-tooltip--open': helpOpen }" role="tooltip">
          <p><strong>{{ t("stationAccess.now") }}</strong> {{ t("stationAccess.nowHelp") }}</p>
          <p><strong>{{ t("stationAccess.zeroWait") }}</strong> {{ t("stationAccess.zeroWaitHelp") }}</p>
          <p><strong>{{ t("stationAccess.ultimate") }}</strong> {{ t("stationAccess.ultimateHelp") }}</p>
        </div>
      </div>
    </form>
    <p v-if="catalogLoading" class="station-access__status" role="status">{{ t("stationAccess.catalogLoading") }}</p>
    <p v-else-if="catalogIncomplete" class="station-access__status" role="status">
      {{ t("stationAccess.catalogIncomplete") }}
      <button type="button" :disabled="busy" @click="optimizer.loadCatalog">{{ t("common.actions.retry") }}</button>
    </p>
    <p v-if="error" class="station-access__status" role="alert">
      {{ t(error === "time" ? "lineOptimizer.simulationInvalid" : "stationAccess.originError") }}
    </p>
    <p v-else-if="locating" class="station-access__status" role="status">{{ t("stationAccess.locating") }}</p>
    <p v-else-if="runStart !== undefined && !rows.length" class="station-access__status" role="status">
      {{ t("stationAccess.noStations") }}
    </p>

    <section v-if="stationComparison && rows.length" class="station-access__comparison">
      <div class="station-access__mobile-actions">
        <button type="button" @click="showResults">{{ t("stationAccess.results") }}</button>
        <small role="status">{{ t("stationAccess.progress", { done: processed, total: rows.length }) }}</small>
      </div>
      <DraggableBottomSheet :open="!mobile || sheetOpen" :enabled="mobile"
        :title="t(mobileDetailMode ? 'stationAccess.details' : 'stationAccess.results')"
        class="station-access__sheet" @update:open="sheetOpen = $event">
        <section class="station-access__results">
          <header v-if="!mobileDetailMode" class="station-access__results-header">
            <h2>{{ t("stationAccess.results") }}</h2>
            <p v-if="ultimateMode">{{ t("stationAccess.referenceTimeUltimate", { date: ultimateDate }) }}</p>
            <p v-else-if="runStart !== undefined">
              {{ t(departureMode === "zeroWait" ? "stationAccess.referenceTimeZero" : "stationAccess.referenceTime", { time: clock(runStart) }) }}
            </p>
            <p role="status">{{ t("stationAccess.progress", { done: processed, total: rows.length }) }}</p>
          </header>
          <template v-if="!mobileDetailMode">
            <section v-for="group in groups" :key="String(group.future)" class="station-access__group">
              <h3>{{ t(group.future ? "stationAccess.futureStations" : "stationAccess.openStations") }}</h3>
              <TransitionGroup tag="ul" name="station-access-ranking">
                <li v-for="row in group.entries" :key="row.target.id" class="station-access__row">
                  <button class="station-access__station" type="button" :aria-pressed="selection === row.target.id" @click="chooseStation(row.target.id)">
                    <span class="station-access__row-heading">
                      <strong>{{ row.target.point.label }}</strong>
                      <b v-if="row.options[0]">{{ minutes(row.options[0].itinerary.route.durationSeconds) }}</b>
                    </span>
                    <small>{{ t("stationAccess.distance", { value: n(row.target.distanceMeters / 1000, { maximumFractionDigits: 2 }) }) }}</small>
                    <small v-if="row.target.future">{{ t(row.target.arrivalAtExistingStation ? "stationAccess.futureHubStatus" : "stationAccess.futureStatus") }}</small>
                    <small v-else-if="row.target.approximate">{{ t("stationAccess.approximate") }}</small>
                    <template v-if="row.options[0]">
                      <small v-if="row.options[0].recommendedDeparture !== undefined" class="station-access__departure-time">
                        {{ t("stationAccess.departAt", { time: clock(row.options[0].recommendedDeparture) }) }}
                      </small>
                      <small class="station-access__lines">
                        <LineIconBadge v-for="(leg, index) in row.options[0].itinerary.route.transitSections" :key="index"
                          :line="lineBadge(leg)" compact />
                        <strong v-if="timeBadge(row, group.fastest)">{{ timeBadge(row, group.fastest) }}</strong>
                        <strong v-else-if="row.options[0].kind === 'walkOnly'">{{ t("stationAccess.walkOnly") }}</strong>
                        <strong v-if="row.options[0].semiDirect">{{ t("lineOptimizer.semiDirect") }}</strong>
                      </small>
                      <small v-if="otherDirectLines(row).length" class="station-access__lines">
                        {{ t("stationAccess.alsoDirect") }}
                        <LineIconBadge v-for="(leg, index) in otherDirectLines(row)" :key="index" :line="lineBadge(leg)" compact />
                      </small>
                      <small>{{ metrics(row.options[0]) }}</small>
                      <small>{{ timingLabel(row.options[0]) }}<template v-if="!row.complete && row.options[0].kind !== 'walkOnly'"> · {{ t("stationAccess.coverage") }}</template></small>
                    </template>
                    <small v-else-if="row.state === 'empty'">{{ t(ultimateMode ? "stationAccess.ultimateEmpty" : "stationAccess.outOfService") }}</small>
                    <small v-else-if="row.state === 'error'">{{ t(ultimateMode ? "stationAccess.ultimateError" : "stationAccess.error") }}</small>
                    <small v-else>{{ t(row.state === "running" ? "stationAccess.calculating" : "stationAccess.pending") }}</small>
                  </button>
                  <footer v-if="row.state === 'queued' || row.state === 'running'" class="station-access__row-progress">
                    <LoadingBar :progress="cardProgress.get(row.target.id) ?? 0"
                      :aria-label="t('stationAccess.cardProgress', { station: row.target.point.label })" />
                  </footer>
                  <button v-if="row.state === 'error'" class="station-access__retry" type="button"
                    :disabled="busy || rows.some((item) => item.state === 'running')" @click="optimizer.retry(row.target.id)">
                    {{ t("common.actions.retry") }}
                  </button>
                </li>
              </TransitionGroup>
            </section>
          </template>
          <section v-if="selectedRow && (!mobile || mobileDetailMode)" class="station-access__details">
            <div v-if="mobile" class="station-access__inline station-access__detail-actions">
              <button type="button" @click="showResults">{{ t("stationAccess.results") }}</button>
              <button type="button" @click="showMap"><MapIcon :size="17" aria-hidden="true" /> {{ t("stationAccess.viewMap") }}</button>
            </div>
            <h3>{{ selectedRow.target.point.label }}</h3>
            <p v-if="selectedRow.target.future">{{ t(selectedRow.target.arrivalAtExistingStation ? "stationAccess.futureHubStatus" : "stationAccess.futureStatus") }}</p>
            <div v-if="!ultimateMode" class="station-access__alternatives">
              <template v-if="selectedRow.options.length > 1 || ultimate?.state === 'ready'">
                <button v-for="option in selectedRow.options" :key="option.itinerary.route.id" type="button"
                  :aria-pressed="selectedJourney?.itinerary.route.id === option.itinerary.route.id"
                  @click="selectOption(option.itinerary.route.id)">
                  {{ t(`stationAccess.${option.kind}`) }} · {{ minutes(option.itinerary.route.durationSeconds) }}
                  <LineIconBadge v-for="(leg, index) in option.itinerary.route.transitSections" :key="index" :line="lineBadge(leg)" compact />
                </button>
              </template>
              <div class="station-access__ultimate">
                <button type="button" :disabled="ultimate?.state === 'running'"
                  :aria-pressed="ultimate?.state === 'ready' ? selectedJourney?.kind === 'ultimate' : undefined"
                  :title="t('stationAccess.ultimateHelp')" @click="selectUltimate(selectedRow.target.id)">
                  <Timer :size="17" aria-hidden="true" /> {{ t("stationAccess.ultimate") }}
                  <template v-if="ultimate?.state === 'ready'"> · {{ minutes(ultimate.journey.itinerary.route.durationSeconds) }}</template>
                </button>
                <LoadingBar v-if="ultimate?.state === 'running'" class="station-access__ultimate-progress"
                  :aria-label="t('stationAccess.ultimateLoading', { date: ultimateDate })"
                  :progress="ultimateProgress.get(selectedRow.target.id) ?? 0" />
              </div>
              <button v-if="ultimate?.state === 'running'" type="button" @click="optimizer.cancelUltimate">
                {{ t("common.actions.cancel") }}
              </button>
            </div>
            <p v-if="ultimate?.state === 'running'" role="status">{{ t("stationAccess.ultimateLoading", { date: ultimateDate }) }}</p>
            <p v-else-if="ultimate?.state === 'empty'" role="status">{{ t("stationAccess.ultimateEmpty") }}</p>
            <p v-else-if="ultimate?.state === 'error'" role="alert">{{ t("stationAccess.ultimateError") }}</p>
            <template v-if="selectedJourney">
              <p>
                <strong v-if="selectedJourney.recommendedDeparture !== undefined" class="station-access__departure-time">
                  {{ t("stationAccess.departAt", { time: clock(selectedJourney.recommendedDeparture) }) }} ·
                </strong>
                <strong>{{ t("stationAccess.arrivalAt", { time: arrivalClock(selectedJourney) }) }}</strong>
              </p>
              <p>{{ metrics(selectedJourney) }} · {{ timingLabel(selectedJourney) }}</p>
              <template v-if="selectedJourney.kind === 'ultimate' && ultimate?.state === 'ready'">
                <p>{{ t("stationAccess.ultimateSummary", { date: ultimateDate }) }}
                  <template v-if="!ultimate.complete"> · {{ t("stationAccess.coverage") }}</template>
                </p>
                <p v-if="runStart !== undefined && selectedJourney.recommendedDeparture !== undefined && selectedJourney.recommendedDeparture < runStart">
                  {{ t("stationAccess.ultimateBeforeReference") }}
                </p>
              </template>
              <StationAccessTimeline :journey="selectedJourney" />
            </template>
            <p v-else-if="!ultimateMode || selectedRow.state === 'queued'">
              {{ t(ultimateMode ? "stationAccess.pending" : selectedRow.state === "error" ? "stationAccess.error" :
                selectedRow.state === "empty" ? "stationAccess.outOfService" : "stationAccess.calculating") }}
            </p>
            <button v-if="selectedRow.state === 'error' && mobile" type="button" :disabled="busy" @click="optimizer.retry(selectedRow.target.id)">
              {{ t("common.actions.retry") }}
            </button>
          </section>
        </section>
      </DraggableBottomSheet>
      <section ref="mapPanel" class="station-access__map" :aria-label="t('lineOptimizer.journeyMap')">
        <div class="station-access__map-tools">
          <button type="button" :aria-pressed="showNetwork" @click="showNetwork = !showNetwork">
            <MapIcon :size="16" aria-hidden="true" /> {{ t("stationAccess.networkLines") }}
          </button>
          <button type="button" @click="focusedStationId = undefined; fitAllVersion++">
            <GlobalTransportPlanModeIcon v-if="line" :mode="line.mode" :size="16" />
            {{ t("stationAccess.fitAll") }}
          </button>
        </div>
        <GlobalTransportPlanTravel :itinerary="selectedJourney?.itinerary" :station-comparison="stationComparison" @select-comparison-station="chooseStation" />
      </section>
    </section>

    <AdressBook :open="bookOpen" selection-mode :selection-description="t('lineOptimizer.bookDescription')"
      @close="bookOpen = false" @select="optimizer.selectAddress($event); bookOpen = false" />
  </main>
</template>

<style scoped>
.station-access { width: min(100% - 2rem, 94rem); margin-inline: auto; padding-block: var(--space-5); }
.station-access > header h1 { margin: 0; font-size: clamp(1.7rem, 3.1vw, 2.45rem); }
.station-access > header p { color: var(--muted); margin: var(--space-2) 0 var(--space-4); }
.station-access__form { display: grid; grid-template-columns: minmax(14rem, 2fr) repeat(4, minmax(8rem, 1fr)) auto; gap: var(--space-3); align-items: end; padding: var(--space-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
.station-access__field { display: grid; gap: var(--space-1); align-content: end; min-width: 0; font-weight: 650; font-size: .875rem; }
.station-access__field :is(input, select) { min-width: 0; width: 100%; }
.station-access__field :is(input, select), .station-access button:not(.station-access__station) { box-sizing: border-box; min-height: var(--control-height); color: var(--ink); background: var(--surface-soft); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); font: inherit; }
.station-access button:not(.station-access__station) { display: inline-flex; gap: var(--space-1); align-items: center; justify-content: center; cursor: pointer; }
.station-access button.station-access__calculate { background: var(--idfm-blue, #2249b4); color: #fff; font-weight: 700; }
.station-access button:disabled { cursor: default; opacity: .55; }
.station-access__departure { position: relative; display: flex; align-items: center; gap: var(--space-2); grid-column: 1 / -1; }
.station-access__mode { display: inline-flex; gap: 2px; padding: 3px; margin: 0; min-width: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-soft); }
.station-access__mode label { position: relative; display: flex; cursor: pointer; }
.station-access__mode input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.station-access__mode label span { display: grid; place-items: center; padding: 6px 10px; border-radius: var(--radius-sm); font-size: .85rem; font-weight: 650; }
.station-access__mode input:checked + span { background: var(--idfm-blue, #2249b4); color: #fff; }
.station-access__mode input:focus-visible + span { outline: 2px solid var(--idfm-blue); outline-offset: 2px; }
.station-access__mode-tooltip { position: absolute; top: calc(100% + 6px); inset-inline-start: 0; z-index: 12; visibility: hidden; width: min(25rem, 100%); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); box-shadow: var(--shadow-md); font-size: .85rem; }
.station-access__mode-tooltip p { margin: 0; }
.station-access__mode-tooltip p + p { margin-top: var(--space-2); }
.station-access__mode-tooltip--open, .station-access__mode-info:focus-visible + .station-access__mode-tooltip { visibility: visible; }
@media (hover: hover) {
  .station-access__mode-info:hover + .station-access__mode-tooltip { visibility: visible; }
}
.station-access .station-access__departure-time { color: var(--idfm-blue); font-weight: 750; }
.station-access__inline { display: flex; align-items: stretch; gap: var(--space-2); }
.station-access__status { display: flex; align-items: center; gap: var(--space-3); color: var(--muted); }
.station-access__comparison { display: grid; grid-template-columns: minmax(18rem, 24rem) minmax(0, 1fr); align-items: start; gap: var(--space-4); margin-top: var(--space-4); }
.station-access__results { display: grid; gap: var(--space-3); min-width: 0; }
.station-access__results-header h2, .station-access__group h3, .station-access__details h3 { margin: 0; }
.station-access__results-header p, .station-access__details p { margin: var(--space-1) 0; color: var(--muted); font-size: .875rem; }
.station-access__group ul { display: grid; gap: var(--space-2); list-style: none; padding: 0; margin: var(--space-2) 0 0; }
.station-access-ranking-move { transition: transform 200ms ease-in-out; }
@media (prefers-reduced-motion: reduce) {
  .station-access-ranking-move { transition: none; }
}
.station-access__row, .station-access__details { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
.station-access__row-progress { padding: 0 var(--space-3) var(--space-2); }
.station-access__station { display: grid; gap: 3px; width: 100%; padding: var(--space-3); border: 0; border-radius: var(--radius-md); background: transparent; color: var(--ink); text-align: start; font: inherit; cursor: pointer; }
.station-access__station:focus-visible, .station-access__station[aria-pressed="true"] { outline: 2px solid var(--idfm-blue); outline-offset: -2px; background: var(--surface-soft); }
.station-access__row-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
.station-access__row-heading b { white-space: nowrap; }
.station-access__station small { color: var(--muted); }
.station-access__lines, .station-access__alternatives { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); }
.station-access__lines strong { color: var(--ink); }
.station-access__retry { margin: 0 var(--space-3) var(--space-2); }
.station-access__details { padding: var(--space-3); }
.station-access__alternatives { margin-block: var(--space-2); }
.station-access__alternatives button[aria-pressed="true"] { border-color: var(--idfm-blue); }
.station-access__ultimate { position: relative; display: flex; }
.station-access__ultimate > .station-access__ultimate-progress {
  position: absolute;
  inset-inline: var(--space-2);
  inset-block-end: 3px;
  width: auto;
  pointer-events: none;
}
.station-access__map { position: sticky; top: var(--space-3); display: grid; grid-template-rows: minmax(0, 1fr); height: min(74dvh, 57rem); min-height: 28rem; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
.station-access__map-tools { position: absolute; inset-block-start: var(--space-2); inset-inline-end: var(--space-2); z-index: 15; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); max-width: calc(100% - 2 * var(--space-2)); font-size: .85rem; }
.station-access__map-tools button[aria-pressed="true"] { border-color: var(--idfm-blue); }
.station-access__mobile-actions { display: none; }
@media (max-width: 1060px) {
  .station-access__form { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .station-access__field:first-child { grid-column: span 2; }
}
@media (max-width: 720px) {
  .station-access__form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .station-access__mode { flex-wrap: wrap; }
  .station-access__mode label span { padding-inline: var(--space-2); }
  .station-access__comparison { display: block; }
  .station-access__mobile-actions { display: flex; justify-content: space-between; align-items: center; padding-bottom: var(--space-2); }
  .station-access__map { position: relative; top: auto; height: 65dvh; }
  .station-access__results { padding: var(--space-3); }
  .station-access__detail-actions { margin-bottom: var(--space-3); }
}
</style>

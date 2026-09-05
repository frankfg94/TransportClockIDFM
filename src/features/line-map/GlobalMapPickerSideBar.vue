<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { XIcon } from "lucide-vue-next";
import GlobalMapSidebarBodyLine from "./GlobalMapSidebarBodyLine.vue";
import GlobalMapSidebarBodyStation from "./GlobalMapSidebarBodyStation.vue";
import GlobalMapSidebarTrafficCalendarBody from "./GlobalMapSidebarTrafficCalendarBody.vue";
import type { TrafficDisruption } from "../traffic/types";
import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
import { useI18n } from "../../i18n";
import { fetchGtfsLineFrequency, getGtfsRequestDate } from "../../services/lineFrequency";
import { fetchAnnualRidershipLine, fetchAnnualRidershipStation } from "../../services/ridership";
import { presentRidershipRanking } from "../../services/ridershipRanking";
import type {
  GlobalMapEntrance,
  GlobalMapLine,
  GlobalMapPath,
  GlobalMapStation,
} from "../transport-map/contracts/manifest";
import type { LineMapDirectionOption } from "./types";
import type {
  GlobalMapSidebarBodyProps,
  GlobalMapSidebarTrafficCalendarState,
} from "./globalMapSidebarBodyTypes";
import type { PatternTrafficCalendarDay } from "../service-pattern/trafficCalendar";
import type { PatternTrafficSummaryEntry } from "../service-pattern/trafficCalendarSummary";
import type {
  AnnualRidershipLineResponse,
  AnnualRidershipRankingScope,
  AnnualRidershipStationResponse,
} from "../../types/ridership";

const props = withDefaults(defineProps<{
  station?: GlobalMapStation;
  line?: GlobalMapLine;
  lines?: GlobalMapLine[];
  allLines?: GlobalMapLine[];
  stations?: GlobalMapStation[];
  cityPatternStations?: GlobalMapStation[];
  paths?: GlobalMapPath[];
  previewLine?: GlobalMapLine;
  previewPaths?: GlobalMapPath[];
  entrances?: GlobalMapEntrance[];
  focusedEntranceId?: string;
  selectedStationCount?: number;
  dashboardPlaces?: Array<{ id: string; label: string }>;
  dashboardPlaceId?: string;
  dashboardBusy?: boolean;
  dashboardMessage?: string;
  lastDashboardUndo?: boolean;
  directionOptions?: LineMapDirectionOption[];
  directionVariants?: LineMapDirectionOption[];
  directionLoading?: boolean;
  selectedDirectionId?: string;
  selectedMainDirectionId?: string;
  mergeDirections?: boolean;
  hoveredLineId?: string;
  trafficDisruption?: TrafficDisruption;
  trafficCalendar?: GlobalMapSidebarTrafficCalendarState;
}>(), {
  lines: () => [],
  allLines: () => [],
  stations: () => [],
  cityPatternStations: () => [],
  paths: () => [],
  previewLine: undefined,
  previewPaths: () => [],
  entrances: () => [],
  focusedEntranceId: undefined,
  selectedStationCount: 0,
  dashboardPlaces: () => [],
  dashboardPlaceId: "",
  dashboardBusy: false,
  dashboardMessage: "",
  lastDashboardUndo: false,
  directionOptions: () => [],
  directionVariants: () => [],
  directionLoading: false,
  hoveredLineId: undefined,
  trafficDisruption: undefined,
  trafficCalendar: undefined,
  mergeDirections: false,
});

const emit = defineEmits<{
  close: [];
  "select-line": [lineId: string];
  "change-line": [];
  "view-line-schema": [];
  "focus-entrance": [entrance: GlobalMapEntrance];
  "add-active-station": [];
  "add-selection": [];
  "undo-dashboard": [];
  "update:dashboardPlaceId": [placeId: string];
  "change-direction": [directionId: string];
  "change-direction-variant": [directionId: string];
  "toggle-merge-directions": [];
  "hover-line": [lineId: string | undefined];
  "traffic-calendar-close-expanded": [];
  "traffic-calendar-previous": [];
  "traffic-calendar-next": [];
  "traffic-calendar-reset-today": [];
  "traffic-calendar-select": [day: PatternTrafficCalendarDay];
  "traffic-calendar-expand": [];
  "traffic-calendar-focus-disruption": [entry: PatternTrafficSummaryEntry];
}>();

const { t } = useI18n();

const SIDEBAR_PREVIEW_SWITCH_DEBOUNCE_MS = 100;

// The tooltip can briefly lose its hovered line while the pointer crosses the
// small gap between two overlapping line choices. Keep the current body
// mounted during that gap so the station/line layouts do not clip or flash.
const bodyPreviewLine = shallowRef<GlobalMapLine | undefined>(props.previewLine);
const bodyPreviewPaths = shallowRef<GlobalMapPath[]>(props.previewPaths);
let previewSwitchTimer: ReturnType<typeof setTimeout> | undefined;

function clearPreviewSwitchTimer(): void {
  if (previewSwitchTimer === undefined) return;
  clearTimeout(previewSwitchTimer);
  previewSwitchTimer = undefined;
}

function commitPreviewState(): void {
  bodyPreviewLine.value = props.previewLine;
  bodyPreviewPaths.value = props.previewPaths;
}

watch(
  [() => props.station?.id, () => props.previewLine?.id],
  ([stationId, previewLineId], previous) => {
    clearPreviewSwitchTimer();

    const stationChanged = previous !== undefined && previous[0] !== stationId;
    // A real line-to-line change can update immediately because both choices
    // use the same body component. Only debounce the transient "no preview"
    // state emitted while crossing the tooltip gap.
    if (
      !stationId ||
      stationChanged ||
      bodyPreviewLine.value === undefined ||
      previewLineId !== undefined
    ) {
      commitPreviewState();
      return;
    }

    previewSwitchTimer = setTimeout(() => {
      previewSwitchTimer = undefined;
      commitPreviewState();
    }, SIDEBAR_PREVIEW_SWITCH_DEBOUNCE_MS);
  },
);

watch(
  () => props.previewPaths,
  (previewPaths) => {
    if (props.previewLine?.id === bodyPreviewLine.value?.id) {
      bodyPreviewPaths.value = previewPaths;
    }
  },
);

// The parent already passes the union of entrances for a grouped physical station result.
const stationEntrances = computed(() => props.entrances);
const numberedEntrances = computed(() => {
  const usedCodes = new Set(
    stationEntrances.value
      .map((entrance) => entrance.code?.trim())
      .filter((code): code is string => Boolean(code)),
  );
  let nextFallbackCode = 1;

  const numbered = stationEntrances.value.map((entrance) => {
    let displayCode = entrance.code?.trim();
    if (!displayCode) {
      while (usedCodes.has(String(nextFallbackCode))) nextFallbackCode += 1;
      displayCode = String(nextFallbackCode);
      usedCodes.add(displayCode);
      nextFallbackCode += 1;
    }

    return { entrance, displayCode };
  });

  return numbered.sort((left, right) => {
    const leftNumber = getEntranceNumber(left.displayCode);
    const rightNumber = getEntranceNumber(right.displayCode);
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    return left.displayCode.localeCompare(right.displayCode, "fr-FR", { numeric: true }) ||
      left.entrance.name.localeCompare(right.entrance.name, "fr-FR");
  });
});
const displayLine = computed(() => bodyPreviewLine.value ?? props.line);
const isLinePreview = computed(() => Boolean(bodyPreviewLine.value));
const frequencyProfile = ref<GtfsLineFrequencyResponse>();
const frequencyLoading = ref(false);
const frequencyUnavailable = ref(false);
const frequencyRequestToken = ref(0);
const ridershipLine = ref<AnnualRidershipLineResponse>();
const ridershipLoading = ref(false);
const ridershipUnavailable = ref(false);
const ridershipRequestToken = ref(0);
const ridershipStation = ref<AnnualRidershipStationResponse>();
const ridershipStationLoading = ref(false);
const ridershipStationUnavailable = ref(false);
const ridershipStationRequestToken = ref(0);
const ridershipStationScope = ref<AnnualRidershipRankingScope>("network");
let frequencyTimer: ReturnType<typeof setTimeout> | undefined;

let frequencyController: AbortController | undefined;
let frequencyDate = getGtfsRequestDate();
let frequencyDateTimer: ReturnType<typeof setInterval> | undefined;
const ridershipLineRanking = computed(() => presentRidershipRanking(ridershipLine.value?.ranking));
const ridershipStationRanking = computed(() => presentRidershipRanking(
  ridershipStation.value?.rankings?.[ridershipStationScope.value],
));
const isIdfmRailEntryValidation = computed(() =>
  ridershipStation.value?.primary.metric === "annual_station_entries" &&
  ridershipStation.value.primary.sourceIds.includes("idfm-rail-validations"),
);
const ridershipStationScopeOptions = computed(() => {
  const rankings = ridershipStation.value?.rankings;
  const options: Array<{ value: AnnualRidershipRankingScope; label: string }> = [
    {
      value: "network",
      label: t(isIdfmRailEntryValidation.value
        ? "globalMap.sidebar.annualRidershipRailStationScopeNetwork"
        : "globalMap.sidebar.annualRidershipStationScopeNetwork"),
    },
  ];
  if (props.line && !bodyPreviewLine.value && rankings?.mode) {
    options.push({
      value: "mode",
      label: t("globalMap.sidebar.annualRidershipStationScopeMode", { mode: modeLabel(props.line.mode) }),
    });
  }
  if (props.line && !bodyPreviewLine.value && rankings?.line) {
    options.push({
      value: "line",
      label: t("globalMap.sidebar.annualRidershipStationScopeLine", {
        line: props.line.label || props.line.code,
      }),
    });
  }
  return options;
});
const sidebarBodyIsLine = computed(() => Boolean(
  bodyPreviewLine.value || (!props.station && props.line),
));
const sidebarBodyComponent = computed(() =>
  props.station && !bodyPreviewLine.value
    ? GlobalMapSidebarBodyStation
    : GlobalMapSidebarBodyLine);
const trafficCalendarOpen = computed(() => props.trafficCalendar?.open === true);
const panelLine = computed(() => sidebarBodyIsLine.value ? displayLine.value : undefined);
const panelEyebrow = computed(() =>
  trafficCalendarOpen.value
    ? t("globalMap.sidebar.trafficCalendarEyebrow")
    : isLinePreview.value
    ? t("globalMap.sidebar.linePreviewEyebrow")
    : panelLine.value ? t("globalMap.sidebar.lineEyebrow") : t("globalMap.sidebar.eyebrow"));
const panelTitle = computed(() => {
  if (trafficCalendarOpen.value) return t("pattern.trafficCalendarTitle");
  if (panelLine.value) return t("globalMap.search.lineName", { line: panelLine.value.label || panelLine.value.code });
  if (props.station) return props.station.name;
  return t("globalMap.sidebar.selection");
});
const sidebarBodyProps = computed<GlobalMapSidebarBodyProps>(() => ({
  station: props.station,
  displayLine: displayLine.value,
  lines: props.lines,
  allLines: props.allLines,
  stations: props.stations,
  cityPatternStations: props.cityPatternStations,
  paths: props.paths,
  previewPaths: bodyPreviewPaths.value,
  entrances: stationEntrances.value,
  numberedEntrances: numberedEntrances.value,
  focusedEntranceId: props.focusedEntranceId,
  hoveredLineId: props.hoveredLineId,
  dashboardBusy: props.dashboardBusy,
  isLinePreview: isLinePreview.value,
  trafficDisruption: props.trafficDisruption,
  frequencyProfile: frequencyProfile.value,
  frequencyLoading: frequencyLoading.value,
  frequencyUnavailable: frequencyUnavailable.value,
  ridershipLine: ridershipLine.value,
  ridershipLoading: ridershipLoading.value,
  ridershipUnavailable: ridershipUnavailable.value,
  ridershipLineRanking: ridershipLineRanking.value,
  ridershipStation: ridershipStation.value,
  ridershipStationLoading: ridershipStationLoading.value,
  ridershipStationUnavailable: ridershipStationUnavailable.value,
  ridershipStationRanking: ridershipStationRanking.value,
  ridershipStationScope: ridershipStationScope.value,
  ridershipStationScopeOptions: ridershipStationScopeOptions.value,
  directionOptions: props.directionOptions,
  directionVariants: props.directionVariants,
  directionLoading: props.directionLoading,
  selectedDirectionId: props.selectedDirectionId,
  selectedMainDirectionId: props.selectedMainDirectionId,
  mergeDirections: props.mergeDirections,
}));

function modeLabel(mode: GlobalMapLine["mode"]): string {
  const keys: Record<GlobalMapLine["mode"], string> = {
    BUS: "bus",
    METRO: "metro",
    RER: "rer",
    TRAIN: "train",
    TRANSILIEN: "transilien",
    TRAM: "tram",
    CABLE: "cable",
    NOCTILIEN: "noctilien",
    BIKE: "bike",
  };
  return t(("globalMap.modes." + keys[mode]) as never);
}

function getEntranceNumber(code: string): number {
  const match = code.match(/\d+/u);
  return match ? Number.parseInt(match[0], 10) : Number.POSITIVE_INFINITY;
}

function scheduleFrequencyLoad(): void {
  if (frequencyTimer !== undefined) {
    clearTimeout(frequencyTimer);
    frequencyTimer = undefined;
  }

  frequencyRequestToken.value += 1;
  frequencyController?.abort();
  frequencyController = undefined;
  frequencyDate = getGtfsRequestDate();
  frequencyProfile.value = undefined;
  frequencyUnavailable.value = false;
  frequencyLoading.value = false;

  const line = props.line;
  if (
    typeof window === "undefined" ||
    !line ||
    line.mode === "BIKE"
  ) {
    frequencyUnavailable.value = Boolean(line);
    return;
  }

  frequencyLoading.value = true;
  const token = frequencyRequestToken.value;
  // Let the first paint of the line card settle before requesting GTFS. This
  // also keeps opening the picker responsive on a cold network connection.
  frequencyTimer = setTimeout(() => {
    frequencyTimer = undefined;
    void loadFrequencyProfile(line.id, token);
  }, 80);
}

async function loadFrequencyProfile(lineId: string, token: number): Promise<void> {
  const line = props.line;
  if (!line || line.id !== lineId) {
    return;
  }

  const controller = new AbortController();
  frequencyController = controller;
  try {
    const profile = await fetchGtfsLineFrequency(lineId, { signal: controller.signal });
    if (token !== frequencyRequestToken.value) return;
    frequencyProfile.value = profile;
    frequencyUnavailable.value = profile.status !== "ready";
  } catch {
    if (token !== frequencyRequestToken.value) return;
    frequencyUnavailable.value = true;
  } finally {
    if (token === frequencyRequestToken.value) {
      frequencyLoading.value = false;
    }
  }
}

function scheduleRidershipLoad(): void {
  ridershipRequestToken.value += 1;
  ridershipLine.value = undefined;
  ridershipUnavailable.value = false;
  ridershipLoading.value = false;

  const line = props.line;
  if (typeof window === "undefined" || !line) return;

  ridershipLoading.value = true;
  const token = ridershipRequestToken.value;
  void loadRidershipLine(line.id, token);
}

async function loadRidershipLine(lineId: string, token: number): Promise<void> {
  try {
    const result = await fetchAnnualRidershipLine(lineId);
    if (token !== ridershipRequestToken.value || props.line?.id !== lineId) return;
    ridershipLine.value = result;
    ridershipUnavailable.value = result.primary.status === "unavailable" || typeof result.primary.value !== "number";
  } catch {
    if (token !== ridershipRequestToken.value) return;
    ridershipUnavailable.value = true;
  } finally {
    if (token === ridershipRequestToken.value) ridershipLoading.value = false;
  }
}

function scheduleStationRidershipLoad(): void {
  ridershipStationRequestToken.value += 1;
  ridershipStation.value = undefined;
  ridershipStationUnavailable.value = false;
  ridershipStationLoading.value = false;
  ridershipStationScope.value = "network";

  const station = props.station;
  if (typeof window === "undefined" || !station || bodyPreviewLine.value) return;

  ridershipStationLoading.value = true;
  const token = ridershipStationRequestToken.value;
  void loadRidershipStation(station.id, props.line?.id, token);
}

async function loadRidershipStation(
  stationId: string,
  lineId: string | undefined,
  token: number,
): Promise<void> {
  try {
    // A line response already contains the ranked station documents. Reuse it
    // when possible so a station click on an active line does not make a second
    // request for data that is already in the sidebar cache.
    if (lineId) {
      try {
        const line = await fetchAnnualRidershipLine(lineId);
        if (token !== ridershipStationRequestToken.value || props.station?.id !== stationId) return;
        const lineStation = line.stations.find((candidate) => candidate.id === stationId);
        if (lineStation) {
          ridershipStation.value = {
            ...lineStation,
            sources: line.sources,
            rankings: lineStation.rankings ?? {},
            context: { lineId: line.id, mode: line.mode },
          };
          ridershipStationScope.value = lineStation.rankings?.line?.lineId === line.id
            ? "line"
            : "network";
          ridershipStationUnavailable.value = lineStation.primary.status === "unavailable" || typeof lineStation.primary.value !== "number";
          return;
        }
      } catch {
        // Fall back to the station endpoint below when the line document is
        // unavailable or does not contain this physical station.
      }
    }

    const result = await fetchAnnualRidershipStation(stationId, lineId);
    if (token !== ridershipStationRequestToken.value || props.station?.id !== stationId) return;
    ridershipStation.value = result;
    ridershipStationScope.value = lineId && result.rankings.line?.lineId === lineId
      ? "line"
      : "network";
    ridershipStationUnavailable.value = result.primary.status === "unavailable" || typeof result.primary.value !== "number";
  } catch {
    if (token !== ridershipStationRequestToken.value) return;
    ridershipStationUnavailable.value = true;
  } finally {
    if (token === ridershipStationRequestToken.value) ridershipStationLoading.value = false;
  }
}

watch(
  () => props.line?.id,
  scheduleFrequencyLoad,
  { immediate: true },
);

watch(
  () => props.line?.id,
  scheduleRidershipLoad,
  { immediate: true },
);

watch(
  [() => props.station?.id, () => props.line?.id, () => bodyPreviewLine.value?.id],
  scheduleStationRidershipLoad,
  { immediate: true },
);

// Refresh the date even while the same pinned line remains open overnight.
onMounted(() => {
  frequencyDateTimer = setInterval(() => {
    if (frequencyDate !== getGtfsRequestDate()) scheduleFrequencyLoad();
  }, 30_000);
});

onBeforeUnmount(() => {
  clearPreviewSwitchTimer();
  if (frequencyTimer !== undefined) clearTimeout(frequencyTimer);
  if (frequencyDateTimer !== undefined) clearInterval(frequencyDateTimer);
  frequencyController?.abort();
  frequencyRequestToken.value += 1;
  ridershipRequestToken.value += 1;
  ridershipStationRequestToken.value += 1;
});
</script>

<template>
  <aside
    class="global-map-picker-sidebar"
    data-global-map-picker-sidebar
    :data-global-map-line-preview="props.previewLine?.id"
    :aria-label="t('globalMap.sidebar.aria')"
    @pointerleave="emit('hover-line', undefined)"
  >
    <header class="global-map-picker-sidebar__header" :class="{ 'global-map-picker-sidebar__header--line': panelLine || trafficCalendarOpen }">
      <div>
        <p class="global-map-picker-sidebar__eyebrow">{{ panelEyebrow }}</p>
        <h2>{{ panelTitle }}</h2>
      </div>
      <button v-if="!isLinePreview" class="global-map-picker-sidebar__close" type="button" :aria-label="trafficCalendarOpen ? t('globalMap.sidebar.closeTrafficCalendar') : t('globalMap.sidebar.close')" @click="emit('close')">
        <XIcon :size="20" :stroke-width="2.25" aria-hidden="true" />
      </button>
    </header>

    <div class="global-map-picker-sidebar__content">
      <GlobalMapSidebarTrafficCalendarBody
        v-if="trafficCalendarOpen && trafficCalendar"
        v-bind="trafficCalendar"
        @close-expanded="emit('traffic-calendar-close-expanded')"
        @previous="emit('traffic-calendar-previous')"
        @next="emit('traffic-calendar-next')"
        @reset-today="emit('traffic-calendar-reset-today')"
        @select="emit('traffic-calendar-select', $event)"
        @expand="emit('traffic-calendar-expand')"
        @focus-disruption="emit('traffic-calendar-focus-disruption', $event)"
      />
      <component
        v-else
        :is="sidebarBodyComponent"
        v-bind="sidebarBodyProps"
        @select-line="emit('select-line', $event)"
        @change-line="emit('change-line')"
        @view-line-schema="emit('view-line-schema')"
        @focus-entrance="emit('focus-entrance', $event)"
        @change-direction="emit('change-direction', $event)"
        @change-direction-variant="emit('change-direction-variant', $event)"
        @toggle-merge-directions="emit('toggle-merge-directions')"
        @update:scope="ridershipStationScope = $event"
        @hover-line="emit('hover-line', $event)"
        @add-active-station="emit('add-active-station')"
      />

      <section v-if="selectedStationCount && !trafficCalendarOpen" class="global-map-picker-sidebar__dashboard">
        <strong>{{ t("globalMap.sidebar.dashboardCount", { count: selectedStationCount }) }}</strong>
        <select :value="dashboardPlaceId" :aria-label="t('globalMap.sidebar.dashboardPlace')" @change="emit('update:dashboardPlaceId', ($event.target as HTMLSelectElement).value)">
          <option v-for="place in dashboardPlaces" :key="place.id" :value="place.id">{{ place.label }}</option>
        </select>
        <button class="global-map-picker-sidebar__primary-action" type="button" :disabled="dashboardBusy || !dashboardPlaces.length" @click="emit('add-selection')">{{ t("globalMap.sidebar.addSelection") }}</button>
        <button v-if="lastDashboardUndo" class="global-map-picker-sidebar__secondary-action" type="button" :disabled="dashboardBusy" @click="emit('undo-dashboard')">{{ t("globalMap.sidebar.undo") }}</button>
        <p v-if="dashboardMessage" aria-live="polite">{{ dashboardMessage }}</p>
      </section>
    </div>
  </aside>
</template>

<style>
.global-map-picker-sidebar {
  --sidebar-border: #e5e9f2;
  position: absolute;
  z-index: 6;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  width: min(430px, 44vw);
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--sidebar-border);
  color: #18233f;
  background: rgba(248, 250, 253, .97);
  box-shadow: -18px 0 48px rgba(24, 41, 76, .15);
  backdrop-filter: blur(18px);
}
.global-map-picker-sidebar-slide-enter-active,
.global-map-picker-sidebar-slide-leave-active {
  will-change: opacity, transform;
}
.global-map-picker-sidebar-slide-enter-active {
  transition: opacity 220ms ease-out, transform 380ms cubic-bezier(.16, 1, .3, 1);
}
.global-map-picker-sidebar-slide-leave-active {
  transition: opacity 170ms ease-in, transform 280ms cubic-bezier(.4, 0, .8, .2);
}
.global-map-picker-sidebar-slide-enter-from,
.global-map-picker-sidebar-slide-leave-to {
  opacity: 0;
  transform: translate3d(100%, 0, 0);
}
.global-map-picker-sidebar__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 22px 20px 18px;
  border-bottom: 1px solid var(--sidebar-border);
  background: rgba(255, 255, 255, .8);
}
.global-map-picker-sidebar__header h2,
.global-map-picker-sidebar__header p { margin: 0; }
.global-map-picker-sidebar__header h2 { max-width: 310px; font-size: 1.12rem; letter-spacing: -.02em; }
.global-map-picker-sidebar__eyebrow { margin-bottom: 6px !important; color: #71809d; font-size: .64rem; font-weight: 950; letter-spacing: .12em; text-transform: uppercase; }
.global-map-picker-sidebar__close {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--sidebar-border);
  border-radius: 13px;
  background: #fff;
  color: #35415d;
  cursor: pointer;
  box-shadow: 0 5px 16px rgba(36, 55, 94, .08);
}
.global-map-picker-sidebar__close:hover,
.global-map-picker-sidebar__close:focus-visible { border-color: #b9c4d8; outline: 0; box-shadow: 0 7px 18px rgba(36, 55, 94, .14); }
.global-map-picker-sidebar__close svg { display: block; flex: 0 0 auto; }
.global-map-picker-sidebar__content {
  display: grid;
  align-content: start;
  flex: 1;
  gap: 16px;
  min-height: 0;
  overflow: auto;
  padding: 18px;
  scrollbar-gutter: stable;
}
.global-map-picker-sidebar__station-profile {
  display: grid;
  gap: 16px;
}
.global-map-picker-sidebar__station-heading,
.global-map-picker-sidebar__line-heading { display: flex; align-items: center; gap: 12px; }
.global-map-picker-sidebar__station-heading > svg { flex: 0 0 auto; color: #0064ff; }
.global-map-picker-sidebar__station-heading strong,
.global-map-picker-sidebar__station-heading span,
.global-map-picker-sidebar__station-heading small,
.global-map-picker-sidebar__line-heading strong,
.global-map-picker-sidebar__line-heading span { display: block; }
.global-map-picker-sidebar__station-heading span,
.global-map-picker-sidebar__line-heading span { margin-top: 4px; color: #71809d; font-size: .78rem; font-weight: 750; }
.global-map-picker-sidebar__station-heading small { margin-top: 5px; color: #71809d; font-size: .68rem; font-weight: 900; text-transform: uppercase; }
.global-map-picker-sidebar__card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--sidebar-border);
  border-radius: 16px;
  background: linear-gradient(145deg, #fff, #f3f6fb);
  box-shadow: 0 10px 28px rgba(24, 41, 76, .07);
}
.global-map-picker-sidebar__card-title { display: flex; align-items: center; justify-content: space-between; font-size: .76rem; font-weight: 900; }
.global-map-picker-sidebar__list { display: grid; gap: 7px; padding: 0; margin: 0; list-style: none; color: #71809d; font-size: .75rem; }
.global-map-picker-sidebar__list li { display: flex; align-items: baseline; gap: 7px; }
.global-map-picker-sidebar__list strong { color: #0064ff; font-size: .7rem; }
.global-map-picker-sidebar__entrance {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 40px;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: rgba(255, 255, 255, .72);
  color: #18233f;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}
.global-map-picker-sidebar__entrance:hover,
.global-map-picker-sidebar__entrance:focus-visible {
  border-color: rgba(0, 100, 255, .24);
  background: #fff;
  outline: 0;
  transform: translateY(-1px);
}
.global-map-picker-sidebar__entrance--focused {
  border-color: rgba(0, 100, 255, .42);
  background: #eff5ff;
  box-shadow: 0 7px 18px rgba(0, 100, 255, .14);
}
.global-map-picker-sidebar__entrance strong { flex: 0 0 auto; }
.global-map-picker-sidebar__entrance span { min-width: 0; color: inherit; }
.global-map-picker-sidebar__secondary-action,
.global-map-picker-sidebar__primary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  border: 0;
  border-radius: 13px;
  font: inherit;
  font-weight: 900;
  cursor: pointer;
}
.global-map-picker-sidebar__secondary-action { background: #edf2fa; color: #31517f; }
.global-map-picker-sidebar__primary-action { background: #18233f; color: #fff; box-shadow: 0 9px 18px rgba(24, 35, 63, .16); }
.global-map-picker-sidebar__primary-action:hover,
.global-map-picker-sidebar__primary-action:focus-visible { background: #0e1730; outline: 0; }
.global-map-picker-sidebar__primary-action:disabled { opacity: .55; cursor: not-allowed; }
.global-map-picker-sidebar__dashboard { display: grid; gap: 9px; padding-top: 14px; border-top: 1px solid var(--sidebar-border); }
.global-map-picker-sidebar__dashboard select { min-height: 38px; padding: 0 8px; border: 1px solid var(--sidebar-border); border-radius: 9px; background: #fff; color: #18233f; font: inherit; }
.global-map-picker-sidebar__dashboard p { margin: 0; color: #71809d; font-size: .75rem; }

.global-map-picker-sidebar__line-profile { display: grid; align-content: start; gap: 14px; }
.global-map-picker-sidebar__line-hero {
  position: relative;
  display: grid;
  gap: 14px;
  overflow: hidden;
  padding: 17px;
  border: 1px solid color-mix(in srgb, var(--line-color) 24%, #dfe5f0);
  border-radius: 20px;
  background: linear-gradient(145deg, color-mix(in srgb, var(--line-color) 12%, #fff), #fff 68%);
  box-shadow: 0 10px 24px rgba(24, 41, 76, .08);
}
.global-map-picker-sidebar__line-hero::after {
  position: absolute;
  right: -38px;
  bottom: -48px;
  width: 150px;
  height: 150px;
  border: 22px solid color-mix(in srgb, var(--line-color) 14%, transparent);
  border-radius: 50%;
  content: "";
}
.global-map-picker-sidebar__line-hero-main { position: relative; z-index: 1; display: flex; align-items: center; gap: 12px; }
.global-map-picker-sidebar__line-hero-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  min-height: 44px;
  border-radius: 14px;
  background: rgba(255, 255, 255, .78);
}
.global-map-picker-sidebar__line-hero-main p { margin: 0 0 3px; color: #71809d; font-size: .62rem; font-weight: 950; letter-spacing: .1em; text-transform: uppercase; }
.global-map-picker-sidebar__line-hero-main h3 { margin: 0; color: var(--line-color); font-size: 1.65rem; line-height: 1; letter-spacing: -.04em; }
.global-map-picker-sidebar__line-hero-main span { display: block; margin-top: 6px; color: #53627e; font-size: .75rem; font-weight: 800; }
.global-map-picker-sidebar__line-hero-main i { font-style: normal; color: #a1aec3; }
.global-map-picker-sidebar__line-code {
  position: relative;
  z-index: 1;
  justify-self: start;
  padding: 4px 7px;
  border-radius: 6px;
  background: rgba(255, 255, 255, .62);
  color: #71809d;
  font: 700 .62rem/1 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.global-map-picker-sidebar__line-rule { position: relative; z-index: 1; height: 5px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--line-color) 14%, #fff); }
.global-map-picker-sidebar__line-rule span { display: block; width: 58%; height: 100%; border-radius: inherit; background: var(--line-color); }

.global-map-picker-sidebar__line-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.global-map-picker-sidebar__line-stat {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 12px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: 14px;
  background: #fff;
}
.global-map-picker-sidebar__line-stat > svg { flex: 0 0 auto; color: var(--line-color); }
.global-map-picker-sidebar__line-stat strong,
.global-map-picker-sidebar__line-stat span { display: block; }
.global-map-picker-sidebar__line-stat strong { overflow: hidden; color: #18233f; font-size: .92rem; text-overflow: ellipsis; white-space: nowrap; }
.global-map-picker-sidebar__line-stat span { margin-top: 3px; color: #71809d; font-size: .65rem; font-weight: 800; }

.global-map-picker-sidebar__line-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--sidebar-border);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 22px rgba(24, 41, 76, .05);
}
.global-map-picker-sidebar__line-card-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #253452; font-size: .78rem; font-weight: 950; }
.global-map-picker-sidebar__line-card-title > span { display: inline-flex; align-items: center; gap: 7px; }
.global-map-picker-sidebar__line-card-title svg { color: var(--line-color, #496081); }
.global-map-picker-sidebar__line-card-title small { color: #8491a9; font-size: .64rem; font-weight: 800; }
.global-map-picker-sidebar__accordion-trigger {
  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.global-map-picker-sidebar__accordion-trigger > span { display: inline-flex; align-items: center; gap: 7px; }
.global-map-picker-sidebar__accordion-trigger > svg { flex: 0 0 auto; transition: transform 160ms ease; }
.global-map-picker-sidebar__accordion-trigger:hover,
.global-map-picker-sidebar__accordion-trigger:focus-visible { color: var(--line-color, #253452); outline: 0; }
.global-map-picker-sidebar__accordion-trigger--expanded > svg { transform: rotate(180deg); }
.global-map-picker-sidebar__route { display: grid; grid-template-columns: minmax(0, 1fr) 46px minmax(0, 1fr); gap: 8px; align-items: center; }
.global-map-picker-sidebar__route-station { display: flex; min-width: 0; align-items: flex-start; gap: 8px; }
.global-map-picker-sidebar__route-station--end { flex-direction: row-reverse; text-align: right; }
.global-map-picker-sidebar__route-station > div { min-width: 0; }
.global-map-picker-sidebar__route-dot { flex: 0 0 auto; width: 10px; height: 10px; margin-top: 3px; border: 3px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px var(--line-color); }
.global-map-picker-sidebar__route-station small,
.global-map-picker-sidebar__route-station span,
.global-map-picker-sidebar__route-station strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.global-map-picker-sidebar__route-station small { color: #8491a9; font-size: .6rem; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
.global-map-picker-sidebar__route-station strong { margin-top: 3px; color: #253452; font-size: .74rem; }
.global-map-picker-sidebar__route-station div > span { margin-top: 2px; color: #8491a9; font-size: .64rem; }
.global-map-picker-sidebar__route-track { position: relative; display: grid; justify-items: center; gap: 5px; color: #8491a9; font-size: .58rem; font-weight: 850; text-align: center; }
.global-map-picker-sidebar__route-track::before { position: absolute; top: 5px; right: 0; left: 0; height: 2px; background: color-mix(in srgb, var(--line-color) 42%, #dfe5f0); content: ""; }
.global-map-picker-sidebar__route-track span { position: relative; z-index: 1; width: 8px; height: 8px; border: 2px solid #fff; border-radius: 50%; background: var(--line-color); box-shadow: 0 0 0 1px var(--line-color); }
.global-map-picker-sidebar__directions { display: grid; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid #e8edf5; }
.global-map-picker-sidebar__directions-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.global-map-picker-sidebar__directions-label { color: #66748c; font-size: .68rem; font-weight: 850; letter-spacing: .04em; text-transform: uppercase; }
.global-map-picker-sidebar__direction-list { display: grid; gap: 6px; }
.global-map-picker-sidebar__direction-option { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 8px 10px; border: 1px solid #dbe3ef; border-radius: 9px; background: #fff; color: #18243a; cursor: pointer; font: inherit; font-size: .8rem; font-weight: 800; text-align: left; }
.global-map-picker-sidebar__direction-option small { flex: 0 0 auto; color: #77859c; font-size: .67rem; font-weight: 750; }
.global-map-picker-sidebar__direction-option:hover,
.global-map-picker-sidebar__direction-option:focus-visible { outline: 0; border-color: var(--line-color); box-shadow: 0 0 0 2px color-mix(in srgb, var(--line-color) 20%, transparent); }
.global-map-picker-sidebar__direction-option--selected { border-color: var(--line-color); background: color-mix(in srgb, var(--line-color) 10%, #fff); color: color-mix(in srgb, var(--line-color) 85%, #18243a); }
.global-map-picker-sidebar__direction-option--variant { font-size: .75rem; font-weight: 720; }
.global-map-picker-sidebar__direction-variants { display: grid; gap: 8px; color: #53627a; font-size: .75rem; }
.global-map-picker-sidebar__direction-variants > summary { cursor: pointer; font-weight: 800; }
.global-map-picker-sidebar__route-track small { position: relative; z-index: 1; padding: 0 3px; background: #fff; white-space: nowrap; }
.global-map-picker-sidebar__line-empty { margin: 0; color: #8491a9; font-size: .7rem; }

.global-map-picker-sidebar__line-hint { margin: -4px 0 0; color: #8491a9; font-size: .68rem; line-height: 1.35; }
.global-map-picker-sidebar__frequency-loading { display: flex; align-items: center; gap: 8px; color: #71809d; font-size: .7rem; font-weight: 750; }
.global-map-picker-sidebar__loading-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--line-color); box-shadow: 0 0 0 4px color-mix(in srgb, var(--line-color) 15%, transparent); }
.global-map-picker-sidebar__connection-list { display: flex; flex-wrap: wrap; gap: 6px; }
.global-map-picker-sidebar__connection { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 5px 8px; border: 1px solid #e1e7f0; border-radius: 999px; background: #f8faff; color: #253452; cursor: pointer; }
.global-map-picker-sidebar__connection:hover,
.global-map-picker-sidebar__connection:focus-visible { border-color: var(--line-color); outline: 0; }
.global-map-picker-sidebar__connection:disabled { cursor: default; opacity: .55; }
.global-map-picker-sidebar__connection strong { font-size: .7rem; }
.global-map-picker-sidebar__connection small { color: #8491a9; font-size: .6rem; font-weight: 750; }
.global-map-picker-sidebar__connection-dot { width: 8px; height: 8px; border-radius: 50%; }
.global-map-picker-sidebar__line-provenance { display: flex; align-items: flex-start; gap: 7px; padding: 1px 2px; color: #8491a9; font-size: .62rem; font-weight: 750; line-height: 1.35; }
.global-map-picker-sidebar__line-provenance svg { flex: 0 0 auto; margin-top: 1px; }
.global-map-picker-sidebar__line-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.global-map-picker-sidebar__line-actions .global-map-picker-sidebar__secondary-action { min-width: 0; padding: 0 10px; font-size: .76rem; }
.global-map-picker-sidebar__line-action { width: 100%; background: var(--line-color, #18233f); }
.global-map-picker-sidebar__line-action:hover,
.global-map-picker-sidebar__line-action:focus-visible { background: color-mix(in srgb, var(--line-color, #18233f) 86%, #000); }

@media (max-width: 760px) {
  .global-map-picker-sidebar { width: min(430px, calc(100% - 16px)); }
}
@media (max-width: 420px) {
  .global-map-picker-sidebar__content { padding: 14px; }
  .global-map-picker-sidebar__route { grid-template-columns: minmax(0, 1fr) 30px minmax(0, 1fr); gap: 5px; }
  .global-map-picker-sidebar__line-card { padding: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .global-map-picker-sidebar-slide-enter-active,
  .global-map-picker-sidebar-slide-leave-active {
    transition: none;
  }
}
</style>

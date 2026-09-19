<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Footprints, LoaderCircle, Map as MapIcon } from "lucide-vue-next";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { useI18n } from "../../i18n";
import type { TransitFamily, TransitMode } from "../../types/transit";
import type { GlobalMapLine, GlobalMapMode } from "../transport-map/contracts/manifest";
import type { GlobalMapStation } from "../transport-map/contracts/manifest";
import { getNearbyWalkingRouteMatrix } from "../../services/nearbyWalkingRoutes";
import { nearbyWalkingMinutesFromSeconds } from "./nearbyPlacePresentation";
import { haversineMeters, type NearbyWalkingMatrixDestination, type NearbyWalkingRoute } from "./nearbyWalkingRoutes";

type SummaryLineBadge = {
  color?: string;
  family?: TransitFamily;
  iconUrl?: string;
  iconUrls?: string[];
  id?: string;
  label?: string;
  mode?: TransitMode | string;
  ref?: string;
  textColor?: string;
};

type WalkingState =
  | { status: "loading" }
  | { status: "ready"; route: NearbyWalkingRoute }
  | { status: "unavailable" };

type SummaryWalkingTarget = NearbyWalkingMatrixDestination & {
  lineId: string;
  stationId: string;
};

type SummaryLineGroup = {
  mode: GlobalMapMode;
  lines: GlobalMapLine[];
};

const props = defineProps<{
  lines: readonly GlobalMapLine[];
  lineBadge: (line: GlobalMapLine) => SummaryLineBadge;
  origin: { lon: number; lat: number };
  stationsForLine: (lineId: string) => readonly GlobalMapStation[];
  walkingStationsForLine?: (lineId: string) => readonly GlobalMapStation[];
  heavyLines?: readonly GlobalMapLine[];
  activeLineId?: string;
  hoveredLineId?: string;
}>();

const emit = defineEmits<{
  "hover-line": [lineId: string];
  "leave-line": [lineId: string];
  "pin-line": [lineId: string];
  "open-global-map": [];
}>();

const { t } = useI18n();
const LINE_MODE_ORDER: readonly GlobalMapMode[] = [
  "METRO",
  "RER",
  "TRAIN",
  "TRANSILIEN",
  "TRAM",
  "CABLE",
  "BUS",
  "NOCTILIEN",
];

const hoveredLineId = ref<string>();
const walkingStates = ref(new Map<string, WalkingState>());
let walkingController: AbortController | undefined;
let walkingRequestToken = 0;
let walkingMounted = false;
let hoverTimer: number | undefined;
const WALKING_MATRIX_BATCH_SIZE = 48;

const summaryLines = computed(() => {
  const linesById = new Map<string, GlobalMapLine>();
  for (const line of props.lines) {
    if (!linesById.has(line.id)) linesById.set(line.id, line);
  }
  return [...linesById.values()];
});

function groupSummaryLines(lines: readonly GlobalMapLine[]): SummaryLineGroup[] {
  return LINE_MODE_ORDER.flatMap((mode) => {
    const matchingLines = lines
    .filter((line) => line.mode === mode)
    .sort((left, right) =>
      lineLabel(left).localeCompare(lineLabel(right), "fr-FR", { numeric: true, sensitivity: "base" })
      || left.id.localeCompare(right.id),
    );
    return matchingLines.length > 0 ? [{ mode, lines: matchingLines }] : [];
  });
}

const lineGroups = computed(() => groupSummaryLines(summaryLines.value));

const summaryHeavyLines = computed(() => {
  const localLineIds = new Set(summaryLines.value.map((line) => line.id));
  const linesById = new Map<string, GlobalMapLine>();
  for (const line of props.heavyLines ?? []) {
    if (localLineIds.has(line.id) || linesById.has(line.id)) continue;
    linesById.set(line.id, line);
  }
  return [...linesById.values()];
});

const heavyLineGroups = computed(() => groupSummaryLines(summaryHeavyLines.value));

const lineCount = computed(() => lineGroups.value.reduce((count, group) => count + group.lines.length, 0));

const walkingTargets = computed<SummaryWalkingTarget[]>(() => summaryLines.value.flatMap((line) => {
  const stations = props.walkingStationsForLine?.(line.id) ?? props.stationsForLine(line.id);
  let nearest: GlobalMapStation | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const station of stations) {
    if (!Number.isFinite(station.lon) || !Number.isFinite(station.lat)) continue;
    const distance = haversineMeters(props.origin, station);
    if (distance < nearestDistance) {
      nearest = station;
      nearestDistance = distance;
    }
  }

  if (!nearest) return [];
  return [{
    id: line.id,
    cacheKey: `nearby-summary-${line.id}-${nearest.id}`,
    lineId: line.id,
    stationId: nearest.id,
    lon: nearest.lon,
    lat: nearest.lat,
  }];
}));

function lineBadge(line: GlobalMapLine): SummaryLineBadge {
  return props.lineBadge(line);
}

function lineLabel(line: GlobalMapLine): string {
  return lineBadge(line).label?.trim() || line.label.trim() || line.code.trim() || line.id;
}

function modeLabel(mode: GlobalMapMode): string {
  switch (mode) {
    case "METRO": return t("nearbyStations.modes.metro");
    case "RER": return t("nearbyStations.modes.rer");
    case "TRAIN": return t("nearbyStations.modes.train");
    case "TRANSILIEN": return t("nearbyStations.modes.transilien");
    case "TRAM": return t("nearbyStations.modes.tram");
    case "CABLE": return t("nearbyStations.modes.cable");
    case "BUS": return t("nearbyStations.modes.bus");
    case "NOCTILIEN": return t("nearbyStations.modes.noctilien");
    default: return mode;
  }
}

function walkingState(lineId: string): WalkingState | undefined {
  return walkingStates.value.get(lineId);
}

function updateWalkingState(lineId: string, state: WalkingState): void {
  const next = new Map(walkingStates.value);
  next.set(lineId, state);
  walkingStates.value = next;
}

function walkingMinutes(lineId: string): number | undefined {
  const state = walkingState(lineId);
  if (state?.status !== "ready") return undefined;
  return nearbyWalkingMinutesFromSeconds(state.route.durationSeconds, state.route.distanceMeters);
}

function walkingRoute(lineId: string): NearbyWalkingRoute | undefined {
  const state = walkingState(lineId);
  return state?.status === "ready" ? state.route : undefined;
}

function walkingTargetSignature(): string {
  return walkingTargets.value
    .map((target) => `${target.lineId}:${target.stationId}:${target.lon.toFixed(5)}:${target.lat.toFixed(5)}`)
    .join("|");
}

async function loadWalkingTimes(): Promise<void> {
  if (!walkingMounted) return;

  walkingController?.abort();
  const controller = new AbortController();
  walkingController = controller;
  const requestToken = ++walkingRequestToken;
  const targets = walkingTargets.value;
  const targetLineIds = new Set(targets.map((target) => target.lineId));
  const nextStates = new Map<string, WalkingState>();
  for (const target of targets) nextStates.set(target.lineId, { status: "loading" });
  for (const line of summaryLines.value) {
    if (!targetLineIds.has(line.id)) nextStates.set(line.id, { status: "unavailable" });
  }
  walkingStates.value = nextStates;

  try {
    for (let offset = 0; offset < targets.length; offset += WALKING_MATRIX_BATCH_SIZE) {
      const batch = targets.slice(offset, offset + WALKING_MATRIX_BATCH_SIZE);
      const routes = await getNearbyWalkingRouteMatrix(
        props.origin,
        batch,
        controller.signal,
      );
      if (walkingController !== controller || requestToken !== walkingRequestToken) return;
      routes.forEach((route, index) => {
        const target = batch[index];
        if (target) updateWalkingState(
          target.lineId,
          route ? { status: "ready", route } : { status: "unavailable" },
        );
      });
    }
  } catch (cause) {
    if (controller.signal.aborted || walkingController !== controller) return;
    for (const target of targets) updateWalkingState(target.lineId, { status: "unavailable" });
  } finally {
    if (walkingController === controller) walkingController = undefined;
  }
}

function setHoveredLine(lineId: string): void {
  if (hoveredLineId.value === lineId) return;
  hoveredLineId.value = lineId;
  if (hoverTimer !== undefined) window.clearTimeout(hoverTimer);
  hoverTimer = window.setTimeout(() => {
    hoverTimer = undefined;
    emit("hover-line", lineId);
  }, 70);
}

function clearHoveredLine(lineId: string): void {
  if (hoveredLineId.value !== lineId) return;
  hoveredLineId.value = undefined;
  if (hoverTimer !== undefined) window.clearTimeout(hoverTimer);
  hoverTimer = window.setTimeout(() => {
    hoverTimer = undefined;
    emit("leave-line", lineId);
  }, 70);
}

function pinLine(lineId: string): void {
  setHoveredLine(lineId);
  emit("pin-line", lineId);
}

onBeforeUnmount(() => {
  if (hoverTimer !== undefined) window.clearTimeout(hoverTimer);
  walkingMounted = false;
  walkingRequestToken += 1;
  walkingController?.abort();
  walkingController = undefined;
});

onMounted(() => {
  walkingMounted = true;
  void loadWalkingTimes();
});

watch(
  () => `${props.origin.lon}:${props.origin.lat}:${walkingTargetSignature()}`,
  () => {
    if (walkingMounted) void loadWalkingTimes();
  },
);
</script>

<template>
  <section
    class="nearby-summary"
    data-testid="nearby-summary"
    :aria-label="t('nearbyStations.summaryTitle')"
  >
    <header class="nearby-summary__header">
      <div>
        <p class="nearby-summary__eyebrow">{{ t("nearbyStations.summaryEyebrow") }}</p>
        <h3>{{ t("nearbyStations.summaryTitle") }}</h3>
      </div>
      <span class="nearby-summary__count" data-testid="nearby-summary-line-count">
        {{ t("nearbyStations.summaryLineCount", { count: lineCount }) }}
      </span>
    </header>

    <button
      v-if="lineCount > 0"
      class="nearby-summary__global-map"
      type="button"
      :aria-label="t('nearbyStations.summaryOpenGlobalMap')"
      @click.stop="emit('open-global-map')"
    >
      <MapIcon :size="15" aria-hidden="true" />
      {{ t("nearbyStations.summaryOpenGlobalMap") }}
    </button>

    <div v-if="lineGroups.length > 0" class="nearby-summary__groups">
      <section
        v-for="group in lineGroups"
        :key="group.mode"
        class="nearby-summary__group"
        :class="{ 'nearby-summary__group--dense': group.mode === 'BUS' || group.mode === 'NOCTILIEN' }"
      >
        <h4>{{ modeLabel(group.mode) }}</h4>
        <div class="nearby-summary__lines">
          <button
            v-for="line in group.lines"
            :key="line.id"
            class="nearby-summary__line"
            :class="{
              'nearby-summary__line--active': props.activeLineId === line.id,
              'nearby-summary__line--hovered': hoveredLineId === line.id || props.hoveredLineId === line.id,
            }"
            type="button"
            :data-summary-line-id="line.id"
            :aria-label="t('nearbyStations.summaryLineAria', { line: lineLabel(line) })"
            :title="t('nearbyStations.summaryPinLine')"
            @mouseenter="setHoveredLine(line.id)"
            @mouseleave="clearHoveredLine(line.id)"
            @focus="setHoveredLine(line.id)"
            @blur="clearHoveredLine(line.id)"
            @click.stop="pinLine(line.id)"
          >
            <span class="nearby-summary__line-main">
              <LineIconBadge :line="lineBadge(line)" compact eager />
              <span
                v-if="walkingState(line.id)?.status === 'ready'"
                class="nearby-summary__walking"
                :title="t('nearbyStations.summaryWalkingTime', { minutes: walkingMinutes(line.id) ?? 0 })"
              >
                <Footprints :size="13" aria-hidden="true" />
                <span>
                  {{ t(
                    walkingRoute(line.id)?.fallback
                      ? "nearbyStations.summaryWalkingTimeApprox"
                      : "nearbyStations.summaryWalkingTime",
                    { minutes: walkingMinutes(line.id) ?? 0 },
                  ) }}
                </span>
              </span>
              <span v-else-if="walkingState(line.id)?.status === 'loading'" class="nearby-summary__walking nearby-summary__walking--loading">
                <LoaderCircle class="nearby-summary__walking-spinner" :size="13" aria-hidden="true" />
                <span>{{ t("nearbyStations.summaryWalkingLoading") }}</span>
              </span>
            </span>
          </button>
        </div>
      </section>
    </div>

    <details
      v-if="heavyLineGroups.length > 0"
      class="nearby-summary__heavy-accordion"
      data-testid="nearby-summary-heavy-accordion"
    >
      <summary class="nearby-summary__heavy-accordion-summary">
        <span>{{ t("nearbyStations.summaryHeavyTransportTitle") }}</span>
        <span class="nearby-summary__count">
          {{ t("nearbyStations.summaryLineCount", { count: summaryHeavyLines.length }) }}
        </span>
      </summary>
      <div class="nearby-summary__groups">
        <section
          v-for="group in heavyLineGroups"
          :key="group.mode"
          class="nearby-summary__group"
          :class="{ 'nearby-summary__group--dense': group.mode === 'BUS' || group.mode === 'NOCTILIEN' }"
        >
          <h4>{{ modeLabel(group.mode) }}</h4>
          <div class="nearby-summary__lines">
            <button
              v-for="line in group.lines"
              :key="line.id"
              class="nearby-summary__line"
              :class="{
                'nearby-summary__line--active': props.activeLineId === line.id,
                'nearby-summary__line--hovered': hoveredLineId === line.id || props.hoveredLineId === line.id,
            }"
            type="button"
            :data-summary-line-id="line.id"
            :data-summary-heavy-line-id="line.id"
            :aria-label="t('nearbyStations.summaryLineAria', { line: lineLabel(line) })"
            :title="t('nearbyStations.summaryPinLine')"
            @mouseenter="setHoveredLine(line.id)"
            @mouseleave="clearHoveredLine(line.id)"
            @focus="setHoveredLine(line.id)"
            @blur="clearHoveredLine(line.id)"
            @click.stop="pinLine(line.id)"
            >
              <span class="nearby-summary__line-main">
                <LineIconBadge :line="lineBadge(line)" compact eager />
                <span
                  v-if="walkingState(line.id)?.status === 'ready'"
                  class="nearby-summary__walking"
                  :title="t('nearbyStations.summaryWalkingTime', { minutes: walkingMinutes(line.id) ?? 0 })"
                >
                  <Footprints :size="13" aria-hidden="true" />
                  <span>
                    {{ t(
                      walkingRoute(line.id)?.fallback
                        ? "nearbyStations.summaryWalkingTimeApprox"
                        : "nearbyStations.summaryWalkingTime",
                      { minutes: walkingMinutes(line.id) ?? 0 },
                    ) }}
                  </span>
                </span>
                <span v-else-if="walkingState(line.id)?.status === 'loading'" class="nearby-summary__walking nearby-summary__walking--loading">
                  <LoaderCircle class="nearby-summary__walking-spinner" :size="13" aria-hidden="true" />
                  <span>{{ t("nearbyStations.summaryWalkingLoading") }}</span>
                </span>
              </span>
            </button>
          </div>
        </section>
      </div>
    </details>

    <p v-if="lineGroups.length === 0" class="nearby-summary__empty">{{ t("nearbyStations.summaryEmpty") }}</p>
  </section>
</template>

<style scoped>
.nearby-summary { align-content: start; display: grid; gap: 15px; min-height: 100%; padding-bottom: 44px; }
.nearby-summary__header { align-items: flex-start; display: flex; gap: 10px; justify-content: space-between; }
.nearby-summary__eyebrow { color: #7168d8; font-size: .62rem; font-weight: 850; letter-spacing: .08em; margin: 0 0 2px; text-transform: uppercase; }
.nearby-summary h3 { color: var(--ink); font-size: 1rem; margin: 0; }
.nearby-summary__count { background: #ebe9ff; border: 1px solid rgba(81,70,255,.14); border-radius: 999px; color: #4034df; flex: 0 0 auto; font-size: .64rem; font-weight: 850; padding: 5px 8px; text-align: center; }
.nearby-summary__groups { display: grid; gap: 14px; }
.nearby-summary__heavy-accordion { background: #f7f8fc; border: 1px solid rgba(100,116,139,.16); border-radius: 11px; overflow: hidden; }
.nearby-summary__heavy-accordion-summary { align-items: center; color: var(--muted); cursor: pointer; display: flex; font-size: .7rem; font-weight: 850; gap: 8px; justify-content: space-between; list-style: none; padding: 8px; text-transform: uppercase; }
.nearby-summary__heavy-accordion-summary::-webkit-details-marker { display: none; }
.nearby-summary__heavy-accordion > .nearby-summary__groups { padding: 0 8px 10px; }
.nearby-summary__group { display: grid; gap: 6px; }
.nearby-summary__group h4 { color: var(--muted); font-size: .7rem; letter-spacing: .06em; margin: 0; text-transform: uppercase; }
.nearby-summary__lines { display: grid; gap: 7px; }
.nearby-summary__group--dense .nearby-summary__lines { grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); }
.nearby-summary__line { background: #f7f8fc; border: 1px solid rgba(100,116,139,.16); border-radius: 11px; box-sizing: border-box; color: var(--ink); display: grid; gap: 5px; min-width: 0; padding: 6px 8px; text-align: left; transition: background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease; width: 100%; }
.nearby-summary__line:hover, .nearby-summary__line:focus-visible, .nearby-summary__line--hovered { background: #ebe9ff; border-color: rgba(81,70,255,.34); box-shadow: 0 4px 12px rgba(81,70,255,.12); outline: 0; }
.nearby-summary__line--active { border-color: rgba(81,70,255,.42); box-shadow: 0 0 0 2px rgba(81,70,255,.1); }
.nearby-summary__line-main { align-items: center; display: flex; gap: 7px; min-width: 0; }
.nearby-summary__line-main :deep(.line-icon-badge) { height: 28px; min-width: 34px; }
.nearby-summary__line-main :deep(.line-icon-badge img) { max-height: 28px; max-width: 48px; }
.nearby-summary__walking { align-items: center; color: #475569; display: inline-flex; flex: 0 1 auto; font-size: .63rem; gap: 3px; line-height: 1.2; min-width: 0; white-space: nowrap; }
.nearby-summary__walking > span { overflow: hidden; text-overflow: ellipsis; }
.nearby-summary__walking svg { color: #5146ff; flex: 0 0 auto; }
.nearby-summary__walking--loading { color: #64748b; }
.nearby-summary__walking-spinner { animation: nearby-summary-spin 900ms linear infinite; }
.nearby-summary__group--dense .nearby-summary__line { align-items: center; padding: 7px 4px 6px; text-align: center; }
.nearby-summary__group--dense .nearby-summary__line-main { flex-direction: column; gap: 3px; justify-content: center; }
.nearby-summary__group--dense .nearby-summary__line-main :deep(.line-icon-badge) { min-width: 30px; }
.nearby-summary__group--dense .nearby-summary__line-main :deep(.line-icon-badge img) { max-width: 52px; }
.nearby-summary__group--dense .nearby-summary__walking { max-width: 100%; }
.nearby-summary__global-map { align-items: center; background: #5146ff; border: 1px solid #5146ff; border-radius: 10px; box-shadow: 0 5px 14px rgba(81,70,255,.18); color: #fff; display: inline-flex; font-size: .72rem; font-weight: 850; gap: 7px; justify-content: center; min-height: 36px; padding: 8px 11px; text-align: center; transition: background-color 140ms ease, box-shadow 140ms ease, transform 140ms ease; width: 100%; }
.nearby-summary__global-map:hover, .nearby-summary__global-map:focus-visible { background: #4034df; box-shadow: 0 7px 16px rgba(81,70,255,.26); outline: 0; transform: translateY(-1px); }
.nearby-summary__empty { color: var(--muted); font-size: .8rem; line-height: 1.45; margin: 0; }
@keyframes nearby-summary-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .nearby-summary__line { transition: none; }
}
</style>

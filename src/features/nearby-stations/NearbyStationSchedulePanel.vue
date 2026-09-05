<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ArrowLeft, ChevronDown, Clock3, LoaderCircle } from "lucide-vue-next";
import TransitBoard from "../../components/TransitBoard.vue";
import { useI18n } from "../../i18n";
import { createLinePresentation, transitFamilyToMode } from "../../services/linePresentation";
import type {
  Departure,
  DirectionDepartureGroup,
  LineConfig,
  TransitBoardConfig,
  TransitFamily,
} from "../../types/transit";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";
import type { BoardTrafficAlert } from "../traffic";
import type { NearbyStationScheduleItem } from "./nearbyStationSchedules";

const props = withDefaults(defineProps<{
  items: readonly NearbyStationScheduleItem[];
  activeModes?: readonly GlobalMapMode[];
  activeStationId?: string;
  loading?: boolean;
  fullscreen?: boolean;
  radiusMeters?: number;
  contextMenuMode?: "direction" | "station";
  directionVisible?: (itemId: string, directionId: string) => boolean;
  focusedStationId?: string;
  trafficAlertForItem?: (item: NearbyStationScheduleItem) => BoardTrafficAlert | undefined;
  alarmDepartureIds?: (itemId: string) => string[];
}>(), {
  contextMenuMode: "direction",
});

const emit = defineEmits<{
  stationContextMenu: [stationId: string, anchor: HTMLElement];
  directionContextMenu: [itemId: string, directionId: string, label: string, anchor: HTMLElement];
  clearStationFocus: [];
  openTraffic: [item: NearbyStationScheduleItem, alert: BoardTrafficAlert];
  openLinePage: [item: NearbyStationScheduleItem, board: TransitBoardConfig];
  openFullscreenPanel: [item: NearbyStationScheduleItem, board: TransitBoardConfig];
  removeItem: [itemId: string];
  updateHiddenDirections: [itemId: string, directionIds: string[]];
  scheduleAlarm: [payload: { board: TransitBoardConfig; directionGroup: DirectionDepartureGroup; departure: Departure }];
}>();

const { t } = useI18n();
const now = ref(Date.now());
let clockTimer: number | undefined;
const expandedDirectionKeys = ref<Set<string>>(new Set());

const displayedItems = computed(() => props.items.filter((item) =>
  item.state !== "hidden" &&
  (!props.activeModes || props.activeModes.includes(item.line.mode)) &&
  (!props.focusedStationId || item.stationId === props.focusedStationId),
));

onMounted(() => {
  clockTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 1_000);
});

onBeforeUnmount(() => {
  if (clockTimer !== undefined) window.clearInterval(clockTimer);
});

function lineBadge(item: NearbyStationScheduleItem): LineConfig {
  if (item.board?.line) return item.board.line;

  const family = globalLineFamily(item.line.mode);
  const presentation = createLinePresentation({
    code: item.line.code,
    color: item.line.color,
    family,
    id: item.line.id,
    longName: item.line.label,
    mode: family ? transitFamilyToMode(family) : undefined,
    ref: item.line.sourceLineId ?? item.line.id,
    shortName: item.line.label,
    textColor: item.line.textColor,
  });
  return {
    ref: item.line.sourceLineId ?? item.line.id,
    shortName: item.line.label,
    longName: item.line.label,
    mode: family ? transitFamilyToMode(family) : "bus",
    color: presentation.color,
    textColor: presentation.textColor,
    iconUrl: item.line.pictogram ?? presentation.iconUrl,
    iconUrls: presentation.iconUrls,
  };
}

function globalLineFamily(mode: GlobalMapMode): TransitFamily | undefined {
  if (mode === "METRO" || mode === "RER" || mode === "BUS" || mode === "TRAM" || mode === "NOCTILIEN" || mode === "TRANSILIEN" || mode === "CABLE") {
    return mode;
  }
  if (mode === "TRAIN") return "TRANSILIEN";
  return undefined;
}

function isDirectionVisible(itemId: string, directionId: string): boolean {
  return props.directionVisible?.(itemId, directionId) ?? true;
}

function visibleDirectionGroups(item: NearbyStationScheduleItem): DirectionDepartureGroup[] {
  // Keep the nearby panel's one-second clock refresh, just like the home board
  // gets refreshed by its parent clock, so the shared counter stays current.
  void now.value;
  return (item.result?.directionGroups ?? []).filter((group) =>
    isDirectionVisible(item.id, group.id),
  );
}

function scheduleDirectionGroups(item: NearbyStationScheduleItem): DirectionDepartureGroup[] {
  return visibleDirectionGroups(item).map((group) => ({
    ...group,
    departures: group.departures.slice(0, 2),
  }));
}

function scheduleBoard(item: NearbyStationScheduleItem): TransitBoardConfig {
  if (item.board) {
    return item.board;
  }

  const line = lineBadge(item);
  const family = globalLineFamily(item.line.mode);

  return {
    id: item.id,
    title: item.entry.station.name,
    city: item.entry.station.city ?? item.mapStation.city ?? "",
    line: {
      ...line,
      longName: family ? `${family} ${item.line.label}` : line.longName,
    },
    monitoringPoints: [],
    directionGroups: [],
    maxDepartures: 8,
  };
}

function scheduleDepartures(item: NearbyStationScheduleItem) {
  return scheduleDirectionGroups(item).flatMap((group) => group.departures);
}

function hiddenDirectionIds(item: NearbyStationScheduleItem): string[] {
  return (item.result?.directionGroups ?? [])
    .map((group) => group.id)
    .filter((directionId) => !isDirectionVisible(item.id, directionId));
}

function openTraffic(item: NearbyStationScheduleItem, alert: BoardTrafficAlert): void {
  emit("openTraffic", item, alert);
}

function collapsedDirectionIds(item: NearbyStationScheduleItem): string[] {
  return scheduleDirectionGroups(item)
    .map((group) => group.id)
    .filter((directionId) => !expandedDirectionKeys.value.has(directionKey(item.id, directionId)));
}

function directionKey(itemId: string, directionId: string): string {
  return `${itemId}:${directionId}`;
}

function toggleScheduleDirection(itemId: string, directionId: string): void {
  const key = directionKey(itemId, directionId);
  const next = new Set(expandedDirectionKeys.value);

  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }

  expandedDirectionKeys.value = next;
}

function boardContextMenu(itemId: string, event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const item = displayedItems.value.find((candidate) => candidate.id === itemId) ??
    props.items.find((candidate) => candidate.id === itemId);
  if (!item) return;

  if (props.contextMenuMode === "station") {
    const anchor = event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : target.closest<HTMLElement>("[data-schedule-id]");
    if (!anchor) return;

    event.preventDefault();
    event.stopPropagation();
    emit("stationContextMenu", item.stationId, anchor);
    return;
  }

  const direction = target.closest<HTMLElement>("[data-direction-id]");
  const directionId = direction?.dataset.directionId;
  if (!direction || !directionId) return;

  const group = visibleDirectionGroups(item).find((candidate) => candidate.id === directionId);
  if (!group) return;

  event.preventDefault();
  event.stopPropagation();
  const anchor = direction.querySelector<HTMLElement>(".direction-section__header") ?? direction;
  emit("directionContextMenu", itemId, directionId, group.label, anchor);
}
</script>

<template>
  <section
    class="nearby-schedule-panel"
    :class="{ 'nearby-schedule-panel--fullscreen': fullscreen }"
    :aria-label="t('nearbyStations.scheduleTitle')"
  >
    <header class="nearby-schedule-panel__header">
      <div class="nearby-schedule-panel__heading">
        <button
          v-if="focusedStationId"
          class="nearby-schedule-panel__back"
          type="button"
          :aria-label="t('nearbyStations.backToOverview')"
          :title="t('nearbyStations.backToOverview')"
          @click="emit('clearStationFocus')"
        >
          <ArrowLeft :size="18" aria-hidden="true" />
        </button>
        <div>
          <p class="nearby-schedule-panel__eyebrow">{{ t("nearbyStations.scheduleEyebrow") }}</p>
          <h3>{{ t("nearbyStations.scheduleTitle") }}</h3>
          <p class="nearby-schedule-panel__subtitle">
            {{ t("nearbyStations.scheduleRadius", { meters: radiusMeters ?? 600 }) }}
          </p>
        </div>
      </div>
      <div class="nearby-schedule-panel__header-actions">
        <div class="nearby-schedule-panel__sort" :aria-label="t('nearbyStations.scheduleSortLabel')">
          <span>{{ t("nearbyStations.scheduleSortLabel") }}</span>
          <strong>{{ t("nearbyStations.scheduleSortProximity") }}</strong>
          <ChevronDown :size="14" aria-hidden="true" />
        </div>
        <LoaderCircle v-if="loading" class="nearby-schedule-panel__spinner" :size="17" aria-hidden="true" />
      </div>
    </header>

    <div v-if="displayedItems.length === 0 && !loading" class="nearby-schedule-panel__empty">
      <Clock3 :size="21" aria-hidden="true" />
      <span>{{ t("nearbyStations.scheduleEmpty") }}</span>
    </div>

    <div v-else class="nearby-schedule-panel__cards">
      <div
        v-for="item in displayedItems"
        :key="item.id"
        class="nearby-schedule-board-card"
        :class="{
          'nearby-schedule-board-card--active': activeStationId === item.stationId,
          'nearby-schedule-board-card--unavailable': item.state === 'unavailable',
        }"
        :data-schedule-id="item.id"
        @contextmenu="boardContextMenu(item.id, $event)"
      >
        <TransitBoard
          :board="scheduleBoard(item)"
          :departures="scheduleDepartures(item)"
          :direction-groups="scheduleDirectionGroups(item)"
          :collapsed-direction-ids="collapsedDirectionIds(item)"
          :hidden-direction-ids="hiddenDirectionIds(item)"
          :loading="item.state === 'loading'"
          :error="item.state === 'unavailable' ? t('nearbyStations.scheduleUnavailable') : undefined"
          removable
          :show-station-change-action="false"
          :alarm-departure-ids="alarmDepartureIds?.(item.id) ?? []"
          :traffic-alert="trafficAlertForItem?.(item)"
          display-mode="grid"
          @toggle-direction="toggleScheduleDirection(item.id, $event)"
          @open-traffic="openTraffic(item, $event)"
          @open-line-page="emit('openLinePage', item, $event)"
          @open-fullscreen-panel="emit('openFullscreenPanel', item, $event)"
          @remove="emit('removeItem', item.id)"
          @update:hidden-direction-ids="emit('updateHiddenDirections', item.id, $event)"
          @schedule-alarm="emit('scheduleAlarm', $event)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.nearby-schedule-panel { background: rgba(255,255,255,.96); border: 1px solid rgba(16,35,63,.1); border-radius: 16px; display: grid; gap: 12px; padding: 15px; }
.nearby-schedule-panel__header { align-items: flex-start; display: flex; gap: 12px; justify-content: space-between; }
.nearby-schedule-panel__heading { align-items: flex-start; display: flex; gap: 8px; min-width: 0; }
.nearby-schedule-panel__back { align-items: center; background: #ebe9ff; border: 1px solid rgba(81,70,255,.18); border-radius: 8px; color: #4034df; display: inline-flex; flex: 0 0 32px; height: 32px; justify-content: center; padding: 0; }
.nearby-schedule-panel__back:hover, .nearby-schedule-panel__back:focus-visible { background: #4034df; color: #fff; outline: 0; }
.nearby-schedule-panel__eyebrow { color: #7168d8; font-size: .62rem; font-weight: 850; letter-spacing: .08em; margin: 0 0 2px; text-transform: uppercase; }
.nearby-schedule-panel h3 { color: var(--ink); font-size: 1rem; margin: 0; }
.nearby-schedule-panel__subtitle { color: var(--muted); font-size: .68rem; margin: 4px 0 0; }
.nearby-schedule-panel__header-actions { align-items: center; display: flex; gap: 9px; }
.nearby-schedule-panel__sort { align-items: center; color: var(--muted); display: inline-flex; font-size: .62rem; gap: 4px; white-space: nowrap; }
.nearby-schedule-panel__sort strong { color: var(--ink); font-weight: 850; }
.nearby-schedule-panel__sort svg { color: #68748c; }
.nearby-schedule-panel__spinner { animation: nearby-schedule-spin 900ms linear infinite; color: #5146ff; flex: 0 0 auto; }
.nearby-schedule-panel__empty { align-items: center; color: var(--muted); display: flex; font-size: .76rem; gap: 8px; padding: 12px 3px; }
.nearby-schedule-panel__empty svg { color: #5146ff; flex: 0 0 auto; }
.nearby-schedule-panel__cards { display: grid; gap: 9px; max-height: 330px; overflow: auto; padding: 1px 2px 1px 0; }
.nearby-schedule-panel--fullscreen .nearby-schedule-panel__cards { max-height: none; overflow: visible; }
.nearby-schedule-board-card { min-width: 0; }
.nearby-schedule-board-card--active :deep(.board) { box-shadow: 0 8px 22px rgba(81,70,255,.14); outline: 2px solid color-mix(in srgb, var(--line-color, #5146ff), #fff 42%); }
.nearby-schedule-board-card--unavailable :deep(.board) { opacity: .72; }
.nearby-schedule-board-card :deep(.board) { border-radius: 13px; box-shadow: 0 4px 14px rgba(16,35,63,.08); }
.nearby-schedule-board-card :deep(.board::before) { height: 5px; }
.nearby-schedule-board-card :deep(.board__header) { align-items: flex-start; gap: 10px; padding: 14px 12px 12px; }
.nearby-schedule-board-card :deep(.board__header > div:not(.board-actions)) { flex: 1 1 auto; min-width: 0; overflow: hidden; }
.nearby-schedule-board-card :deep(.board-line-icon) { flex: 0 0 56px; height: 56px; max-height: 56px; max-width: 56px; min-width: 56px; overflow: hidden; width: 56px; }
.nearby-schedule-board-card :deep(.board-line-icon img) { display: block; height: 56px; max-height: 56px; max-width: 56px; object-fit: contain; width: 56px; }
.nearby-schedule-board-card :deep(.board-line-icon .line-icon-badge__fallback) { height: 56px; max-width: 56px; min-width: 56px; }
.nearby-schedule-board-card :deep(.board-line-icon .line-icon-badge__label) { font-size: 1.05rem; min-width: 56px; }
.nearby-schedule-board-card :deep(.board__mode) { font-size: .68rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-schedule-board-card :deep(.board__title-row) { align-items: flex-start; min-width: 0; }
.nearby-schedule-board-card :deep(.board__title-row h2) { flex: 1 1 auto; font-size: .98rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-schedule-board-card :deep(.board-traffic-chip) { flex: 0 1 auto; max-width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-schedule-board-card :deep(.board__city) { font-size: .68rem; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-schedule-board-card :deep(.board-actions) { flex: 0 0 auto; min-width: 30px; }
.nearby-schedule-board-card :deep(.board-actions__trigger) { min-height: 30px; opacity: 1; padding: 0 4px; }
.nearby-schedule-board-card :deep(.direction-section + .direction-section) { border-top-width: 5px; }
.nearby-schedule-board-card :deep(.direction-section__header) { display: grid; gap: 7px; grid-template-columns: minmax(0, 1fr) auto 20px; padding: 10px 12px; }
.nearby-schedule-board-card :deep(.direction-section--collapsed .direction-section__header) { gap: 7px; padding: 10px 12px; }
.nearby-schedule-board-card :deep(.direction-section__title) { min-width: 0; }
.nearby-schedule-board-card :deep(.direction-section__title p) { display: none; }
.nearby-schedule-board-card :deep(.direction-section__title h3) { font-size: .78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-schedule-board-card :deep(.direction-section--collapsed .direction-section__title) { display: block; }
.nearby-schedule-board-card :deep(.direction-section--collapsed .direction-section__title h3) { margin: 0; }
.nearby-schedule-board-card :deep(.direction-section--collapsed .direction-section__title span) { max-width: 100%; }
.nearby-schedule-board-card :deep(.last-service) { padding-left: 8px; width: auto; }
.nearby-schedule-board-card :deep(.last-service__times) { gap: 4px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.nearby-schedule-board-card :deep(.last-service__time) { gap: 3px; min-height: 32px; min-width: 47px; padding: 0 5px; width: auto; }
.nearby-schedule-board-card :deep(.last-service__time svg) { height: 14px; width: 14px; }
.nearby-schedule-board-card :deep(.last-service__time strong) { font-size: .82rem; }
.nearby-schedule-board-card :deep(.accordion-chevron) { height: 20px; width: 20px; }
.nearby-schedule-board-card :deep(.direction-section--collapsed .accordion-chevron) { transform: rotate(-90deg); }
.nearby-schedule-board-card :deep(.departure) { gap: 8px; grid-template-columns: minmax(0, 1fr) auto; min-height: 60px; padding: 10px 12px; }
.nearby-schedule-board-card :deep(.departure-pattern-button), .nearby-schedule-board-card :deep(.status-pill) { display: none; }
.nearby-schedule-board-card :deep(.departure__time) { min-width: 58px; }
.nearby-schedule-board-card :deep(.departure__time strong) { font-size: 1rem; }
.nearby-schedule-board-card :deep(.departure__time span) { font-size: .68rem; margin-top: 3px; }
.nearby-schedule-board-card :deep(.departure__main strong) { font-size: .86rem; }
.nearby-schedule-board-card :deep(.departure__main span) { font-size: .68rem; margin-top: 3px; }
.nearby-schedule-board-card :deep(.board__footer) { font-size: .72rem; padding: 10px 12px; }
.nearby-schedule-board-card :deep(.notice) { min-height: 76px; padding: 24px 12px; }
@media (max-width: 720px) {
  .nearby-schedule-board-card :deep(.board__title-row) { align-items: flex-start; }
  .nearby-schedule-board-card :deep(.board-traffic-chip) {
    height: auto;
    line-height: 1.15;
    max-width: 100%;
    overflow: visible;
    overflow-wrap: anywhere;
    padding: 4px 9px;
    text-align: left;
    text-overflow: clip;
    white-space: normal;
  }
}
@keyframes nearby-schedule-spin { to { transform: rotate(360deg); } }
</style>

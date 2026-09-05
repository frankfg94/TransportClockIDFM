<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { X } from "lucide-vue-next";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { useI18n } from "../../i18n";
import { createLinePresentation, transitFamilyToMode } from "../../services/linePresentation";
import type { Departure, LineConfig, TransitFamily } from "../../types/transit";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";
import type {
  NearbyStationDirectionOrientation,
  NearbyStationScheduleItem,
  NearbyStationTooltipDirection,
} from "./nearbyStationSchedules";

const props = defineProps<{
  items: readonly NearbyStationScheduleItem[];
  stationId: string;
  /** Lines that can reach the currently focused projected heavy station. */
  emphasizedLineIds?: ReadonlySet<string>;
  directionVisible?: (itemId: string, directionId: string) => boolean;
  hideLongWaitTransports?: boolean;
}>();

const { t } = useI18n();
const now = ref(Date.now());
const expanded = ref(false);
let timer: number | undefined;
let expandTimer: number | undefined;
const INLINE_TOOLTIP_EXPAND_DELAY_MS = 500;

interface InlineScheduleRow {
  item: NearbyStationScheduleItem;
  group: NonNullable<NearbyStationScheduleItem["result"]>["directionGroups"][number];
  departure: Departure;
}

const rows = computed<InlineScheduleRow[]>(() => {
  const byLine = new Map<string, InlineScheduleRow>();

  for (const item of props.items) {
    if (item.stationId !== props.stationId || item.state !== "visible" || !item.result) continue;

    const departures = item.result.directionGroups
      .filter((group) => props.directionVisible?.(item.id, group.id) ?? true)
      .flatMap((group) => group.departures.map((departure) => ({ group, departure })))
      .sort((left, right) => departureTimestamp(left.departure) - departureTimestamp(right.departure));
    const first = departures.find(({ departure }) => !isLongWait(departure));
    if (!first) continue;

    const existing = byLine.get(item.line.id);
    if (!existing || departureTimestamp(first.departure) < departureTimestamp(existing.departure)) {
      byLine.set(item.line.id, { item, group: first.group, departure: first.departure });
    }
  }

  const orderedRows = [...byLine.values()].sort(
    (left, right) => departureTimestamp(left.departure) - departureTimestamp(right.departure),
  );
  const visibleRows = orderedRows.slice(0, 3);
  if (!props.emphasizedLineIds?.size) return visibleRows;

  // Keep a relevant feeder visible even when another line has an earlier
  // departure, while preserving the normal chronological order in the badge.
  const selectedRows = [...visibleRows];
  for (const relevantRow of orderedRows.filter(isLineEmphasized)) {
    if (selectedRows.includes(relevantRow)) continue;
    const replaceIndex = [...selectedRows]
      .map((row, index) => ({ row, index }))
      .reverse()
      .find(({ row }) => !isLineEmphasized(row))?.index;
    if (replaceIndex === undefined) break;
    selectedRows[replaceIndex] = relevantRow;
  }

  return selectedRows.sort(
    (left, right) => orderedRows.indexOf(left) - orderedRows.indexOf(right),
  );
});
const hasVisibleStation = computed(() => props.items.some((item) => item.stationId === props.stationId && item.state === "visible"));
const hasUnavailableStation = computed(() => props.items.some((item) => item.stationId === props.stationId && item.state === "unavailable"));
const emptyIndicatorColor = computed(() => props.items.find((item) =>
  item.stationId === props.stationId && (item.state === "visible" || item.state === "unavailable"),
)?.line.color ?? "#5146ff");
const emptyIndicatorTooltip = computed(() => hasVisibleStation.value
  ? t("nearbyStations.noDeparturesTooltip")
  : t("nearbyStations.scheduleUnavailable"));

function directionForRow(row: InlineScheduleRow): NearbyStationTooltipDirection {
  return row.item.tooltipDirections?.find((direction) =>
    direction.id === row.group.id || direction.label === row.group.label,
  ) ?? {
    id: row.group.id,
    label: row.group.label,
  };
}

function isLineEmphasized(row: InlineScheduleRow): boolean {
  const emphasizedLineIds = props.emphasizedLineIds;
  return !emphasizedLineIds?.size || emphasizedLineIds.has(row.item.line.id);
}

function directionLabel(row: InlineScheduleRow): string {
  return t("nearbyStations.direction", { destination: directionForRow(row).label });
}

function orientationLabel(orientation: NearbyStationDirectionOrientation): string {
  return t(`nearbyStations.orientation.${orientation}`);
}

function startExpansion(): void {
  if (expandTimer !== undefined) window.clearTimeout(expandTimer);
  expandTimer = window.setTimeout(() => {
    expandTimer = undefined;
    expanded.value = true;
  }, INLINE_TOOLTIP_EXPAND_DELAY_MS);
}

function stopExpansion(): void {
  if (expandTimer !== undefined) {
    window.clearTimeout(expandTimer);
    expandTimer = undefined;
  }
  expanded.value = false;
}

function handleFocusOut(event: FocusEvent): void {
  const currentTarget = event.currentTarget as HTMLElement | null;
  const relatedTarget = event.relatedTarget as Node | null;
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) return;
  stopExpansion();
}

onMounted(() => {
  timer = window.setInterval(() => { now.value = Date.now(); }, 1_000);
});

onBeforeUnmount(() => {
  if (timer !== undefined) window.clearInterval(timer);
  if (expandTimer !== undefined) window.clearTimeout(expandTimer);
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
  if (["METRO", "RER", "BUS", "TRAM", "NOCTILIEN", "TRANSILIEN", "CABLE"].includes(mode)) return mode as TransitFamily;
  if (mode === "TRAIN") return "TRANSILIEN";
  return undefined;
}

function departureTime(departure?: Departure): string | undefined {
  return departure?.expectedDepartureTime ?? departure?.aimedDepartureTime ?? departure?.expectedArrivalTime;
}

function departureTimestamp(departure?: Departure): number {
  const value = departureTime(departure);
  return value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
}

function isLongWait(departure?: Departure): boolean {
  if (!props.hideLongWaitTransports) return false;
  const timestamp = departureTimestamp(departure);
  return Number.isFinite(timestamp) && timestamp - now.value > 60 * 60_000;
}

function formatWait(departure?: Departure): string {
  if (!departure) return "--";
  const value = departureTime(departure);
  if (!value) return t("board.unavailableSchedule");
  const minutes = Math.max(0, Math.round((new Date(value).getTime() - now.value) / 60_000));
  return minutes === 0 ? t("board.imminent") : `${minutes} min`;
}
</script>

<template>
  <div
    v-if="rows.length"
    class="nearby-map__inline-schedules"
    :class="{ 'nearby-map__inline-schedules--expanded': expanded }"
    :aria-label="t('nearbyStations.inlineScheduleAria')"
    @mouseenter="startExpansion"
    @mouseleave="stopExpansion"
    @focusin="startExpansion"
    @focusout="handleFocusOut"
    @click.stop
  >
    <div
      v-for="row in rows"
      :key="`${row.item.id}:${row.group.id}`"
      class="nearby-map__inline-schedule"
      :class="{
        'nearby-map__inline-schedule--expanded': expanded,
        'nearby-map__inline-schedule--muted': !isLineEmphasized(row),
      }"
      :title="`${row.item.line.code} · ${row.group.label}`"
    >
      <LineIconBadge :line="lineBadge(row.item)" compact />
      <strong class="nearby-map__inline-schedule-time">{{ formatWait(row.departure) }}</strong>
      <span v-if="expanded" class="nearby-map__inline-schedule-direction">
        <span>{{ directionLabel(row) }}</span>
        <span
          v-if="directionForRow(row).orientation"
          class="nearby-map__inline-schedule-orientation"
        >
          ({{ orientationLabel(directionForRow(row).orientation!) }})
        </span>
      </span>
    </div>
  </div>
  <span
    v-else-if="hasVisibleStation || hasUnavailableStation"
    class="nearby-map__inline-schedules-disabled"
    :class="{ 'nearby-map__inline-schedules-disabled--unavailable': !hasVisibleStation }"
    :style="{ '--nearby-marker-color': emptyIndicatorColor }"
    :aria-label="emptyIndicatorTooltip"
    :title="emptyIndicatorTooltip"
  >
    <X :size="14" stroke-width="2.8" aria-hidden="true" />
  </span>
</template>

<style scoped>
.nearby-map__inline-schedules { backdrop-filter: blur(5px); background: rgba(255,255,255,.94); border: 1px solid rgba(255,255,255,.98); border-radius: 8px; box-shadow: 0 4px 10px rgba(37,31,92,.2), 0 1px 2px rgba(37,31,92,.14); box-sizing: border-box; display: grid; gap: 1px; max-width: min(132px, calc(100vw - 20px)); min-width: 118px; padding: 4px 5px; pointer-events: auto; width: max-content; }
.nearby-map__inline-schedule { align-items: center; display: grid; gap: 4px; grid-template-columns: 54px minmax(52px, 1fr); min-height: 29px; padding: 0 1px; }
.nearby-map__inline-schedule--muted { opacity: .45; }
.nearby-map__inline-schedule-direction { animation: nearby-inline-schedule-direction-expand 180ms ease-out both; color: var(--ink); display: flex; flex-wrap: wrap; font-size: .64rem; font-weight: 850; gap: 3px; grid-column: 1 / -1; justify-content: center; line-height: 1.15; max-height: 40px; min-width: 0; overflow: hidden; padding: 4px 1px 2px; text-align: center; }
.nearby-map__inline-schedule-orientation { color: var(--muted); font-weight: 700; }
.nearby-map__inline-schedule :deep(.line-icon-badge) { align-items: center; display: inline-flex; flex: 0 0 54px; height: 29px; min-width: 54px; }
.nearby-map__inline-schedule :deep(.line-icon-badge img) { max-height: 29px; max-width: 54px; }
.nearby-map__inline-schedule :deep(.line-icon-badge__fallback) { border-radius: 5px; height: 28px; }
.nearby-map__inline-schedule :deep(.line-icon-badge__label) { font-size: .9rem; min-width: 45px; padding: 0 5px; }
.nearby-map__inline-schedule-time { color: #4034df; font-size: .66rem; font-weight: 900; justify-self: start; line-height: 1; max-width: 100%; white-space: nowrap; }
.nearby-map__inline-schedules--empty { align-items: center; color: var(--muted); display: inline-flex; font-size: .62rem; gap: 4px; width: auto; }
.nearby-map__inline-schedules-disabled { align-items: center; background: #fff; border: 2px solid var(--nearby-marker-color, #5146ff); border-radius: 50%; bottom: -7px; box-shadow: 0 2px 6px rgba(16,35,63,.24); color: var(--nearby-marker-color, #5146ff); display: inline-flex; height: 18px; justify-content: center; min-height: 18px; min-width: 18px; padding: 0; pointer-events: auto; position: absolute; right: -7px; width: 18px; z-index: 26; }
.nearby-map__inline-schedules-disabled--unavailable { border-color: #8b95a7; color: #6d778a; }
@keyframes nearby-inline-schedule-direction-expand { from { max-height: 0; opacity: 0; padding-bottom: 0; padding-top: 0; } to { max-height: 40px; opacity: 1; padding-bottom: 2px; padding-top: 4px; } }
</style>

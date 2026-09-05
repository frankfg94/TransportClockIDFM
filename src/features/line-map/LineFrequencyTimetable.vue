<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n, type TranslationKey } from "../../i18n";
import MaterialCombobox, {
  type MaterialComboboxOption,
} from "../../components/MaterialCombobox.vue";
import type {
  FrequencyDirection,
  FrequencySection,
  GtfsLineFrequencyResponse,
} from "../../types/lineFrequency";
import type {
  GtfsLineTimetableResponse,
  GtfsLineTimetableStop,
  GtfsLineTimetableTrip,
  GtfsLineTimetableStatus,
} from "../../types/lineFrequencyTimetable";
import {
  canonicalGtfsTimetableStationId,
  calculateGtfsTimetableInterval,
  GTFS_LINE_TIMETABLE_WINDOWS,
  isBoardableGtfsTimetableCall,
  type GtfsTimetableInterval,
} from "./lineFrequencyTimetableIntervals";
import {
  inferLineFrequencyCompassDirection,
  type LineFrequencyCompassDirection,
  type LineFrequencyCompassPoint,
  type LineFrequencyStationCoordinate,
} from "./lineFrequencyCompass";

const props = withDefaults(
  defineProps<{
    profile?: GtfsLineFrequencyResponse;
    lineColor?: string;
    stationCoordinates?: readonly LineFrequencyStationCoordinate[];
    timetable?: GtfsLineTimetableResponse;
    loading?: boolean;
    error?: boolean;
  }>(),
  {
    loading: false,
    error: false,
  },
);

const { t, d } = useI18n();

const statusKeys: Record<GtfsLineTimetableStatus, TranslationKey> = {
  ready: "globalMap.sidebar.gtfsFrequency.ready",
  disabled: "globalMap.sidebar.gtfsFrequency.disabled",
  missing: "globalMap.sidebar.gtfsFrequency.missing",
  "out-of-coverage": "globalMap.sidebar.gtfsFrequency.outOfCoverage",
  "line-missing": "globalMap.sidebar.gtfsFrequency.lineMissing",
};

type SectionOrientation = "forward" | "reverse";

interface TimetableDirection {
  key: string;
  label: string;
  trips: GtfsLineTimetableTrip[];
  orientation?: SectionOrientation;
}

interface TimetableTripEntry {
  trip: GtfsLineTimetableTrip;
  orientation?: SectionOrientation;
}

interface TimetableSectionOption extends MaterialComboboxOption {
  isCentral: boolean;
  compassDirection?: string;
}

const compassPointKeys: Record<LineFrequencyCompassPoint, TranslationKey> = {
  north: "globalMap.sidebar.gtfsFrequency.timetableCompassNorth",
  south: "globalMap.sidebar.gtfsFrequency.timetableCompassSouth",
  east: "globalMap.sidebar.gtfsFrequency.timetableCompassEast",
  west: "globalMap.sidebar.gtfsFrequency.timetableCompassWest",
  "north-east": "globalMap.sidebar.gtfsFrequency.timetableCompassNorthEast",
  "north-west": "globalMap.sidebar.gtfsFrequency.timetableCompassNorthWest",
  "south-east": "globalMap.sidebar.gtfsFrequency.timetableCompassSouthEast",
  "south-west": "globalMap.sidebar.gtfsFrequency.timetableCompassSouthWest",
};

function formatCompassDirection(direction?: LineFrequencyCompassDirection): string | undefined {
  if (!direction) return undefined;
  return t("globalMap.sidebar.gtfsFrequency.timetableCompassDirection", {
    from: t(compassPointKeys[direction.from]),
    to: t(compassPointKeys[direction.to]),
  });
}

function sectionOptionFor(id: string): TimetableSectionOption | undefined {
  return sectionOptions.value.find((option) => option.id === id);
}

const stopsById = computed(
  () => new Map((props.timetable?.stops ?? []).map((stop) => [stop.id, stop])),
);
const sections = computed(() => props.profile?.sections ?? []);
const selectedSectionKey = ref("");

const preferredSection = computed<FrequencySection | undefined>(
  () => sections.value.find((section) => section.kind === "central") ?? sections.value[0],
);
const hasSectionSelector = computed(() => sections.value.length > 1);
const sectionOptions = computed<TimetableSectionOption[]>(() =>
  hasSectionSelector.value
    ? [
        {
          id: "all",
          label: t("globalMap.sidebar.gtfsFrequency.timetableWholeLine"),
          isCentral: false,
        },
        ...sections.value.map((section) => ({
          id: section.id,
          label: t("globalMap.sidebar.gtfsFrequency.timetableSegmentFromTo", {
            from: section.from.name,
            to: section.to.name,
          }),
          isCentral: section.kind === "central",
          compassDirection: formatCompassDirection(
            inferLineFrequencyCompassDirection(
              section.from,
              section.to,
              props.stationCoordinates ?? [],
            ),
          ),
        })),
      ]
    : [],
);

watch(
  [
    () => props.profile?.lineId,
    () => props.profile?.serviceDate,
    () => sections.value.map((section) => section.id).join("|"),
  ],
  () => {
    selectedSectionKey.value = preferredSection.value?.id ?? "all";
  },
  { immediate: true },
);

const activeSection = computed<FrequencySection | undefined>(() => {
  if (selectedSectionKey.value === "all") return undefined;
  return (
    sections.value.find((section) => section.id === selectedSectionKey.value) ??
    (sections.value.length === 1 ? sections.value[0] : preferredSection.value)
  );
});
const activeSectionStationIds = computed<ReadonlySet<string> | undefined>(() =>
  activeSection.value ? new Set(activeSection.value.stationIds) : undefined,
);
const lineColorStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {};
  if (props.lineColor) style["--line-frequency-color"] = props.lineColor;
  return style;
});

function orderedCalls(trip: GtfsLineTimetableTrip) {
  return [...trip.calls].sort((left, right) => left.sequence - right.sequence);
}

function boardableCalls(trip: GtfsLineTimetableTrip) {
  return orderedCalls(trip).filter(isBoardableGtfsTimetableCall);
}

function directionKey(trip: GtfsLineTimetableTrip): string {
  const directionId = trip.directionId?.trim();
  if (directionId) return `gtfs:${directionId}`;

  const calls = boardableCalls(trip);
  return `route:${calls[0]?.stopId ?? ""}:${calls.at(-1)?.stopId ?? ""}`;
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values.map((item) => item.trim()).filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].sort(
    ([leftValue, leftCount], [rightValue, rightCount]) =>
      rightCount - leftCount || leftValue.localeCompare(rightValue),
  )[0]?.[0];
}

function stopForId(id: string): GtfsLineTimetableStop {
  return stopsById.value.get(id) ?? { id, name: id };
}

function stationIndexForStop(stopId: string, section: FrequencySection): number {
  const stop = stopsById.value.get(stopId);
  const ids = [stopId, stop?.parentId, stop?.topologyId]
    .filter((value): value is string => Boolean(value))
    .map(canonicalGtfsTimetableStationId);
  return section.stationIds.findIndex((sectionId) =>
    ids.includes(canonicalGtfsTimetableStationId(sectionId)),
  );
}

function sectionOrientation(
  trip: GtfsLineTimetableTrip,
  section: FrequencySection,
): SectionOrientation | undefined {
  const indexes = orderedCalls(trip)
    .map((call) => stationIndexForStop(call.stopId, section))
    .filter((index) => index >= 0);
  const uniqueIndexes = new Set(indexes);
  if (uniqueIndexes.size < 2) return undefined;

  const first = indexes[0]!;
  const last = indexes.at(-1)!;
  return last > first ? "forward" : last < first ? "reverse" : undefined;
}

const timetableTrips = computed<TimetableTripEntry[]>(() => {
  const trips = (props.timetable?.trips ?? []).filter((trip) => boardableCalls(trip).length > 0);
  const section = activeSection.value;
  if (!section) return trips.map((trip) => ({ trip }));

  return trips.flatMap((trip) => {
    const orientation = sectionOrientation(trip, section);
    return orientation ? [{ trip, orientation }] : [];
  });
});

const hasBoardableTrips = computed(() =>
  (props.timetable?.trips ?? []).some((trip) => boardableCalls(trip).length > 0),
);

function normalizedLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function sameLabel(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && normalizedLabel(left) === normalizedLabel(right));
}

function terminalName(trips: readonly GtfsLineTimetableTrip[]): string | undefined {
  const names = trips.flatMap((trip) => {
    const last = orderedCalls(trip).at(-1);
    if (!last) return [];
    const stop = stopForId(last.stopId);
    return stop.name !== stop.id ? [stop.name] : [];
  });
  return mostCommon(names);
}

function profileDirectionFor(
  trips: readonly GtfsLineTimetableTrip[],
  orientation: SectionOrientation | undefined,
): FrequencyDirection | undefined {
  const section = activeSection.value;
  const candidates = section?.directions ?? props.profile?.directions ?? [];
  if (!candidates.length) return undefined;

  if (section && orientation) {
    const from = orientation === "forward" ? section.from.name : section.to.name;
    const to = orientation === "forward" ? section.to.name : section.from.name;
    const bySectionOrientation = candidates.find(
      (candidate) => sameLabel(candidate.from, from) && sameLabel(candidate.to, to),
    );
    if (bySectionOrientation) return bySectionOrientation;
  }

  const directionIds = new Set(
    trips
      .map((trip) => trip.directionId?.trim())
      .filter((value): value is string => Boolean(value)),
  );
  const byId = candidates.find((candidate) =>
    [...directionIds].some(
      (id) =>
        candidate.id === id || candidate.id === `gtfs:${id}` || candidate.id.endsWith(`:${id}`),
    ),
  );
  if (byId) return byId;

  const destination = terminalName(trips);
  return candidates.find((candidate) => sameLabel(candidate.to, destination));
}

const directions = computed<TimetableDirection[]>(() => {
  const grouped = new Map<string, TimetableTripEntry[]>();
  for (const entry of timetableTrips.value) {
    const key = activeSection.value
      ? `section:${entry.orientation ?? "unknown"}`
      : directionKey(entry.trip);
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  return [...grouped.entries()].map(([key, entries], index) => {
    const trips = entries.map((entry) => entry.trip);
    const orientation = entries[0]?.orientation;
    const profileDirection = profileDirectionFor(trips, orientation);
    const destination = profileDirection?.to ?? terminalName(trips);
    const label = destination
      ? t("globalMap.sidebar.gtfsFrequency.timetableDirectionTo", { destination })
      : profileDirection?.from && profileDirection.to
        ? t("globalMap.sidebar.gtfsFrequency.fromTo", {
            from: profileDirection.from,
            to: profileDirection.to,
          })
        : t("globalMap.sidebar.gtfsFrequency.timetableDirectionNumber", {
            number: index + 1,
          });

    return { key, label, trips, orientation };
  });
});

const timetableRows = computed(() =>
  GTFS_LINE_TIMETABLE_WINDOWS.map((window) => ({
    ...window,
    intervals: directions.value.map((direction) =>
      calculateGtfsTimetableInterval(
        direction.trips,
        window,
        stopsById.value,
        activeSectionStationIds.value,
      ),
    ),
  })),
);

const hasIntervals = computed(() =>
  timetableRows.value.some((row) => row.intervals.some((interval) => interval !== undefined)),
);

function formatServiceDate(value?: string): string {
  if (!value || !/^\d{8}$/u.test(value)) return t("globalMap.sidebar.gtfsFrequency.unknownDate");
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return t("globalMap.sidebar.gtfsFrequency.unknownDate");
  }
  return d(date, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
}

function formatInterval(interval: GtfsTimetableInterval | undefined): string {
  if (!interval) return t("globalMap.sidebar.gtfsFrequency.timetableNoInterval");

  const min = Math.max(0, Math.round(interval.minMinutes));
  const max = Math.max(min, Math.round(interval.maxMinutes));
  if (min === max) {
    return t("globalMap.sidebar.gtfsFrequency.timetableIntervalSingle", { value: min });
  }
  return t("globalMap.sidebar.gtfsFrequency.timetableIntervalRange", { min, max });
}
</script>

<template>
  <section
    class="line-frequency-timetable"
    :style="lineColorStyle"
    data-testid="line-frequency-timetable"
  >
    <p v-if="timetable" class="line-frequency-timetable__service-date">
      {{
        t("globalMap.sidebar.gtfsFrequency.serviceDate", {
          date: formatServiceDate(timetable.serviceDate),
        })
      }}
    </p>

    <div v-if="hasSectionSelector" class="line-frequency-timetable__segment-picker">
      <span class="line-frequency-timetable__segment-label">
        {{ t("globalMap.sidebar.gtfsFrequency.timetableSegment") }}
      </span>
      <MaterialCombobox
        v-model="selectedSectionKey"
        :options="sectionOptions"
        :aria-label="t('globalMap.sidebar.gtfsFrequency.timetableSegment')"
        data-testid="line-frequency-timetable-segment"
      >
        <template #value="{ option }">
          <span v-if="option" class="line-frequency-timetable__segment-option">
            <span
              v-if="sectionOptionFor(option.id)?.isCentral"
              class="line-frequency-timetable__segment-chip"
            >
              {{ t("globalMap.sidebar.gtfsFrequency.central") }}
            </span>
            <span class="line-frequency-timetable__segment-name">{{ option.label }}</span>
          </span>
        </template>
        <template #option="{ option }">
          <span class="line-frequency-timetable__segment-option">
            <span
              v-if="sectionOptionFor(option.id)?.isCentral"
              class="line-frequency-timetable__segment-chip"
            >
              {{ t("globalMap.sidebar.gtfsFrequency.central") }}
            </span>
            <span class="line-frequency-timetable__segment-name">{{ option.label }}</span>
            <span
              v-if="sectionOptionFor(option.id)?.compassDirection"
              class="line-frequency-timetable__segment-compass"
            >
              {{ sectionOptionFor(option.id)?.compassDirection }}
            </span>
          </span>
        </template>
      </MaterialCombobox>
    </div>

    <p class="line-frequency-timetable__hint">
      {{ t("globalMap.sidebar.gtfsFrequency.timetableHint") }}
    </p>

    <p v-if="loading" role="status" data-testid="line-frequency-timetable-loading">
      {{ t("globalMap.sidebar.gtfsFrequency.timetableLoading") }}
    </p>
    <p v-else-if="error" role="alert" data-testid="line-frequency-timetable-unavailable">
      {{ t("globalMap.sidebar.gtfsFrequency.timetableError") }}
    </p>
    <p
      v-else-if="!timetable"
      role="status"
      data-testid="line-frequency-timetable-unavailable"
    >
      {{ t("globalMap.sidebar.gtfsFrequency.timetableError") }}
    </p>
    <p
      v-else-if="timetable.status !== 'ready'"
      role="status"
      data-testid="line-frequency-timetable-unavailable"
      :data-frequency-status="timetable.status"
    >
      {{ t(statusKeys[timetable.status]) }}
    </p>
    <p
      v-else-if="!hasBoardableTrips"
      role="status"
      data-testid="line-frequency-timetable-unavailable"
    >
      {{ t("globalMap.sidebar.gtfsFrequency.timetableNoDepartures") }}
    </p>
    <p
      v-else-if="!directions.length"
      role="status"
      data-testid="line-frequency-timetable-unavailable"
    >
      {{
        activeSection
          ? t("globalMap.sidebar.gtfsFrequency.timetableNoSegmentDepartures")
          : t("globalMap.sidebar.gtfsFrequency.timetableNoDepartures")
      }}
    </p>
    <p
      v-else-if="!hasIntervals"
      role="status"
      data-testid="line-frequency-timetable-unavailable"
    >
      {{ t("globalMap.sidebar.gtfsFrequency.timetableNoIntervals") }}
    </p>
    <div
      v-else
      class="line-frequency-timetable__table-wrap"
      data-testid="line-frequency-timetable-table"
    >
      <table>
        <caption>
          {{
            t("globalMap.sidebar.gtfsFrequency.timetableTableCaption")
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">{{ t("globalMap.sidebar.gtfsFrequency.timetableTimeBand") }}</th>
            <th v-for="direction in directions" :key="direction.key" scope="col">
              {{ direction.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in timetableRows" :key="row.key">
            <th scope="row">{{ t(row.label) }}</th>
            <td
              v-for="(interval, directionIndex) in row.intervals"
              :key="directions[directionIndex]?.key ?? directionIndex"
              :data-direction-key="directions[directionIndex]?.key"
              :data-window-key="row.key"
            >
              {{ formatInterval(interval) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.line-frequency-timetable {
  --line-frequency-color: var(--idfm-blue);
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  border-top: 4px solid var(--line-frequency-color);
  padding-top: var(--space-2);
}

p {
  margin: 0;
  color: var(--muted);
  font-size: 0.74rem;
  line-height: 1.45;
}

.line-frequency-timetable__service-date {
  color: var(--ink);
  font-weight: 700;
}

.line-frequency-timetable__segment-picker {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.line-frequency-timetable__segment-label {
  display: block;
  min-width: 0;
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 700;
}

.line-frequency-timetable__segment-picker :deep(.material-combobox) {
  --line-color: var(--line-frequency-color);
  width: 100%;
  min-width: 0;
}

.line-frequency-timetable__segment-picker :deep(.material-combobox__value) {
  font-size: 0.76rem;
  font-weight: 800;
}

.line-frequency-timetable__segment-picker :deep(.material-combobox__option) {
  display: flex;
  min-height: 42px;
  white-space: normal;
}

.line-frequency-timetable__segment-option {
  align-items: center;
  display: flex;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.line-frequency-timetable__segment-chip {
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--line-frequency-color), transparent 55%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--line-frequency-color), transparent 86%);
  color: color-mix(in srgb, var(--line-frequency-color), black 22%);
  font-size: 0.62rem;
  font-weight: 900;
  line-height: 1;
  padding: 5px 7px;
  white-space: nowrap;
}

.line-frequency-timetable__segment-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-frequency-timetable__segment-compass {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 800;
  white-space: nowrap;
}

.line-frequency-timetable__table-wrap {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

table {
  width: 100%;
  min-width: 460px;
  border-collapse: collapse;
  color: var(--ink);
  font-size: 0.74rem;
}

caption {
  padding: var(--space-3) var(--space-3) var(--space-2);
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.4;
  text-align: left;
}

th,
td {
  padding: 9px 10px;
  border-top: 1px solid var(--border);
  vertical-align: middle;
  text-align: center;
}

thead th {
  border-top: 0;
  border-bottom: 3px solid var(--line-frequency-color);
  background: var(--surface-soft);
  color: var(--ink);
  font-weight: 800;
  white-space: nowrap;
}

tbody th {
  min-width: 142px;
  border-left: 4px solid var(--line-frequency-color);
  background: var(--surface-soft);
  font-weight: 700;
  text-align: left;
  white-space: nowrap;
}

tbody td {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

tbody tr:nth-child(even) td {
  background: color-mix(in srgb, var(--surface-soft) 56%, transparent);
}

@media (max-width: 520px) {
  table {
    min-width: 420px;
  }

  th,
  td {
    padding: 8px;
  }
}
</style>

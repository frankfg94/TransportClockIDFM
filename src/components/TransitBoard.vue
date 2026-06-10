<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  Bell,
  BellRing,
  ChevronDown,
  Map,
  MapPin,
  MoreVertical,
  Route,
  Trash,
} from "lucide-vue-next";
import LineCombobox from "./LineCombobox.vue";
import LineIconBadge from "./LineIconBadge.vue";
import StationCombobox from "./StationCombobox.vue";
import { createBoardFromDraft } from "../services/boardBuilder";
import {
  fetchDirectionGroupsForStation,
  fetchStationTransfers,
  searchLineStations,
} from "../services/idfm";
import type {
  Departure,
  DirectionDepartureGroup,
  LineSearchOption,
  StationSearchOption,
  TransitBoardConfig,
  TransitFamily,
  TransferLineOption,
} from "../types/transit";

type DeparturePatternPayload = {
  board: TransitBoardConfig;
  directionGroup: DirectionDepartureGroup;
  departure: Departure;
};

type ClosedSummaryMode = "last" | "next";
type TrafficAlertTone = "orange" | "red";

interface BoardTrafficAlert {
  label: "Perturbation" | "Interruption";
  tone: TrafficAlertTone;
}

interface DirectionSummary {
  label: string;
  time?: string;
  detail: string;
}

const props = withDefaults(
  defineProps<{
    board: TransitBoardConfig;
    departures: Departure[];
    directionGroups: DirectionDepartureGroup[];
    hiddenDirectionIds?: string[];
    collapsedDirectionIds: string[];
    loading: boolean;
    error?: string;
    updatedAt?: Date;
    removable?: boolean;
    alarmDepartureIds?: string[];
    closedSummaryMode?: ClosedSummaryMode;
    trafficAlert?: BoardTrafficAlert;
  }>(),
  {
    closedSummaryMode: "last",
    hiddenDirectionIds: () => [],
  },
);

const emit = defineEmits<{
  "change-station": [board: TransitBoardConfig];
  "open-traffic": [];
  remove: [];
  "open-line-page": [board: TransitBoardConfig];
  "schedule-alarm": [
    payload: {
      board: TransitBoardConfig;
      directionGroup: DirectionDepartureGroup;
      departure: Departure;
    },
  ];
  "update:hiddenDirectionIds": [directionIds: string[]];
  "show-pattern": [payload: DeparturePatternPayload];
  toggleDirection: [directionId: string];
}>();

const directionFilterOpen = ref(false);

const hiddenDirectionIdSet = computed(() => new Set(props.hiddenDirectionIds));

const visibleDirectionGroups = computed(() =>
  props.directionGroups.filter(
    (group) => !hiddenDirectionIdSet.value.has(group.id),
  ),
);

const totalDeparturesCount = computed(() =>
  props.directionGroups.reduce(
    (total, group) => total + group.departures.length,
    0,
  ),
);

const displayedDeparturesCount = computed(() =>
  visibleDirectionGroups.value.reduce(
    (total, group) => total + group.departures.length,
    0,
  ),
);

const hiddenDirectionsCount = computed(
  () => props.directionGroups.length - visibleDirectionGroups.value.length,
);

const isCompactPatternInteraction = ref(false);
const actionsOpen = ref(false);
const stationEditorOpen = ref(false);
const stationOptions = ref<StationSearchOption[]>([]);
const stationTransfers = reactive<Record<string, TransferLineOption[]>>({});
const stationTransferLoadingIds = ref<string[]>([]);
const stationQuery = ref("");
const selectedStation = ref<StationSearchOption>();
const loadingStations = ref(false);
const changingStation = ref(false);
const stationEditorError = ref("");
let compactPatternMediaQuery: MediaQueryList | undefined;
let latestStationRequest = 0;

const currentLineOption = computed<LineSearchOption>(() => {
  const family = transitModeToFamily(props.board.line.mode);
  const navitiaId = props.board.schedule?.lineRef ?? props.board.line.ref;

  return {
    family,
    id: navitiaId,
    label: props.board.line.shortName,
    ref: props.board.line.ref,
    navitiaId,
    color: props.board.line.color,
    textColor: props.board.line.textColor,
    displayName: props.board.line.longName,
    iconUrl: props.board.line.iconUrl,
    iconUrls: props.board.line.iconUrls,
  };
});

const lineOptions = computed(() => [currentLineOption.value]);

const filteredStationOptions = computed(() =>
  stationOptions.value.filter((station) =>
    stationMatchesQuery(station, stationQuery.value),
  ),
);

const canConfirmStationChange = computed(
  () =>
    Boolean(selectedStation.value) &&
    selectedStation.value?.label !== props.board.title,
);

const statusLabels: Record<string, string> = {
  noReport: "À l'heure",
  onTime: "À l'heure",
  delayed: "Retardé",
  early: "En avance",
  missed: "Manqué",
  cancelled: "Supprimé",
};

watch(stationQuery, () => {
  if (
    selectedStation.value &&
    !stationMatchesQuery(selectedStation.value, stationQuery.value)
  ) {
    selectedStation.value = undefined;
  }
});

watch(
  () => props.board.id,
  () => {
    closeStationEditor();
    closeDirectionFilter();
  },
);

function formatClock(value?: string): string {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function openDirectionFilter(): void {
  actionsOpen.value = false;
  directionFilterOpen.value = true;
}

function closeDirectionFilter(): void {
  directionFilterOpen.value = false;
}

function isDirectionVisible(directionId: string): boolean {
  return !hiddenDirectionIdSet.value.has(directionId);
}

function setDirectionVisibility(directionId: string, event: Event): void {
  const checked = (event.target as HTMLInputElement | null)?.checked ?? true;

  const nextHiddenIds = checked
    ? props.hiddenDirectionIds.filter((id) => id !== directionId)
    : [...new Set([...props.hiddenDirectionIds, directionId])];

  emit("update:hiddenDirectionIds", pruneDirectionIds(nextHiddenIds));
}

function showAllDirections(): void {
  emit("update:hiddenDirectionIds", []);
}

function pruneDirectionIds(directionIds: string[]): string[] {
  const knownDirectionIds = new Set(
    props.directionGroups.map((group) => group.id),
  );

  return [
    ...new Set(
      directionIds.filter((directionId) => knownDirectionIds.has(directionId)),
    ),
  ];
}

function formatWait(value?: string, vehicleAtStop = false): string {
  if (vehicleAtStop) {
    return "À quai";
  }

  if (!value) {
    return "";
  }

  const minutes = Math.max(
    0,
    Math.round((new Date(value).getTime() - Date.now()) / 60000),
  );

  if (minutes === 0) {
    return "Maintenant";
  }

  return `${minutes} min`;
}

function statusLabel(status?: string): string {
  return status ? (statusLabels[status] ?? status) : "";
}

function isDirectionCollapsed(directionId: string): boolean {
  return props.collapsedDirectionIds.includes(directionId);
}

function formatLastDetail(group: DirectionDepartureGroup): string {
  if (!group.lastDeparture) {
    return "";
  }

  const dayHint =
    getParisDateKey(group.lastDeparture.time) === getParisDateKey(new Date())
      ? "Aujourd'hui"
      : "Après minuit";

  return `${dayHint} · ${group.lastDeparture.destination}`;
}

function getDirectionSummary(group: DirectionDepartureGroup): DirectionSummary {
  if (props.closedSummaryMode === "next") {
    const nextDeparture = group.departures[0];
    const nextTime = getDepartureTime(nextDeparture);

    return {
      label: "Prochain passage",
      time: nextTime,
      detail: nextDeparture
        ? formatWait(nextTime, nextDeparture.vehicleAtStop) ||
          formatDepartureMeta(nextDeparture)
        : "",
    };
  }

  return {
    label: "Dernier passage",
    time: group.lastDeparture?.time,
    detail: formatLastDetail(group),
  };
}

function getDepartureTime(departure?: Departure): string | undefined {
  return (
    departure?.expectedDepartureTime ??
    departure?.aimedDepartureTime ??
    departure?.expectedArrivalTime
  );
}

function getParisDateKey(value: string | Date): string {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).format(new Date(value));
}

function hasAlarm(departure: Departure): boolean {
  return props.alarmDepartureIds?.includes(departure.id) ?? false;
}

function formatDepartureMeta(departure: Departure): string {
  const normalizedLabel = normalizeText(departure.monitoringLabel);
  const normalizedDestination = normalizeText(departure.destination);
  const parts: string[] = [];

  if (
    departure.monitoringLabel &&
    normalizedLabel !== "tous quais" &&
    normalizedLabel !== "tous quais." &&
    normalizedLabel !== "horaire idfm" &&
    normalizedLabel !== normalizedDestination
  ) {
    parts.push(departure.monitoringLabel);
  }

  if (departure.platform) {
    parts.push(`Quai ${departure.platform}`);
  } else if (normalizedLabel === "tous quais") {
    parts.push("Tous quais");
  }

  return parts.join(" · ");
}

function formatRemainingStopCount(departure: Departure): string {
  if (typeof departure.remainingStopCount !== "number") {
    return "";
  }

  return departure.remainingStopCount > 1
    ? `${departure.remainingStopCount} arrêts`
    : `${departure.remainingStopCount} arrêt`;
}

function canShowPattern(): boolean {
  return true;
}

function canAutoOpenPattern(): boolean {
  return canShowPattern() && !isCompactPatternInteraction.value;
}

function openPatternForDeparture(payload: DeparturePatternPayload): void {
  emit("show-pattern", payload);
}

function openLinePage(): void {
  actionsOpen.value = false;
  emit("open-line-page", props.board);
}

function openStationEditor(): void {
  actionsOpen.value = false;
  stationEditorOpen.value = true;
  stationQuery.value = "";
  selectedStation.value = undefined;
  stationEditorError.value = "";
  void loadStations();
}

function removeBoard(): void {
  actionsOpen.value = false;
  emit("remove");
}

function closeStationEditor(): void {
  stationEditorOpen.value = false;
  stationOptions.value = [];
  stationQuery.value = "";
  selectedStation.value = undefined;
  stationEditorError.value = "";
  clearStationTransfers();
}

async function loadStations(): Promise<void> {
  const requestId = ++latestStationRequest;
  loadingStations.value = true;
  stationEditorError.value = "";

  try {
    const stations = await searchLineStations(
      currentLineOption.value,
      stationQuery.value,
    );

    if (requestId === latestStationRequest) {
      stationOptions.value = stations;
      clearStationTransfers();
    }
  } catch {
    if (requestId === latestStationRequest) {
      stationOptions.value = [];
      stationEditorError.value = "Impossible de charger les stations.";
    }
  } finally {
    if (requestId === latestStationRequest) {
      loadingStations.value = false;
    }
  }
}

function selectStationOption(station?: StationSearchOption): void {
  selectedStation.value = station;

  if (station) {
    stationQuery.value = station.label;
    void loadStationTransferBadges(station);
  }
}

async function loadStationTransferBadges(
  station: StationSearchOption,
): Promise<void> {
  if (stationTransfers[station.id]) {
    return;
  }

  if (stationTransferLoadingIds.value.includes(station.id)) {
    return;
  }

  stationTransferLoadingIds.value = [
    ...stationTransferLoadingIds.value,
    station.id,
  ];

  try {
    stationTransfers[station.id] = await fetchStationTransfers(
      station,
      currentLineOption.value.id,
    );
  } catch {
    stationTransfers[station.id] = [];
  } finally {
    stationTransferLoadingIds.value = stationTransferLoadingIds.value.filter(
      (id) => id !== station.id,
    );
  }
}

async function confirmStationChange(): Promise<void> {
  if (!selectedStation.value || changingStation.value) {
    return;
  }

  changingStation.value = true;
  stationEditorError.value = "";

  try {
    const directionGroups = await fetchDirectionGroupsForStation(
      currentLineOption.value,
      selectedStation.value,
    );
    const nextBoard = createBoardFromDraft(
      {
        family: currentLineOption.value.family,
        line: currentLineOption.value,
        station: selectedStation.value,
      },
      directionGroups,
    );

    emit("change-station", nextBoard);
    closeStationEditor();
  } catch {
    stationEditorError.value = "Impossible de changer de station.";
  } finally {
    changingStation.value = false;
  }
}

function clearStationTransfers(): void {
  Object.keys(stationTransfers).forEach((key) => {
    delete stationTransfers[key];
  });
  stationTransferLoadingIds.value = [];
}

function normalizeText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function stationMatchesQuery(
  station: StationSearchOption,
  query: string,
): boolean {
  const normalizedQuery = normalizeText(query);

  return (
    !normalizedQuery ||
    normalizeText(`${station.label} ${station.city ?? ""}`).includes(
      normalizedQuery,
    )
  );
}

function transitModeToFamily(mode: string): TransitFamily {
  if (mode === "metro") return "METRO";
  if (mode === "rer") return "RER";
  if (mode === "bus") return "BUS";
  if (mode === "tram") return "TRAM";
  if (mode === "noctilien") return "NOCTILIEN";
  if (mode === "train") return "TRANSILIEN";
  if (mode === "cable") return "CABLE";

  return "BUS";
}

function syncCompactPatternInteraction(event?: MediaQueryListEvent): void {
  isCompactPatternInteraction.value =
    event?.matches ?? compactPatternMediaQuery?.matches ?? false;
}

onMounted(() => {
  compactPatternMediaQuery = window.matchMedia("(max-width: 1024px)");
  syncCompactPatternInteraction();
  compactPatternMediaQuery.addEventListener(
    "change",
    syncCompactPatternInteraction,
  );
});

onUnmounted(() => {
  compactPatternMediaQuery?.removeEventListener(
    "change",
    syncCompactPatternInteraction,
  );
});
</script>

<template>
  <article class="board" :style="{ '--line-color': board.line.color }">
    <header class="board__header">
      <LineIconBadge
        class="board-line-icon"
        :line="board.line"
        :aria-label="board.line.longName"
      />

      <div>
        <p class="board__mode">{{ board.line.longName }}</p>

        <div class="board__title-row">
          <h2>{{ board.title }}</h2>

          <button
            v-if="trafficAlert"
            class="board-traffic-chip"
            :class="`board-traffic-chip--${trafficAlert.tone}`"
            type="button"
            @click.stop="emit('open-traffic')"
          >
            {{ trafficAlert.label }}
          </button>
        </div>

        <p class="board__city">{{ board.city }}</p>
      </div>

      <div class="board-actions">
        <button
          class="board-actions__trigger"
          type="button"
          :aria-expanded="actionsOpen"
          aria-label="Actions de la station"
          @click.stop="actionsOpen = !actionsOpen"
        >
          <MoreVertical :size="20" aria-hidden="true" />
        </button>

        <div v-if="actionsOpen" class="board-actions__menu">
          <button type="button" @click="openLinePage">
            <Map :size="17" aria-hidden="true" />
            Schéma de la ligne
          </button>

          <button type="button" @click="openStationEditor">
            <MapPin :size="17" aria-hidden="true" />
            Changer de station
          </button>

          <button
            v-if="directionGroups.length > 0"
            type="button"
            @click="openDirectionFilter"
          >
            <Route :size="17" aria-hidden="true" />
            Filtrer les directions
            <span v-if="hiddenDirectionsCount > 0">
              · {{ hiddenDirectionsCount }}
            </span>
          </button>

          <button
            v-if="removable"
            class="board-actions__danger"
            type="button"
            @click="removeBoard"
          >
            <Trash :size="17" aria-hidden="true" />
            Supprimer
          </button>
        </div>
      </div>
    </header>

    <div v-if="error" class="notice notice--error">
      {{ error }}
    </div>

    <div v-else-if="loading && totalDeparturesCount === 0" class="notice">
      Chargement des passages...
    </div>

    <div
      v-else-if="
        directionGroups.length > 0 && visibleDirectionGroups.length === 0
      "
      class="notice notice--direction-filter-empty"
    >
      <span>Toutes les directions sont masquées.</span>

      <button type="button" class="button-secondary" @click="showAllDirections">
        Tout afficher
      </button>
    </div>

    <div v-else class="direction-groups">
      <section
        v-for="group in visibleDirectionGroups"
        :key="group.id"
        class="direction-section"
        :class="{
          'direction-section--collapsed': isDirectionCollapsed(group.id),
        }"
      >
        <button
          class="direction-section__header"
          type="button"
          :aria-expanded="!isDirectionCollapsed(group.id)"
          @click="emit('toggleDirection', group.id)"
        >
          <div class="direction-section__title">
            <p>Direction</p>
            <h3 style="font-weight: 600">{{ group.label }}</h3>
          </div>

          <div class="last-service">
            <span>{{ getDirectionSummary(group).label }}</span>
            <strong>{{ formatClock(getDirectionSummary(group).time) }}</strong>
            <small v-if="getDirectionSummary(group).detail">
              {{ getDirectionSummary(group).detail }}
            </small>
          </div>

          <span class="accordion-chevron" aria-hidden="true">
            <ChevronDown :size="20" stroke-width="2.8" />
          </span>
        </button>

        <div class="direction-section__body">
          <div class="direction-section__body-inner">
            <ol v-if="group.departures.length > 0" class="departures">
              <li
                v-for="departure in group.departures"
                :key="departure.id"
                class="departure"
                :class="{
                  'departure--cancelled': departure.status === 'cancelled',
                }"
                @click="
                  canAutoOpenPattern() &&
                  openPatternForDeparture({
                    board,
                    directionGroup: group,
                    departure,
                  })
                "
              >
                <button
                  v-if="canAutoOpenPattern()"
                  class="departure__main departure__main-button"
                  type="button"
                  @click.stop="
                    openPatternForDeparture({
                      board,
                      directionGroup: group,
                      departure,
                    })
                  "
                  @keydown.enter.prevent="
                    openPatternForDeparture({
                      board,
                      directionGroup: group,
                      departure,
                    })
                  "
                  @keydown.space.prevent="
                    openPatternForDeparture({
                      board,
                      directionGroup: group,
                      departure,
                    })
                  "
                >
                  <strong>{{ departure.destination }}</strong>

                  <span
                    v-if="
                      formatDepartureMeta(departure) ||
                      formatRemainingStopCount(departure)
                    "
                    class="departure__meta"
                  >
                    <span v-if="formatDepartureMeta(departure)">
                      {{ formatDepartureMeta(departure) }}
                    </span>

                    <small v-if="formatRemainingStopCount(departure)">
                      {{ formatRemainingStopCount(departure) }}
                    </small>
                  </span>
                </button>

                <div v-else class="departure__main">
                  <strong>{{ departure.destination }}</strong>

                  <span
                    v-if="
                      formatDepartureMeta(departure) ||
                      formatRemainingStopCount(departure)
                    "
                    class="departure__meta"
                  >
                    <span v-if="formatDepartureMeta(departure)">
                      {{ formatDepartureMeta(departure) }}
                    </span>

                    <small v-if="formatRemainingStopCount(departure)">
                      {{ formatRemainingStopCount(departure) }}
                    </small>
                  </span>
                </div>

                <div class="departure__time">
                  <strong>
                    {{
                      formatWait(
                        departure.expectedDepartureTime,
                        departure.vehicleAtStop,
                      )
                    }}
                  </strong>

                  <span>
                    {{ formatClock(departure.expectedDepartureTime) }}
                  </span>
                </div>

                <div v-if="statusLabel(departure.status)" class="status-pill">
                  {{ statusLabel(departure.status) }}
                </div>

                <button
                  v-if="canShowPattern()"
                  class="departure-pattern-button"
                  type="button"
                  aria-label="Afficher la desserte"
                  @click.stop="
                    openPatternForDeparture({
                      board,
                      directionGroup: group,
                      departure,
                    })
                  "
                >
                  <Route :size="18" aria-hidden="true" />
                </button>

                <button
                  class="departure-alarm-button"
                  :class="{
                    'departure-alarm-button--active': hasAlarm(departure),
                  }"
                  type="button"
                  :aria-label="
                    hasAlarm(departure)
                      ? 'Alarme programmée'
                      : 'Programmer une alarme'
                  "
                  @click.stop="
                    emit('schedule-alarm', {
                      board,
                      directionGroup: group,
                      departure,
                    })
                  "
                >
                  <BellRing
                    v-if="hasAlarm(departure)"
                    :size="18"
                    aria-hidden="true"
                  />
                  <Bell v-else :size="18" aria-hidden="true" />
                </button>
              </li>
            </ol>

            <div v-else class="notice notice--compact">
              {{
                group.serviceEnded
                  ? "Service terminé"
                  : "Aucun passage imminent"
              }}
            </div>
          </div>
        </div>
      </section>
    </div>

    <footer class="board__footer">
      <span>{{ displayedDeparturesCount }} passages</span>
    </footer>
  </article>

  <Teleport to="body">
    <Transition name="modal-scale">
      <div
        v-if="stationEditorOpen"
        class="modal-backdrop"
        @click.self="closeStationEditor"
      >
        <section
          class="modal-panel board-station-modal"
          aria-modal="true"
          role="dialog"
        >
          <header class="modal-panel__header">
            <div>
              <p class="eyebrow">Station</p>
              <h2>Changer de station</h2>
              <span class="board-station-modal__subtitle">
                {{ board.line.longName }} · {{ board.title }}
              </span>
            </div>

            <button
              class="icon-button"
              type="button"
              aria-label="Fermer"
              @click="closeStationEditor"
            >
              ×
            </button>
          </header>

          <div class="station-form board-station-modal__form">
            <label>
              <span>Ligne</span>

              <LineCombobox
                :model-value="currentLineOption"
                :options="lineOptions"
                :query="
                  currentLineOption.displayName ?? currentLineOption.label
                "
                disabled
                placeholder="Ligne"
                @update:model-value="() => undefined"
                @update:query="() => undefined"
              />
            </label>

            <label>
              <span>Nouvelle station</span>

              <StationCombobox
                :model-value="selectedStation"
                :options="filteredStationOptions"
                :query="stationQuery"
                :loading="loadingStations"
                :transfer-map="stationTransfers"
                :transfer-loading-ids="stationTransferLoadingIds"
                @inspect="loadStationTransferBadges"
                @update:model-value="selectStationOption"
                @update:query="stationQuery = $event"
              />

              <span v-if="loadingStations" class="field-loader">
                <span aria-hidden="true" class="loader-dot"></span>
                Chargement des stations
              </span>
            </label>

            <div v-if="stationEditorError" class="form-error">
              <span>{{ stationEditorError }}</span>

              <button
                class="button-secondary form-retry"
                type="button"
                @click="loadStations"
              >
                Réessayer
              </button>
            </div>
          </div>

          <footer class="modal-panel__footer">
            <button
              class="button-secondary"
              type="button"
              @click="closeStationEditor"
            >
              Annuler
            </button>

            <button
              type="button"
              :disabled="!canConfirmStationChange || changingStation"
              @click="confirmStationChange"
            >
              {{ changingStation ? "Changement..." : "Changer" }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>

    <Transition name="modal-scale">
      <div
        v-if="directionFilterOpen"
        class="modal-backdrop"
        @click.self="closeDirectionFilter"
      >
        <section
          class="modal-panel board-direction-filter-modal"
          :style="{ '--line-color': board.line.color }"
          aria-modal="true"
          role="dialog"
          aria-labelledby="direction-filter-title"
        >
          <header
            class="modal-panel__header board-direction-filter-modal__header"
          >
            <div>
              <p class="eyebrow">Directions</p>
              <h2 id="direction-filter-title">Filtrer les directions</h2>
              <span class="board-station-modal__subtitle">
                {{ board.line.longName }} · {{ board.title }}
              </span>
            </div>

            <button
              class="icon-button"
              type="button"
              aria-label="Fermer"
              @click="closeDirectionFilter"
            >
              ×
            </button>
          </header>

          <div class="direction-filter-summary">
            <strong>
              {{ visibleDirectionGroups.length }} / {{ directionGroups.length }}
              directions affichées
            </strong>

            <span v-if="hiddenDirectionsCount > 0">
              {{ hiddenDirectionsCount }} masquée{{
                hiddenDirectionsCount > 1 ? "s" : ""
              }}
            </span>
          </div>

          <div class="direction-filter-list">
            <label
              v-for="group in directionGroups"
              :key="group.id"
              class="direction-filter-option"
              :class="{
                'direction-filter-option--hidden': !isDirectionVisible(
                  group.id,
                ),
              }"
            >
              <input
                type="checkbox"
                :checked="isDirectionVisible(group.id)"
                @change="setDirectionVisibility(group.id, $event)"
              />

              <span
                class="direction-filter-option__check"
                aria-hidden="true"
              ></span>

              <span class="direction-filter-option__content">
                <strong>{{ group.label }}</strong>

              </span>
            </label>
          </div>

          <footer
            class="modal-panel__footer board-direction-filter-modal__footer"
          >
            <button
              class="button-secondary"
              type="button"
              :disabled="hiddenDirectionsCount === 0"
              @click="showAllDirections"
            >
              Tout afficher
            </button>

            <button type="button" @click="closeDirectionFilter">OK</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.notice--direction-filter-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.board-direction-filter-modal {
  width: min(460px, calc(100vw - 32px));
  max-height: min(720px, calc(100vh - 48px));
  overflow: hidden;
  padding: 0;
}

.board-direction-filter-modal__header {
  padding: 22px 24px 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.board-direction-filter-modal__header .eyebrow {
  color: var(--line-color);
}

.direction-filter-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 20px 0;
  padding: 12px 14px;
  border-radius: 16px;
}

.direction-filter-summary strong {
  min-width: 0;
  font-size: 0.9rem;
  font-weight: 700;
}

.direction-filter-summary span {
  flex-shrink: 0;
  color: rgba(226, 232, 240, 0.72);
  font-size: 0.78rem;
  font-weight: 600;
}

.direction-filter-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(420px, 52vh);
  overflow-y: auto;
  padding: 18px 20px 20px;
}

.direction-filter-list::-webkit-scrollbar {
  width: 8px;
}

.direction-filter-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.28);
}

.direction-filter-option {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 13px 14px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 18px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.06),
    rgba(255, 255, 255, 0.025)
  );
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    opacity 160ms ease,
    transform 160ms ease;
}

.direction-filter-option:hover {
  border-color: color-mix(
    in srgb,
    var(--line-color) 42%,
    rgba(148, 163, 184, 0.22)
  );
}

.direction-filter-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.direction-filter-option__check {
  position: relative;
  width: 24px;
  height: 24px;
  border: 2px solid rgba(148, 163, 184, 0.48);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.72);
  transition:
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease;
}

.direction-filter-option input:focus-visible + .direction-filter-option__check {
  outline: 2px solid color-mix(in srgb, var(--line-color) 70%, white);
  outline-offset: 3px;
}

.direction-filter-option input:checked + .direction-filter-option__check {
  border-color: var(--line-color);
  background: var(--line-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--line-color) 18%, transparent);
}

.direction-filter-option
  input:checked
  + .direction-filter-option__check::after {
  content: "";
  position: absolute;
  left: 7px;
  top: 3px;
  width: 6px;
  height: 12px;
  border: solid currentColor;
  border-width: 0 2px 2px 0;
  color: white;
  transform: rotate(45deg);
}

.direction-filter-option__content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.direction-filter-option__content strong {
  overflow: hidden;
  color: var(--line-color);
  font-size: 0.98rem;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.direction-filter-option__content small {
  overflow: hidden;
  color: rgba(203, 213, 225, 0.68);
  font-size: 0.78rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-direction-filter-modal__footer {
  padding: 16px 20px 20px;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}

@media (max-width: 560px) {
  .notice--direction-filter-empty {
    align-items: stretch;
    flex-direction: column;
  }

  .board-direction-filter-modal {
    width: calc(100vw - 20px);
    max-height: calc(100vh - 24px);
  }

  .direction-filter-summary {
    align-items: flex-start;
    flex-direction: column;
  }

  .direction-filter-option {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .direction-filter-option__state {
    grid-column: 2;
    justify-self: start;
  }
}
</style>

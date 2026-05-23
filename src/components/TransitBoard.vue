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

const props = defineProps<{
  board: TransitBoardConfig;
  departures: Departure[];
  directionGroups: DirectionDepartureGroup[];
  collapsedDirectionIds: string[];
  loading: boolean;
  error?: string;
  updatedAt?: Date;
  removable?: boolean;
  alarmDepartureIds?: string[];
}>();

const emit = defineEmits<{
  "change-station": [board: TransitBoardConfig];
  remove: [];
  "open-line-page": [board: TransitBoardConfig];
  "schedule-alarm": [
    payload: {
      board: TransitBoardConfig;
      directionGroup: DirectionDepartureGroup;
      departure: Departure;
    },
  ];
  "show-pattern": [payload: DeparturePatternPayload];
  toggleDirection: [directionId: string];
}>();

const displayedDeparturesCount = computed(() =>
  props.directionGroups.reduce(
    (total, group) => total + group.departures.length,
    0,
  ),
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
        <h2>{{ board.title }}</h2>
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

    <div v-else-if="loading && displayedDeparturesCount === 0" class="notice">
      Chargement des passages...
    </div>

    <div v-else class="direction-groups">
      <section
        v-for="group in directionGroups"
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
            <span>Dernier passage</span>
            <strong>
              {{
                group.lastDeparture
                  ? formatClock(group.lastDeparture.time)
                  : "--:--"
              }}
            </strong>
            <small v-if="group.lastDeparture">
              {{ formatLastDetail(group) }}
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
                  <strong>{{
                    formatWait(
                      departure.expectedDepartureTime,
                      departure.vehicleAtStop,
                    )
                  }}</strong>
                  <span>{{
                    formatClock(departure.expectedDepartureTime)
                  }}</span>
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
                :query="currentLineOption.displayName ?? currentLineOption.label"
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
  </Teleport>
</template>


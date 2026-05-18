<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { DetailedLineMapPicker } from "../features/line-map";
import FamilyCombobox from "./FamilyCombobox.vue";
import LineCombobox from "./LineCombobox.vue";
import StationCombobox from "./StationCombobox.vue";
import { createBoardFromDraft } from "../services/boardBuilder";
import {
  fetchDirectionGroupsForStation,
  fetchStationTransfers,
  fetchTransitFamilyOptions,
  searchLineStations,
  searchTransitLines,
} from "../services/idfm";
import type {
  LineSearchOption,
  StationBoardDraft,
  StationSearchOption,
  TransitBoardConfig,
  TransitFamilyOption,
  TransferLineOption,
} from "../types/transit";

type StationSelectionMode = "list" | "map";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  add: [board: TransitBoardConfig];
  close: [];
}>();

const draft = reactive<StationBoardDraft>({});
const selectedNetwork = ref<TransitFamilyOption>();
const familyOptions = ref<TransitFamilyOption[]>([]);
const lineOptions = ref<LineSearchOption[]>([]);
const stationOptions = ref<StationSearchOption[]>([]);
const stationTransfers = reactive<Record<string, TransferLineOption[]>>({});
const stationTransferLoadingIds = ref<string[]>([]);
const lineQuery = ref("");
const stationQuery = ref("");
const stationSelectionMode = ref<StationSelectionMode>("list");
const loadingFamilies = ref(false);
const loadingLines = ref(false);
const loadingStations = ref(false);
const adding = ref(false);
const errorMessage = ref("");
const canAdd = computed(() =>
  Boolean(draft.family && draft.line && draft.station),
);
const modalWide = computed(
  () => stationSelectionMode.value === "map" && Boolean(draft.line),
);
const filteredStationOptions = computed(() =>
  stationOptions.value.filter((station) =>
    stationMatchesQuery(station, stationQuery.value),
  ),
);
let lineSearchTimer: number | undefined;
let latestFamilyRequest = 0;
let latestLineRequest = 0;
let latestStationRequest = 0;
let suppressLineQueryWatcher = false;

watch(
  () => props.open,
  (open) => {
    if (open) {
      void loadFamilies();
    }
  },
  { immediate: true },
);

watch(lineQuery, () => {
  if (suppressLineQueryWatcher) {
    suppressLineQueryWatcher = false;
    return;
  }

  if (draft.line) {
    draft.line = undefined;
    draft.station = undefined;
    stationOptions.value = [];
    stationQuery.value = "";
    clearStationTransfers();
    stationSelectionMode.value = "list";
  }

  scheduleLineLoad();
});

watch(stationQuery, () => {
  if (
    draft.station &&
    !stationMatchesQuery(draft.station, stationQuery.value)
  ) {
    draft.station = undefined;
  }
});

async function loadFamilies(): Promise<void> {
  const requestId = ++latestFamilyRequest;
  loadingFamilies.value = true;
  errorMessage.value = "";

  try {
    const families = await fetchTransitFamilyOptions();

    if (requestId === latestFamilyRequest) {
      familyOptions.value = families;
    }
  } catch (error) {
    if (requestId === latestFamilyRequest) {
      familyOptions.value = [];
      errorMessage.value = formatLoadError(error, "réseaux");
    }
  } finally {
    if (requestId === latestFamilyRequest) {
      loadingFamilies.value = false;
    }
  }
}

function selectFamilyOption(network?: TransitFamilyOption): void {
  selectedNetwork.value = network;
  draft.family = selectedNetwork.value?.family;
  draft.line = undefined;
  draft.station = undefined;
  lineOptions.value = [];
  stationOptions.value = [];
  lineQuery.value = "";
  stationQuery.value = "";
  clearStationTransfers();
  stationSelectionMode.value = "list";

  if (selectedNetwork.value) {
    void loadLines();
  }
}

function selectLineOption(line?: LineSearchOption): void {
  draft.line = line;
  draft.station = undefined;
  stationOptions.value = [];
  stationQuery.value = "";
  clearStationTransfers();
  stationSelectionMode.value = "list";

  if (!line) {
    return;
  }

  suppressLineQueryWatcher = true;
  lineQuery.value = line.displayName ?? line.label;
  void loadStations();
}

function selectStationOption(station?: StationSearchOption): void {
  draft.station = station;

  if (station) {
    stationQuery.value = station.label;
    void loadStationTransferBadges(station);
  }
}

function selectStationFromMap(station: StationSearchOption): void {
  draft.station = station;

  if (!stationOptions.value.some((option) => option.id === station.id)) {
    stationOptions.value = [...stationOptions.value, station].sort(
      (left, right) => left.label.localeCompare(right.label, "fr"),
    );
  }

  stationQuery.value = station.label;
  void loadStationTransferBadges(station);
}

function toggleStationSelectionMode(): void {
  stationSelectionMode.value =
    stationSelectionMode.value === "list" ? "map" : "list";
}

async function loadLines(): Promise<void> {
  const network = selectedNetwork.value;

  if (!network) {
    return;
  }

  const requestId = ++latestLineRequest;
  loadingLines.value = true;
  errorMessage.value = "";

  try {
    const lines = await searchTransitLines(network, lineQuery.value);

    if (requestId === latestLineRequest) {
      lineOptions.value = lines;
    }
  } catch (error) {
    if (requestId === latestLineRequest) {
      lineOptions.value = [];
      errorMessage.value = formatLoadError(error, "lignes");
    }
  } finally {
    if (requestId === latestLineRequest) {
      loadingLines.value = false;
    }
  }
}

async function loadStations(): Promise<void> {
  if (!draft.line) {
    return;
  }

  const requestId = ++latestStationRequest;
  loadingStations.value = true;
  errorMessage.value = "";

  try {
    const stations = await searchLineStations(draft.line, stationQuery.value);

    if (requestId === latestStationRequest) {
      stationOptions.value = stations;
      clearStationTransfers();
    }
  } catch (error) {
    if (requestId === latestStationRequest) {
      stationOptions.value = [];
      errorMessage.value = formatLoadError(error, "stations");
    }
  } finally {
    if (requestId === latestStationRequest) {
      loadingStations.value = false;
    }
  }
}

async function loadStationTransferBadges(
  station: StationSearchOption,
): Promise<void> {
  if (!draft.line || stationTransfers[station.id]) {
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
      draft.line.id,
    );
  } catch {
    stationTransfers[station.id] = [];
  } finally {
    stationTransferLoadingIds.value = stationTransferLoadingIds.value.filter(
      (id) => id !== station.id,
    );
  }
}

async function addStation(): Promise<void> {
  if (!draft.family || !draft.line || !draft.station || adding.value) {
    return;
  }

  adding.value = true;
  errorMessage.value = "";

  try {
    const directionGroups = await fetchDirectionGroupsForStation(
      draft.line,
      draft.station,
    );
    const board = createBoardFromDraft(
      {
        family: draft.family,
        line: draft.line,
        station: draft.station,
      },
      directionGroups,
    );

    emit("add", board);
    resetDraft();
    emit("close");
  } catch {
    errorMessage.value = "Impossible d'ajouter cette station.";
  } finally {
    adding.value = false;
  }
}

function resetDraft(): void {
  selectedNetwork.value = undefined;
  draft.family = undefined;
  draft.line = undefined;
  draft.station = undefined;
  lineOptions.value = [];
  stationOptions.value = [];
  lineQuery.value = "";
  stationQuery.value = "";
  clearStationTransfers();
  stationSelectionMode.value = "list";
}

function clearStationTransfers(): void {
  Object.keys(stationTransfers).forEach((key) => {
    delete stationTransfers[key];
  });
  stationTransferLoadingIds.value = [];
}

function scheduleLineLoad(): void {
  if (lineSearchTimer) {
    window.clearTimeout(lineSearchTimer);
  }

  lineSearchTimer = window.setTimeout(() => {
    void loadLines();
  }, 260);
}

function retryCurrentStep(): void {
  if (draft.line) {
    void loadStations();
    return;
  }

  if (selectedNetwork.value) {
    void loadLines();
    return;
  }

  void loadFamilies();
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

function formatLoadError(error: unknown, resource: string): string {
  const isRateLimit =
    error instanceof Error && error.message.toLowerCase().includes("429");

  if (isRateLimit) {
    return `L'API IDFM limite les appels pour le moment. Réessaie le chargement des ${resource}.`;
  }

  return `Impossible de charger les ${resource} depuis l'API IDFM.`;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-scale">
      <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
        <section
          class="modal-panel"
          :class="{ 'modal-panel--wide': modalWide }"
          aria-modal="true"
          role="dialog"
        >
          <header class="modal-panel__header">
            <div>
              <p class="eyebrow">Configuration</p>
              <h2>Nouvelle station</h2>
            </div>
            <button
              class="icon-button"
              type="button"
              aria-label="Fermer"
              @click="emit('close')"
            >
              ×
            </button>
          </header>

          <div class="station-form">
            <label>
              <span>Réseau</span>
              <FamilyCombobox
                :model-value="selectedNetwork"
                :options="familyOptions"
                :loading="loadingFamilies"
                @update:model-value="selectFamilyOption"
              />
              <span v-if="loadingFamilies" class="field-loader">
                <span aria-hidden="true" class="loader-dot"></span>
                Chargement des réseaux
              </span>
            </label>

            <label>
              <span>Ligne</span>
              <LineCombobox
                :model-value="draft.line"
                :options="lineOptions"
                :query="lineQuery"
                :disabled="!selectedNetwork"
                :loading="loadingLines"
                placeholder="Sélectionner une ligne"
                @update:model-value="selectLineOption"
                @update:query="lineQuery = $event"
              />
              <span v-if="loadingLines" class="field-loader">
                <span aria-hidden="true" class="loader-dot"></span>
                Chargement des lignes
              </span>
            </label>

            <div class="station-picker">
              <div class="station-picker__header">
                <span>Station</span>
                <button
                  v-if="draft.line"
                  class="button-secondary station-picker__mode"
                  type="button"
                  @click="toggleStationSelectionMode"
                >
                  {{
                    stationSelectionMode === "list"
                      ? "Plan détaillé"
                      : "Liste simple"
                  }}
                </button>
              </div>

              <div
                v-if="stationSelectionMode === 'list'"
                class="station-picker__list"
              >
                <StationCombobox
                  :model-value="draft.station"
                  :options="filteredStationOptions"
                  :query="stationQuery"
                  :disabled="!draft.line"
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
              </div>

              <DetailedLineMapPicker
                v-else
                :line="draft.line"
                :selected-station-id="draft.station?.id"
                @select="selectStationFromMap"
              />
            </div>

            <div v-if="errorMessage" class="form-error">
              <span>{{ errorMessage }}</span>
              <button
                class="button-secondary form-retry"
                type="button"
                @click="retryCurrentStep"
              >
                Réessayer
              </button>
            </div>
          </div>

          <footer class="modal-panel__footer">
            <button
              class="button-secondary"
              type="button"
              @click="emit('close')"
            >
              Fermer
            </button>
            <button
              type="button"
              :disabled="!canAdd || adding"
              @click="addStation"
            >
              <span class="button-plus" aria-hidden="true">+</span>
              {{ adding ? "Ajout..." : "Ajouter" }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>


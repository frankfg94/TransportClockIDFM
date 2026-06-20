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
type StationBoardModalMode = "dropdown" | "multistep";
type StepTransitionDirection = "forward" | "backward";

const props = withDefaults(
  defineProps<{
    open: boolean;
    mode?: StationBoardModalMode;
  }>(),
  {
    mode: "dropdown",
  },
);

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
const currentStep = ref(1);
const stepTransitionName = ref("station-step-forward");
const canAdd = computed(() =>
  Boolean(draft.family && draft.line && draft.station),
);
const isMultiStep = computed(() => props.mode === "multistep");
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
let swipeStartPoint: { x: number; y: number } | undefined;

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetDraft();
      void loadFamilies();
      return;
    }

    resetDraft();
  },
  { immediate: true },
);

watch(
  () => props.mode,
  () => {
    if (props.open) {
      resetDraft();
    }
  },
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
    if (isMultiStep.value) {
      setCurrentStep(2, "forward");
    }
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

  if (isMultiStep.value) {
    setCurrentStep(3, "forward");
  }
}

function selectStationOption(station?: StationSearchOption): void {
  draft.station = station;

  if (station) {
    if (!isMultiStep.value) {
      stationQuery.value = station.label;
    }
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
  latestFamilyRequest += 1;
  latestLineRequest += 1;
  latestStationRequest += 1;
  if (lineSearchTimer) {
    window.clearTimeout(lineSearchTimer);
    lineSearchTimer = undefined;
  }

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
  currentStep.value = 1;
  stepTransitionName.value = "station-step-forward";
  errorMessage.value = "";
}

function setCurrentStep(
  step: number,
  direction: StepTransitionDirection,
): void {
  if (step === currentStep.value) {
    return;
  }

  stepTransitionName.value = `station-step-${direction}`;
  currentStep.value = step;
}

function canAdvanceStep(): boolean {
  if (currentStep.value === 1) {
    return Boolean(selectedNetwork.value);
  }

  return currentStep.value === 2 ? Boolean(draft.line) : canAdd.value;
}

function goToPreviousStep(): void {
  setCurrentStep(Math.max(1, currentStep.value - 1), "backward");
}

function goToNextStep(): void {
  if (canAdvanceStep()) {
    setCurrentStep(Math.min(3, currentStep.value + 1), "forward");
  }
}

function handleSwipeStart(event: TouchEvent): void {
  if (!isMultiStep.value) {
    return;
  }

  const touch = event.touches[0];
  if (touch) {
    swipeStartPoint = { x: touch.clientX, y: touch.clientY };
  }
}

function handleSwipeEnd(event: TouchEvent): void {
  const start = swipeStartPoint;
  const touch = event.changedTouches[0];
  swipeStartPoint = undefined;

  if (!start || !touch || !isMultiStep.value) {
    return;
  }

  const horizontalDistance = touch.clientX - start.x;
  const verticalDistance = touch.clientY - start.y;

  if (
    Math.abs(horizontalDistance) < 64 ||
    Math.abs(horizontalDistance) <= Math.abs(verticalDistance)
  ) {
    return;
  }

  if (horizontalDistance < 0 && currentStep.value < 3) {
    goToNextStep();
    return;
  }

  if (horizontalDistance > 0) {
    goToPreviousStep();
  }
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
      <div
        v-if="open"
        class="modal-backdrop"
        :class="{
          'station-board-modal-backdrop--multistep': isMultiStep,
        }"
        @click.self="emit('close')"
      >
        <section
          class="modal-panel"
          :class="{
            'modal-panel--wide': modalWide,
            'station-board-modal--dropdown': !isMultiStep,
            'station-board-modal--multistep': isMultiStep,
          }"
          aria-modal="true"
          role="dialog"
          @touchstart.passive="handleSwipeStart"
          @touchend="handleSwipeEnd"
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

          <div
            class="station-form"
            :class="{ 'station-multistep__form': isMultiStep }"
          >
            <template v-if="!isMultiStep">
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
                  :compact="true"
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
                  :compact="true"
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
            </template>

            <Transition v-else :name="stepTransitionName" mode="out-in">
              <label v-if="currentStep === 1" key="network">
              <span>Réseau</span>
              <FamilyCombobox
                :model-value="selectedNetwork"
                :options="familyOptions"
                :loading="loadingFamilies"
                :inline="true"
                @update:model-value="selectFamilyOption"
              />
              <span v-if="loadingFamilies" class="field-loader">
                <span aria-hidden="true" class="loader-dot"></span>
                Chargement des réseaux
              </span>
            </label>

              <label v-else-if="currentStep === 2" key="line">
              <span>Ligne</span>
              <LineCombobox
                :model-value="draft.line"
                :options="lineOptions"
                :query="lineQuery"
                :disabled="!selectedNetwork"
                :loading="loadingLines"
                :inline="true"
                placeholder="Sélectionner une ligne"
                @update:model-value="selectLineOption"
                @update:query="lineQuery = $event"
              />
              <span v-if="loadingLines" class="field-loader">
                <span aria-hidden="true" class="loader-dot"></span>
                Chargement des lignes
              </span>
            </label>

              <div v-else key="station" class="station-picker">
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
                  :inline="true"
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
            </Transition>

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

          <footer
            v-if="!isMultiStep"
            class="modal-panel__footer"
          >
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

          <footer v-else class="modal-panel__footer station-multistep__footer">
            <button
              class="button-secondary"
              type="button"
              :disabled="currentStep === 1"
              @click="goToPreviousStep"
            >
              Précédent
            </button>

            <div
              class="station-multistep__steps"
              aria-label="Progression : 3 étapes"
            >
              <span
                v-for="step in 3"
                :key="step"
                class="station-multistep__step"
                :class="{ 'station-multistep__step--active': step === currentStep }"
                :aria-current="step === currentStep ? 'step' : undefined"
              ></span>
            </div>

            <button
              v-if="currentStep < 3"
              type="button"
              :disabled="!canAdvanceStep()"
              @click="goToNextStep"
            >
              Suivant
            </button>
            <button
              v-else
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


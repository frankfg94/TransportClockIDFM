<script setup lang="ts">
import { ExternalLink, MapIcon, MapPinned, Plus, Star } from "lucide-vue-next";
import { computed } from "vue";
import LineIconBadge from "../../components/LineIconBadge.vue";
import StationBoardSelector from "../../components/StationBoardSelector.vue";
import StationTransferDetails from "../../components/StationTransferDetails.vue";
import { useI18n } from "../../i18n";
import type { NetworkGhostLineView } from "../network-ghost";
import type { TransitPlacePreset } from "../../storage/transitPreferences";
import type { LineFrequencyProfile, TransferLineOption } from "../../types/transit";
import type { LineMapEntranceView, LineMapStopView } from "./types";

const props = withDefaults(
  defineProps<{
    stop: LineMapStopView;
    transfers: TransferLineOption[];
    transfersLoading: boolean;
    transfersError?: string;
    lineColor?: string;
    entrances?: LineMapEntranceView[];
    focusedEntranceId?: string;
    showActions?: boolean;
    favoriteLoading?: boolean;
    favoriteError?: string;
    favoriteDashboardSelectorOpen?: boolean;
    favoriteDashboardId?: string;
    favoriteDashboardOptions?: TransitPlacePreset[];
    activeGhostLine?: NetworkGhostLineView;
    ghostDirections?: string[];
    ghostDirectionsLoading?: boolean;
    ghostDirectionsError?: boolean;
    ghostFrequency?: LineFrequencyProfile;
    ghostFrequencyLoading?: boolean;
    ghostFrequencyError?: boolean;
  }>(),
  {
    entrances: () => [],
    favoriteDashboardOptions: () => [],
    favoriteDashboardSelectorOpen: false,
  },
);

const emit = defineEmits<{
  addFavorite: [];
  cancelFavoriteDashboard: [];
  confirmFavoriteDashboard: [];
  focusEntrances: [];
  focusEntrance: [entrance: LineMapEntranceView];
  addGhostLineStation: [];
  openGoogleMaps: [];
  viewGhostLineMap: [];
  selectTransfer: [transfer: TransferLineOption];
  "update:favoriteDashboardId": [placeId: string];
}>();

const { t } = useI18n();

const sortedEntrances = computed(() =>
  [...props.entrances].sort((first, second) => {
    const firstNumber = getEntranceNumber(first.code);
    const secondNumber = getEntranceNumber(second.code);

    if (firstNumber !== secondNumber) {
      return firstNumber - secondNumber;
    }

    return (first.code ?? first.name).localeCompare(second.code ?? second.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }),
);

function getEntranceNumber(code?: string): number {
  const match = code?.match(/\d+/u);
  return match ? Number.parseInt(match[0], 10) : Number.POSITIVE_INFINITY;
}

function isNoctilienLine(line: NetworkGhostLineView): boolean {
  return (
    line.family === "NOCTILIEN" ||
    line.mode.toLowerCase().includes("noctilien") ||
    /^n[\s_-]*\d{1,3}[a-z]?$/iu.test(line.label.trim())
  );
}

function hasDayFrequency(profile?: LineFrequencyProfile): boolean {
  return Boolean(profile?.peakMinutes || profile?.offPeakMinutes);
}

function formatFrequency(minutes?: number): string {
  return minutes ? `~ ${minutes} min` : t("common.states.unavailable");
}
</script>

<template>
  <div
    class="line-map-sidebar"
    :aria-label="t('lineMap.sidebar.detailsAria')"
    data-testid="line-map-sidebar"
  >
    <div class="line-map-sidebar__content">
      <section
        v-if="activeGhostLine"
        class="line-map-sidebar__ghost-detail"
        data-testid="line-map-sidebar-ghost-detail"
      >
        <header>
          <LineIconBadge :line="activeGhostLine" compact />
          <div>
            <small>{{ t("lineMap.sidebar.hoveredLine") }}</small>
            <strong>{{ activeGhostLine.label }}</strong>
            <span>{{ activeGhostLine.mode }}</span>
          </div>
          <button
            class="button-secondary line-map-sidebar__ghost-add"
            type="button"
            :aria-label="t('lineMap.sidebar.addLineStation')"
            data-testid="line-map-sidebar-ghost-add"
            @click="emit('addGhostLineStation')"
          >
            <Plus aria-hidden="true" />
            {{ t("common.actions.add") }}
          </button>
        </header>

        <div class="line-map-sidebar__ghost-directions">
          <small>{{ t("lineMap.sidebar.lineDirections") }}</small>
          <span v-if="ghostDirectionsLoading" class="line-map-sidebar__ghost-muted">
            {{ t("common.states.loading") }}
          </span>
          <div v-else-if="ghostDirections?.length">
            <span v-for="direction in ghostDirections" :key="`${activeGhostLine.id}-${direction}`">
              {{ direction }}
            </span>
          </div>
          <span v-else class="line-map-sidebar__ghost-muted">
            {{
              ghostDirectionsError
                ? t("lineMap.sidebar.directionsUnavailable")
                : t("lineMap.sidebar.noDirections")
            }}
          </span>
        </div>

        <div class="line-map-sidebar__ghost-frequency">
          <small>{{ t("lineMap.sidebar.theoreticalFrequency") }}</small>
          <span v-if="ghostFrequencyLoading" class="line-map-sidebar__ghost-muted">
            {{ t("lineMap.sidebar.calculating") }}
          </span>
          <div
            v-else-if="
              ghostFrequency && (hasDayFrequency(ghostFrequency) || ghostFrequency.nightMinutes)
            "
            class="line-map-sidebar__ghost-frequency-grid"
          >
            <template v-if="isNoctilienLine(activeGhostLine)">
              <div class="line-map-sidebar__ghost-frequency-card">
                <span>{{ t("lineMap.sidebar.night") }}</span>
                <strong>
                  {{ formatFrequency(ghostFrequency.nightMinutes) }}
                </strong>
                <small>{{ t("lineMap.sidebar.nightRange") }}</small>
              </div>
            </template>
            <template v-else>
              <div class="line-map-sidebar__ghost-frequency-card">
                <span>{{ t("lineMap.sidebar.peakHours") }}</span>
                <strong>
                  {{ formatFrequency(ghostFrequency.peakMinutes) }}
                </strong>
                <small>{{ t("lineMap.sidebar.peakRange") }}</small>
              </div>
              <div class="line-map-sidebar__ghost-frequency-card">
                <span>{{ t("lineMap.sidebar.offPeakHours") }}</span>
                <strong>
                  {{ formatFrequency(ghostFrequency.offPeakMinutes) }}
                </strong>
                <small>{{ t("lineMap.sidebar.offPeakRange") }}</small>
              </div>
            </template>
          </div>
          <span v-else class="line-map-sidebar__ghost-muted">
            {{
              ghostFrequencyError
                ? t("lineMap.sidebar.frequencyUnavailable")
                : t("lineMap.sidebar.insufficientSchedules")
            }}
          </span>
        </div>
      </section>

      <section
        v-if="entrances.length"
        class="line-map-sidebar__entrances"
        data-testid="line-map-sidebar-entrances"
      >
        <button
          class="line-map-sidebar__entrances-title"
          type="button"
          :aria-label="t('lineMap.sidebar.focusEntrancesAria', { station: stop.label })"
          data-testid="line-map-sidebar-focus-entrances"
          @click="emit('focusEntrances')"
        >
          <small>{{ t("lineMap.sidebar.stationExits") }}</small>
          <MapPinned aria-hidden="true" />
        </button>
        <ul>
          <li v-for="entrance in sortedEntrances" :key="entrance.id">
            <button
              class="line-map-sidebar__entrance"
              :class="{
                'line-map-sidebar__entrance--focused': entrance.id === focusedEntranceId,
              }"
              type="button"
              :aria-label="t('lineMap.sidebar.focusEntranceAria', { exit: entrance.name })"
              :aria-pressed="entrance.id === focusedEntranceId"
              :data-entrance-id="entrance.id"
              data-testid="line-map-sidebar-focus-entrance"
              @click="emit('focusEntrance', entrance)"
            >
              <strong v-if="entrance.code">
                {{ t("lineMap.sidebar.exitWithCode", { code: entrance.code }) }}
              </strong>
              <span>{{ entrance.name }}</span>
            </button>
          </li>
        </ul>
      </section>

      <StationTransferDetails
        :station-label="stop.label"
        :city="stop.city"
        :transfers="transfers"
        :loading="transfersLoading"
        :error="transfersError"
        :line-color="lineColor"
        :active-transfer-id="activeGhostLine?.id"
        @select-transfer="emit('selectTransfer', $event)"
      />
    </div>

    <footer v-if="showActions" class="line-map-sidebar__actions">
      <section
        v-if="favoriteDashboardSelectorOpen"
        class="line-map-sidebar__favorite-selector"
        data-testid="line-map-sidebar-favorite-selector"
        :aria-label="t('lineMap.sidebar.dashboardChoiceAria')"
      >
        <StationBoardSelector
          :model-value="favoriteDashboardId"
          :places="favoriteDashboardOptions"
          :disabled="favoriteLoading"
          @update:model-value="emit('update:favoriteDashboardId', $event)"
        />
        <p v-if="favoriteError" class="line-map-sidebar__error" role="alert">
          {{ favoriteError }}
        </p>
        <div class="line-map-sidebar__favorite-selector-actions">
          <button
            class="button-secondary"
            type="button"
            :disabled="favoriteLoading"
            @click="emit('cancelFavoriteDashboard')"
          >
            {{ t("common.actions.cancel") }}
          </button>
          <button
            class="line-map-sidebar__favorite"
            type="button"
            :disabled="favoriteLoading || !favoriteDashboardId"
            @click="emit('confirmFavoriteDashboard')"
          >
            <Star aria-hidden="true" />
            {{ favoriteLoading ? t("lineMap.sidebar.adding") : t("common.actions.add") }}
          </button>
        </div>
      </section>
      <template v-else>
        <p v-if="favoriteError" class="line-map-sidebar__error" role="alert">
          {{ favoriteError }}
        </p>
        <button
          class="line-map-sidebar__favorite"
          type="button"
          :disabled="favoriteLoading"
          @click="emit('addFavorite')"
        >
          <Star aria-hidden="true" />
          {{ favoriteLoading ? t("lineMap.sidebar.adding") : t("lineMap.sidebar.addToFavorites") }}
        </button>
      </template>
      <button
        v-if="activeGhostLine"
        class="button-secondary line-map-sidebar__line-map"
        type="button"
        data-testid="line-map-sidebar-view-line-map"
        @click="emit('viewGhostLineMap')"
      >
        <MapPinned aria-hidden="true" />
        {{ t("lineMap.sidebar.viewLineMap") }}
      </button>
      <button
        class="button-secondary line-map-sidebar__maps"
        type="button"
        @click="emit('openGoogleMaps')"
      >
        <MapIcon aria-hidden="true" />
        {{ t("lineMap.sidebar.openInGoogleMaps") }}
        <ExternalLink aria-hidden="true" />
      </button>
    </footer>
  </div>
</template>

<style scoped>
.line-map-sidebar {
  color: var(--ink);
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
  width: 100%;
}

.line-map-sidebar__actions svg {
  height: 18px;
  width: 18px;
}

.line-map-sidebar__content {
  display: grid;
  gap: 16px;
  min-height: 0;
  overflow: auto;
  padding: 20px;
}

.line-map-sidebar__entrances {
  background: linear-gradient(145deg, #ffffff 0%, var(--surface-soft) 100%);
  border: 1px solid var(--border);
  border-radius: 16px;
  display: grid;
  gap: 13px;
  padding: 14px;
  box-shadow: 0 10px 28px rgba(16, 35, 63, 0.08);
}

.line-map-sidebar__entrances-title {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 10px;
  color: var(--ink);
  display: flex;
  justify-content: space-between;
  min-height: 32px;
  padding: 0 2px;
  width: 100%;
}

.line-map-sidebar__entrances-title:hover,
.line-map-sidebar__entrances-title:focus-visible {
  background: transparent;
  color: var(--ink);
  transform: none;
}

.line-map-sidebar__entrances-title small {
  color: var(--muted);
  font-size: 0.65rem;
  font-weight: 950;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.line-map-sidebar__entrances-title svg {
  background: rgba(0, 100, 255, 0.08);
  border: 1px solid rgba(0, 100, 255, 0.14);
  border-radius: 9px;
  color: var(--idfm-blue);
  height: 32px;
  padding: 7px;
  width: 32px;
}

.line-map-sidebar__entrances ul {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.line-map-sidebar__entrance {
  align-items: center;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid transparent;
  border-radius: 11px;
  color: var(--ink);
  display: flex;
  gap: 9px;
  min-height: 43px;
  padding: 8px 10px;
  position: relative;
  text-align: left;
  transition:
    background var(--motion-fast),
    border-color var(--motion-fast),
    box-shadow var(--motion-fast),
    transform var(--motion-fast);
  width: 100%;
}

.line-map-sidebar__entrance:hover,
.line-map-sidebar__entrance:focus-visible {
  background: #ffffff;
  border-color: rgba(0, 100, 255, 0.24);
  color: var(--ink);
  transform: translateY(-1px);
}

.line-map-sidebar__entrance--focused {
  background: #eff5ff;
  border-color: rgba(0, 100, 255, 0.42);
  box-shadow: 0 7px 18px rgba(0, 100, 255, 0.14);
  z-index: 1;
}

.line-map-sidebar__entrance strong {
  align-items: center;
  background: rgba(0, 100, 255, 0.1);
  border: 1px solid rgba(0, 100, 255, 0.12);
  border-radius: 7px;
  color: var(--idfm-blue);
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 0.69rem;
  font-weight: 950;
  justify-content: center;
  min-height: 25px;
  padding: 3px 7px;
  white-space: nowrap;
}

.line-map-sidebar__entrance span {
  color: inherit;
  font-size: 0.77rem;
  font-weight: 800;
  line-height: 1.25;
}

@media (prefers-reduced-motion: reduce) {
  .line-map-sidebar__entrance {
    animation: none;
    transition: none;
  }
}

.line-map-sidebar__ghost-detail {
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  display: grid;
  gap: 12px;
  padding: 12px;
  align-items: start;
  align-content: baseline;
}

.line-map-sidebar__ghost-detail header {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: auto 1fr auto;
}

.line-map-sidebar__ghost-detail header div {
  display: grid;
  gap: 2px;
}

.line-map-sidebar__ghost-directions {
  height: 120px;
  overflow: auto;
}

.line-map-sidebar__ghost-detail header small,
.line-map-sidebar__ghost-directions > small,
.line-map-sidebar__ghost-frequency > small {
  color: var(--muted);
  font-size: 0.65rem;
  font-weight: 950;
  text-transform: uppercase;
}

.line-map-sidebar__ghost-detail header strong {
  color: var(--ink);
  font-size: 0.92rem;
}

.line-map-sidebar__ghost-detail header span {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 800;
}

.line-map-sidebar__ghost-add {
  align-items: center;
  align-self: start;
  display: inline-flex;
  font-size: 0.72rem;
  gap: 5px;
  min-height: 32px;
  padding: 6px 9px;
  white-space: nowrap;
}

.line-map-sidebar__ghost-add svg {
  height: 15px;
  width: 15px;
}

.line-map-sidebar__ghost-directions {
  display: grid;
  gap: 7px;
}

.line-map-sidebar__ghost-frequency {
  display: grid;
  gap: 7px;
}

.line-map-sidebar__ghost-frequency-grid {
  display: grid;
  gap: 7px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.line-map-sidebar__ghost-frequency-card {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 9px;
  display: grid;
  gap: 3px;
  padding: 8px;
}

.line-map-sidebar__ghost-frequency-card > span {
  color: var(--muted);
  font-size: 0.63rem;
  font-weight: 850;
}

.line-map-sidebar__ghost-frequency-card > strong {
  color: var(--ink);
  font-size: 0.84rem;
}

.line-map-sidebar__ghost-frequency-card > small {
  color: var(--muted);
  font-size: 0.58rem;
  font-weight: 700;
  line-height: 1.25;
}

.line-map-sidebar__ghost-directions > div {
  display: grid;
  gap: 5px;
}

.line-map-sidebar__ghost-directions > div span {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 7px;
  color: var(--ink);
  font-size: 0.72rem;
  font-weight: 850;
  padding: 6px 8px;
}

.line-map-sidebar__ghost-muted {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 750;
}

.line-map-sidebar__actions {
  background: #ffffff;
  border-top: 1px solid var(--border);
  display: grid;
  gap: 10px;
  padding: 16px 20px 20px;
}

.line-map-sidebar__actions button {
  width: 100%;
}

.line-map-sidebar__favorite {
  box-shadow: 0 10px 24px rgba(0, 100, 255, 0.18);
}

.line-map-sidebar__favorite-selector {
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 14px;
  display: grid;
  gap: 12px;
  padding: 12px;
}

.line-map-sidebar__favorite-selector-actions {
  display: grid;
  gap: 8px;
  grid-template-columns: 0.82fr 1.18fr;
}

.line-map-sidebar__favorite-selector-actions button {
  min-height: 40px;
}

.line-map-sidebar__maps svg:last-child {
  height: 15px;
  margin-left: auto;
  width: 15px;
}

.line-map-sidebar__error {
  color: #b91c1c;
  font-size: 0.78rem;
  font-weight: 800;
  margin: 0;
}

@media (max-width: 720px) {
  .line-map-sidebar__content {
    overscroll-behavior: contain;
    padding: 14px 18px 18px;
  }

  .line-map-sidebar__actions {
    bottom: 0;
    padding: 14px 18px calc(16px + env(safe-area-inset-bottom));
    position: sticky;
  }
}
</style>

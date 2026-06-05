<template>
  <main class="line-pattern-page">
    <nav
      v-if="activeView === 'map'"
      class="line-pattern-page__view-tabs line-pattern-page__view-tabs--map"
      aria-label="Changer de vue du plan"
    >
      <button
        type="button"
        :aria-pressed="activeView === 'schema'"
        @click="changeView('schema')"
      >
        Schéma
      </button>
      <button
        type="button"
        :aria-pressed="activeView === 'map'"
        @click="changeView('map')"
      >
        Carte
      </button>
    </nav>

    <DeparturePatternModal
      v-if="activeView === 'schema'"
      embedded
      open
      wheel-zoom
      :board="patternView?.board"
      :departure="patternView?.departure"
      :pattern="patternView?.pattern"
      :direction-options="directionOptions"
      :selected-direction-id="selectedDirectionId"
      :full-line="isFullLineSelected"
      :loading="isPatternRequestPending"
      :error="errorMessage"
      :show-mini-map="settings.showPatternMiniMap"
      :compact-mode="settings.compactLinePlanMode"
      :rich-transfer-tooltips="settings.richTransferTooltips"
      :reduce-motion="settings.reduceMotion"
      :transfer-bundle-retention-days="settings.transferBundleRetentionDays"
      :transfer-bundle-request-concurrency="settings.transferBundleRequestConcurrency"
      :transfer-bundle-request-spacing-ms="settings.transferBundleRequestSpacingMs"
      :transport-type="transferBundleTransportType"
      :transfer-resolver-mode="settings.transferResolverMode"
      @close="navigateHome"
      @direction-change="changeDirection"
    >
      <template #flow-actions-prefix>
        <nav
          class="line-pattern-page__view-tabs"
          aria-label="Changer de vue du plan"
        >
          <button
            type="button"
            :aria-pressed="activeView === 'schema'"
            @click.stop="changeView('schema')"
          >
            Schéma
          </button>
          <button
            type="button"
            :aria-pressed="activeView === 'map'"
            @click.stop="changeView('map')"
          >
            Carte
          </button>
        </nav>
      </template>
    </DeparturePatternModal>

    <section v-else class="line-pattern-page__map-view">
      <DetailedLineMapPicker
        v-if="lineMapLine"
        mode="explorer"
        :line="lineMapLine"
        :selectable="false"
      />

      <div v-else class="line-pattern-page__fallback" aria-live="polite">
        <p class="eyebrow">Carte de ligne</p>
        <h1>{{ pageTitle }}</h1>
        <p v-if="isPatternRequestPending">Chargement de la carte...</p>
        <p v-else-if="errorMessage">{{ errorMessage }}</p>
      </div>
    </section>

    <section
      v-if="activeView === 'schema' && (isPatternRequestPending || errorMessage)"
      class="line-pattern-page__fallback"
      aria-live="polite"
    >
      <p class="eyebrow">Schéma de ligne</p>
      <h1>{{ pageTitle }}</h1>
      <p v-if="isPatternRequestPending">Chargement du schéma...</p>
      <p v-else-if="errorMessage">{{ errorMessage }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useFetch, useRoute, navigateTo } from "#imports";
import {
  filterTerminalOnly,
  useAppSettings,
} from "../../../src/features/app-settings";
import { DeparturePatternModal } from "../../../src/features/service-pattern";
import { DetailedLineMapPicker } from "../../../src/features/line-map";
import { createLinePresentation, transitModeToFamily } from "../../../src/services/linePresentation";
import type {
  LinePatternViewResponse,
  LineSearchOption,
  TransitFamily,
} from "../../../src/types/transit";

const LINE_COMPLETE_DIRECTION_ID = "line-complete";
type LinePageView = "schema" | "map";

const route = useRoute();
const { settings } = useAppSettings();
const apiUrl = computed(() => {
  const params = new URLSearchParams();
  const direction = firstRouteQuery(route.query.direction);
  const startStation = firstRouteQuery(route.query.startStation);

  if (direction && direction !== LINE_COMPLETE_DIRECTION_ID) {
    params.set("direction", direction);
  }

  if (startStation) {
    params.set("startStation", startStation);
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";

  return `/api/lines/${encodeURIComponent(route.params.transportType as string)}/${encodeURIComponent(
    route.params.lineId as string,
  )}/pattern${suffix}`;
});
const { data: patternView, pending, error } =
  useFetch<LinePatternViewResponse>(apiUrl);
const patternRequestTimedOut = ref(false);
let patternRequestTimeout: ReturnType<typeof setTimeout> | undefined;
const selectedDirectionId = computed(
  () => firstRouteQuery(route.query.direction) ?? LINE_COMPLETE_DIRECTION_ID,
);
const isPatternRequestPending = computed(
  () =>
    pending.value &&
    !patternView.value &&
    !error.value &&
    !patternRequestTimedOut.value,
);
const isFullLineSelected = computed(
  () => selectedDirectionId.value === LINE_COMPLETE_DIRECTION_ID,
);
const activeView = computed<LinePageView>(() =>
  firstRouteQuery(route.query.view) === "map" ? "map" : "schema",
);
const directionOptions = computed(() => [
  {
    id: LINE_COMPLETE_DIRECTION_ID,
    label: "Ligne complète",
    isTerminal: true,
  },
  ...filterTerminalOnly(
    patternView.value?.directionOptions ?? [],
    settings.value.terminalDirectionsOnly,
  ),
]);

const errorMessage = computed(() => {
  if (error.value) {
    return "Impossible de charger ce schéma de ligne.";
  }

  if (patternRequestTimedOut.value && !patternView.value) {
    return "Le chargement de ce schéma prend trop longtemps. Recharge la page pour réessayer.";
  }

  return "";
});
const pageTitle = computed(() => {
  if (patternView.value) {
    return `${patternView.value.board.line.longName} · ${patternView.value.pattern.destination}`;
  }

  return `${route.params.transportType}/${route.params.lineId}`;
});
const transferBundleTransportType = computed(
  () =>
    patternView.value?.transportType ?? firstRouteQuery(route.params.transportType),
);
const lineMapLine = computed<LineSearchOption | undefined>(() => {
  const view = patternView.value;
  const boardLine = view?.board.line;

  if (!view || !boardLine) {
    return undefined;
  }

  const family =
    transitModeToFamily(boardLine.mode) ??
    transportTypeToFamily(view.transportType);
  const presentation = createLinePresentation({
    code: boardLine.shortName,
    color: boardLine.color,
    family,
    id: view.lineId,
    mode: boardLine.mode,
    ref: boardLine.ref,
    shortName: boardLine.shortName,
    textColor: boardLine.textColor,
  });

  return {
    family,
    id: view.lineId,
    label: boardLine.shortName,
    ref: boardLine.ref,
    navitiaId: view.lineId,
    color: presentation.color,
    textColor: presentation.textColor,
    displayName: boardLine.longName,
    iconUrl: presentation.iconUrl,
    iconUrls: presentation.iconUrls,
  };
});

function navigateHome(): void {
  void navigateTo("/");
}

function changeDirection(directionId: string): void {
  const query: Record<string, string> = {
    direction: directionId,
  };
  const startStation = firstRouteQuery(route.query.startStation);

  if (startStation) {
    query.startStation = startStation;
  }

  void navigateTo({
    path: route.path,
    query,
  });
}

function changeView(view: LinePageView): void {
  const query: Record<string, string> = {};
  const direction = firstRouteQuery(route.query.direction);
  const startStation = firstRouteQuery(route.query.startStation);

  if (direction) {
    query.direction = direction;
  }

  if (startStation) {
    query.startStation = startStation;
  }

  if (view === "map") {
    query.view = "map";
  }

  void navigateTo({
    path: route.path,
    query,
  });
}

function firstRouteQuery(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return typeof value === "string" ? value : undefined;
}

function transportTypeToFamily(value: string): TransitFamily {
  const normalized = value.toLowerCase();

  if (normalized.includes("metro")) return "METRO";
  if (normalized.includes("rer")) return "RER";
  if (normalized.includes("tram")) return "TRAM";
  if (normalized.includes("bus")) return "BUS";

  return "TRANSILIEN";
}

watch(
  apiUrl,
  () => {
    patternRequestTimedOut.value = false;

    if (typeof window === "undefined") {
      return;
    }

    if (patternRequestTimeout) {
      clearTimeout(patternRequestTimeout);
    }

    patternRequestTimeout = setTimeout(() => {
      if (pending.value && !patternView.value && !error.value) {
        patternRequestTimedOut.value = true;
      }
    }, 30_000);
  },
  { immediate: true },
);

watch(
  [patternView, error],
  () => {
    if ((patternView.value || error.value) && patternRequestTimeout) {
      clearTimeout(patternRequestTimeout);
      patternRequestTimeout = undefined;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (patternRequestTimeout) {
    clearTimeout(patternRequestTimeout);
  }
});
</script>

<style scoped>
.line-pattern-page {
  position: relative;
}

.line-pattern-page__view-tabs {
  align-items: center;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(16, 35, 63, 0.12);
  border-radius: 999px;
  box-shadow: 0 14px 34px rgba(16, 35, 63, 0.16);
  display: inline-flex;
  gap: 4px;
  padding: 5px;
  position: relative;
}

.line-pattern-page__view-tabs--map {
  position: fixed;
  right: 22px;
  top: 18px;
  z-index: 40;
}

.line-pattern-page__view-tabs button {
  background: transparent;
  border: 0;
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 950;
  min-height: 34px;
  padding: 0 16px;
}

.line-pattern-page__view-tabs button[aria-pressed="true"] {
  background: #0f172a;
  color: #ffffff;
}

.line-pattern-page__map-view {
  background: #eef3f8;
  height: 100vh;
  padding-top: 64px;
}

.line-pattern-page__map-view :deep(.line-map-panel) {
  height: calc(100vh - 64px);
}

@media (max-width: 720px) {
  .line-pattern-page__view-tabs--map {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
  }
}
</style>

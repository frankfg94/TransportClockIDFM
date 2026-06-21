<template>
  <main class="line-pattern-page">
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
      :show-city-zones="settings.showPatternCityZones"
      :compact-mode="settings.compactLinePlanMode"
      :rich-transfer-tooltips="settings.richTransferTooltips"
      :reduce-motion="settings.reduceMotion"
      :transfer-bundle-retention-days="settings.transferBundleRetentionDays"
      :transfer-bundle-request-concurrency="
        settings.transferBundleRequestConcurrency
      "
      :transfer-bundle-request-spacing-ms="
        settings.transferBundleRequestSpacingMs
      "
      :transfer-bundle-local-cache-enabled="
        settings.transferBundleLocalCacheEnabled
      "
      :transfer-bundle-backend-cache-enabled="
        settings.transferBundleBackendCacheEnabled
      "
      :transport-type="transferBundleTransportType"
      :transfer-resolver-mode="settings.transferResolverMode"
      @close="navigateHome"
      @direction-change="changeDirection"
    >
      <template #top-strip-direction-action>
        <button
          class="line-pattern-page__back line-pattern-page__back--desktop"
          type="button"
          aria-label="Retour à l'écran précédent"
          title="Retour"
          @click="goBack"
        >
          <ArrowLeft aria-hidden="true" />
          <span>Retour</span>
        </button>
      </template>

      <template #summary-action>
        <button
          class="line-pattern-page__back line-pattern-page__back--mobile"
          type="button"
          aria-label="Retour à l'écran précédent"
          title="Retour"
          @click="goBack"
        >
          <ArrowLeft aria-hidden="true" />
        </button>
      </template>

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
        ghost-network-enabled
        :ghost-network-scope="
          settings.ghostNetworkStructuralOnly ? 'structural' : 'all'
        "
        :reduce-motion="settings.reduceMotion"
      >
        <template #bar-before-chip>
          <button
            class="line-pattern-page__back line-pattern-page__back--map-mobile"
            type="button"
            aria-label="Retour à l'écran précédent"
            title="Retour"
            @click="goBack"
          >
            <ArrowLeft aria-hidden="true" />
          </button>
        </template>

        <template #bar-before-stats>
          <nav
            class="line-pattern-page__view-tabs line-pattern-page__view-tabs--map"
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
          <button
            class="line-pattern-page__back line-pattern-page__back--map-desktop"
            type="button"
            aria-label="Retour à l'écran précédent"
            title="Retour"
            @click="goBack"
          >
            <ArrowLeft aria-hidden="true" />
            <span>Retour</span>
          </button>
        </template>
      </DetailedLineMapPicker>

      <div v-else class="line-pattern-page__fallback" aria-live="polite">
        <p class="eyebrow">Carte de ligne</p>
        <h1>{{ pageTitle }}</h1>
        <p v-if="isPatternRequestPending">Chargement de la carte...</p>
        <p v-else-if="errorMessage">{{ errorMessage }}</p>
      </div>
    </section>

    <section
      v-if="
        activeView === 'schema' && (isPatternRequestPending || errorMessage)
      "
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
import { ArrowLeft } from "lucide-vue-next";
import { useFetch, useRoute, useRouter, navigateTo } from "#imports";
import {
  filterTerminalOnly,
  useAppSettings,
} from "../../../src/features/app-settings";
import { DeparturePatternModal } from "../../../src/features/service-pattern";
import { DetailedLineMapPicker } from "../../../src/features/line-map";
import {
  createLinePresentation,
  transitModeToFamily,
} from "../../../src/services/linePresentation";
import { toServerApiUrl } from "../../../src/services/serverApi";
import type {
  LinePatternViewResponse,
  LineSearchOption,
  TransitFamily,
} from "../../../src/types/transit";

const LINE_COMPLETE_DIRECTION_ID = "line-complete";
type LinePageView = "schema" | "map";

const route = useRoute();
const router = useRouter();
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

  return toServerApiUrl(
    `/api/lines/${encodeURIComponent(route.params.transportType as string)}/${encodeURIComponent(
      route.params.lineId as string,
    )}/pattern${suffix}`,
  );
});
const {
  data: patternView,
  pending,
  error,
} = useFetch<LinePatternViewResponse>(apiUrl);
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
    patternView.value?.transportType ??
    firstRouteQuery(route.params.transportType),
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

function goBack(): void {
  if (typeof window !== "undefined" && window.history.state?.back) {
    router.back();
    return;
  }

  navigateHome();
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

.line-pattern-page__back {
  align-items: center;
  background: rgba(15, 23, 42, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  box-shadow: 0 10px 26px rgba(16, 35, 63, 0.24);
  color: #ffffff;
  cursor: pointer;
  display: inline-flex;
  font-size: 0.82rem;
  font-weight: 900;
  gap: 7px;
  min-height: 44px;
  padding: 0 15px 0 12px;
  transition:
    background 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.line-pattern-page__back:hover,
.line-pattern-page__back:focus-visible {
  background: #0064ff;
  box-shadow: 0 14px 32px rgba(0, 100, 255, 0.3);
  transform: translateY(-1px);
}

.line-pattern-page__back svg {
  height: 18px;
  width: 18px;
}

.line-pattern-page__back--mobile,
.line-pattern-page__back--map-mobile {
  display: none;
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
  box-shadow: none;
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
}

.line-pattern-page__map-view :deep(.line-map-panel) {
  height: 100vh;
}

@media (max-width: 720px) {
  .line-pattern-page__back--desktop,
  .line-pattern-page__back--map-desktop {
    display: none;
  }

  .line-pattern-page__back--mobile,
  .line-pattern-page__back--map-mobile {
    display: inline-flex;
    justify-content: center;
    padding: 0;
    width: 44px;
  }

  .line-pattern-page__view-tabs--map {
    order: -1;
  }
}
</style>

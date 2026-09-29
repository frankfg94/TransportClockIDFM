<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { CheckCircle2, CircleAlert, CircleHelp, EllipsisVertical, ExternalLink, LoaderCircle, Pencil, X } from "lucide-vue-next";
import { useI18n, type TranslationKey } from "../../i18n";
import {
  NEIGHBORHOOD_SCORE_BAND_COLORS,
  type NeighborhoodScoreBand,
  type NeighborhoodScoreResult,
} from "./neighborhood";
import type {
  NeighborhoodCriterionState,
  NeighborhoodCriterionStatus,
  NeighborhoodDatasetStatus,
} from "./neighborhood/criterionRegistry";
import NearbyNeighborhoodScoreFact from "./NearbyNeighborhoodScoreFact.vue";

const props = defineProps<{
  result: NeighborhoodScoreResult;
  originLabel?: string;
  workplaceLabel?: string;
  loading?: boolean;
  progressLabel?: string;
  error?: string;
  retrying?: boolean;
  criteria?: readonly NeighborhoodCriterionState[];
  directoryUrl: string;
}>();

const emit = defineEmits<{
  "change-origin": [];
  "retry-source": [];
}>();

const { d, t } = useI18n();
const selectedFactId = ref<string>();
const criteriaById = computed(() => new Map((props.criteria ?? []).map((criterion) => [criterion.id, criterion])));
const diagnosticsOpen = ref(false);
const diagnosticsDialog = ref<HTMLElement>();
let previouslyFocused: HTMLElement | undefined;

const criterionStatusKeys: Record<NeighborhoodCriterionStatus, TranslationKey> = {
  idle: "nearbyStations.neighborhoodScore.criterionStatuses.idle",
  loading: "nearbyStations.neighborhoodScore.criterionStatuses.loading",
  ready: "nearbyStations.neighborhoodScore.criterionStatuses.ready",
  degraded: "nearbyStations.neighborhoodScore.criterionStatuses.degraded",
  unavailable: "nearbyStations.neighborhoodScore.criterionStatuses.unavailable",
  error: "nearbyStations.neighborhoodScore.criterionStatuses.error",
};
const datasetStatusKeys: Record<NeighborhoodDatasetStatus, TranslationKey> = {
  ready: "nearbyStations.neighborhoodScore.datasetStatuses.ready",
  loading: "nearbyStations.neighborhoodScore.datasetStatuses.loading",
  missing: "nearbyStations.neighborhoodScore.datasetStatuses.missing",
  stale: "nearbyStations.neighborhoodScore.datasetStatuses.stale",
  error: "nearbyStations.neighborhoodScore.datasetStatuses.error",
};
const datasetLabelKeys: Record<string, TranslationKey> = {
  "transport-bootstrap": "nearbyStations.neighborhoodScore.datasets.transport-bootstrap",
  "navitia-journeys": "nearbyStations.neighborhoodScore.datasets.navitia-journeys",
  "heavy-access": "nearbyStations.neighborhoodScore.datasets.heavy-access",
  "gtfs-frequency": "nearbyStations.neighborhoodScore.datasets.gtfs-frequency",
  "service-quality": "nearbyStations.neighborhoodScore.datasets.service-quality",
  "neighborhood-verdict": "nearbyStations.neighborhoodScore.datasets.neighborhood-verdict",
  "osm-places": "nearbyStations.neighborhoodScore.datasets.osm-places",
  "neighborhood-green-spaces": "nearbyStations.neighborhoodScore.datasets.neighborhood-green-spaces",
  "walking-routes": "nearbyStations.neighborhoodScore.datasets.walking-routes",
};
const diagnosticsSummary = computed(() => {
  const datasets = (props.criteria ?? []).flatMap((criterion) => criterion.datasets);
  const ready = datasets.filter((dataset) => dataset.status === "ready").length;
  const loading = datasets.filter((dataset) => dataset.status === "loading").length;
  return t("nearbyStations.neighborhoodScore.diagnosticsSummary", {
    ready,
    loading,
    issues: datasets.length - ready - loading,
  });
});

const bandKeys: Record<NeighborhoodScoreBand, TranslationKey> = {
  excellent: "nearbyStations.neighborhoodScore.bands.excellent",
  good: "nearbyStations.neighborhoodScore.bands.good",
  medium: "nearbyStations.neighborhoodScore.bands.medium",
  weak: "nearbyStations.neighborhoodScore.bands.weak",
  "very-weak": "nearbyStations.neighborhoodScore.bands.veryWeak",
};

function toggleFact(factId: string): void {
  selectedFactId.value = selectedFactId.value === factId ? undefined : factId;
}

function bandColor(band: NeighborhoodScoreBand | undefined): string | undefined {
  return band ? NEIGHBORHOOD_SCORE_BAND_COLORS[band] : undefined;
}

function factLabel(fact: NeighborhoodScoreResult["positiveFacts"][number]): string {
  return fact.label ?? (fact.labelKey ? t(fact.labelKey, fact.labelValues) : "");
}

function datasetLabel(datasetId: string): string {
  const key = datasetLabelKeys[datasetId];
  return key ? t(key) : datasetId;
}

function criterionStatusLabel(status: NeighborhoodCriterionStatus): string {
  return t(criterionStatusKeys[status]);
}

function datasetStatusLabel(status: NeighborhoodDatasetStatus): string {
  return t(datasetStatusKeys[status]);
}

function openDiagnostics(): void {
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  diagnosticsOpen.value = true;
  requestAnimationFrame(() => diagnosticsDialog.value?.focus());
}

function closeDiagnostics(): void {
  diagnosticsOpen.value = false;
  previouslyFocused?.focus();
  previouslyFocused = undefined;
}

function handleDiagnosticsKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || !diagnosticsOpen.value) return;
  event.preventDefault();
  closeDiagnostics();
}

onMounted(() => document.addEventListener("keydown", handleDiagnosticsKeydown));
onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleDiagnosticsKeydown);
  previouslyFocused?.focus();
});
</script>

<template>
  <article class="nearby-neighborhood-score-card">
    <header class="nearby-neighborhood-score-card__header">
      <div>
        <p class="nearby-neighborhood-score-card__eyebrow">
          {{ t("nearbyStations.neighborhoodScore.cardEyebrow") }}
        </p>
        <h2>{{ t("nearbyStations.neighborhoodScore.cardTitle") }}</h2>
        <button
          v-if="originLabel"
          class="nearby-neighborhood-score-card__origin"
          type="button"
          :aria-label="t('nearbyStations.neighborhoodScore.changeOriginAria')"
          :title="t('nearbyStations.neighborhoodScore.changeOrigin')"
          @click="emit('change-origin')"
        >
          <span>{{ originLabel }}</span>
          <Pencil :size="14" aria-hidden="true" />
        </button>
      </div>
      <div class="nearby-neighborhood-score-card__header-actions">
        <div
          class="nearby-neighborhood-score-card__score"
          :class="result.band ? `nearby-neighborhood-score-card__score--${result.band}` : undefined"
          :style="{ '--score-color': bandColor(result.band) }"
          data-testid="neighborhood-score"
        >
          <strong>{{ result.displayScore ?? "—" }}</strong>
          <span>/10</span>
        </div>
        <button
          class="nearby-neighborhood-score-card__diagnostics-trigger"
          type="button"
          :aria-label="t('nearbyStations.neighborhoodScore.diagnosticsButton')"
          :title="t('nearbyStations.neighborhoodScore.diagnosticsButton')"
          aria-haspopup="dialog"
          :aria-expanded="diagnosticsOpen"
          @click="openDiagnostics"
        >
          <EllipsisVertical :size="19" aria-hidden="true" />
        </button>
      </div>
    </header>

    <Teleport to="body">
      <div
        v-if="diagnosticsOpen"
        class="nearby-neighborhood-score-card__diagnostics-overlay"
        role="presentation"
        @click.self="closeDiagnostics"
      >
        <section
          ref="diagnosticsDialog"
          class="nearby-neighborhood-score-card__diagnostics-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nearby-score-diagnostics-title"
          tabindex="-1"
        >
          <header class="nearby-neighborhood-score-card__diagnostics-header">
            <div>
              <h2 id="nearby-score-diagnostics-title">{{ t("nearbyStations.neighborhoodScore.diagnosticsTitle") }}</h2>
              <p>{{ t("nearbyStations.neighborhoodScore.diagnosticsDescription") }}</p>
              <p class="nearby-neighborhood-score-card__diagnostics-summary">{{ diagnosticsSummary }}</p>
            </div>
            <button
              class="nearby-neighborhood-score-card__diagnostics-close"
              type="button"
              :aria-label="t('common.actions.close')"
              @click="closeDiagnostics"
            >
              <X :size="19" aria-hidden="true" />
            </button>
          </header>
          <div class="nearby-neighborhood-score-card__diagnostics-list">
            <article
              v-for="category in result.categories"
              :key="`diagnostic:${category.id}`"
              class="nearby-neighborhood-score-card__diagnostics-category"
            >
              <header>
                <h3>{{ t(category.labelKey) }}</h3>
                <span
                  v-if="criteriaById.get(category.id)"
                  class="nearby-neighborhood-score-card__diagnostic-status"
                  :data-status="criteriaById.get(category.id)?.status"
                >{{ criterionStatusLabel(criteriaById.get(category.id)!.status) }}</span>
                <span v-else class="nearby-neighborhood-score-card__diagnostic-status" data-status="idle">
                  {{ criterionStatusLabel("idle") }}
                </span>
              </header>
              <ul v-if="criteriaById.get(category.id)?.datasets.length">
                <li
                  v-for="dataset in criteriaById.get(category.id)!.datasets"
                  :key="`${category.id}:${dataset.id}`"
                  class="nearby-neighborhood-score-card__diagnostic-dataset"
                  :data-status="dataset.status"
                >
                  <component
                    :is="dataset.status === 'ready' ? CheckCircle2 : dataset.status === 'loading' ? LoaderCircle : dataset.status === 'error' ? CircleAlert : CircleHelp"
                    :size="16"
                    class="nearby-neighborhood-score-card__diagnostic-icon"
                    :class="{ 'nearby-neighborhood-score-card__diagnostic-icon--spin': dataset.status === 'loading' }"
                    aria-hidden="true"
                  />
                  <span class="nearby-neighborhood-score-card__diagnostic-label">{{ datasetLabel(dataset.id) }}</span>
                  <small>{{ t(dataset.required ? "nearbyStations.neighborhoodScore.datasetRequirements.required" : "nearbyStations.neighborhoodScore.datasetRequirements.optional") }}</small>
                  <strong>{{ datasetStatusLabel(dataset.status) }}</strong>
                </li>
              </ul>
              <p v-else class="nearby-neighborhood-score-card__diagnostics-empty">
                {{ t("nearbyStations.neighborhoodScore.diagnosticsNoCriteria") }}
              </p>
            </article>
          </div>
        </section>
      </div>
    </Teleport>

    <p v-if="loading" class="nearby-neighborhood-score-card__loading" role="status">
      <LoaderCircle class="nearby-neighborhood-score-card__spin" :size="16" aria-hidden="true" />
      {{ progressLabel ?? t("nearbyStations.neighborhoodScore.loading") }}
    </p>
    <div v-if="error" class="nearby-neighborhood-score-card__error" role="status">
      <span>{{ error }}</span>
      <button
        class="nearby-neighborhood-score-card__retry"
        type="button"
        :disabled="retrying"
        @click="emit('retry-source')"
      >
        {{ retrying ? t("nearbyStations.neighborhoodScore.retrying") : t("common.actions.retry") }}
      </button>
    </div>

    <p v-if="result.band" class="nearby-neighborhood-score-card__verdict" :style="{ color: bandColor(result.band) }">
      {{ t(bandKeys[result.band]) }}
    </p>
    <p v-else class="nearby-neighborhood-score-card__verdict nearby-neighborhood-score-card__verdict--pending">
      {{ t("nearbyStations.neighborhoodScore.scorePending") }}
    </p>

    <p class="nearby-neighborhood-score-card__coverage">
      {{ t("nearbyStations.neighborhoodScore.coverage", {
        available: result.availableCategoryCount,
        total: result.totalCategoryCount,
      }) }}
    </p>

    <section v-if="result.positiveFacts.length || result.negativeFacts.length || result.neutralFacts.length" class="nearby-neighborhood-score-card__highlights">
      <div v-if="result.positiveFacts.length" class="nearby-neighborhood-score-card__highlight nearby-neighborhood-score-card__highlight--positive">
        <h3>{{ t("nearbyStations.neighborhoodScore.positives") }}</h3>
        <p
          v-for="fact in result.positiveFacts"
          :key="`summary:${fact.id}`"
          class="nearby-neighborhood-score-card__summary-fact"
        >
          <span aria-hidden="true">{{ fact.emphasis === "exceptional" ? "+++" : "+" }}</span>
          {{ factLabel(fact) }}
        </p>
      </div>
      <div v-if="result.negativeFacts.length" class="nearby-neighborhood-score-card__highlight nearby-neighborhood-score-card__highlight--negative">
        <h3>{{ t("nearbyStations.neighborhoodScore.negatives") }}</h3>
        <p
          v-for="fact in result.negativeFacts"
          :key="`summary:${fact.id}`"
          class="nearby-neighborhood-score-card__summary-fact"
        >
          <span aria-hidden="true">{{ fact.emphasis === "exceptional" ? "+++" : "−" }}</span>
          {{ factLabel(fact) }}
        </p>
      </div>
      <div v-if="result.neutralFacts.length" class="nearby-neighborhood-score-card__highlight nearby-neighborhood-score-card__highlight--neutral">
        <h3>{{ t("nearbyStations.neighborhoodScore.neutralFacts") }}</h3>
        <p
          v-for="fact in result.neutralFacts"
          :key="`summary:${fact.id}`"
          class="nearby-neighborhood-score-card__summary-fact"
        >
          <span aria-hidden="true">·</span>
          {{ factLabel(fact) }}
        </p>
      </div>
    </section>

    <section class="nearby-neighborhood-score-card__categories" :aria-label="t('nearbyStations.neighborhoodScore.categoriesLabel')">
      <article v-for="category in result.categories" :key="category.id" class="nearby-neighborhood-score-card__category">
        <template v-for="criterion in [criteriaById.get(category.id)]" :key="`${category.id}:status`">
        <header class="nearby-neighborhood-score-card__category-header">
          <h3>{{ t(category.labelKey) }}</h3>
          <div class="nearby-neighborhood-score-card__category-status">
            <strong v-if="category.available">{{ category.displayScore }}/10</strong>
            <span v-else>{{ t("nearbyStations.neighborhoodScore.categoryUnavailable") }}</span>
            <small v-if="criterion?.status === 'loading'" class="nearby-neighborhood-score-card__category-loading">
              {{ t("nearbyStations.neighborhoodScore.criterionLoading") }}
            </small>
            <small v-else-if="criterion?.datasets.some((dataset) => dataset.status === 'error')" class="nearby-neighborhood-score-card__category-error">
              {{ t("nearbyStations.neighborhoodScore.criterionError") }}
            </small>
          </div>
        </header>
        <p v-if="!category.available && !category.neutralFacts.length" class="nearby-neighborhood-score-card__category-empty">
          {{ category.unavailableReasonKey ? t(category.unavailableReasonKey) : t("nearbyStations.neighborhoodScore.noData") }}
        </p>
        <div v-if="category.available || category.neutralFacts.length" class="nearby-neighborhood-score-card__facts">
          <div
            v-if="category.positiveFacts.length"
            class="nearby-neighborhood-score-card__fact-group"
            :class="{ 'nearby-neighborhood-score-card__fact-group--positive-only': !category.negativeFacts.length }"
          >
            <span>{{ t("nearbyStations.neighborhoodScore.positives") }}</span>
            <NearbyNeighborhoodScoreFact
              v-for="fact in category.positiveFacts"
              :key="fact.id"
              :fact="fact"
              :open="selectedFactId === fact.id"
              @toggle="toggleFact(fact.id)"
            />
          </div>
          <div v-if="category.negativeFacts.length" class="nearby-neighborhood-score-card__fact-group">
            <span>{{ t("nearbyStations.neighborhoodScore.negatives") }}</span>
            <NearbyNeighborhoodScoreFact
              v-for="fact in category.negativeFacts"
              :key="fact.id"
              :fact="fact"
              :open="selectedFactId === fact.id"
              @toggle="toggleFact(fact.id)"
            />
          </div>
          <div v-if="category.neutralFacts.length" class="nearby-neighborhood-score-card__fact-group nearby-neighborhood-score-card__fact-group--neutral">
            <span>{{ t("nearbyStations.neighborhoodScore.neutralFacts") }}</span>
            <NearbyNeighborhoodScoreFact
              v-for="fact in category.neutralFacts"
              :key="fact.id"
              :fact="fact"
              :open="selectedFactId === fact.id"
              @toggle="toggleFact(fact.id)"
            />
          </div>
          <p v-if="!category.positiveFacts.length && !category.negativeFacts.length && !category.neutralFacts.length" class="nearby-neighborhood-score-card__category-empty">
            {{ t("nearbyStations.neighborhoodScore.noDocumentedSignal") }}
          </p>
        </div>
        </template>
      </article>
    </section>

    <footer class="nearby-neighborhood-score-card__footer">
      <p>{{ t("nearbyStations.neighborhoodScore.updatedAt", { time: d(result.generatedAt, { dateStyle: "short", timeStyle: "short" }) }) }}</p>
      <p>{{ t("nearbyStations.neighborhoodScore.methodNote") }}</p>
      <p>{{ t("nearbyStations.neighborhoodScore.coveragePercent", { percent: Math.round(result.coverageRatio * 100) }) }}</p>
      <details v-if="result.sources.length">
        <summary>{{ t("nearbyStations.neighborhoodScore.sourcesTitle") }}</summary>
        <ul class="nearby-neighborhood-score-card__sources">
          <li v-for="source in result.sources" :key="source.id">
            <a :href="source.pageUrl" target="_blank" rel="noopener noreferrer">{{ source.title }}</a>
            — {{ source.producer }} · {{ source.licence.label }}
            <span v-if="source.referencePeriod"> · {{ source.referencePeriod }}</span>
            <strong v-if="source.freshness.status !== 'fresh'"> · {{ source.freshness.status === 'stale' ? t("nearbyStations.neighborhoodScore.sourceStale") : t("nearbyStations.neighborhoodScore.sourceAging") }}</strong>
          </li>
        </ul>
      </details>
      <details v-if="result.warnings.length">
        <summary>{{ t("nearbyStations.neighborhoodScore.dataWarnings") }}</summary>
        <ul><li v-for="warning in result.warnings" :key="warning">{{ warning }}</li></ul>
      </details>
      <details>
        <summary>{{ t("nearbyStations.neighborhoodScore.limitationsTitle") }}</summary>
        <ul>
          <li>{{ t("nearbyStations.neighborhoodScore.limitations.education") }}</li>
          <li>{{ t("nearbyStations.neighborhoodScore.limitations.livingEnvironment") }}</li>
          <li>{{ t("nearbyStations.neighborhoodScore.limitations.futureProjects") }}</li>
          <li v-if="workplaceLabel">
            {{ t("nearbyStations.neighborhoodScore.limitations.workKnown", { name: workplaceLabel }) }}
          </li>
          <li v-else>{{ t("nearbyStations.neighborhoodScore.limitations.work") }}</li>
          <li>{{ t("nearbyStations.neighborhoodScore.limitations.crowding") }}</li>
        </ul>
      </details>
    </footer>

    <NuxtLink class="nearby-neighborhood-score-card__directory" :to="directoryUrl">
      <ExternalLink :size="17" aria-hidden="true" />
      <span>
        <strong>{{ t("nearbyStations.neighborhoodScore.seePlaces") }}</strong>
        <small>{{ t("nearbyStations.neighborhoodScore.seePlacesHint") }}</small>
      </span>
    </NuxtLink>
  </article>
</template>

<style scoped>
.nearby-neighborhood-score-card { background: #fff; border: 1px solid rgba(16,35,63,.12); border-radius: 20px; box-shadow: 0 16px 40px rgba(16,35,63,.08); overflow: visible; padding: 22px; }
.nearby-neighborhood-score-card__header { align-items: flex-start; display: flex; gap: 20px; justify-content: space-between; }
.nearby-neighborhood-score-card__eyebrow { color: #5146ff; font-size: .68rem; font-weight: 900; letter-spacing: .1em; margin: 0 0 5px; text-transform: uppercase; }
.nearby-neighborhood-score-card h2 { color: var(--ink); font-size: clamp(1.35rem, 3vw, 1.9rem); margin: 0; }
.nearby-neighborhood-score-card__header-actions { align-items: flex-start; display: flex; flex: 0 0 auto; gap: 8px; }
.nearby-neighborhood-score-card__diagnostics-trigger, .nearby-neighborhood-score-card__diagnostics-close { align-items: center; background: #f7f8fc; border: 1px solid rgba(16,35,63,.12); border-radius: 10px; color: var(--muted); cursor: pointer; display: inline-flex; height: 38px; justify-content: center; padding: 0; width: 38px; }
.nearby-neighborhood-score-card__diagnostics-trigger:hover, .nearby-neighborhood-score-card__diagnostics-trigger:focus-visible, .nearby-neighborhood-score-card__diagnostics-close:hover, .nearby-neighborhood-score-card__diagnostics-close:focus-visible { background: #f2efff; border-color: rgba(81,70,255,.38); color: #5146ff; outline: 2px solid rgba(81,70,255,.25); outline-offset: 2px; }
.nearby-neighborhood-score-card__diagnostics-overlay { align-items: center; background: rgba(15,23,42,.54); display: flex; inset: 0; justify-content: center; padding: 18px; position: fixed; z-index: 9500; }
.nearby-neighborhood-score-card__diagnostics-dialog { background: #fff; border: 1px solid rgba(81,70,255,.16); border-radius: 18px; box-shadow: 0 28px 70px rgba(15,23,42,.28); display: flex; flex-direction: column; max-height: min(90vh, 820px); max-width: 760px; outline: none; overflow: hidden; padding: 20px; width: min(100%, 760px); }
.nearby-neighborhood-score-card__diagnostics-header { align-items: flex-start; display: flex; gap: 14px; justify-content: space-between; padding-bottom: 14px; }
.nearby-neighborhood-score-card__diagnostics-header h2 { font-size: 1.2rem; margin: 0; }
.nearby-neighborhood-score-card__diagnostics-header p { color: var(--muted); font-size: .78rem; line-height: 1.45; margin: 6px 0 0; }
.nearby-neighborhood-score-card__diagnostics-header .nearby-neighborhood-score-card__diagnostics-summary { color: #5146ff; font-weight: 800; }
.nearby-neighborhood-score-card__diagnostics-list { display: grid; gap: 9px; overflow: auto; padding: 2px 2px 4px; }
.nearby-neighborhood-score-card__diagnostics-category { background: #fbfcfe; border: 1px solid rgba(16,35,63,.1); border-radius: 12px; padding: 10px 12px; }
.nearby-neighborhood-score-card__diagnostics-category > header { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
.nearby-neighborhood-score-card__diagnostics-category h3 { color: var(--ink); font-size: .86rem; margin: 0; }
.nearby-neighborhood-score-card__diagnostic-status { background: #f0edff; border-radius: 999px; color: #5146ff; flex: 0 0 auto; font-size: .66rem; font-weight: 850; padding: 4px 8px; }
.nearby-neighborhood-score-card__diagnostic-status[data-status="ready"] { background: #e7f5eb; color: #267b3c; }
.nearby-neighborhood-score-card__diagnostic-status[data-status="degraded"], .nearby-neighborhood-score-card__diagnostic-status[data-status="unavailable"], .nearby-neighborhood-score-card__diagnostic-status[data-status="error"] { background: #fff1e8; color: #a64b1d; }
.nearby-neighborhood-score-card__diagnostics-category ul { display: grid; gap: 5px; list-style: none; margin: 9px 0 0; padding: 0; }
.nearby-neighborhood-score-card__diagnostic-dataset { align-items: center; color: var(--ink); display: grid; gap: 8px; grid-template-columns: 18px minmax(0,1fr) auto auto; min-height: 28px; }
.nearby-neighborhood-score-card__diagnostic-icon { color: #8792a6; flex: 0 0 auto; }
.nearby-neighborhood-score-card__diagnostic-dataset[data-status="ready"] .nearby-neighborhood-score-card__diagnostic-icon { color: #278145; }
.nearby-neighborhood-score-card__diagnostic-dataset[data-status="loading"] .nearby-neighborhood-score-card__diagnostic-icon { color: #6b4cff; }
.nearby-neighborhood-score-card__diagnostic-dataset[data-status="error"] .nearby-neighborhood-score-card__diagnostic-icon, .nearby-neighborhood-score-card__diagnostic-dataset[data-status="stale"] .nearby-neighborhood-score-card__diagnostic-icon { color: #b74b24; }
.nearby-neighborhood-score-card__diagnostic-icon--spin { animation: nearby-score-spin 900ms linear infinite; }
.nearby-neighborhood-score-card__diagnostic-label { font-size: .75rem; font-weight: 750; min-width: 0; }
.nearby-neighborhood-score-card__diagnostic-dataset small { color: var(--muted); font-size: .64rem; white-space: nowrap; }
.nearby-neighborhood-score-card__diagnostic-dataset strong { color: #657089; font-size: .68rem; text-align: right; }
.nearby-neighborhood-score-card__diagnostic-dataset[data-status="ready"] strong { color: #267b3c; }
.nearby-neighborhood-score-card__diagnostic-dataset[data-status="error"] strong, .nearby-neighborhood-score-card__diagnostic-dataset[data-status="stale"] strong { color: #a64b1d; }
.nearby-neighborhood-score-card__diagnostics-empty { color: var(--muted); font-size: .74rem; margin: 8px 0 0; }
.nearby-neighborhood-score-card__origin { align-items: center; background: transparent; border: 0; color: var(--muted); cursor: pointer; display: inline-flex; font: inherit; font-size: .8rem; gap: 6px; margin: 6px 0 0; max-width: 100%; padding: 0; text-align: left; }
.nearby-neighborhood-score-card__origin span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-neighborhood-score-card__origin:hover, .nearby-neighborhood-score-card__origin:focus-visible { color: #5146ff; outline: 0; text-decoration: underline; text-underline-offset: 3px; }
.nearby-neighborhood-score-card__score { align-items: baseline; background: #f4f5fa; border: 1px solid rgba(16,35,63,.1); border-radius: 16px; color: var(--score-color, #64748b); display: flex; flex: 0 0 auto; gap: 2px; justify-content: center; min-width: 88px; padding: 10px 12px 8px; }
.nearby-neighborhood-score-card__score strong { font-size: 2.25rem; font-variant-numeric: tabular-nums; line-height: 1; }
.nearby-neighborhood-score-card__score span { font-size: .75rem; font-weight: 850; }
.nearby-neighborhood-score-card__score--excellent { background: #e3f5e9; }
.nearby-neighborhood-score-card__score--good { background: #edf7e9; }
.nearby-neighborhood-score-card__score--medium { background: #fff7de; }
.nearby-neighborhood-score-card__score--weak { background: #fff0e8; }
.nearby-neighborhood-score-card__score--very-weak { background: #ffebe9; }
.nearby-neighborhood-score-card__loading, .nearby-neighborhood-score-card__error { align-items: center; border-radius: 9px; display: flex; font-size: .76rem; gap: 7px; justify-content: space-between; margin: 15px 0 0; padding: 8px 10px; }
.nearby-neighborhood-score-card__loading { background: #f4f2ff; color: #5146ff; }
.nearby-neighborhood-score-card__error { background: #fff5f4; color: #a5231d; }
.nearby-neighborhood-score-card__error > span { line-height: 1.4; }
.nearby-neighborhood-score-card__retry { background: transparent; border: 1px solid currentColor; border-radius: 7px; color: inherit; cursor: pointer; flex: 0 0 auto; font: inherit; font-size: .68rem; font-weight: 850; padding: 5px 8px; }
.nearby-neighborhood-score-card__retry:hover, .nearby-neighborhood-score-card__retry:focus-visible { background: rgba(165,35,29,.08); outline: 2px solid currentColor; outline-offset: 1px; }
.nearby-neighborhood-score-card__retry:disabled { cursor: wait; opacity: .65; }
.nearby-neighborhood-score-card__spin { animation: nearby-score-spin 900ms linear infinite; }
.nearby-neighborhood-score-card__verdict { font-size: 1.05rem; font-weight: 900; margin: 18px 0 3px; }
.nearby-neighborhood-score-card__verdict--pending { color: var(--muted); }
.nearby-neighborhood-score-card__coverage { color: var(--muted); font-size: .76rem; line-height: 1.45; margin: 0; }
.nearby-neighborhood-score-card__highlights { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 18px; }
.nearby-neighborhood-score-card__highlight { border-radius: 13px; padding: 10px 9px 8px; }
.nearby-neighborhood-score-card__highlight--positive { background: #f1faf4; border: 1px solid rgba(23,134,76,.14); }
.nearby-neighborhood-score-card__highlight--negative { background: #fff8f4; border: 1px solid rgba(183,75,36,.15); }
.nearby-neighborhood-score-card__highlight--neutral { background: #f5f6fa; border: 1px solid rgba(93,105,130,.16); grid-column: 1 / -1; }
.nearby-neighborhood-score-card__highlight h3, .nearby-neighborhood-score-card__fact-group > span { color: var(--muted); font-size: .68rem; font-weight: 900; letter-spacing: .05em; margin: 0 7px 4px; text-transform: uppercase; }
.nearby-neighborhood-score-card__summary-fact { align-items: flex-start; color: var(--ink); display: flex; font-size: .78rem; gap: 7px; line-height: 1.35; margin: 0; padding: 5px 7px; }
.nearby-neighborhood-score-card__highlight--positive .nearby-neighborhood-score-card__summary-fact > span { color: #17864c; font-weight: 950; }
.nearby-neighborhood-score-card__highlight--negative .nearby-neighborhood-score-card__summary-fact > span { color: #b74b24; font-weight: 950; }
.nearby-neighborhood-score-card__highlight--neutral .nearby-neighborhood-score-card__summary-fact > span { color: #64748b; font-weight: 950; }
.nearby-neighborhood-score-card__categories { display: grid; gap: 9px; margin-top: 20px; }
.nearby-neighborhood-score-card__category { background: #fbfcfe; border: 1px solid rgba(16,35,63,.1); border-radius: 13px; min-width: 0; padding: 12px 9px 9px; }
.nearby-neighborhood-score-card__category-header { align-items: center; display: flex; gap: 10px; justify-content: space-between; padding: 0 7px 7px; }
.nearby-neighborhood-score-card__category-header h3 { color: var(--ink); font-size: .9rem; margin: 0; }
.nearby-neighborhood-score-card__category-status { align-items: flex-end; display: flex; flex-direction: column; gap: 2px; }
.nearby-neighborhood-score-card__category-header strong { color: #5146ff; font-size: .8rem; font-variant-numeric: tabular-nums; }
.nearby-neighborhood-score-card__category-header span { color: #8b95a7; font-size: .7rem; font-weight: 800; }
.nearby-neighborhood-score-card__category-loading { color: #7168d8; font-size: .58rem; font-weight: 800; }
.nearby-neighborhood-score-card__category-error { color: var(--muted); font-size: .65rem; font-weight: 800; }
.nearby-neighborhood-score-card__category-empty { color: var(--muted); font-size: .76rem; line-height: 1.45; margin: 0; padding: 2px 7px 4px; }
.nearby-neighborhood-score-card__facts { display: grid; gap: 4px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.nearby-neighborhood-score-card__fact-group--neutral { grid-column: 1 / -1; }
.nearby-neighborhood-score-card__fact-group { min-width: 0; }
.nearby-neighborhood-score-card__fact-group--positive-only { display: grid; gap: 4px; grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.nearby-neighborhood-score-card__fact-group--positive-only > span { grid-column: 1 / -1; }
.nearby-neighborhood-score-card__footer { border-top: 1px solid rgba(16,35,63,.1); color: var(--muted); display: grid; font-size: .7rem; gap: 5px; line-height: 1.45; margin-top: 20px; padding: 14px 7px 0; }
.nearby-neighborhood-score-card__footer p { margin: 0; }
.nearby-neighborhood-score-card__footer details { margin-top: 4px; }
.nearby-neighborhood-score-card__footer summary { color: #5146ff; cursor: pointer; font-weight: 850; }
.nearby-neighborhood-score-card__footer ul { margin: 7px 0 0; padding-left: 18px; }
.nearby-neighborhood-score-card__sources li { margin-bottom: 5px; }
.nearby-neighborhood-score-card__sources a { color: #5146ff; font-weight: 800; }
.nearby-neighborhood-score-card__sources strong { color: #b74b24; }
.nearby-neighborhood-score-card__directory { align-items: center; background: #5146ff; border-radius: 12px; color: #fff; display: flex; gap: 10px; justify-content: center; margin-top: 18px; min-height: 52px; padding: 9px 13px; text-align: left; text-decoration: none; }
.nearby-neighborhood-score-card__directory:hover, .nearby-neighborhood-score-card__directory:focus-visible { background: #4034df; color: #fff; outline: 0; }
.nearby-neighborhood-score-card__directory span { display: grid; gap: 2px; }
.nearby-neighborhood-score-card__directory strong { font-size: .82rem; }
.nearby-neighborhood-score-card__directory small { font-size: .68rem; opacity: .86; }
@keyframes nearby-score-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .nearby-neighborhood-score-card__spin, .nearby-neighborhood-score-card__diagnostic-icon--spin { animation: none; }
}
@media (max-width: 680px) {
  .nearby-neighborhood-score-card { padding: 16px; }
  .nearby-neighborhood-score-card__header > div:first-child { min-width: 0; }
  .nearby-neighborhood-score-card__header h2 { overflow-wrap: anywhere; }
  .nearby-neighborhood-score-card__highlights, .nearby-neighborhood-score-card__facts, .nearby-neighborhood-score-card__fact-group--positive-only { grid-template-columns: 1fr; }
  .nearby-neighborhood-score-card__score { min-width: 74px; padding-left: 9px; padding-right: 9px; }
  .nearby-neighborhood-score-card__score strong { font-size: 1.9rem; }
  .nearby-neighborhood-score-card__error { align-items: flex-start; flex-direction: column; }
  .nearby-neighborhood-score-card__header-actions { gap: 5px; }
  .nearby-neighborhood-score-card__diagnostics-dialog { border-radius: 14px; max-height: 94vh; padding: 15px; }
  .nearby-neighborhood-score-card__diagnostic-dataset { align-items: flex-start; grid-template-columns: 18px minmax(0,1fr) auto; }
  .nearby-neighborhood-score-card__diagnostic-dataset strong { grid-column: 2 / -1; text-align: left; }
}
</style>

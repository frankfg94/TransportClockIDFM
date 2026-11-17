<script setup lang="ts">
import { computed } from "vue";
import { VERDICT_SERVER_SCORE_RULES as server } from "../../../shared/neighborhoodVerdictScoreRules";
import AppModal from "../../components/AppModal.vue";
import { useI18n, type TranslationKey } from "../../i18n";
import type { NeighborhoodCategoryResult, NeighborhoodScoreResult } from "./neighborhood/contracts";
import { NEIGHBORHOOD_MAX_SCORE } from "./neighborhood/contracts";
import { neighborhoodScoreHelpDefinitions } from "./neighborhood/scoreHelpRules";
import { CATEGORY_KEYS } from "./neighborhood/i18nKeys";
import type { NeighborhoodCriterionState, NeighborhoodCriterionStatus } from "./neighborhood/criterionRegistry";

const props = defineProps<{ open: boolean; result: NeighborhoodScoreResult; criteria?: readonly NeighborhoodCriterionState[] }>();
defineEmits<{ close: [] }>();
const { t, n } = useI18n();
const states = computed(() => new Map(props.criteria?.map(item => [item.id, item.status]) ?? []));
const contributes = (item: NeighborhoodCategoryResult) => item.available && item.score !== undefined && Number.isFinite(item.score) && item.weight > 0;
const activeWeight = computed(() => props.result.categories.reduce((sum, item) => sum + (contributes(item) ? item.weight : 0), 0));
const statusKeys: Record<NeighborhoodCriterionStatus, TranslationKey> = {
  idle: "nearbyStations.neighborhoodScore.criterionStatuses.idle", loading: "nearbyStations.neighborhoodScore.criterionStatuses.loading",
  ready: "nearbyStations.neighborhoodScore.criterionStatuses.ready", degraded: "nearbyStations.neighborhoodScore.criterionStatuses.degraded",
  unavailable: "nearbyStations.neighborhoodScore.criterionStatuses.unavailable", error: "nearbyStations.neighborhoodScore.criterionStatuses.error",
};
const percent = (value: number) => n(value * 100, { maximumFractionDigits: 1 });
const number = (value: number) => n(Math.abs(value) < 0.0000005 ? 0 : value, {
  maximumFractionDigits: Math.abs(value) > 0 && Math.abs(value) < 0.01 ? 6 : 2,
});
const ruleDefinitions = computed(() => neighborhoodScoreHelpDefinitions({ percent, number }));
</script>

<template>
  <AppModal :open="open" :title="t('nearbyStations.neighborhoodScore.scoreHelp.title')" @close="$emit('close')">
    <div class="score-help">
      <p>{{ t("nearbyStations.neighborhoodScore.scoreHelp.intro", { max: NEIGHBORHOOD_MAX_SCORE }) }}</p>
      <p>{{ t("nearbyStations.neighborhoodScore.scoreHelp.coverage", { weight: percent(activeWeight) }) }}</p>
      <ul class="score-help__categories">
        <li v-for="item in result.categories" :key="item.id">
          <strong>{{ t(item.labelKey) }}</strong>
          <span>{{ t("nearbyStations.neighborhoodScore.scoreHelp.category", { base: percent(item.weight), active: contributes(item) && activeWeight ? percent(item.weight / activeWeight) : percent(0), score: contributes(item) ? number(item.score!) : t("nearbyStations.neighborhoodScore.scoreHelp.notEvaluated"), contribution: contributes(item) && activeWeight ? number(item.score! * item.weight / activeWeight) : number(0), max: NEIGHBORHOOD_MAX_SCORE }) }}</span>
          <small v-if="states.get(item.id)">{{ t(statusKeys[states.get(item.id)!]) }}</small>
          <details v-if="item.scoreDetails?.length" class="score-help__details">
            <summary>{{ t("nearbyStations.neighborhoodScore.scoreHelp.detail.open") }}</summary>
            <section v-for="(group, groupIndex) in item.scoreDetails" :key="groupIndex" class="score-help__group">
              <h4>{{ t(group.labelKey) }}<template v-if="group.score !== undefined"> · {{ number(group.score) }} / {{ NEIGHBORHOOD_MAX_SCORE }}</template></h4>
              <p>{{ t(group.method === "average" ? "nearbyStations.neighborhoodScore.scoreHelp.detail.averageExplanation" : "nearbyStations.neighborhoodScore.scoreHelp.detail.sumExplanation") }}</p>
              <ul>
                <li v-for="(row, rowIndex) in group.rows" :key="rowIndex">
                  <strong>{{ row.label ?? t(row.labelKey) }}</strong>
                  <span v-if="row.measurement !== undefined">{{ t("nearbyStations.neighborhoodScore.scoreHelp.detail.measurement", { value: number(row.measurement), unit: t(row.measurementUnit === 'minutes' ? 'nearbyStations.neighborhoodScore.scoreHelp.detail.minutes' : row.measurementUnit === 'meters' ? 'nearbyStations.neighborhoodScore.scoreHelp.detail.meters' : row.measurementUnit === 'percent' ? 'nearbyStations.neighborhoodScore.scoreHelp.detail.percentUnit' : 'nearbyStations.neighborhoodScore.scoreHelp.detail.count') }) }}</span>
                  <span v-if="row.value !== undefined">{{ t("nearbyStations.neighborhoodScore.scoreHelp.detail.value", { value: number(row.value), max: NEIGHBORHOOD_MAX_SCORE }) }}</span>
                  <span v-if="row.weight !== undefined">{{ t("nearbyStations.neighborhoodScore.scoreHelp.detail.weight", { value: percent(row.weight) }) }}</span>
                  <span v-if="row.points !== undefined">{{ t("nearbyStations.neighborhoodScore.scoreHelp.detail.points", { value: number(row.points) }) }}</span>
                  <span v-if="row.value === undefined && row.points === undefined">{{ t("nearbyStations.neighborhoodScore.scoreHelp.notEvaluated") }}</span>
                  <span v-if="row.provisional">{{ t("nearbyStations.neighborhoodScore.scoreHelp.detail.provisional") }}</span>
                  <span v-if="row.unavailable">{{ t("nearbyStations.neighborhoodScore.scoreHelp.detail.sourceUnavailable") }}</span>
                  <span v-if="row.thresholds">{{ t("nearbyStations.neighborhoodScore.scoreHelp.detail.thresholds", { positive: row.thresholds.positive, neutral: row.thresholds.neutral }) }}</span>
                </li>
              </ul>
            </section>
          </details>
        </li>
      </ul>
      <p>{{ t("nearbyStations.neighborhoodScore.scoreHelp.status") }}</p>
      <section v-for="definition in ruleDefinitions" :key="definition.id">
        <h3>{{ t(CATEGORY_KEYS[definition.id]) }}</h3>
        <p v-for="rule in definition.rules" :key="rule.key">{{ t(rule.key, rule.values) }}</p>
      </section>
      <h3>{{ t("nearbyStations.neighborhoodScore.scoreHelp.serverTitle") }}</h3>
      <p>{{ t("nearbyStations.neighborhoodScore.scoreHelp.server") }}</p>
      <p>{{ t("nearbyStations.neighborhoodScore.scoreHelp.serverNature", { d1: server.natureDistances[0].maximumMeters, s1: server.natureDistances[0].score, d2: server.natureDistances[1].maximumMeters, s2: server.natureDistances[1].score, d3: server.natureDistances[2].maximumMeters, s3: server.natureDistances[2].score, d4: server.natureDistances[3].maximumMeters, s4: server.natureDistances[3].score, beyond: server.natureBeyondScore, minutes: server.futureStation.walkingMinutes, bonus: server.futureStation.bonus }) }}</p>
      <p>{{ t("nearbyStations.neighborhoodScore.scoreHelp.serverSecurity", { trend: percent(server.security.trendWeight), cap: number(server.security.maximumAdjustment), positive: percent(server.security.positivePercentile), negative: percent(server.security.negativePercentile) }) }}</p>
      <p>{{ t("nearbyStations.neighborhoodScore.scoreHelp.facts") }}</p>
    </div>
  </AppModal>
</template>

<style scoped>
.score-help { color: var(--ink); line-height: 1.5; }
.score-help h3 { margin: 1.2rem 0 .3rem; }
.score-help p { margin: .5rem 0; }
.score-help__categories { display: grid; gap: .5rem; list-style: none; padding: 0; }
.score-help__categories li { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; display: grid; gap: .15rem; padding: .65rem; }
.score-help__categories small { color: var(--muted); }
.score-help__details summary { cursor: pointer; font-weight: 700; padding: .35rem 0; }
.score-help__details summary:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.score-help__group h4 { margin: .8rem 0 .2rem; }
.score-help__group p { color: var(--muted); font-size: .85em; }
.score-help__group ul { display: grid; gap: .3rem; list-style: none; padding: 0; }
.score-help__group li { display: flex; flex-wrap: wrap; gap: .25rem .75rem; font-size: .9em; }
.score-help__group li strong { flex-basis: 100%; }
</style>

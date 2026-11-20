<script setup lang="ts">
import LineIconBadge from "../../components/LineIconBadge.vue";
import { useI18n } from "../../i18n";
import { PASSENGER_SATISFACTION_SOURCE } from "../../../shared/passengerSatisfaction";
import { PASSENGER_SATISFACTION_RULES, type PassengerSatisfaction } from "./neighborhood/verdict-transport-facts/passengerSatisfaction";
import { formatTransportLineName } from "./neighborhood/verdict-transport-facts/heavyTransports";
import { createLinePresentation } from "../../services/linePresentation";
import type { TransitFamily } from "../../types/transit";

defineProps<{ survey?: PassengerSatisfaction }>();
const { n, t } = useI18n();
const currentYear = new Date().getUTCFullYear();
const percent = (value: number) => n(value / 100, { style: "percent", maximumFractionDigits: 4 });
function badge(line: PassengerSatisfaction["rows"][number]["line"]) {
  const family = (line.mode === "TRAIN" ? "TRANSILIEN" : line.mode) as TransitFamily;
  const label = formatTransportLineName(line).replace(/^(?:métro|metro|rer|train|transilien|tramway|tram|câble|cable)\s+/iu, "");
  return { id: line.id, label, family, ...createLinePresentation({ ...line, code: label, family }) };
}
</script>

<template>
  <details v-if="survey" class="passenger-satisfaction" data-testid="verdict-passenger-satisfaction" :data-coverage="survey.coverage">
    <summary>
      <strong>{{ t('nearbyStations.neighborhoodScore.satisfaction.title') }}</strong>
      <span>{{ t(`nearbyStations.neighborhoodScore.satisfaction.${survey.coverage === 'loading' ? 'loading' : survey.qualification.kind}`) }}</span>
      <span v-if="survey.percent !== undefined">{{ percent(survey.percent) }}</span>
      <small>{{ t('nearbyStations.neighborhoodScore.satisfaction.coverage', { covered: survey.covered, total: survey.total }) }}</small>
    </summary>
    <p v-if="survey.coverage !== 'complete' && survey.coverage !== 'loading'">{{ t(`nearbyStations.neighborhoodScore.satisfaction.${survey.coverage}`) }}</p>
    <p>{{ t('nearbyStations.neighborhoodScore.satisfaction.scope') }}</p>
    <ul v-if="survey.rows.length">
      <li v-for="{ line, observations } in survey.rows" :key="line.id" :data-satisfaction-line="line.code">
        <LineIconBadge :line="badge(line)" compact />
        <strong>{{ formatTransportLineName(line) }}</strong>
        <small v-if="!observations.length && survey.coverage !== 'loading'">{{ t('nearbyStations.neighborhoodScore.satisfaction.noObservation') }}</small>
        <small v-for="row in observations" :key="`${row.operator}:${row.contract ?? ''}`">
          {{ t('nearbyStations.neighborhoodScore.satisfaction.observation', { operator: row.operator, year: row.year, result: percent(row.percent) }) }}
          <template v-if="row.contract"> · {{ t('nearbyStations.neighborhoodScore.satisfaction.contract', { contract: row.contract }) }}</template>
          <template v-if="currentYear - row.year > PASSENGER_SATISFACTION_RULES.maxAnnualAge"> · {{ t('nearbyStations.neighborhoodScore.satisfaction.old') }}</template>
        </small>
      </li>
    </ul>
    <a :href="PASSENGER_SATISFACTION_SOURCE" target="_blank" rel="noopener noreferrer">{{ t('nearbyStations.neighborhoodScore.satisfaction.source') }}</a>
  </details>
</template>

<style scoped>
.passenger-satisfaction { margin-block: 0 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.passenger-satisfaction summary { cursor: pointer; }
.passenger-satisfaction summary > * { margin-inline-end: 8px; }
.passenger-satisfaction p, .passenger-satisfaction small { color: var(--muted); }
.passenger-satisfaction ul { padding: 0; list-style: none; }
.passenger-satisfaction li { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; padding-block: 5px; }
</style>

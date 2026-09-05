<script setup lang="ts">
import { CircleHelp } from "lucide-vue-next";
import { useI18n, type TranslationKey } from "../../i18n";
import type { NeighborhoodFact, NeighborhoodFactGeography } from "./neighborhoodScore";

const props = defineProps<{
  fact: NeighborhoodFact;
  open?: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
}>();

const { d, t } = useI18n();

const geographyKeys: Record<NeighborhoodFactGeography["level"], TranslationKey> = {
  point: "nearbyStations.neighborhoodScore.evidence.geographyPoint",
  commune: "nearbyStations.neighborhoodScore.evidence.geographyCommune",
  department: "nearbyStations.neighborhoodScore.evidence.geographyDepartment",
  region: "nearbyStations.neighborhoodScore.evidence.geographyRegion",
};

function proofKey(proof: NeighborhoodFact["evidence"]["proof"]): TranslationKey {
  return proof === "direct"
    ? "nearbyStations.neighborhoodScore.evidence.direct"
    : "nearbyStations.neighborhoodScore.evidence.derived";
}

function toggle(): void {
  emit("toggle");
}

function factLabel(): string {
  return props.fact.label ?? (props.fact.labelKey ? t(props.fact.labelKey, props.fact.labelValues) : "");
}

function factTooltip(): string {
  return props.fact.tooltip ?? (props.fact.tooltipKey ? t(props.fact.tooltipKey, props.fact.tooltipValues) : "");
}

function geographyLabel(): string {
  const geography = props.fact.evidence.geography;
  if (!geography) return "";
  const key = geographyKeys[geography.level];
  return `${t(key)}${geography.name ? ` · ${geography.name}` : geography.code ? ` · ${geography.code}` : ""}`;
}
</script>

<template>
  <div
    class="nearby-neighborhood-score-fact"
    :class="[
      `nearby-neighborhood-score-fact--${fact.polarity}`,
      { 'nearby-neighborhood-score-fact--open': open },
    ]"
  >
    <button
      class="nearby-neighborhood-score-fact__trigger"
      type="button"
      :aria-describedby="`neighborhood-score-fact-${fact.id}`"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="nearby-neighborhood-score-fact__marker" aria-hidden="true">
        {{ fact.polarity === "positive" ? "+" : fact.polarity === "negative" ? "−" : "•" }}
      </span>
      <span>{{ factLabel() }}</span>
      <CircleHelp :size="15" aria-hidden="true" />
    </button>
    <div
      :id="`neighborhood-score-fact-${fact.id}`"
      class="nearby-neighborhood-score-fact__tooltip"
      role="tooltip"
    >
      <strong>{{ factTooltip() }}</strong>
      <dl>
        <div>
          <dt>{{ t("nearbyStations.neighborhoodScore.evidence.sourceLabel") }}</dt>
          <dd>
            <a v-if="fact.evidence.sourceUrl" :href="fact.evidence.sourceUrl" target="_blank" rel="noopener noreferrer">{{ fact.evidence.sourceName }}</a>
            <template v-else>{{ fact.evidence.sourceName ?? (fact.evidence.sourceKey ? t(fact.evidence.sourceKey) : "—") }}</template>
            <small v-if="fact.evidence.licence"> · {{ fact.evidence.licence }}</small>
          </dd>
        </div>
        <div>
          <dt>{{ t("nearbyStations.neighborhoodScore.evidence.ruleLabel") }}</dt>
          <dd>{{ fact.evidence.rule ?? (fact.evidence.ruleKey ? t(fact.evidence.ruleKey, fact.evidence.ruleValues) : "—") }}</dd>
        </div>
        <div v-if="fact.evidence.referencePeriod">
          <dt>{{ t("nearbyStations.neighborhoodScore.evidence.periodLabel") }}</dt>
          <dd>{{ fact.evidence.referencePeriod }}</dd>
        </div>
        <div v-if="fact.evidence.value !== undefined || fact.evidence.unit || fact.evidence.geography">
          <dt>{{ t("nearbyStations.neighborhoodScore.evidence.valueLabel") }}</dt>
          <dd>
            <span v-if="fact.evidence.value !== undefined">{{ fact.evidence.value }}<template v-if="fact.evidence.unit"> {{ fact.evidence.unit }}</template></span>
            <span v-if="fact.evidence.geography"> · {{ geographyLabel() }}</span>
          </dd>
        </div>
        <div>
          <dt>{{ t("nearbyStations.neighborhoodScore.evidence.proofLabel") }}</dt>
          <dd>{{ t(proofKey(fact.evidence.proof)) }}</dd>
        </div>
        <div>
          <dt>{{ t("nearbyStations.neighborhoodScore.evidence.freshnessLabel") }}</dt>
          <dd>{{ t("nearbyStations.neighborhoodScore.evidence.loadedAt", { time: d(fact.evidence.observedAt, { dateStyle: "short", timeStyle: "short" }) }) }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>

<style scoped>
.nearby-neighborhood-score-fact { position: relative; }
.nearby-neighborhood-score-fact__trigger { align-items: center; background: transparent; border-radius: 9px; color: var(--ink); display: flex; font-size: .8rem; gap: 7px; justify-content: flex-start; line-height: 1.35; min-height: 35px; padding: 6px 7px; text-align: left; width: 100%; }
.nearby-neighborhood-score-fact__trigger:hover, .nearby-neighborhood-score-fact__trigger:focus-visible { background: #f6f7fb; outline: 0; }
.nearby-neighborhood-score-fact__trigger > span:nth-child(2) { flex: 1; }
.nearby-neighborhood-score-fact__trigger > svg { color: #8490a4; flex: 0 0 auto; }
.nearby-neighborhood-score-fact__marker { align-items: center; border-radius: 999px; display: inline-flex; flex: 0 0 auto; font-size: .72rem; font-weight: 950; height: 19px; justify-content: center; width: 19px; }
.nearby-neighborhood-score-fact--positive .nearby-neighborhood-score-fact__marker { background: #e3f5e9; color: #17864c; }
.nearby-neighborhood-score-fact--negative .nearby-neighborhood-score-fact__marker { background: #fff0e8; color: #b74b24; }
.nearby-neighborhood-score-fact--neutral .nearby-neighborhood-score-fact__marker { background: #eef2f7; color: #64748b; }
.nearby-neighborhood-score-fact__tooltip { background: #fff; border: 1px solid rgba(16,35,63,.16); border-radius: 11px; box-shadow: 0 14px 30px rgba(16,35,63,.16); color: #344054; left: 0; max-width: min(380px, calc(100vw - 42px)); opacity: 0; padding: 11px 12px; pointer-events: none; position: absolute; top: calc(100% + 4px); transform: translateY(-3px); transition: opacity .14s ease, transform .14s ease, visibility .14s ease; visibility: hidden; width: max-content; z-index: 8; }
.nearby-neighborhood-score-fact:hover .nearby-neighborhood-score-fact__tooltip, .nearby-neighborhood-score-fact:focus-within .nearby-neighborhood-score-fact__tooltip, .nearby-neighborhood-score-fact--open .nearby-neighborhood-score-fact__tooltip { opacity: 1; pointer-events: auto; transform: translateY(0); visibility: visible; }
.nearby-neighborhood-score-fact__tooltip strong { color: var(--ink); display: block; font-size: .78rem; line-height: 1.35; max-width: 355px; }
.nearby-neighborhood-score-fact__tooltip dl { display: grid; gap: 5px; margin: 9px 0 0; }
.nearby-neighborhood-score-fact__tooltip dl > div { display: grid; gap: 2px; grid-template-columns: auto 1fr; }
.nearby-neighborhood-score-fact__tooltip dt { color: #8490a4; font-size: .64rem; font-weight: 850; }
.nearby-neighborhood-score-fact__tooltip dd { color: #344054; font-size: .68rem; margin: 0; }
@media (max-width: 680px) {
  .nearby-neighborhood-score-fact__tooltip { left: 0; max-width: none; position: relative; top: auto; transform: none; width: auto; }
  .nearby-neighborhood-score-fact:hover .nearby-neighborhood-score-fact__tooltip { opacity: 0; pointer-events: none; visibility: hidden; }
  .nearby-neighborhood-score-fact:focus-within .nearby-neighborhood-score-fact__tooltip, .nearby-neighborhood-score-fact--open .nearby-neighborhood-score-fact__tooltip { opacity: 1; pointer-events: auto; visibility: visible; }
}
</style>

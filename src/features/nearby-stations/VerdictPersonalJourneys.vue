<script setup lang="ts">
import { computed, ref } from "vue";
import { BookUser, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import AppModal from "../../components/AppModal.vue";
import AdressBook from "../address-book/AdressBook.vue";
import type { AddressBookEntry } from "../address-book/addressBook";
import NearbyNeighborhoodScoreFact from "./NearbyNeighborhoodScoreFact.vue";
import type { VerdictPersonalJourneys } from "./useVerdictPersonalJourneys";
import { DEFAULT_PERSONAL_JOURNEY_THRESHOLDS, personalJourneyFact, validPersonalJourneyThresholds, type PersonalJourneyResult } from "./neighborhood/personalJourneys";

const props = defineProps<{ journeys: VerdictPersonalJourneys }>();
const { t } = useI18n();
const directoryOpen = ref(false);
const selected = ref<AddressBookEntry>();
const positive = ref(DEFAULT_PERSONAL_JOURNEY_THRESHOLDS.positiveBelowMinutes);
const neutral = ref(DEFAULT_PERSONAL_JOURNEY_THRESHOLDS.neutralThroughMinutes);
const expanded = ref<string>();
const valid = computed(() => validPersonalJourneyThresholds({ positiveBelowMinutes: positive.value, neutralThroughMinutes: neutral.value }));

function choose(entry: AddressBookEntry): void {
  directoryOpen.value = false;
  selected.value = entry;
  const existing = props.journeys.rows.value.find(row => row.destinationId === entry.id);
  positive.value = existing?.positiveBelowMinutes ?? DEFAULT_PERSONAL_JOURNEY_THRESHOLDS.positiveBelowMinutes;
  neutral.value = existing?.neutralThroughMinutes ?? DEFAULT_PERSONAL_JOURNEY_THRESHOLDS.neutralThroughMinutes;
}
function edit(row: PersonalJourneyResult): void {
  if (!row.destination) return;
  selected.value = row.destination;
  positive.value = row.positiveBelowMinutes;
  neutral.value = row.neutralThroughMinutes;
}
function save(): void {
  if (!selected.value || !valid.value) return;
  props.journeys.save(selected.value, { positiveBelowMinutes: positive.value, neutralThroughMinutes: neutral.value });
  selected.value = undefined;
}
</script>

<template>
  <section class="verdict-personal-journeys" data-testid="verdict-personal-journeys" :aria-busy="journeys.loading.value">
    <header>
      <h4>{{ t('nearbyStations.neighborhoodScore.personalJourneys.title') }}</h4>
      <button type="button" class="icon-button" data-testid="personal-journey-add" :aria-label="t('nearbyStations.neighborhoodScore.personalJourneys.add')" :title="t('nearbyStations.neighborhoodScore.personalJourneys.add')" @click="directoryOpen = true"><Plus :size="19" /></button>
    </header>
    <p v-if="journeys.loading.value" role="status" data-testid="personal-journeys-loading"><LoaderCircle class="verdict-personal-journeys__spinner" :size="17" aria-hidden="true" />{{ t('nearbyStations.neighborhoodScore.personalJourneys.loadingAddresses') }}</p>
    <div v-if="journeys.hasError.value" role="alert" class="verdict-personal-journeys__error">
      <p>{{ t(journeys.directoryError.value ? 'nearbyStations.neighborhoodScore.personalJourneys.directoryError' : journeys.settingsError.value ? 'nearbyStations.neighborhoodScore.personalJourneys.settingsError' : 'nearbyStations.neighborhoodScore.personalJourneys.routingError') }}</p>
      <button v-if="!journeys.settingsError.value" type="button" class="button-secondary" @click="journeys.retry()">{{ t('common.actions.retry') }}</button>
    </div>
    <p v-if="!journeys.loading.value && !journeys.hasError.value && !journeys.rows.value.length" data-testid="personal-journeys-empty">{{ t('nearbyStations.neighborhoodScore.personalJourneys.empty') }}</p>
    <div v-for="row in journeys.rows.value" :key="row.id" class="verdict-personal-journeys__row" :data-status="row.status" data-testid="personal-journey-row">
      <div class="verdict-personal-journeys__result">
        <small v-if="row.commute" class="verdict-personal-journeys__source"><BookUser :size="14" aria-hidden="true" />{{ t('nearbyStations.neighborhoodScore.personalJourneys.commute', { origin: row.origin?.label ?? '', destination: row.destination?.name ?? '' }) }}</small>
        <NearbyNeighborhoodScoreFact :fact="personalJourneyFact(row)" :open="expanded === row.id" @toggle="expanded = expanded === row.id ? undefined : row.id" />
      </div>
      <button v-if="row.destination" type="button" class="icon-button" :aria-label="t('nearbyStations.neighborhoodScore.personalJourneys.edit', { destination: row.destination.name })" @click="edit(row)"><Pencil :size="16" /></button>
      <button type="button" class="icon-button" data-testid="personal-journey-remove" :aria-label="t('nearbyStations.neighborhoodScore.personalJourneys.remove', { destination: row.destination?.name ?? row.destinationId })" @click="journeys.remove(row)"><Trash2 :size="17" /></button>
    </div>
  </section>
  <AdressBook :open="directoryOpen" selection-mode selection-target="destination" :selection-description="t('nearbyStations.neighborhoodScore.personalJourneys.selection')" @close="directoryOpen = false" @select="choose" />
  <AppModal :open="Boolean(selected)" :title="t('nearbyStations.neighborhoodScore.personalJourneys.thresholdTitle')" @close="selected = undefined">
    <form class="verdict-personal-journeys__form" @submit.prevent="save">
      <p>{{ selected?.name }}</p>
      <label>{{ t('nearbyStations.neighborhoodScore.personalJourneys.positiveBelow') }}<input v-model.number="positive" type="number" min="1" step="any" required data-testid="personal-journey-positive" /></label>
      <label>{{ t('nearbyStations.neighborhoodScore.personalJourneys.neutralThrough') }}<input v-model.number="neutral" type="number" :min="positive || 1" step="any" required data-testid="personal-journey-neutral" /></label>
      <p>{{ t('nearbyStations.neighborhoodScore.personalJourneys.rule', { positive, neutral }) }}</p>
      <p v-if="!valid" role="alert">{{ t('nearbyStations.neighborhoodScore.personalJourneys.invalidThresholds') }}</p>
      <button type="submit" :disabled="!valid" data-testid="personal-journey-save">{{ t('common.actions.confirm') }}</button>
    </form>
  </AppModal>
</template>

<style scoped>
.verdict-personal-journeys { border-block: 1px solid var(--border); padding-block: 12px; margin-block: 12px; }
.verdict-personal-journeys > header, .verdict-personal-journeys > p, .verdict-personal-journeys__source { display: flex; align-items: center; gap: 8px; }
.verdict-personal-journeys > header { justify-content: space-between; }
.verdict-personal-journeys h4 { margin: 0; color: var(--ink); }
.verdict-personal-journeys p { font-size: .85rem; color: var(--muted); }
.verdict-personal-journeys__row { display: flex; align-items: flex-start; gap: 6px; padding-block: 6px; }
.verdict-personal-journeys__result { flex: 1; min-width: 0; }
.verdict-personal-journeys__source { color: var(--muted); margin-bottom: 5px; overflow-wrap: anywhere; }
.verdict-personal-journeys__error p { color: var(--danger, #b42318); }
.verdict-personal-journeys__spinner { animation: personal-journey-spin 1s linear infinite; }
.verdict-personal-journeys__form { display: grid; gap: 16px; }
.verdict-personal-journeys__form label { display: grid; gap: 6px; }
.verdict-personal-journeys__form input { box-sizing: border-box; width: 100%; min-height: 44px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; font: inherit; }
@keyframes personal-journey-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .verdict-personal-journeys__spinner { animation: none; } }
</style>

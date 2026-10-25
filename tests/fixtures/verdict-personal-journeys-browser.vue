<script setup lang="ts">
// Explicitly labelled deterministic browser harness. Never shipped as an application route.
import { computed, ref } from "vue";
import { useAddressBook } from "../../src/features/address-book/addressBook";
import { useAppSettings } from "../../src/features/app-settings/appSettings";
import Card from "../../src/features/nearby-stations/NearbyNeighborhoodScoreCard.vue";
import Panel from "../../src/features/nearby-stations/VerdictPersonalJourneys.vue";
import { useVerdictPersonalJourneys } from "../../src/features/nearby-stations/useVerdictPersonalJourneys";
import { buildNeighborhoodScore } from "../../src/features/nearby-stations/neighborhood";
import type { NearbyJourney } from "../../src/features/nearby-stations/nearbyHeavyTransports";
const directory = useAddressBook();
const settings = useAppSettings();
const originalRoles = directory.entries.value.filter(entry => !entry.id.startsWith("lot03-")).map(entry => ({ id: entry.id, isPrimary: entry.isPrimary, isWorkplace: entry.isWorkplace }));
const scenario = ref("ready");
let release: (() => void) | undefined;
const journey: NearbyJourney = { source: "gtfs", durationSeconds: 2700, sections: [{ type: "public_transport", mode: "METRO", lineCode: "4", durationSeconds: 2700 }] };
const journeys = useVerdictPersonalJourneys({
  origin: ref({ label: "Adresse Verdict de test", lon: 2.28, lat: 48.79 }), datetime: ref("20261023T090000"),
  provider: { async findJourneys() {
    if (scenario.value === "loading") await new Promise<void>(resolve => { release = resolve; });
    if (scenario.value === "error") throw new Error("Simulated provider outage");
    return scenario.value === "missing" ? [] : [journey];
  } },
});
function seed(commute: boolean) {
  for (const entry of directory.entries.value.filter(entry => entry.id.startsWith("lot03-"))) directory.removeEntry(entry.id);
  settings.updateSettings({ verdictPersonalJourneys: settings.settings.value.verdictPersonalJourneys.filter(preference => !preference.destinationId.startsWith("lot03-")) });
  if (commute) directory.addEntry({ id: "lot03-home", kind: "address", name: "Domicile de test", lon: 2.28, lat: 48.79, icon: "home", isPrimary: true });
  directory.addEntry({ id: "lot03-work", kind: "address", name: "Destination de test", lon: 2.32, lat: 48.84, icon: "work", isWorkplace: commute });
  journeys.retry();
}
function restore() {
  for (const entry of directory.entries.value.filter(entry => entry.id.startsWith("lot03-"))) directory.removeEntry(entry.id);
  for (const role of originalRoles) {
    const entry = directory.getEntry(role.id);
    if (entry) directory.updateEntry({ ...entry, isPrimary: role.isPrimary, isWorkplace: role.isWorkplace });
  }
  settings.updateSettings({ verdictPersonalJourneys: settings.settings.value.verdictPersonalJourneys.filter(preference => !preference.destinationId.startsWith("lot03-")) });
}
const result = computed(() => buildNeighborhoodScore({ stations: [], stationsLoaded: true, places: [], placesLoaded: false, personalJourneys: journeys.rows.value }));
const cardResult = computed(() => ({ ...result.value, categories: result.value.categories.map(category => ({ ...category,
  positiveFacts: category.positiveFacts.filter(fact => !fact.family.startsWith("personal-journey:")),
  negativeFacts: category.negativeFacts.filter(fact => !fact.family.startsWith("personal-journey:")),
  neutralFacts: category.neutralFacts.filter(fact => !fact.family.startsWith("personal-journey:")),
})) }));
const criteria = computed(() => [{ id: "transport" as const, status: journeys.loading.value ? "loading" as const : "ready" as const, confidence: 1, reasons: [], datasets: journeys.datasets.value }]);
</script>
<template>
  <main style="max-width: 960px; margin: 20px auto; padding: 16px">
    <h1>Lot 03 — validation sur données de test</h1>
    <p>Les 45 minutes de cette page sont simulées pour tester les interactions et les seuils.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <button @click="seed(false)">Annuaire sans domicile/travail</button>
      <button @click="seed(true)">Annuaire domicile + travail</button>
      <label>État du fournisseur <select v-model="scenario" aria-label="État du fournisseur" @change="journeys.retry()"><option value="ready">Succès</option><option value="missing">Aucun trajet</option><option value="error">Erreur</option><option value="loading">Chargement suspendu</option></select></label>
      <button @click="release?.()">Terminer le chargement</button>
      <button @click="restore">Nettoyer les données de test</button>
    </div>
    <Card :result="cardResult" :criteria="criteria" directory-url="/nearby-stations"><template #personal-journeys><Panel :journeys="journeys" /></template></Card>
  </main>
</template>

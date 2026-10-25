<script setup lang="ts">
import { ref } from "vue";
import AnnualRidershipStationCard from "../../src/features/line-map/AnnualRidershipStationCard.vue";
import NearbyRealEstateControls from "../../src/features/nearby-stations/NearbyRealEstateControls.vue";
import ResponsiveSidePanel from "../../src/components/ResponsiveSidePanel.vue";
import type { AnnualRidershipRankingScope, AnnualRidershipStationResponse } from "../../src/types/ridership";
import type { DvfComparisonScope } from "../../src/services/real-estate/compiledRealEstate";
import type { BottomSheetStage } from "../../src/components/draggableBottomSheet";
const open = ref(false);
const stage = ref<BottomSheetStage>("mid");
const scope = ref<AnnualRidershipRankingScope>("network");
const reference = ref<DvfComparisonScope>("city");
const measure = ref<"median" | "mean">("median");
const mode = ref<"prices" | "liquidity">("prices");
const station: AnnualRidershipStationResponse = {
  id: "station:lot08-fixture", name: "Station de validation", lineIds: [], measures: [], sources: [], rankings: {},
  primary: { value: 8765, unit: "entries", metric: "annual_station_entries", year: 2024, status: "official", sourceIds: ["idfm-rail-validations"], sourceRecordIds: [] },
};
</script>
<template>
  <main>
    <h1>Lot 08 — fixture navigateur — données factices</h1>
    <p>Vérification des vrais composants. Aucun résultat de transport ou immobilier réel.</p>
    <button @click="open = true">Ouvrir les contrôles de validation</button>
    <output>scope={{ scope }} · reference={{ reference }} · measure={{ measure }} · stage={{ stage }}</output>
    <ResponsiveSidePanel :open="open" title="Contrôles de validation" mobile-sheet :mobile-sheet-stage="stage" @mobile-sheet-stage-change="stage = $event" @close="open = false">
      <div class="fixture-content">
        <AnnualRidershipStationCard :station="station" :scope="scope" :scope-options="[{ value: 'network', label: 'Réseau de test' }, { value: 'mode', label: 'Mode de test' }, { value: 'line', label: 'Ligne de test' }]" @update:scope="scope = $event" />
        <NearbyRealEstateControls enabled :mode="mode" :reference="reference" :measure="measure" reference-label="Référence de test" @update:mode="mode = $event" @update:reference="reference = $event" @update:measure="measure = $event" />
        <label>Focus suivant <input placeholder="Saisie de validation" /></label>
        <p v-for="index in 15" :key="index">Contenu défilant de validation {{ index }}</p>
      </div>
    </ResponsiveSidePanel>
  </main>
</template>
<style scoped>
main { padding: 20px; }
output { display: block; margin: 12px 0; }
.fixture-content { padding: 16px; display: grid; gap: 20px; }
</style>

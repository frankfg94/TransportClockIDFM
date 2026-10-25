<script setup lang="ts">
import { ref } from "vue";
import DraggableBottomSheet from "../../src/components/DraggableBottomSheet.vue";
import ResponsiveSidePanel from "../../src/components/ResponsiveSidePanel.vue";
import type { BottomSheetStage } from "../../src/components/draggableBottomSheet";
const basicOpen = ref(false);
const customOpen = ref(false);
const responsiveOpen = ref(false);
const responsiveStage = ref<BottomSheetStage>("mid");
</script>

<template>
  <main class="sheet-fixture">
    <h1>Validation du conteneur générique</h1>
    <button data-testid="sheet-fixture-open" @click="basicOpen = true">Ouvrir avec un seul slot</button>
    <button data-testid="sheet-fixture-custom" @click="customOpen = true">Ouvrir les slots personnalisés</button>
    <button data-testid="sheet-fixture-responsive" @click="responsiveOpen = true">Ouvrir le panneau responsive</button>
    <p>Le contenu de ces panneaux est uniquement fourni par les slots du parent.</p>
    <DraggableBottomSheet v-if="basicOpen" @close="basicOpen = false">
      <div class="sheet-fixture__content">
        <h2>Contenu transmis par le slot</h2>
        <label>Saisie conservée <input data-testid="sheet-fixture-input" /></label>
        <ol><li v-for="index in 40" :key="index">Élément de validation {{ index }}</li></ol>
      </div>
    </DraggableBottomSheet>
    <DraggableBottomSheet v-model:open="customOpen" title="Fiche personnalisée">
      <template #header><h2>En-tête fourni par le parent</h2></template>
      <div class="sheet-fixture__content"><p>Corps indépendant de la carte.</p></div>
      <template #footer><button data-testid="sheet-fixture-footer-close" @click="customOpen = false">Fermer depuis le footer</button></template>
    </DraggableBottomSheet>
    <ResponsiveSidePanel :open="responsiveOpen" title="Panneau adaptatif" mobile-sheet
      :mobile-sheet-stage="responsiveStage" @mobile-sheet-stage-change="responsiveStage = $event"
      @close="responsiveOpen = false">
      <div class="sheet-fixture__content"><p>La même fiche sur ordinateur et mobile.</p></div>
    </ResponsiveSidePanel>
  </main>
</template>

<style scoped>
.sheet-fixture { min-height: 100dvh; padding: 20px; }
.sheet-fixture > button { display: block; margin: 12px 0; }
.sheet-fixture__content { padding: 16px; }
.sheet-fixture__content li { min-height: 48px; }
.sheet-fixture__content input { display: block; width: 100%; }
</style>

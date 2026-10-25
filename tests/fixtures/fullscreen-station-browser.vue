<script setup lang="ts">
// Test-only host for web and Android swipes. Uses the production panel and live GTFS provider.
import { ref } from "vue";
import FullscreenStationPanel from "../../src/components/FullscreenStationPanel.vue";
import { transitBoards } from "../../src/config/transitBoards";
const board = transitBoards[0]!;
const open = ref(true);
const refreshed = ref(0);
const alarm = ref("");
const touchEvents = ref(0);
const lastTouchTrusted = ref(false);
function recordTouch(event: TouchEvent): void {
  touchEvents.value++;
  lastTouchTrusted.value = event.isTrusted;
}
const directionId = ref<string>();
const design = ref<"dense-list" | "all-directions" | "double-stop" | "home-card">("dense-list");
const anchor = Date.now();
const directions = board.directionGroups.map((direction, index) => ({
  ...direction,
  departures: Array.from({ length: 20 }, (_, item) => ({
    id: `fixture-${index}-${item}`, waitLabel: String(item * 3 + index + 1),
    destination: direction.label, mission: `TEST ${index * 20 + item + 1}`,
    departureTime: new Date(anchor + (item * 3 + index + 1) * 60_000).toISOString(),
    meta: `Départ de test ${index * 20 + item + 1} / 60`,
  })),
}));
</script>
<template>
  <main style="min-height:2500px; padding:80px 20px" data-testid="fullscreen-fixture-background" @touchstart.capture="recordTouch">
    <h1>Lot 11 — validation de 60 départs synthétiques</h1>
    <p>Horaires : fournisseur GTFS réel, ligne et station du tableau configuré.</p>
    <button @click="open = true">Ouvrir la liste dense</button>
    <p data-testid="fullscreen-fixture-refreshes">Rafraîchissements : {{ refreshed }}</p>
    <p data-testid="fullscreen-fixture-alarm">Alarme : {{ alarm }}</p>
    <p data-testid="fullscreen-fixture-touch">Touches : {{ touchEvents }} / trusted : {{ lastTouchTrusted }}</p>
    <FullscreenStationPanel
      v-if="open"
      :station-name="board.title" :station-id="board.schedule?.stopAreaRef"
      :line-id="board.schedule?.lineRef ?? board.line.ref"
      :line-name="board.line.longName" :line-short-name="board.line.shortName"
      :line-color="board.line.color" :line-text-color="board.line.textColor"
      :transport-mode="board.line.mode" :directions="directions"
      :design="design" :panam-direction-id="directionId" :keep-screen-on="false"
      @close="open = false" @refresh="refreshed++"
      @schedule-alarm="alarm = $event.departureId"
      @change-design="design = $event.design; directionId = $event.panamDirectionId"
    />
  </main>
</template>

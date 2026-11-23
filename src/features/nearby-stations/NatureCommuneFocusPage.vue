<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import type { GreenMapReference, GreenPoint } from "../../../shared/natureInCity";
import { useI18n } from "../../i18n";
import NeighborhoodGreeneryMap from "./NeighborhoodGreeneryMap.vue";

const props = defineProps<{
  reference: Extract<GreenMapReference, { scope: "commune" }>;
  communeName: string;
  origin?: GreenPoint;
}>();
const { t } = useI18n();
const router = useRouter();
const title = computed(() => t("nearbyStations.comparison.focusTitle", { commune: props.communeName }));

function leaveFocus() {
  // Replace the focused URL so browser Back returns to the comparison that opened it.
  void router.replace({ path: "/map", query: {} });
}
</script>

<template>
  <main class="nature-commune-focus" :aria-label="title">
    <header class="nature-commune-focus__header">
      <button type="button" @click="leaveFocus">{{ t("nearbyStations.comparison.focusBack") }}</button>
      <div>
        <h1>{{ title }}</h1>
        <p>{{ t("nearbyStations.comparison.focusDescription") }}</p>
      </div>
      <span class="nature-commune-focus__legend"><i aria-hidden="true" />{{ t("nearbyStations.comparison.canopyLegend") }}</span>
    </header>
    <section class="nature-commune-focus__map" :aria-label="title">
      <NeighborhoodGreeneryMap :reference="reference" :origin="origin" :map-label="title" expanded />
    </section>
  </main>
</template>

<style scoped>
.nature-commune-focus { display: grid; grid-template-rows: auto minmax(0, 1fr); width: 100%; height: 100dvh; min-height: 480px; overflow: hidden; background: var(--surface); color: var(--ink); }
.nature-commune-focus__header { position: relative; z-index: 2; display: flex; align-items: center; gap: 14px; min-height: 82px; padding: 12px clamp(12px, 3vw, 28px); border-bottom: 1px solid var(--border); background: var(--surface); }
.nature-commune-focus__header button { flex: 0 0 auto; min-height: 40px; padding: 7px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-soft); color: var(--ink); font: inherit; cursor: pointer; }
.nature-commune-focus__header button:focus-visible { outline: 3px solid #eea417; outline-offset: 2px; }
.nature-commune-focus__header h1 { margin: 0; font-size: clamp(1rem, 2.2vw, 1.3rem); }
.nature-commune-focus__header p { margin: 3px 0 0; color: var(--muted); font-size: .84rem; }
.nature-commune-focus__legend { display: inline-flex; align-items: center; gap: 7px; margin-inline-start: auto; padding: 7px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-soft); font-size: .85rem; }
.nature-commune-focus__legend i { width: 17px; height: 17px; border: 1px solid #0d5a37; background: #137a46; }
.nature-commune-focus__map { min-height: 0; position: relative; }
@media (max-width: 640px) {
  .nature-commune-focus__header { align-items: flex-start; flex-wrap: wrap; gap: 7px 10px; }
  .nature-commune-focus__header > div { flex: 1 1 180px; }
  .nature-commune-focus__legend { margin-inline-start: 0; }
}
</style>

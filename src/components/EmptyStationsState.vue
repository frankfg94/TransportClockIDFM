<script setup lang="ts">
import { Info, MapPinPlus, Plus } from "lucide-vue-next";
import { useI18n } from "../i18n";

defineProps<{
  placeLabel: string;
}>();

const emit = defineEmits<{
  addStation: [];
  addNearby: [];
}>();

const { t } = useI18n();
</script>

<template>
  <section class="empty-stations" aria-labelledby="empty-stations-title">
    <img
      alt=""
      class="empty-stations__image"
      src="/images/no_stations_illustration.png"
    />
    <div class="empty-stations__copy">
      <h2 id="empty-stations-title">
        {{ t("emptyStations.title") }}
      </h2>
      <p>
        {{ t("emptyStations.body") }}
      </p>
    </div>
    <div class="empty-stations__actions">
      <button type="button" @click="emit('addStation')">
        <Plus aria-hidden="true" />
        {{ t("emptyStations.addStation") }}
      </button>
      <button class="button-secondary" type="button" @click="emit('addNearby')">
        <MapPinPlus aria-hidden="true" />
        {{ t("nearbyStations.addAroundPlace") }}
      </button>
    </div>
    <p class="empty-stations__hint">
      <Info :size="17" aria-hidden="true" />
      {{ t("emptyStations.hint", { place: placeLabel }) }}
    </p>
  </section>
</template>

<style scoped>
.empty-stations__actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
@media (max-width: 520px) { .empty-stations__actions { align-items: stretch; flex-direction: column; width: 100%; } }
</style>

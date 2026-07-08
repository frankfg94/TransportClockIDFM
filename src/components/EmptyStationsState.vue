<script setup lang="ts">
import { Info, Plus } from "lucide-vue-next";
import { useI18n } from "../i18n";

defineProps<{
  placeLabel: string;
}>();

const emit = defineEmits<{
  addStation: [];
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
    <button type="button" @click="emit('addStation')">
      <Plus aria-hidden="true" />
      {{ t("emptyStations.addStation") }}
    </button>
    <p class="empty-stations__hint">
      <Info :size="17" aria-hidden="true" />
      {{ t("emptyStations.hint", { place: placeLabel }) }}
    </p>
  </section>
</template>

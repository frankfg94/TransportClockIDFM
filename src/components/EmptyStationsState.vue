<script setup lang="ts">
import { Info, Plus } from "lucide-vue-next";

defineProps<{
  placeLabel: string;
}>();

const emit = defineEmits<{
  addStation: [];
}>();
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
        Aucune station suivie pour le moment
      </h2>
      <p>
        Ajoutez votre première station pour voir les prochains passages ici.
      </p>
    </div>
    <button type="button" @click="emit('addStation')">
      <Plus aria-hidden="true" />
      Ajouter une station
    </button>
    <p class="empty-stations__hint">
      <Info :size="17" aria-hidden="true" />
      {{ placeLabel }} aura sa propre liste de stations.
    </p>
  </section>
</template>

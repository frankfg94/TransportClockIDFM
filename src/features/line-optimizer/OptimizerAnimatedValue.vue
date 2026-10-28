<script setup lang="ts">
import { ref, watch } from "vue";
const props = defineProps<{ value: string; itinerary: string }>();
const revision = ref(0);
watch(() => [props.value, props.itinerary] as const, ([value, itinerary], [oldValue, oldItinerary]) => {
  if (itinerary && itinerary === oldItinerary && value !== oldValue) revision.value++;
});
</script>
<template><strong><span :key="revision" :class="{ 'optimizer-value-update': revision > 0 }">{{ value }}</span></strong></template>
<style scoped>
.optimizer-value-update { display: inline-block; animation: optimizer-value-pop 240ms ease-out; }
@keyframes optimizer-value-pop { from { opacity: .5; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .optimizer-value-update { animation: none; } }
</style>

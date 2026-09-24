<script setup lang="ts">
import { LoaderCircle, TriangleAlert } from "lucide-vue-next";

defineProps<{
  label: string;
  busy?: boolean;
}>();
</script>

<template>
  <main
    class="transport-map-page-loading"
    :role="busy === false ? 'alert' : 'status'"
    :aria-live="busy === false ? 'assertive' : 'polite'"
    :aria-busy="busy === false ? 'false' : 'true'"
  >
    <LoaderCircle
      v-if="busy !== false"
      class="transport-map-page-loading__icon transport-map-page-loading__icon--spinning"
      :size="20"
      aria-hidden="true"
    />
    <TriangleAlert v-else class="transport-map-page-loading__icon" :size="20" aria-hidden="true" />
    <span>{{ label }}</span>
  </main>
</template>

<style scoped>
.transport-map-page-loading {
  align-items: center;
  background: var(--surface-soft, #f8fafc);
  color: var(--ink, #0f172a);
  display: flex;
  gap: 10px;
  justify-content: center;
  min-height: 100dvh;
  padding: 24px;
}

.transport-map-page-loading__icon {
  flex: 0 0 auto;
}

.transport-map-page-loading__icon--spinning {
  animation: transport-map-page-loading-spin 1s linear infinite;
}

@keyframes transport-map-page-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .transport-map-page-loading__icon--spinning {
    animation: none;
  }
}
</style>

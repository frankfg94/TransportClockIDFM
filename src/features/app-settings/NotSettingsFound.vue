<script setup lang="ts">
import { Search } from "lucide-vue-next";

defineProps<{
  description: string;
  title: string;
}>();
</script>

<template>
  <section
    class="not-settings-found"
    data-settings-no-results
    role="status"
    aria-labelledby="not-settings-found-title"
  >
    <Search :size="30" aria-hidden="true" />
    <div>
      <h2 id="not-settings-found-title">{{ title }}</h2>
      <p>{{ description }}</p>
    </div>
  </section>
</template>

<style scoped>
.not-settings-found {
  align-items: center;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 18px;
  color: var(--muted);
  display: flex;
  gap: 16px;
  margin-top: 18px;
  padding: 28px 24px;
}

.not-settings-found svg {
  color: var(--idfm-blue);
  flex: 0 0 auto;
}

.not-settings-found h2 {
  color: var(--ink);
  font-size: 1.2rem;
  margin: 0;
}

.not-settings-found p {
  font-weight: 700;
  line-height: 1.45;
  margin: 6px 0 0;
}

@media (max-width: 520px) {
  .not-settings-found {
    align-items: flex-start;
  }
}
</style>

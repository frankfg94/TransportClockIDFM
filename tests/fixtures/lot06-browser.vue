<script setup lang="ts">
// Browser-only validation harness: real datasets and UI, manually delayed HTTP
// completions. The banner makes the artificial delay explicit.
import { onBeforeUnmount, ref } from "vue";
import GlobalTransportPlan from "../../src/features/line-map/GlobalTransportPlan.vue";
const held = ref(true);
const pending = ref<string[]>([]);
const releases = new Set<() => void>();
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const response = await originalFetch(input, init);
  const url = String(input);
  if (held.value && (url.includes("/data/places/") || url.endsWith("/api/iris"))) {
    pending.value = [...pending.value, url];
    await new Promise<void>((resolve) => {
      const finish = () => {
        releases.delete(finish);
        pending.value = pending.value.filter(value => value !== url);
        resolve();
      };
      releases.add(finish);
      init?.signal?.addEventListener("abort", finish, { once: true });
    });
  }
  return response;
};
function release(): void { held.value = false; for (const finish of [...releases]) finish(); }
onBeforeUnmount(() => { release(); globalThis.fetch = originalFetch; });
</script>
<template>
  <div style="position:fixed;left:120px;top:4px;z-index:50000;background:#fff6d6;border:1px solid #92400e;padding:8px;max-width:720px;font-size:12px">
    <strong>Lot 06 — données réelles, délai HTTP contrôlé</strong>
    <button @click="release">Terminer les réponses retenues</button>
    <span> {{ held ? 'Délai actif' : 'Réponses libérées' }} · {{ pending.length }} réponses retenues</span>
  </div>
  <GlobalTransportPlan experience="next" />
</template>

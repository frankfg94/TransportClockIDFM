<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";

withDefaults(
  defineProps<{
    eyebrow: string;
    title: string;
    titleId: string;
    panelOpen: boolean;
    panelClass?: string;
  }>(),
  {
    panelClass: "",
  },
);

const emit = defineEmits<{
  toggle: [];
}>();
</script>

<template>
  <section
    class="settings-panel"
    :class="[panelClass, { 'settings-panel--open': panelOpen }]"
    :aria-labelledby="titleId"
    v-bind="$attrs"
  >
    <div class="settings-panel__heading">
      <button
        class="settings-panel__trigger"
        type="button"
        :aria-expanded="panelOpen"
        @click="emit('toggle')"
      >
        <div>
          <p class="eyebrow">{{ eyebrow }}</p>
          <h2 :id="titleId">{{ title }}</h2>
        </div>
        <ChevronDown :size="22" aria-hidden="true" />
      </button>
      <slot name="heading-actions" />
    </div>

    <slot />
  </section>
</template>

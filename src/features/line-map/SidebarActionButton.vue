<script setup lang="ts">
import type { Component } from "vue";

defineOptions({ inheritAttrs: false });

defineProps<{
  prefixIcon?: Component;
  suffixIcon?: Component;
}>();
</script>

<template>
  <button v-bind="$attrs" class="sidebar-action-button">
    <component
      v-if="prefixIcon"
      :is="prefixIcon"
      class="sidebar-action-button__icon sidebar-action-button__icon--prefix"
      aria-hidden="true"
    />
    <slot />
    <component
      v-if="suffixIcon"
      :is="suffixIcon"
      class="sidebar-action-button__icon sidebar-action-button__icon--suffix"
      aria-hidden="true"
    />
  </button>
</template>

<style scoped>
.sidebar-action-button {
  width: 100%;
}

.sidebar-action-button__icon {
  flex: 0 0 auto;
  height: 18px;
  width: 18px;
}

.sidebar-action-button__icon--suffix {
  height: 15px;
  margin-left: auto;
  width: 15px;
}
</style>

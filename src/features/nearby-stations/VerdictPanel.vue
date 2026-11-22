<script setup lang="ts">
import { Maximize2 } from "lucide-vue-next";
import AppModal from "../../components/AppModal.vue";

defineProps<{ title: string; expandLabel: string; disabled?: boolean }>();
const open = defineModel<boolean>({ required: true });
</script>

<template>
  <button type="button" class="icon-button verdict-panel-expand" :title="expandLabel"
    :aria-label="expandLabel" aria-haspopup="dialog" :disabled="disabled" @click="open = true">
    <Maximize2 :size="16" aria-hidden="true" />
  </button>
  <AppModal :open="open" :title="title" panel-class="verdict-panel-fullscreen" @close="open = false">
    <div v-if="$slots.controls" class="verdict-panel-controls"><slot name="controls" /></div>
    <div v-if="open" class="verdict-panel-content"><slot /></div>
  </AppModal>
</template>

<style>
html:has(.modal-backdrop > .verdict-panel-fullscreen),
body:has(.modal-backdrop > .verdict-panel-fullscreen) { scrollbar-gutter: auto; }
.modal-backdrop:has(> .verdict-panel-fullscreen) { padding: 0; }
.verdict-panel-fullscreen.modal-panel {
  width: 100%; max-width: none; height: 100dvh; max-height: none;
  border-radius: 0; display: flex; flex-direction: column;
}
.verdict-panel-fullscreen > .app-modal__body {
  display: flex;
  flex: 1;
  gap: 0;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}
.verdict-panel-controls {
  flex: 0 0 clamp(17rem, 27vw, 23rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  border-inline-end: 1px solid var(--border);
}
.verdict-panel-content { flex: 1; min-width: 0; min-height: 0; }
.verdict-panel-expand:disabled { opacity: .4; cursor: default; }

@media (max-width: 680px) {
  .verdict-panel-fullscreen > .app-modal__body { flex-direction: column; }
  .verdict-panel-controls {
    flex: 0 1 auto;
    max-height: 36%;
    border-inline-end: 0;
    border-bottom: 1px solid var(--border);
  }
}
</style>

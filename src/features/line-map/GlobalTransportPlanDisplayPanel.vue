<template>
  <aside
    class="global-transport-plan__display-panel"
    data-global-map-display-panel
    @click.stop
    @pointerdown.stop
  >
    <button
      type="button"
      class="global-transport-plan__display-panel-header"
      :aria-expanded="expanded"
      :aria-controls="expanded ? 'global-map-display-controls' : undefined"
      @click="emit('toggle')"
    >
      <span>
        <Eye :size="16" aria-hidden="true" />
        {{ t("lineMap.picker.display") }}
      </span>
      <Minus v-if="expanded" :size="15" aria-hidden="true" />
      <Plus v-else :size="15" aria-hidden="true" />
    </button>
    <LineMapDisplayControls
      v-if="expanded"
      id="global-map-display-controls"
      variant="global"
      :available-modes="availableModes"
      :selected-modes="selectedModes"
      @update:selected-modes="emit('update:selected-modes', $event)"
    />
  </aside>
</template>

<script setup lang="ts">
import { Eye, Minus, Plus } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import LineMapDisplayControls from "./LineMapDisplayControls.vue";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";

defineProps<{
  expanded: boolean;
  availableModes: GlobalMapMode[];
  selectedModes: GlobalMapMode[];
}>();

const emit = defineEmits<{
  toggle: [];
  "update:selected-modes": [modes: GlobalMapMode[]];
}>();

const { t } = useI18n();
</script>

<style scoped>
.global-transport-plan__display-panel {
  position: absolute;
  z-index: 5;
  bottom: 44px;
  right: 16px;
  width: min(270px, calc(100% - 32px));
  overflow: hidden;
  border: 1px solid rgba(100, 116, 139, 0.24);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(12px);
}
.global-transport-plan__display-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 38px;
  padding: 8px 11px;
  border: 0;
  border-bottom: 1px solid rgba(100, 116, 139, 0.16);
  background: transparent;
  color: #18233f;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 850;
  cursor: pointer;
}
.global-transport-plan__display-panel-header > span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.global-transport-plan__display-panel-header:hover,
.global-transport-plan__display-panel-header:focus-visible {
  background: rgba(241, 245, 249, 0.78);
  outline: 0;
}
.global-transport-plan__display-panel :deep(.line-map-display-panel__content--global) {
  padding: 10px;
}
@media (max-width: 700px) {
  .global-transport-plan__display-panel {
    display: none;
  }
}
</style>

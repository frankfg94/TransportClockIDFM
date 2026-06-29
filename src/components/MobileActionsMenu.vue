<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { EllipsisVertical } from "lucide-vue-next";
import ContextMenu from "./ContextMenu.vue";

const props = withDefaults(
  defineProps<{
    ariaLabel?: string;
    menuId?: string;
  }>(),
  {
    ariaLabel: "Options",
  },
);

const trigger = ref<HTMLElement>();
const isOpen = ref(false);
const generatedId = useId();
const resolvedMenuId = computed(
  () => props.menuId ?? `mobile-actions-menu-${generatedId}`,
);

function close(): void {
  isOpen.value = false;
}

function toggle(): void {
  isOpen.value = !isOpen.value;
}

</script>

<template>
  <div
    class="pattern-flow-mobile-actions"
    :class="{ 'pattern-flow-mobile-actions--open': isOpen }"
    @click.stop
    @keydown.esc.stop="close"
  >
    <button
      ref="trigger"
      class="pattern-flow-mobile-actions__trigger"
      type="button"
      :aria-expanded="isOpen"
      :aria-controls="resolvedMenuId"
      :aria-label="ariaLabel"
      @click.stop="toggle"
    >
      <EllipsisVertical aria-hidden="true" />
    </button>
    <ContextMenu
      :id="resolvedMenuId"
      v-model:open="isOpen"
      :anchor="trigger"
      class="pattern-flow-mobile-actions__menu"
      close-on-outside-click
      :teleport="false"
    >
      <template #default="{ close: closeMenu }">
        <slot :close="closeMenu"></slot>
      </template>
    </ContextMenu>
  </div>
</template>

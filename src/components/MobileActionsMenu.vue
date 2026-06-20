<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";
import { EllipsisVertical } from "lucide-vue-next";

const props = withDefaults(
  defineProps<{
    ariaLabel?: string;
    menuId?: string;
  }>(),
  {
    ariaLabel: "Options",
  },
);

const root = ref<HTMLElement>();
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

function closeOnOutsidePointer(event: PointerEvent): void {
  if (!isOpen.value || !(event.target instanceof Node)) {
    return;
  }

  if (!root.value?.contains(event.target)) {
    close();
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", closeOnOutsidePointer);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeOnOutsidePointer);
});
</script>

<template>
  <div
    ref="root"
    class="pattern-flow-mobile-actions"
    :class="{ 'pattern-flow-mobile-actions--open': isOpen }"
    @click.stop
    @keydown.esc.stop="close"
  >
    <button
      class="pattern-flow-mobile-actions__trigger"
      type="button"
      :aria-expanded="isOpen"
      :aria-controls="resolvedMenuId"
      :aria-label="ariaLabel"
      @click.stop="toggle"
    >
      <EllipsisVertical aria-hidden="true" />
    </button>
    <Transition name="pattern-flow-mobile-actions-menu">
      <div
        v-if="isOpen"
        :id="resolvedMenuId"
        class="pattern-flow-mobile-actions__menu"
      >
        <slot :close="close"></slot>
      </div>
    </Transition>
  </div>
</template>

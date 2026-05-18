<script setup lang="ts">
import LineIconBadge from "./LineIconBadge.vue";
import type { TransitBoardConfig } from "../types/transit";

defineProps<{
  boards: TransitBoardConfig[];
  visibleBoardIds: string[];
}>();

const emit = defineEmits<{
  toggle: [boardId: string];
}>();

function isVisible(boardId: string, visibleBoardIds: string[]): boolean {
  return visibleBoardIds.includes(boardId);
}
</script>

<template>
  <div class="board-toggles" aria-label="Affichage des tableaux">
    <button
      v-for="board in boards"
      :key="board.id"
      class="switch-control"
      :class="{ 'switch-control--active': isVisible(board.id, visibleBoardIds) }"
      type="button"
      role="switch"
      :aria-checked="isVisible(board.id, visibleBoardIds)"
      @click="emit('toggle', board.id)"
    >
      <span class="switch-control__line">
        <LineIconBadge :line="board.line" compact />
      </span>
      <span class="switch-control__label">{{ board.title }}</span>
      <span class="switch-control__track" aria-hidden="true">
        <span class="switch-control__thumb" />
      </span>
    </button>
  </div>
</template>


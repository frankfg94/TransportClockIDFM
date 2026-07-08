<script setup lang="ts">
import LineIconBadge from "./LineIconBadge.vue";
import { useI18n } from "../i18n";
import type { TransitBoardConfig } from "../types/transit";

defineProps<{
  boards: TransitBoardConfig[];
  visibleBoardIds: string[];
}>();

const emit = defineEmits<{
  toggle: [boardId: string];
}>();

const { t } = useI18n();

function isVisible(boardId: string, visibleBoardIds: string[]): boolean {
  return visibleBoardIds.includes(boardId);
}
</script>

<template>
  <div class="board-toggles" :aria-label="t('app.boardVisibilityAria')">
    <button
      v-for="board in boards"
      :key="board.id"
      class="switch-control"
      :class="{
        'switch-control--active': isVisible(board.id, visibleBoardIds),
      }"
      type="button"
      role="switch"
      :aria-checked="isVisible(board.id, visibleBoardIds)"
      @click="emit('toggle', board.id)"
      style="display: flex"
    >
      <span class="switch-control__line">
        <LineIconBadge :line="board.line" compact />
      </span>
      <span class="switch-control__label" style="flex-grow: 1">{{
        board.title
      }}</span>
      <span class="switch-control__track" aria-hidden="true">
        <span class="switch-control__thumb" />
      </span>
    </button>
  </div>
</template>

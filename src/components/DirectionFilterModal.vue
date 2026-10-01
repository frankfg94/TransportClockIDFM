<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import { X } from "lucide-vue-next";
import { useI18n } from "../i18n";
const props = withDefaults(
  defineProps<{
    open: boolean;
    directions: { id: string; label: string }[];
    hiddenDirectionIds?: string[];
    selectedDirectionId?: string;
    single?: boolean;
    stationName: string;
    lineName: string;
    lineColor?: string;
    darkTheme?: boolean;
  }>(),
  { hiddenDirectionIds: () => [], single: false, darkTheme: false },
);
const emit = defineEmits<{
  close: [];
  "update:hiddenDirectionIds": [ids: string[]];
  "select-direction": [id: string];
}>();
const { t } = useI18n();
const titleId = useId();
const dialog = ref<HTMLElement>();
let previousFocus: HTMLElement | null = null;
const visibleCount = computed(
  () => props.directions.filter((d) => !props.hiddenDirectionIds.includes(d.id)).length,
);
function checked(id: string): boolean {
  return props.single ? props.selectedDirectionId === id : !props.hiddenDirectionIds.includes(id);
}
function change(id: string, event: Event): void {
  if (props.single) {
    emit("select-direction", id);
    return;
  }
  const show = (event.target as HTMLInputElement).checked;
  emit(
    "update:hiddenDirectionIds",
    show
      ? props.hiddenDirectionIds.filter((value) => value !== id)
      : [...new Set([...props.hiddenDirectionIds, id])],
  );
}
function keydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.stopPropagation();
    emit("close");
  }
  if (event.key !== "Tab") return;
  const nodes = Array.from(
    dialog.value?.querySelectorAll<HTMLElement>("button:not(:disabled), input") ?? [],
  );
  const first = nodes[0],
    last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      (
        dialog.value?.querySelector<HTMLElement>("input:checked") ??
        dialog.value?.querySelector<HTMLElement>("input, button")
      )?.focus();
    } else if (previousFocus?.isConnected) previousFocus.focus();
  },
);
</script>
<template>
  <Transition name="modal-scale">
    <div
      v-if="open"
      class="modal-backdrop direction-filter-backdrop"
      :class="{ 'direction-filter-backdrop--dark': darkTheme }"
      @click.self="emit('close')"
      @keydown="keydown"
    >
      <section
        ref="dialog"
        class="modal-panel board-direction-filter-modal"
        :style="{ '--line-color': lineColor }"
        aria-modal="true"
        role="dialog"
        :aria-labelledby="titleId"
      >
        <header class="modal-panel__header board-direction-filter-modal__header">
          <div>
            <p class="eyebrow">{{ t("board.directionFilter.eyebrow") }}</p>
            <h2 :id="titleId">
              {{ t(single ? "board.directionFilter.singleTitle" : "board.directionFilter.title") }}
            </h2>
            <span class="board-station-modal__subtitle">{{ lineName }} · {{ stationName }}</span>
          </div>
          <button
            class="icon-button"
            type="button"
            :aria-label="t('common.actions.close')"
            @click="emit('close')"
          >
            <X :size="20" aria-hidden="true" />
          </button>
        </header>
        <div class="direction-filter-summary">
          <strong>{{
            single
              ? t("board.directionFilter.singleHint")
              : t("board.directionFilter.summary", {
                  visible: visibleCount,
                  total: directions.length,
                })
          }}</strong>
        </div>
        <p v-if="single" class="direction-filter-mode-hint">
          {{ t("board.directionFilter.singleFiltersHint") }}
        </p>
        <div class="direction-filter-list">
          <label
            v-for="direction in directions"
            :key="direction.id"
            class="direction-filter-option"
            :class="{ 'direction-filter-option--hidden': !checked(direction.id) }"
          >
            <input
              :type="single ? 'radio' : 'checkbox'"
              :name="single ? titleId : undefined"
              :checked="checked(direction.id)"
              @change="change(direction.id, $event)"
            />
            <span
              class="direction-filter-option__check"
              :class="{ 'direction-filter-option__check--radio': single }"
              aria-hidden="true"
            ></span>
            <span class="direction-filter-option__content"
              ><strong>{{ direction.label }}</strong></span
            >
          </label>
        </div>
        <footer
          class="modal-panel__footer board-direction-filter-modal__footer"
          :class="{ 'board-direction-filter-modal__footer--single': single }"
        >
          <button
            v-if="!single"
            class="button-secondary"
            type="button"
            :disabled="visibleCount === directions.length"
            @click="emit('update:hiddenDirectionIds', [])"
          >
            {{ t("common.actions.showAll") }}
          </button>
          <button type="button" @click="emit('close')">
            {{ t("board.directionFilter.done") }}
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>
<style scoped>
.board-direction-filter-modal {
  width: min(460px, calc(100vw - 32px));
  max-height: min(720px, calc(100vh - 48px));
  overflow: hidden;
  padding: 0;
}

.board-direction-filter-modal__header {
  padding: 22px 24px 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.board-direction-filter-modal__header .eyebrow {
  color: var(--line-color);
}

.direction-filter-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 20px 0;
  padding: 12px 14px;
  border-radius: 16px;
}

.direction-filter-summary strong {
  min-width: 0;
  font-size: 0.9rem;
  font-weight: 700;
}

.direction-filter-summary span {
  flex-shrink: 0;
  color: rgba(226, 232, 240, 0.72);
  font-size: 0.78rem;
  font-weight: 600;
}

.direction-filter-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(420px, 52vh);
  overflow-y: auto;
  padding: 18px 20px 20px;
}

.direction-filter-list::-webkit-scrollbar {
  width: 8px;
}

.direction-filter-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.28);
}

.direction-filter-option {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 13px 14px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.025));
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    opacity 160ms ease,
    transform 160ms ease;
}

.direction-filter-option:hover {
  border-color: color-mix(in srgb, var(--line-color) 42%, rgba(148, 163, 184, 0.22));
}

.direction-filter-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.direction-filter-option__check {
  position: relative;
  width: 24px;
  height: 24px;
  border: 2px solid rgba(148, 163, 184, 0.48);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.72);
  transition:
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease;
}

.direction-filter-option input:focus-visible + .direction-filter-option__check {
  outline: 2px solid color-mix(in srgb, var(--line-color) 70%, white);
  outline-offset: 3px;
}

.direction-filter-option input:checked + .direction-filter-option__check {
  border-color: var(--line-color);
  background: var(--line-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--line-color) 18%, transparent);
}

.direction-filter-option input:checked + .direction-filter-option__check::after {
  content: "";
  position: absolute;
  left: 7px;
  top: 3px;
  width: 6px;
  height: 12px;
  border: solid currentColor;
  border-width: 0 2px 2px 0;
  color: white;
  transform: rotate(45deg);
}

.direction-filter-option__content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.direction-filter-option__content strong {
  overflow: hidden;
  color: var(--line-color);
  font-size: 0.98rem;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.direction-filter-option__content small {
  overflow: hidden;
  color: rgba(203, 213, 225, 0.68);
  font-size: 0.78rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-direction-filter-modal__footer {
  padding: 16px 20px 20px;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}

@media (max-width: 560px) {
  .board-direction-filter-modal {
    width: calc(100vw - 20px);
    max-height: calc(100vh - 24px);
  }

  .direction-filter-summary {
    align-items: flex-start;
    flex-direction: column;
  }

  .direction-filter-option {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .direction-filter-option__state {
    grid-column: 2;
    justify-self: start;
  }
}

.direction-filter-backdrop {
  z-index: 12060;
}
.direction-filter-mode-hint {
  margin: 0 24px;
  font-size: 0.85rem;
  color: var(--text-secondary, #64748b);
}
.direction-filter-option__check--radio {
  border-radius: 50%;
}
.direction-filter-backdrop--dark .board-direction-filter-modal {
  background: #101827;
  color: #f8fafc;
}
.direction-filter-backdrop--dark .direction-filter-mode-hint,
.direction-filter-backdrop--dark .board-station-modal__subtitle {
  color: #b3c3d9;
}
.direction-filter-backdrop--dark .direction-filter-option {
  background: #17243a;
}
.direction-filter-option__content strong {
  white-space: normal;
  overflow-wrap: anywhere;
}
.direction-filter-backdrop--dark .board-direction-filter-modal h2 {
  color: #f8fafc;
}
.board-direction-filter-modal__footer--single {
  justify-content: flex-end;
}
</style>

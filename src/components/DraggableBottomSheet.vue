<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type HTMLAttributes } from "vue";
import { useI18n } from "../i18n";
import type { BottomSheetStage } from "./draggableBottomSheet";
import { usePanelFocus } from "./usePanelFocus";

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{
  title?: string;
  closeLabel?: string;
  resizeLabel?: string;
  busy?: boolean;
  backdrop?: boolean;
  showCloseButton?: boolean;
  enabled?: boolean;
  unwrappedContent?: boolean;
  snapHeights?: (viewportHeight: number) => Record<BottomSheetStage, number>;
  dismissOnSwipe?: boolean;
  cycleStages?: boolean;
  handleAttrs?: HTMLAttributes | Record<`data-${string}`, unknown>;
  inactiveTransition?: string;
}>(), {
  title: "", closeLabel: "", resizeLabel: "",
  busy: false, backdrop: false, showCloseButton: true,
  enabled: true, unwrappedContent: false, dismissOnSwipe: true, cycleStages: false,
});
const open = defineModel<boolean>("open", { default: true });
const stage = defineModel<BottomSheetStage>("stage", { default: "mid" });
const emit = defineEmits<{ close: []; resize: [height: number, dragging: boolean] }>();
const { t } = useI18n();
const panel = ref<HTMLElement>();
defineExpose({ element: panel });
usePanelFocus(panel, () => open.value && props.enabled);
const accessibleTitle = computed(() => props.title || t("common.labels.panel"));
const resolvedCloseLabel = computed(() => props.closeLabel || t("common.actions.close"));
const viewportHeight = ref(720);
const heights = computed(() => props.snapHeights?.(viewportHeight.value));
const drag = reactive({ active: false, pointerId: -1, startY: 0, currentY: 0, startHeight: 0, height: 0 });
const panelStyle = computed(() => ({
  height: props.enabled && heights.value ? `${drag.active ? drag.height : heights.value[stage.value]}px` : undefined,
  "--bottom-sheet-drag-offset": drag.active && !heights.value
    ? `${Math.max(-90, Math.min(220, drag.currentY - drag.startY))}px` : "0px",
}));
let suppressHandleClick = false;
let suppressTimer: ReturnType<typeof setTimeout> | undefined;
let backdropEnabledAt = 0;

watch([open, () => props.enabled], () => {
  drag.active = false;
  drag.pointerId = -1;
  if (open.value) backdropEnabledAt = Date.now() + 350;
}, { immediate: true });
function updateViewport(): void {
  viewportHeight.value = Math.max(1, document.documentElement.clientHeight, window.innerHeight);
}
onMounted(() => {
  updateViewport();
  window.addEventListener("resize", updateViewport);
});
onBeforeUnmount(() => {
  clearTimeout(suppressTimer);
  window.removeEventListener("resize", updateViewport);
});

function close(): void {
  open.value = false;
  emit("close");
}
function closeFromBackdrop(): void {
  if (Date.now() >= backdropEnabledAt) close();
}
function toggleStage(): void {
  if (suppressHandleClick) return;
  stage.value = props.cycleStages
    ? ({ peek: "mid", mid: "full", full: "peek" } as const)[stage.value]
    : stage.value === "full" ? "mid" : "full";
}
function startDrag(event: PointerEvent): void {
  if (drag.active || event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
  drag.active = true;
  drag.pointerId = event.pointerId;
  drag.startY = drag.currentY = event.clientY;
  drag.startHeight = drag.height = panel.value?.getBoundingClientRect().height || heights.value?.[stage.value] || 0;
  emit("resize", drag.height, true);
  (event.currentTarget as HTMLElement)?.setPointerCapture?.(event.pointerId);
}
function moveDrag(event: PointerEvent): void {
  if (!drag.active || drag.pointerId !== event.pointerId) return;
  drag.currentY = event.clientY;
  if (heights.value) {
    const minimum = Math.max(0, heights.value.peek - Math.min(56, heights.value.peek / 3));
    drag.height = Math.max(minimum, Math.min(heights.value.full, drag.startHeight + drag.startY - event.clientY));
    emit("resize", drag.height, true);
  }
}
function releaseDrag(event: PointerEvent): void {
  drag.active = false;
  drag.pointerId = -1;
  const handle = event.currentTarget as HTMLElement;
  if (handle?.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
}
function finishDrag(event: PointerEvent): void {
  if (!drag.active || drag.pointerId !== event.pointerId) return;
  const delta = event.clientY - drag.startY;
  const height = drag.height;
  releaseDrag(event);
  if (heights.value) {
    const nearest = (["peek", "mid", "full"] as BottomSheetStage[]).reduce((closest, candidate) =>
      Math.abs(heights.value![candidate] - height) < Math.abs(heights.value![closest] - height) ? candidate : closest, "peek");
    stage.value = nearest;
    emit("resize", heights.value[nearest], false);
  }
  if (Math.abs(delta) < (heights.value ? 4 : 60)) return;
  suppressHandleClick = true;
  clearTimeout(suppressTimer);
  suppressTimer = setTimeout(() => { suppressHandleClick = false; }, 120);
  if (heights.value) return;
  if (delta < 0) stage.value = stage.value === "peek" ? "mid" : "full";
  else if (stage.value === "full") stage.value = "mid";
  else if (stage.value === "mid") stage.value = "peek";
  else if (props.dismissOnSwipe) close();
}
function cancelDrag(event: PointerEvent): void {
  if (drag.active && drag.pointerId === event.pointerId) {
    releaseDrag(event);
    emit("resize", heights.value?.[stage.value] || drag.startHeight, false);
  }
}
function handleKeydown(event: KeyboardEvent): void {
  if (!props.enabled) return;
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
}
</script>

<template>
  <Transition name="bottom-sheet-backdrop">
    <button v-if="open && enabled && backdrop" class="draggable-bottom-sheet__backdrop" type="button"
      tabindex="-1" :aria-label="resolvedCloseLabel" @click="closeFromBackdrop" />
  </Transition>
  <Transition :name="enabled ? 'bottom-sheet' : inactiveTransition">
    <aside v-if="open" ref="panel" v-bind="$attrs"
      :class="enabled ? ['draggable-bottom-sheet', `draggable-bottom-sheet--${stage}`, { 'draggable-bottom-sheet--dragging': drag.active }] : []"
      :style="panelStyle" role="complementary" :aria-label="$attrs['aria-label'] as string || accessibleTitle" :aria-busy="busy || undefined"
      tabindex="-1" :data-testid="enabled ? 'draggable-bottom-sheet' : undefined" @keydown="handleKeydown">
      <button v-if="enabled" v-bind="handleAttrs" class="draggable-bottom-sheet__drag-handle" type="button"
        :aria-label="resizeLabel || t('common.actions.resizePanel')" data-testid="draggable-bottom-sheet-drag-handle"
        @click="toggleStage" @pointerdown.prevent="startDrag" @pointermove.prevent="moveDrag"
        @pointerup.prevent="finishDrag" @pointercancel.prevent="cancelDrag" @lostpointercapture="cancelDrag">
        <span aria-hidden="true" />
      </button>
      <header v-if="enabled && (title || $slots.header || showCloseButton)" class="draggable-bottom-sheet__header">
        <slot name="header"><strong v-if="title">{{ title }}</strong></slot>
        <button v-if="showCloseButton" class="icon-button draggable-bottom-sheet__close" type="button"
          :aria-label="resolvedCloseLabel" data-testid="draggable-bottom-sheet-close" @click="close">
          <X aria-hidden="true" />
        </button>
      </header>
      <div :class="!enabled || unwrappedContent ? 'draggable-bottom-sheet__contents' : 'draggable-bottom-sheet__body'"><slot /></div>
      <footer v-if="enabled && $slots.footer" class="draggable-bottom-sheet__footer"><slot name="footer" /></footer>
    </aside>
  </Transition>
</template>

<style scoped>
.draggable-bottom-sheet__contents { display: contents; }
.draggable-bottom-sheet {
  position: fixed;
  inset: auto 0 0;
  z-index: 9401;
  display: grid;
  grid-template-areas: "handle" "header" "body" "footer";
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  width: 100%;
  height: 52dvh;
  min-height: min(180px, calc(100dvh - 10px));
  max-height: calc(100dvh - 10px);
  overflow: hidden;
  outline: none;
  border-radius: 24px 24px 0 0;
  background: var(--surface, #fff);
  color: var(--ink);
  box-shadow: 0 -24px 70px rgba(15, 23, 42, 0.24);
  transform: translateY(var(--bottom-sheet-drag-offset, 0px));
  transition: height 220ms cubic-bezier(0.22, 1, 0.36, 1), transform 180ms ease;
}
.draggable-bottom-sheet--peek { height: 28dvh; }
.draggable-bottom-sheet--full { height: 92dvh; }
.draggable-bottom-sheet--dragging { transition: none; }
.draggable-bottom-sheet__drag-handle {
  grid-area: handle;
  display: flex;
  align-items: center;
  justify-content: center;
  appearance: none;
  padding: 10px 0 6px;
  border: 0;
  background: transparent;
  cursor: grab;
  touch-action: none;
}
.draggable-bottom-sheet__drag-handle:active { cursor: grabbing; }
.draggable-bottom-sheet__drag-handle span {
  display: block;
  width: 48px;
  height: 5px;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.42);
}
.draggable-bottom-sheet__header {
  grid-area: header;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
  padding: 2px 12px 10px 18px;
  border-bottom: 1px solid rgba(16, 35, 63, 0.1);
}
.draggable-bottom-sheet__header strong { font-size: 0.92rem; font-weight: 950; }
.draggable-bottom-sheet__close { flex: 0 0 auto; width: 36px; height: 36px; min-height: 36px; margin-left: auto; }
.draggable-bottom-sheet__close svg { width: 18px; height: 18px; }
.draggable-bottom-sheet__body {
  grid-area: body;
  min-height: 0;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  overflow: auto;
  overscroll-behavior: contain;
}
.draggable-bottom-sheet__footer {
  grid-area: footer;
  padding: 14px 18px calc(14px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid rgba(16, 35, 63, 0.1);
}
.draggable-bottom-sheet__backdrop {
  position: fixed;
  inset: 0;
  z-index: 9400;
  width: 100%;
  padding: 0;
  border: 0;
  background: rgba(15, 23, 42, 0.4);
}
.bottom-sheet-enter-active, .bottom-sheet-leave-active { transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1); }
.bottom-sheet-enter-from, .bottom-sheet-leave-to { transform: translateY(100%); }
.bottom-sheet-backdrop-enter-active, .bottom-sheet-backdrop-leave-active { transition: opacity 180ms ease; }
.bottom-sheet-backdrop-enter-from, .bottom-sheet-backdrop-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .draggable-bottom-sheet, .bottom-sheet-enter-active, .bottom-sheet-leave-active,
  .bottom-sheet-backdrop-enter-active, .bottom-sheet-backdrop-leave-active { transition: none; }
}
</style>

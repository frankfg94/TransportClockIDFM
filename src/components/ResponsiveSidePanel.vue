<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "../i18n";
import DraggableBottomSheet from "./DraggableBottomSheet.vue";
import type { BottomSheetStage } from "./draggableBottomSheet";
import { usePanelFocus } from "./usePanelFocus";

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  closeLabel?: string;
  size?: "medium" | "large";
  busy?: boolean;
  mobileSheet?: boolean;
  mobileSheetStage?: BottomSheetStage;
  mobileSheetResizeLabel?: string;
  mobileBackdrop?: boolean;
}>(), {
  closeLabel: "", size: "medium", busy: false, mobileSheet: false,
  mobileSheetStage: "mid", mobileSheetResizeLabel: "", mobileBackdrop: false,
});
const emit = defineEmits<{ close: []; mobileSheetStageChange: [stage: BottomSheetStage] }>();
const { t } = useI18n();
const panel = ref<HTMLElement>();
const isOverlay = ref(false);
const isMobileViewport = ref(false);
const useSheet = computed(() => props.mobileSheet && isMobileViewport.value);
const resolvedCloseLabel = computed(() => props.closeLabel || t("common.actions.close"));
const { handleTab } = usePanelFocus(panel, () => props.open && !useSheet.value, () => isOverlay.value);
let overlayMedia: MediaQueryList | undefined;
let mobileMedia: MediaQueryList | undefined;
let backdropEnabledAt = 0;
watch(() => props.open, () => { if (props.open) backdropEnabledAt = Date.now() + 350; }, { immediate: true });

function syncOverlay(event: MediaQueryList | MediaQueryListEvent): void { isOverlay.value = event.matches; }
function syncMobile(event: MediaQueryList | MediaQueryListEvent): void { isMobileViewport.value = event.matches; }
onMounted(() => {
  overlayMedia = window.matchMedia("(max-width: 1100px)");
  mobileMedia = window.matchMedia("(max-width: 720px), (pointer: coarse)");
  syncOverlay(overlayMedia);
  syncMobile(mobileMedia);
  overlayMedia.addEventListener?.("change", syncOverlay);
  mobileMedia.addEventListener?.("change", syncMobile);
});
onBeforeUnmount(() => {
  overlayMedia?.removeEventListener?.("change", syncOverlay);
  mobileMedia?.removeEventListener?.("change", syncMobile);
});
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
  } else handleTab(event);
}
function closeFromBackdrop(): void { if (Date.now() >= backdropEnabledAt) emit("close"); }
</script>

<template>
  <DraggableBottomSheet v-if="useSheet" v-bind="$attrs" :open="open" :title="title"
    :close-label="resolvedCloseLabel" :resize-label="mobileSheetResizeLabel" :busy="busy"
    :stage="mobileSheetStage" :backdrop="mobileBackdrop" @close="emit('close')"
    @update:stage="emit('mobileSheetStageChange', $event)">
    <template v-if="$slots.header" #header><slot name="header" /></template>
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </DraggableBottomSheet>
  <template v-else>
    <Transition name="side-panel-backdrop">
      <button v-if="open" class="responsive-side-panel__backdrop" type="button" tabindex="-1"
        :aria-label="resolvedCloseLabel" @click="closeFromBackdrop" />
    </Transition>
    <Transition name="side-panel">
      <aside v-if="open" ref="panel" v-bind="$attrs" class="responsive-side-panel"
        :class="`responsive-side-panel--${size}`" :role="isOverlay ? 'dialog' : 'complementary'"
        :aria-modal="isOverlay ? 'true' : undefined" :aria-label="title" :aria-busy="busy || undefined"
        tabindex="-1" data-testid="responsive-side-panel" @keydown.stop="handleKeydown">
        <header class="responsive-side-panel__header">
          <slot name="header"><strong>{{ title }}</strong></slot>
          <button class="icon-button responsive-side-panel__close" type="button"
            :aria-label="resolvedCloseLabel" data-testid="responsive-side-panel-close" @click="emit('close')">
            <X aria-hidden="true" />
          </button>
        </header>
        <div class="responsive-side-panel__body"><slot /></div>
        <footer v-if="$slots.footer" class="responsive-side-panel__footer"><slot name="footer" /></footer>
      </aside>
    </Transition>
  </template>
</template>

<style scoped>
.responsive-side-panel {
  align-self: stretch;
  position: relative;
  z-index: 40;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  outline: none;
  border-left: 1px solid rgba(16, 35, 63, 0.12);
  background: var(--surface, #fff);
  box-shadow: -18px 0 46px rgba(16, 35, 63, 0.12);
  color: var(--ink);
}
.responsive-side-panel--medium { width: clamp(320px, 30vw, 400px); }
.responsive-side-panel--large { width: clamp(390px, 28vw, 500px); }
.responsive-side-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 54px;
  padding: 9px 12px 9px 18px;
  border-bottom: 1px solid rgba(16, 35, 63, 0.1);
}
.responsive-side-panel__header strong { font-size: 0.92rem; font-weight: 950; }
.responsive-side-panel__close { flex: 0 0 auto; width: 36px; height: 36px; min-height: 36px; }
.responsive-side-panel__close svg { width: 18px; height: 18px; }
.responsive-side-panel__body { min-height: 0; overflow: auto; overscroll-behavior: contain; }
.responsive-side-panel__footer { border-top: 1px solid rgba(16, 35, 63, 0.1); padding: 14px 18px; }
.responsive-side-panel__backdrop { display: none; }
.side-panel-enter-active, .side-panel-leave-active,
.side-panel-backdrop-enter-active, .side-panel-backdrop-leave-active {
  transition: opacity 180ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
.side-panel-enter-from, .side-panel-leave-to { opacity: 0; transform: translateX(100%); }
@media (max-width: 1100px) {
  .responsive-side-panel {
    position: fixed;
    inset: 0 0 0 auto;
    z-index: 9401;
    height: 100dvh;
    max-width: min(500px, calc(100vw - 48px));
    width: min(440px, calc(100vw - 48px));
  }
  .responsive-side-panel__backdrop {
    position: fixed;
    inset: 0;
    z-index: 9400;
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: rgba(15, 23, 42, 0.4);
  }
  .side-panel-backdrop-enter-from, .side-panel-backdrop-leave-to { opacity: 0; }
}
@media (max-width: 720px), (pointer: coarse) {
  .responsive-side-panel { border-left: 0; max-width: none; width: 100vw; }
}
@media (prefers-reduced-motion: reduce) {
  .side-panel-enter-active, .side-panel-leave-active,
  .side-panel-backdrop-enter-active, .side-panel-backdrop-leave-active { transition: none; }
}
</style>

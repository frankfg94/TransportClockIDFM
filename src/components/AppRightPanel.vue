<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "../i18n";

type MobileSheetStage = "peek" | "mid" | "full";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    closeLabel?: string;
    size?: "medium" | "large";
    busy?: boolean;
    mobileSheet?: boolean;
    mobileSheetStage?: MobileSheetStage;
    mobileSheetResizeLabel?: string;
  }>(),
  {
    closeLabel: "",
    size: "medium",
    busy: false,
    mobileSheet: false,
    mobileSheetStage: "mid",
    mobileSheetResizeLabel: "",
  },
);

const emit = defineEmits<{
  close: [];
  mobileSheetStageChange: [stage: MobileSheetStage];
}>();

const { t } = useI18n();
const panel = ref<HTMLElement>();
const isOverlay = ref(false);
const isMobileViewport = ref(false);
const mobileDrag = reactive({
  active: false,
  currentY: 0,
  pointerId: -1,
  startY: 0,
});
const suppressHandleClick = ref(false);
const resolvedCloseLabel = computed(() => props.closeLabel || t("common.actions.close"));
const isMobileSheet = computed(() => props.mobileSheet && isMobileViewport.value);
const isModalOverlay = computed(() => isOverlay.value && !isMobileSheet.value);
const panelStyle = computed(() => ({
  "--app-right-panel-drag-offset": mobileDrag.active
    ? `${Math.max(-90, Math.min(220, mobileDrag.currentY - mobileDrag.startY))}px`
    : "0px",
}));
let overlayMedia: MediaQueryList | undefined;
let mobileMedia: MediaQueryList | undefined;
let previouslyFocused: HTMLElement | undefined;
let backdropEnabledAt = 0;

watch(
  () => props.open,
  async (open) => {
    if (typeof document === "undefined") return;

    if (open) {
      backdropEnabledAt = Date.now() + 350;
      previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      await nextTick();
      if (!isMobileSheet.value) {
        panel.value?.focus({ preventScroll: true });
      }
      return;
    }

    restorePreviousFocus();
  },
  { immediate: true },
);

onMounted(() => {
  if (typeof window === "undefined") return;
  overlayMedia = window.matchMedia("(max-width: 1100px)");
  syncOverlayMode(overlayMedia);
  overlayMedia.addEventListener?.("change", syncOverlayMode);
  mobileMedia = window.matchMedia("(max-width: 720px)");
  syncMobileMode(mobileMedia);
  mobileMedia.addEventListener?.("change", syncMobileMode);
});

onBeforeUnmount(() => {
  overlayMedia?.removeEventListener?.("change", syncOverlayMode);
  mobileMedia?.removeEventListener?.("change", syncMobileMode);
  restorePreviousFocus();
});

function restorePreviousFocus(): void {
  previouslyFocused?.focus?.({ preventScroll: true });
  previouslyFocused = undefined;
}

function syncOverlayMode(event: MediaQueryList | MediaQueryListEvent): void {
  isOverlay.value = event.matches;
}

function syncMobileMode(event: MediaQueryList | MediaQueryListEvent): void {
  isMobileViewport.value = event.matches;
}

function closeFromBackdrop(): void {
  if (Date.now() < backdropEnabledAt) {
    return;
  }

  emit("close");
}

function toggleMobileSheetFromHandle(): void {
  if (suppressHandleClick.value) {
    suppressHandleClick.value = false;
    return;
  }

  emit("mobileSheetStageChange", props.mobileSheetStage === "full" ? "mid" : "full");
}

function startMobileSheetDrag(event: PointerEvent): void {
  if (event.button !== 0 && event.pointerType === "mouse") {
    return;
  }

  mobileDrag.active = true;
  mobileDrag.pointerId = event.pointerId;
  mobileDrag.startY = event.clientY;
  mobileDrag.currentY = event.clientY;

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
}

function moveMobileSheetDrag(event: PointerEvent): void {
  if (!mobileDrag.active || event.pointerId !== mobileDrag.pointerId) {
    return;
  }

  mobileDrag.currentY = event.clientY;
}

function finishMobileSheetDrag(event: PointerEvent): void {
  if (!mobileDrag.active || event.pointerId !== mobileDrag.pointerId) {
    return;
  }

  mobileDrag.currentY = event.clientY;
  const deltaY = mobileDrag.currentY - mobileDrag.startY;

  mobileDrag.active = false;
  mobileDrag.pointerId = -1;

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  if (Math.abs(deltaY) < 60) {
    return;
  }

  suppressHandleClick.value = true;
  window.setTimeout(() => {
    suppressHandleClick.value = false;
  }, 120);

  if (deltaY < 0) {
    emit("mobileSheetStageChange", props.mobileSheetStage === "peek" ? "mid" : "full");
    return;
  }

  if (props.mobileSheetStage === "full") {
    emit("mobileSheetStageChange", "mid");
  } else if (props.mobileSheetStage === "mid") {
    emit("mobileSheetStageChange", "peek");
  } else {
    emit("close");
  }
}

function cancelMobileSheetDrag(event: PointerEvent): void {
  if (!mobileDrag.active || event.pointerId !== mobileDrag.pointerId) {
    return;
  }

  mobileDrag.active = false;
  mobileDrag.pointerId = -1;
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }

  if (!isModalOverlay.value || event.key !== "Tab" || !panel.value) return;

  const focusable = Array.from(
    panel.value.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  );

  if (focusable.length === 0) {
    event.preventDefault();
    panel.value.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <Transition name="app-right-panel-backdrop">
    <button
      v-if="open"
      class="app-right-panel__backdrop"
      type="button"
      tabindex="-1"
      :aria-label="resolvedCloseLabel"
      :class="{ 'app-right-panel__backdrop--mobile-sheet': mobileSheet }"
      @click="closeFromBackdrop"
    ></button>
  </Transition>

  <Transition name="app-right-panel-slide">
    <aside
      v-if="open"
      ref="panel"
      class="app-right-panel"
      :class="[
        `app-right-panel--${size}`,
        {
          'app-right-panel--mobile-sheet': mobileSheet,
          [`app-right-panel--mobile-${mobileSheetStage}`]: mobileSheet,
          'app-right-panel--mobile-dragging': mobileSheet && mobileDrag.active,
        },
      ]"
      :style="panelStyle"
      :role="isModalOverlay ? 'dialog' : 'complementary'"
      :aria-modal="isModalOverlay ? 'true' : undefined"
      :aria-label="title"
      :aria-busy="busy || undefined"
      tabindex="-1"
      data-testid="app-right-panel"
      @keydown="handleKeydown"
    >
      <button
        v-if="mobileSheet"
        class="app-right-panel__drag-handle"
        type="button"
        :aria-label="mobileSheetResizeLabel || title"
        data-testid="app-right-panel-drag-handle"
        @click="toggleMobileSheetFromHandle"
        @pointerdown.prevent="startMobileSheetDrag"
        @pointermove.prevent="moveMobileSheetDrag"
        @pointerup.prevent="finishMobileSheetDrag"
        @pointercancel.prevent="cancelMobileSheetDrag"
      >
        <span aria-hidden="true"></span>
      </button>

      <header class="app-right-panel__header">
        <slot name="header">
          <strong>{{ title }}</strong>
        </slot>
        <button
          class="icon-button app-right-panel__close"
          type="button"
          :aria-label="resolvedCloseLabel"
          data-testid="app-right-panel-close"
          @click="emit('close')"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div class="app-right-panel__body">
        <slot />
      </div>

      <footer v-if="$slots.footer" class="app-right-panel__footer">
        <slot name="footer" />
      </footer>
    </aside>
  </Transition>
</template>

<style scoped>
.app-right-panel {
  align-self: stretch;
  background: var(--surface, #ffffff);
  border-left: 1px solid rgba(16, 35, 63, 0.12);
  box-shadow: -18px 0 46px rgba(16, 35, 63, 0.12);
  color: var(--ink);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
  min-width: 0;
  outline: none;
  overflow: hidden;
  position: relative;
  z-index: 40;
}

.app-right-panel--medium {
  width: clamp(320px, 30vw, 400px);
}

.app-right-panel--large {
  width: clamp(390px, 28vw, 500px);
}

.app-right-panel__header {
  align-items: center;
  border-bottom: 1px solid rgba(16, 35, 63, 0.1);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  min-height: 54px;
  padding: 9px 12px 9px 18px;
}

.app-right-panel__header strong {
  font-size: 0.92rem;
  font-weight: 950;
}

.app-right-panel__close {
  flex: 0 0 auto;
  height: 36px;
  min-height: 36px;
  width: 36px;
}

.app-right-panel__close svg {
  height: 18px;
  width: 18px;
}

.app-right-panel__body {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.app-right-panel__footer {
  border-top: 1px solid rgba(16, 35, 63, 0.1);
  padding: 14px 18px;
}

.app-right-panel__backdrop {
  display: none;
}

.app-right-panel__drag-handle {
  display: none;
}

.app-right-panel-slide-enter-active,
.app-right-panel-slide-leave-active,
.app-right-panel-backdrop-enter-active,
.app-right-panel-backdrop-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.app-right-panel-slide-enter-from,
.app-right-panel-slide-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

@media (max-width: 1100px) {
  .app-right-panel {
    bottom: 0;
    height: 100dvh;
    max-width: min(500px, calc(100vw - 48px));
    position: fixed;
    right: 0;
    top: 0;
    width: min(440px, calc(100vw - 48px));
    z-index: 9401;
  }

  .app-right-panel__backdrop {
    background: rgba(15, 23, 42, 0.4);
    border: 0;
    display: block;
    inset: 0;
    padding: 0;
    position: fixed;
    width: 100%;
    z-index: 9400;
  }

  .app-right-panel-backdrop-enter-from,
  .app-right-panel-backdrop-leave-to {
    opacity: 0;
  }
}

@media (max-width: 720px) {
  .app-right-panel {
    border-left: 0;
    max-width: none;
    width: 100vw;
  }

  .app-right-panel--mobile-sheet {
    border-radius: 24px 24px 0 0;
    bottom: 0;
    box-shadow: 0 -24px 70px rgba(15, 23, 42, 0.24);
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    height: 52dvh;
    max-height: calc(100dvh - 10px);
    min-height: 180px;
    overflow: hidden;
    top: auto;
    transform: translateY(var(--app-right-panel-drag-offset, 0px));
    transition:
      height 220ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 180ms ease;
  }

  .app-right-panel--mobile-peek {
    height: 28dvh;
  }

  .app-right-panel--mobile-mid {
    height: 52dvh;
  }

  .app-right-panel--mobile-full {
    height: 92dvh;
  }

  .app-right-panel--mobile-dragging {
    transition: none;
  }

  .app-right-panel__backdrop--mobile-sheet {
    display: none;
  }

  .app-right-panel__drag-handle {
    align-items: center;
    appearance: none;
    background: transparent;
    border: 0;
    cursor: grab;
    display: flex;
    justify-content: center;
    padding: 10px 0 6px;
    touch-action: none;
  }

  .app-right-panel__drag-handle:active {
    cursor: grabbing;
  }

  .app-right-panel__drag-handle span {
    background: rgba(100, 116, 139, 0.42);
    border-radius: 999px;
    display: block;
    height: 5px;
    width: 48px;
  }

  .app-right-panel--mobile-sheet .app-right-panel__header {
    min-height: 42px;
    padding: 2px 12px 10px 18px;
  }

  .app-right-panel--mobile-sheet.app-right-panel-slide-enter-from,
  .app-right-panel--mobile-sheet.app-right-panel-slide-leave-to {
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-right-panel-slide-enter-active,
  .app-right-panel-slide-leave-active,
  .app-right-panel-backdrop-enter-active,
  .app-right-panel-backdrop-leave-active {
    transition: none;
  }
}
</style>

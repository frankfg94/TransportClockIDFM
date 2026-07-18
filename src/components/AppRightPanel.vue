<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "../i18n";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    closeLabel?: string;
    size?: "medium" | "large";
    busy?: boolean;
  }>(),
  {
    closeLabel: "",
    size: "medium",
    busy: false,
  },
);

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const panel = ref<HTMLElement>();
const isOverlay = ref(false);
const resolvedCloseLabel = computed(
  () => props.closeLabel || t("common.actions.close"),
);
let overlayMedia: MediaQueryList | undefined;
let previouslyFocused: HTMLElement | undefined;

watch(
  () => props.open,
  async (open) => {
    if (typeof document === "undefined") return;

    if (open) {
      previouslyFocused =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : undefined;
      await nextTick();
      panel.value?.focus({ preventScroll: true });
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
});

onBeforeUnmount(() => {
  overlayMedia?.removeEventListener?.("change", syncOverlayMode);
  restorePreviousFocus();
});

function restorePreviousFocus(): void {
  previouslyFocused?.focus?.({ preventScroll: true });
  previouslyFocused = undefined;
}

function syncOverlayMode(event: MediaQueryList | MediaQueryListEvent): void {
  isOverlay.value = event.matches;
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }

  if (!isOverlay.value || event.key !== "Tab" || !panel.value) return;

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
      @click="emit('close')"
    ></button>
  </Transition>

  <Transition name="app-right-panel-slide">
    <aside
      v-if="open"
      ref="panel"
      class="app-right-panel"
      :class="`app-right-panel--${size}`"
      :role="isOverlay ? 'dialog' : 'complementary'"
      :aria-modal="isOverlay ? 'true' : undefined"
      :aria-label="title"
      :aria-busy="busy || undefined"
      tabindex="-1"
      data-testid="app-right-panel"
      @keydown="handleKeydown"
    >
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

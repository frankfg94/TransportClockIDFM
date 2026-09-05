<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useAttrs,
  watch,
} from "vue";

defineOptions({
  inheritAttrs: false,
});

type ContextMenuPlacement =
  | "bottom-end"
  | "bottom-start"
  | "top-end"
  | "top-start";

const props = withDefaults(
  defineProps<{
    open: boolean;
    anchor?: HTMLElement | null;
    point?: { x: number; y: number };
    closeOnOutsideClick?: boolean;
    offset?: number;
    placement?: ContextMenuPlacement;
    role?: string;
    ariaLabel?: string;
    teleport?: boolean;
    teleportTo?: string | HTMLElement;
    transitionName?: string;
    zIndex?: number;
  }>(),
  {
    closeOnOutsideClick: true,
    offset: 8,
    placement: "bottom-end",
    role: "menu",
    teleport: true,
    teleportTo: "body",
    transitionName: "context-menu",
    zIndex: 10_000,
  },
);

const emit = defineEmits<{
  "update:open": [open: boolean];
  close: [];
}>();

const attrs = useAttrs();
const panel = ref<HTMLElement>();
const positionStyle = ref<Record<string, string>>({});
const positioned = ref(false);
let animationFrame = 0;
let resizeObserver: ResizeObserver | undefined;

const panelAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;

  return rest;
});

const panelClasses = computed(() => ["context-menu", attrs.class]);

const panelStyle = computed(() => [
  {
    "--context-menu-z-index": String(props.zIndex),
    zIndex: String(props.zIndex),
    visibility: positioned.value ? "visible" : "hidden",
  },
  positionStyle.value,
  attrs.style,
]);
const teleportTarget = computed(() => {
  // A fullscreen element creates a top-layer boundary. Keep nearby-stations
  // menus inside its shell so they remain visible instead of being teleported
  // behind the fullscreen surface. The open dependency lets a selector that
  // is mounted after this component resolve on the first opening.
  if (!props.open || typeof document === "undefined") return "body";
  if (typeof props.teleportTo !== "string") return props.teleportTo;
  return document.querySelector(props.teleportTo) ? props.teleportTo : "body";
});

watch(
  () => [props.open, props.point?.x, props.point?.y, props.anchor] as const,
  ([open]) => {
    positioned.value = false;

    if (!open) {
      disconnectResizeObserver();
      return;
    }

    // Position immediately when the menu is already mounted (notably when a
    // point is supplied one tick after opening), then retry after Teleport has
    // committed the first layout box.
    updatePosition();
    syncResizeObserver();
    // A teleported menu can receive its first layout box one frame after the
    // opening render. Re-read it once the browser has committed that layout so
    // the first right-click is positioned exactly like subsequent clicks.
    queuePositionUpdate();
  },
  { flush: "post", immediate: true },
);

onMounted(() => {
  document.addEventListener("pointerdown", closeOnOutsideInteraction, true);
  document.addEventListener("click", closeOnOutsideInteraction, true);
  document.addEventListener("contextmenu", closeOnOutsideInteraction, true);
  document.addEventListener("touchstart", closeOnOutsideInteraction, {
    capture: true,
    passive: true,
  });
  window.addEventListener("resize", queuePositionUpdate);
  window.addEventListener("scroll", queuePositionUpdate, true);

  if (props.open) {
    updatePosition();
    syncResizeObserver();
    queuePositionUpdate();
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeOnOutsideInteraction, true);
  document.removeEventListener("click", closeOnOutsideInteraction, true);
  document.removeEventListener("contextmenu", closeOnOutsideInteraction, true);
  document.removeEventListener("touchstart", closeOnOutsideInteraction, true);
  window.removeEventListener("resize", queuePositionUpdate);
  window.removeEventListener("scroll", queuePositionUpdate, true);
  disconnectResizeObserver();

  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame);
  }
});

function close(): void {
  if (!props.open) {
    return;
  }

  emit("update:open", false);
  emit("close");
}

function closeOnOutsideInteraction(event: Event): void {
  if (!props.open || !props.closeOnOutsideClick || isEventInsideMenu(event)) {
    return;
  }

  close();
}

function isEventInsideMenu(event: Event): boolean {
  const target = event.target;
  const path = event.composedPath?.() ?? [];

  return [panel.value, props.anchor].some((element) => {
    if (!element) {
      return false;
    }

    if (path.includes(element)) {
      return true;
    }

    return target instanceof Node && element.contains(target);
  });
}

function queuePositionUpdate(): void {
  if (!props.open || typeof window === "undefined") {
    return;
  }

  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame);
  }

  animationFrame = window.requestAnimationFrame(() => {
    animationFrame = 0;
    updatePosition();
  });
}

function updatePosition(): void {
  if (typeof window === "undefined") {
    return;
  }

  const anchor = props.anchor;
  const point = props.point;
  const menu = panel.value;

  if ((!anchor && !point) || !menu) {
    positionStyle.value = {};
    positioned.value = true;
    return;
  }

  const menuRect = menu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const gutter = 8;
  const desiredTop = point
    ? point.y + props.offset
    : (() => {
        const anchorRect = anchor!.getBoundingClientRect();
        return props.placement.startsWith("top")
          ? anchorRect.top - menuRect.height - props.offset
          : anchorRect.bottom + props.offset;
      })();
  const desiredLeft = point
    ? point.x
    : (() => {
        const anchorRect = anchor!.getBoundingClientRect();
        return props.placement.endsWith("start")
          ? anchorRect.left
          : anchorRect.right - menuRect.width;
      })();
  const maxTop = Math.max(gutter, viewportHeight - menuRect.height - gutter);
  const maxLeft = Math.max(gutter, viewportWidth - menuRect.width - gutter);

  positionStyle.value = {
    bottom: "auto",
    left: `${clamp(desiredLeft, gutter, maxLeft)}px`,
    maxHeight: `${Math.max(120, viewportHeight - gutter * 2)}px`,
    position: "fixed",
    right: "auto",
    top: `${clamp(desiredTop, gutter, maxTop)}px`,
  };
  positioned.value = true;
}

function syncResizeObserver(): void {
  disconnectResizeObserver();

  if (
    !props.open ||
    typeof ResizeObserver === "undefined" ||
    !panel.value
  ) {
    return;
  }

  resizeObserver = new ResizeObserver(queuePositionUpdate);
  if (props.anchor) resizeObserver.observe(props.anchor);
  resizeObserver.observe(panel.value);
}

function disconnectResizeObserver(): void {
  resizeObserver?.disconnect();
  resizeObserver = undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
</script>

<template>
  <Teleport :to="teleportTarget" :disabled="!teleport">
    <Transition :name="transitionName">
      <div
        v-if="open"
        ref="panel"
        v-bind="panelAttrs"
        :aria-label="ariaLabel"
        :class="panelClasses"
        :role="role"
        :style="panelStyle"
        @keydown.esc.stop.prevent="close"
      >
        <slot :close="close"></slot>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.context-menu {
  align-items: stretch;
  background: #fff;
  border: 1px solid rgba(16, 35, 63, .14);
  border-radius: 12px;
  box-sizing: border-box;
  box-shadow: 0 14px 34px rgba(16, 35, 63, .2), 0 3px 8px rgba(16, 35, 63, .08);
  color: var(--ink, #18233f);
  display: grid;
  gap: 3px;
  max-width: calc(100vw - 16px);
  min-width: 220px;
  overflow-y: auto;
  padding: 6px;
  z-index: var(--context-menu-z-index);
}

.context-menu :deep(button),
.context-menu :deep([role="menuitem"]) {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 8px;
  color: inherit;
  display: flex;
  font: inherit;
  font-size: .78rem;
  gap: 8px;
  justify-content: flex-start;
  min-height: 36px;
  padding: 7px 9px;
  text-align: left;
  width: 100%;
}

.context-menu :deep(button:hover),
.context-menu :deep(button:focus-visible),
.context-menu :deep([role="menuitem"]:hover),
.context-menu :deep([role="menuitem"]:focus-visible) {
  background: #f1efff;
  color: #4034df;
  outline: 0;
}

.context-menu :deep(.context-menu-danger) {
  color: #b42318;
}

.context-menu :deep(.context-menu-danger:hover),
.context-menu :deep(.context-menu-danger:focus-visible) {
  background: #fff1f0;
  color: #b42318;
}

.context-menu-enter-active,
.context-menu-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.context-menu-enter-from,
.context-menu-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}
</style>

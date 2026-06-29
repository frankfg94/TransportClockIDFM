<script setup lang="ts">
import {
  computed,
  nextTick,
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
    closeOnOutsideClick?: boolean;
    offset?: number;
    placement?: ContextMenuPlacement;
    role?: string;
    ariaLabel?: string;
    teleport?: boolean;
    transitionName?: string;
    zIndex?: number;
  }>(),
  {
    closeOnOutsideClick: true,
    offset: 8,
    placement: "bottom-end",
    role: "menu",
    teleport: true,
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

watch(
  () => props.open,
  async (open) => {
    positioned.value = false;

    if (!open) {
      disconnectResizeObserver();
      return;
    }

    await nextTick();
    updatePosition();
    syncResizeObserver();
  },
  { flush: "post", immediate: true },
);

onMounted(() => {
  document.addEventListener("pointerdown", closeOnOutsideInteraction, true);
  document.addEventListener("click", closeOnOutsideInteraction, true);
  document.addEventListener("touchstart", closeOnOutsideInteraction, {
    capture: true,
    passive: true,
  });
  window.addEventListener("resize", queuePositionUpdate);
  window.addEventListener("scroll", queuePositionUpdate, true);

  if (props.open) {
    updatePosition();
    syncResizeObserver();
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeOnOutsideInteraction, true);
  document.removeEventListener("click", closeOnOutsideInteraction, true);
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
  const menu = panel.value;

  if (!anchor || !menu) {
    positionStyle.value = {};
    positioned.value = true;
    return;
  }

  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const gutter = 8;
  const opensAbove = props.placement.startsWith("top");
  const alignsStart = props.placement.endsWith("start");
  const desiredTop = opensAbove
    ? anchorRect.top - menuRect.height - props.offset
    : anchorRect.bottom + props.offset;
  const desiredLeft = alignsStart
    ? anchorRect.left
    : anchorRect.right - menuRect.width;
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
    !props.anchor ||
    !panel.value
  ) {
    return;
  }

  resizeObserver = new ResizeObserver(queuePositionUpdate);
  resizeObserver.observe(props.anchor);
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
  <Teleport to="body" :disabled="!teleport">
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
  box-sizing: border-box;
  max-width: calc(100vw - 16px);
  overflow-y: auto;
  z-index: var(--context-menu-z-index);
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

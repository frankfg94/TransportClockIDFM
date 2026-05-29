<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Activity,
  Home,
  MoreVertical,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-vue-next";
import { useRoute } from "#imports";
import { useAppSettings } from "./appSettings";

const AUTO_HIDE_MS = 60_000;

const route = useRoute();
const { settings } = useAppSettings();
const hidden = ref(false);
const menuOpen = ref(false);
const navigationRoot = ref<HTMLElement>();
let hideTimer: number | undefined;

const primaryLinks = [
  { to: "/", label: "Stations", icon: Home },
  { to: "/traffic", label: "Info trafic", icon: TriangleAlert },
];

const secondaryLinks = [
  { to: "/settings", label: "Paramètres", icon: SlidersHorizontal },
  { to: "/health", label: "Health", icon: Activity },
];

const shouldAutoHide = computed(
  () => settings.value.navigationAutoHide === "1m",
);
const secondaryActive = computed(() =>
  secondaryLinks.some((link) => isActive(link.to)),
);

onMounted(() => {
  registerActivityListeners();
  document.addEventListener("pointerdown", closeMenuOnOutsidePointer);
  resetAutoHideTimer();
});

onBeforeUnmount(() => {
  unregisterActivityListeners();
  document.removeEventListener("pointerdown", closeMenuOnOutsidePointer);
  clearAutoHideTimer();
});

watch(shouldAutoHide, () => {
  hidden.value = false;
  resetAutoHideTimer();
});

function isActive(path: string): boolean {
  return path === "/" ? route.path === "/" : route.path.startsWith(path);
}

function revealNavigation(): void {
  hidden.value = false;
  resetAutoHideTimer();
}

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
  revealNavigation();
}

function closeMenu(): void {
  menuOpen.value = false;
}

function closeMenuOnOutsidePointer(event: PointerEvent): void {
  if (!navigationRoot.value?.contains(event.target as Node)) {
    closeMenu();
  }
}

function resetAutoHideTimer(): void {
  clearAutoHideTimer();

  if (!shouldAutoHide.value) {
    hidden.value = false;
    return;
  }

  hideTimer = window.setTimeout(() => {
    hidden.value = true;
    closeMenu();
  }, AUTO_HIDE_MS);
}

function clearAutoHideTimer(): void {
  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }
}

function registerActivityListeners(): void {
  window.addEventListener("pointermove", revealNavigation, { passive: true });
  window.addEventListener("pointerdown", revealNavigation, { passive: true });
  window.addEventListener("keydown", revealNavigation);
  window.addEventListener("focus", revealNavigation);
  window.addEventListener("touchstart", revealNavigation, { passive: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

function unregisterActivityListeners(): void {
  window.removeEventListener("pointermove", revealNavigation);
  window.removeEventListener("pointerdown", revealNavigation);
  window.removeEventListener("keydown", revealNavigation);
  window.removeEventListener("focus", revealNavigation);
  window.removeEventListener("touchstart", revealNavigation);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    revealNavigation();
  }
}
</script>

<template>
  <nav
    ref="navigationRoot"
    class="app-navigation"
    :class="{ 'app-navigation--hidden': hidden && shouldAutoHide }"
    aria-label="Navigation principale"
    @focusin="revealNavigation"
    @pointerenter="revealNavigation"
  >
    <NuxtLink
      v-for="link in primaryLinks"
      :key="link.to"
      class="app-navigation__link"
      :class="{ 'app-navigation__link--active': isActive(link.to) }"
      :to="link.to"
    >
      <component :is="link.icon" aria-hidden="true" />
      <span>{{ link.label }}</span>
    </NuxtLink>

    <div class="app-navigation__menu">
      <button
        class="app-navigation__menu-button"
        :class="{ 'app-navigation__menu-button--active': secondaryActive }"
        type="button"
        :aria-expanded="menuOpen"
        aria-label="Ouvrir les pages secondaires"
        @click="toggleMenu"
      >
        <MoreVertical aria-hidden="true" />
      </button>

      <Transition name="app-navigation-menu">
        <div
          v-if="menuOpen"
          class="app-navigation__menu-panel"
          role="menu"
          aria-label="Pages secondaires"
        >
          <NuxtLink
            v-for="link in secondaryLinks"
            :key="link.to"
            class="app-navigation__menu-link"
            :class="{ 'app-navigation__menu-link--active': isActive(link.to) }"
            :to="link.to"
            role="menuitem"
            @click="closeMenu"
          >
            <component :is="link.icon" aria-hidden="true" />
            <span>{{ link.label }}</span>
          </NuxtLink>
        </div>
      </Transition>
    </div>
  </nav>
</template>

<style scoped>
.app-navigation {
  align-items: center;
  backdrop-filter: blur(18px);
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 999px;
  bottom: 18px;
  box-shadow:
    0 22px 50px rgba(16, 35, 63, 0.16),
    0 2px 10px rgba(16, 35, 63, 0.08);
  display: inline-flex;
  gap: 6px;
  left: 50%;
  padding: 7px;
  position: fixed;
  transform: translateX(-50%);
  transition:
    opacity 220ms ease,
    transform 220ms ease;
  z-index: 9000;
}

.app-navigation--hidden {
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 18px);
}

.app-navigation__link {
  align-items: center;
  border-radius: 999px;
  color: var(--muted);
  display: inline-flex;
  font-weight: 900;
  gap: 8px;
  min-height: 42px;
  padding: 0 16px;
  text-decoration: none;
  transition:
    background 160ms ease,
    color 160ms ease;
}

.app-navigation__link svg {
  height: 18px;
  width: 18px;
}

.app-navigation__link:hover,
.app-navigation__link--active {
  background: #111827;
  color: #ffffff;
}

.app-navigation__menu {
  position: relative;
}

.app-navigation__menu-button {
  align-items: center;
  background: transparent;
  border-radius: 999px;
  color: var(--muted);
  display: inline-flex;
  height: 42px;
  justify-content: center;
  min-height: 42px;
  padding: 0;
  width: 42px;
}

.app-navigation__menu-button:hover,
.app-navigation__menu-button[aria-expanded="true"],
.app-navigation__menu-button--active {
  background: #111827;
  color: #ffffff;
  transform: none;
}

.app-navigation__menu-button svg {
  height: 20px;
  width: 20px;
}

.app-navigation__menu-panel {
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 8px;
  bottom: calc(100% + 12px);
  box-shadow:
    0 22px 50px rgba(16, 35, 63, 0.16),
    0 2px 10px rgba(16, 35, 63, 0.08);
  display: grid;
  gap: 4px;
  min-width: 190px;
  padding: 8px;
  position: absolute;
  right: 0;
}

.app-navigation__menu-link {
  align-items: center;
  border-radius: 7px;
  color: var(--ink);
  display: flex;
  font-weight: 900;
  gap: 10px;
  min-height: 42px;
  padding: 0 12px;
  text-decoration: none;
}

.app-navigation__menu-link:hover,
.app-navigation__menu-link--active {
  background: #eef3fb;
  color: var(--idfm-blue);
}

.app-navigation__menu-link svg {
  height: 18px;
  width: 18px;
}

.app-navigation-menu-enter-active,
.app-navigation-menu-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.app-navigation-menu-enter-from,
.app-navigation-menu-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}

@media (max-width: 640px) {
  .app-navigation {
    bottom: 10px;
    gap: 4px;
    max-width: calc(100vw - 20px);
  }

  .app-navigation__link {
    font-size: 0.82rem;
    padding: 0 11px;
  }
}
</style>

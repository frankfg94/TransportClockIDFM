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

type NavigationSlot = "stations" | "traffic" | "more";

const route = useRoute();
const { settings } = useAppSettings();
const hidden = ref(false);
const menuOpen = ref(false);
const navigationRoot = ref<HTMLElement>();
let hideTimer: number | undefined;

const primaryLinks: {
  to: string;
  label: string;
  icon: typeof Home;
  slot: Exclude<NavigationSlot, "more">;
}[] = [
  { to: "/", label: "Stations", icon: Home, slot: "stations" },
  {
    to: "/traffic",
    label: "Info trafic",
    icon: TriangleAlert,
    slot: "traffic",
  },
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

const activeNavigationSlot = computed<NavigationSlot>(() => {
  if (menuOpen.value || secondaryActive.value) {
    return "more";
  }

  if (isActive("/traffic")) {
    return "traffic";
  }

  return "stations";
});

const navigationClasses = computed(() => [
  {
    "app-navigation--hidden": hidden.value && shouldAutoHide.value,
  },
  `app-navigation--active-${activeNavigationSlot.value}`,
]);

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

watch(
  () => route.path,
  () => {
    closeMenu();
  },
);

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
    :class="navigationClasses"
    aria-label="Navigation principale"
    @focusin="revealNavigation"
    @pointerenter="revealNavigation"
  >
    <NuxtLink
      v-for="link in primaryLinks"
      :key="link.to"
      class="app-navigation__link"
      :class="[
        `app-navigation__link--${link.slot}`,
        {
          'app-navigation__link--active': activeNavigationSlot === link.slot,
        },
      ]"
      :to="link.to"
      @click="closeMenu"
    >
      <component :is="link.icon" aria-hidden="true" />
      <span>{{ link.label }}</span>
    </NuxtLink>

    <div class="app-navigation__menu">
      <button
        class="app-navigation__menu-button"
        :class="{
          'app-navigation__menu-button--active':
            activeNavigationSlot === 'more',
        }"
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
  --nav-padding: 7px;
  --nav-gap: 6px;
  --nav-height: 42px;

  --nav-stations-w: 116px;
  --nav-traffic-w: 136px;
  --nav-more-w: 42px;

  --indicator-x: var(--nav-padding);
  --indicator-w: var(--nav-stations-w);

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
  gap: var(--nav-gap);
  isolation: isolate;
  left: 50%;
  padding: var(--nav-padding);
  position: fixed;
  transform: translateX(-50%);
  transition:
    opacity 220ms ease,
    transform 220ms ease;
  z-index: 9000;
}

.app-navigation::before {
  background: #111827;
  border-radius: 999px;
  box-shadow:
    0 10px 24px rgba(17, 24, 39, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  content: "";
  height: var(--nav-height);
  left: 0;
  pointer-events: none;
  position: absolute;
  top: var(--nav-padding);
  transform: translateX(var(--indicator-x));
  transition:
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
    width 240ms cubic-bezier(0.22, 1, 0.36, 1);
  width: var(--indicator-w);
  z-index: 0;
}

.app-navigation--active-stations {
  --indicator-x: var(--nav-padding);
  --indicator-w: var(--nav-stations-w);
}

.app-navigation--active-traffic {
  --indicator-x: calc(
    var(--nav-padding) + var(--nav-stations-w) + var(--nav-gap)
  );
  --indicator-w: var(--nav-traffic-w);
}

.app-navigation--active-more {
  --indicator-x: calc(
    var(--nav-padding) + var(--nav-stations-w) + var(--nav-gap) +
      var(--nav-traffic-w) + var(--nav-gap)
  );
  --indicator-w: var(--nav-more-w);
}

.app-navigation--hidden {
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 18px);
}

:global(body:has(.modal-backdrop) .app-navigation) {
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 18px);
  visibility: hidden;
}

.app-navigation__link {
  align-items: center;
  background: transparent;
  border-radius: 999px;
  color: var(--muted);
  display: inline-flex;
  font-weight: 900;
  gap: 8px;
  height: var(--nav-height);
  justify-content: center;
  min-height: var(--nav-height);
  padding: 0 14px;
  position: relative;
  text-decoration: none;
  transition:
    background 160ms ease,
    color 160ms ease;
  z-index: 1;
}

.app-navigation__link--stations {
  width: var(--nav-stations-w);
}

.app-navigation__link--traffic {
  width: var(--nav-traffic-w);
}

.app-navigation__link svg {
  height: 18px;
  width: 18px;
}

.app-navigation__link:hover {
  background: rgba(17, 24, 39, 0.06);
  color: #111827;
}

.app-navigation__link--active,
.app-navigation__link--active:hover {
  background: transparent;
  color: #ffffff;
}

.app-navigation__menu {
  position: relative;
  z-index: 2;
}

.app-navigation__menu-button {
  align-items: center;
  background: transparent;
  border-radius: 999px;
  color: var(--muted);
  display: inline-flex;
  height: var(--nav-height);
  justify-content: center;
  min-height: var(--nav-height);
  padding: 0;
  position: relative;
  transition:
    background 160ms ease,
    color 160ms ease;
  width: var(--nav-more-w);
  z-index: 1;
}

.app-navigation__menu-button:hover {
  background: rgba(17, 24, 39, 0.06);
  color: #111827;
  transform: none;
}

.app-navigation__menu-button--active,
.app-navigation__menu-button--active:hover,
.app-navigation__menu-button[aria-expanded="true"],
.app-navigation__menu-button[aria-expanded="true"]:hover {
  background: transparent;
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
  z-index: 10;
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
  transition:
    background 160ms ease,
    color 160ms ease;
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
    --nav-padding: 7px;
    --nav-gap: 4px;
    --nav-stations-w: 100px;
    --nav-traffic-w: 118px;
    --nav-more-w: 42px;

    bottom: 10px;
    max-width: calc(100vw - 20px);
  }

  .app-navigation__link {
    font-size: 0.82rem;
    gap: 6px;
    padding: 0 10px;
  }

  .app-navigation__link svg {
    height: 17px;
    width: 17px;
  }
}
</style>

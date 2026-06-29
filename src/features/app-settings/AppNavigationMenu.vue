<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Activity,
  Briefcase,
  Home,
  MapPin,
  MoreVertical,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-vue-next";
import { useRoute } from "#imports";
import ContextMenu from "../../components/ContextMenu.vue";
import { useAppSettings } from "./appSettings";
import { transitBoards } from "../../config/transitBoards";
import {
  TRANSIT_PREFERENCES_CHANGED_EVENT,
  TRANSIT_PREFERENCES_STORAGE_KEY,
  DEFAULT_TRANSIT_PLACE_ID,
  WORK_TRANSIT_PLACE_ID,
  createDefaultTransitPresetState,
  getTransitPlaceById,
  loadTransitPresetState,
  resolveTransitPlaceId,
  type TransitPlacePreset,
  type TransitPresetState,
} from "../../storage/transitPreferences";

const AUTO_HIDE_MS = 60_000;

type NavigationSlot = "stations" | "traffic" | "more";
type NavigationIcon = typeof Home;
type NavigationTarget = string | { path: string; query?: Record<string, string> };
type PrimaryNavigationLink = {
  to: NavigationTarget;
  label: string;
  icon: NavigationIcon;
  slot: Exclude<NavigationSlot, "more">;
};

const route = useRoute();
const { settings } = useAppSettings();
const hidden = ref(false);
const menuOpen = ref(false);
const navigationRoot = ref<HTMLElement>();
const menuTrigger = ref<HTMLElement>();
const presetState = ref<TransitPresetState>(
  createDefaultTransitPresetState(transitBoards),
);
let hideTimer: number | undefined;

const activeStationPlaceId = computed(() =>
  resolveTransitPlaceId(presetState.value, getRoutePlaceId()),
);
const activeStationPlace = computed(() =>
  getTransitPlaceById(presetState.value, activeStationPlaceId.value),
);
const stationPlaceIcon = computed(() =>
  getPlaceNavigationIcon(activeStationPlace.value),
);
const stationPlaceDots = computed(() =>
  settings.value.placePresetNavigationMode !== "dropdown" &&
  presetState.value.places.length > 1
    ? presetState.value.places
    : [],
);
const primaryLinks = computed<PrimaryNavigationLink[]>(() => [
  {
    to: {
      path: "/",
      query: {
        place: activeStationPlaceId.value,
      },
    },
    label: "Stations",
    icon: stationPlaceIcon.value,
    slot: "stations",
  },
  {
    to: {
      path: "/traffic",
      query: {
        place: activeStationPlaceId.value,
      },
    },
    label: "Info trafic",
    icon: TriangleAlert,
    slot: "traffic",
  },
]);

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
  refreshPresetState();
  registerActivityListeners();
  window.addEventListener("storage", syncPresetState);
  window.addEventListener(TRANSIT_PREFERENCES_CHANGED_EVENT, syncPresetState);
  resetAutoHideTimer();
});

onBeforeUnmount(() => {
  unregisterActivityListeners();
  window.removeEventListener("storage", syncPresetState);
  window.removeEventListener(TRANSIT_PREFERENCES_CHANGED_EVENT, syncPresetState);
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

function getRoutePlaceId(): string | undefined {
  const routeWithQuery = route as {
    query?: Record<string, string | string[] | undefined>;
  };
  const value = routeWithQuery.query?.place;
  const placeId = Array.isArray(value) ? value[0] : value;

  return typeof placeId === "string" ? placeId : undefined;
}

function getPlaceNavigationIcon(place?: TransitPlacePreset): NavigationIcon {
  if (place?.id === WORK_TRANSIT_PLACE_ID) {
    return Briefcase;
  }

  if (place?.id === DEFAULT_TRANSIT_PLACE_ID) {
    return Home;
  }

  return MapPin;
}

function refreshPresetState(): void {
  presetState.value = loadTransitPresetState(transitBoards);
}

function syncPresetState(event?: Event): void {
  if (
    event instanceof StorageEvent &&
    event.key !== null &&
    event.key !== TRANSIT_PREFERENCES_STORAGE_KEY
  ) {
    return;
  }

  refreshPresetState();
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
      :key="link.slot"
      class="app-navigation__link"
      :class="[
        `app-navigation__link--${link.slot}`,
        {
          'app-navigation__link--active': activeNavigationSlot === link.slot,
        },
      ]"
      :aria-label="
        link.slot === 'stations'
          ? `Stations - ${activeStationPlace?.label ?? 'Lieu'}`
          : undefined
      "
      :to="link.to"
      @click="closeMenu"
    >
      <component :is="link.icon" aria-hidden="true" />
      <span>{{ link.label }}</span>
      <span
        v-if="link.slot === 'stations' && stationPlaceDots.length > 1"
        class="app-navigation__place-dots"
        aria-hidden="true"
      >
        <span
          v-for="place in stationPlaceDots"
          :key="place.id"
          :class="{
            'app-navigation__place-dot--active':
              place.id === activeStationPlaceId,
          }"
          class="app-navigation__place-dot"
        ></span>
      </span>
    </NuxtLink>

    <div class="app-navigation__menu">
      <button
        ref="menuTrigger"
        class="app-navigation__menu-button"
        :class="{
          'app-navigation__menu-button--active':
            activeNavigationSlot === 'more',
        }"
        type="button"
        :aria-expanded="menuOpen"
        aria-haspopup="menu"
        aria-label="Ouvrir les pages secondaires"
        @click="toggleMenu"
      >
        <MoreVertical aria-hidden="true" />
      </button>

      <ContextMenu
        v-model:open="menuOpen"
        aria-label="Pages secondaires"
        :anchor="menuTrigger"
        class="app-navigation__menu-panel"
        close-on-outside-click
        placement="top-end"
        :teleport="false"
        :z-index="9500"
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
      </ContextMenu>
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
  padding-bottom: 7px;
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

.app-navigation__place-dots {
  align-items: center;
  bottom: 5px;
  display: inline-flex;
  gap: 3px;
  height: 8px;
  left: 50%;
  position: absolute;
  transform: translateX(-50%);
}

.app-navigation__place-dot {
  background: transparent;
  height: 8px;
  position: relative;
  width: 10px;
}

.app-navigation__place-dot::before {
  background: currentColor;
  border-radius: 999px;
  content: "";
  height: 4px;
  left: 50%;
  opacity: 0.32;
  position: absolute;
  top: 2px;
  transform: translateX(-50%);
  transition:
    opacity 160ms ease,
    width 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
  width: 4px;
  will-change: width, opacity;
}

.app-navigation__place-dot--active::before {
  opacity: 0.95;
  width: 10px;
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

:global(.app-navigation__menu-panel) {
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

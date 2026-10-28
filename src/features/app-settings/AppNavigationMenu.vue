<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Activity,
  Briefcase,
  Home,
  Map,
  MapPin,
  MoreVertical,
  Plus,
  ChevronRight,
  Rss,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-vue-next";
import { useRoute } from "#imports";
import ContextMenu from "../../components/ContextMenu.vue";
import { useAppSettings } from "./appSettings";
import { useI18n } from "../../i18n";
import { useCustomOptimizers } from "../line-optimizer/customOptimizers";
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

type NavigationSlot = "stations" | "traffic" | "plan" | "more";
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
const { t } = useI18n();
const hidden = ref(false);
const menuOpen = ref(false);
const optimizerOpen = ref(false);
const optimizerOpensLeft = ref(false);
const optimizerMenuWidth = ref(190);
const customOptimizers = useCustomOptimizers();
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
    label: t("common.labels.stations"),
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
    label: t("common.labels.traffic"),
    icon: TriangleAlert,
    slot: "traffic",
  },
  ...(settings.value.showPlanInNavigation
    ? [{
        to: "/map",
        label: t("common.labels.plan"),
        icon: Map,
        slot: "plan" as const,
      }]
    : []),
]);

const localizedSecondaryLinks = computed(() => [
  { to: "/feed", label: t("news.title"), icon: Rss },
  { to: "/nearby-stations", label: t("common.labels.nearbyStations"), icon: MapPin },
  { to: "/optimizer", label: t("lineOptimizer.menuTitle"), icon: Activity },
  { to: "/settings", label: t("common.labels.settings"), icon: SlidersHorizontal },
  { to: "/health", label: t("common.labels.health"), icon: Activity },
]);

const shouldAutoHide = computed(
  () => settings.value.navigationAutoHide === "1m",
);

const secondaryActive = computed(() =>
  localizedSecondaryLinks.value.some((link) => isActive(link.to)),
);

const activeNavigationSlot = computed<NavigationSlot>(() => {
  if (menuOpen.value || secondaryActive.value) {
    return "more";
  }

  if (isActive("/traffic")) {
    return "traffic";
  }

  if (isActive("/map")) {
    return "plan";
  }

  return "stations";
});

const navigationClasses = computed(() => [
  {
    "app-navigation--hidden": hidden.value && shouldAutoHide.value,
  },
  { "app-navigation--plan-hidden": !settings.value.showPlanInNavigation },
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

function getPlaceNavigationLabel(place?: TransitPlacePreset): string {
  if (place?.id === WORK_TRANSIT_PLACE_ID) {
    return t("places.work");
  }

  if (place?.id === DEFAULT_TRANSIT_PLACE_ID) {
    return t("places.home");
  }

  return place?.label ?? t("settings.places.defaultLabel");
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

function openOptimizer(event: MouseEvent, toggle = false): void {
  const target = event.currentTarget as HTMLElement;
  const anchor = target.closest(".app-navigation__optimizer");
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    optimizerOpensLeft.value = window.innerWidth - rect.right < 210;
    const space = optimizerOpensLeft.value ? rect.left : window.innerWidth - rect.right;
    optimizerMenuWidth.value = Math.max(100, Math.min(190, space - 8));
  }
  optimizerOpen.value = toggle ? !optimizerOpen.value : true;
}

function optimizerClick(event: MouseEvent): void {
  const touch = "pointerType" in event && (event as PointerEvent).pointerType === "touch";
  // Hover can open the menu before a mouse click reaches the button.
  openOptimizer(event, touch || event.detail === 0);
}

function optimizerPointerEnter(event: PointerEvent): void {
  if (event.pointerType === "mouse") openOptimizer(event);
}

function optimizerPointerLeave(event: PointerEvent): void {
  if (event.pointerType === "mouse") optimizerOpen.value = false;
}

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
  revealNavigation();
}

function closeMenu(): void {
  menuOpen.value = false;
  optimizerOpen.value = false;
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
    :aria-label="t('navigation.mainAria')"
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
          ? t('navigation.stationWithPlace', {
              place: getPlaceNavigationLabel(activeStationPlace),
            })
          : link.slot === 'plan'
            ? t('navigation.planAria')
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
        :aria-label="t('navigation.moreAria')"
        @click="toggleMenu"
      >
        <MoreVertical aria-hidden="true" />
      </button>

      <ContextMenu
        v-model:open="menuOpen"
        :aria-label="t('navigation.secondaryAria')"
        :anchor="menuTrigger"
        class="app-navigation__menu-panel"
        close-on-outside-click
        placement="top-end"
        :z-index="9500"
      >
        <template v-for="link in localizedSecondaryLinks" :key="link.to">
          <div v-if="link.to === '/optimizer'" class="app-navigation__optimizer" @pointerenter="optimizerPointerEnter($event)" @pointerleave="optimizerPointerLeave($event)">
            <button type="button" role="menuitem" class="app-navigation__menu-link app-navigation__optimizer-toggle" :class="{ 'app-navigation__menu-link--active': isActive('/optimizer') }" :aria-expanded="optimizerOpen" aria-haspopup="menu" @click="optimizerClick($event)" @keydown.esc.stop="optimizerOpen = false">
              <Activity aria-hidden="true" /><span>{{ link.label }}</span><ChevronRight class="app-navigation__chevron" aria-hidden="true" />
            </button>
            <div v-if="optimizerOpen" class="app-navigation__optimizer-items" :class="{ 'app-navigation__optimizer-items--left': optimizerOpensLeft }" :style="{ width: `${optimizerMenuWidth}px` }" role="menu" :aria-label="t('lineOptimizer.menuTitle')">
              <NuxtLink class="app-navigation__menu-link" to="/optimizer/line/tram/T10" role="menuitem" @click="closeMenu">{{ t("lineOptimizer.chateletMenu") }}</NuxtLink>
              <NuxtLink class="app-navigation__menu-link" to="/optimizer/velizy" role="menuitem" @click="closeMenu">{{ t("lineOptimizer.velizyMenu") }}</NuxtLink>
              <NuxtLink v-for="item in customOptimizers" :key="item.id" class="app-navigation__menu-link" :to="`/optimizer/custom/${item.id}`" role="menuitem" @click="closeMenu">{{ item.name }}</NuxtLink>
              <NuxtLink class="app-navigation__menu-link" to="/optimizer/new" role="menuitem" @click="closeMenu"><Plus aria-hidden="true" /><span>{{ t("lineOptimizer.newMenu") }}</span></NuxtLink>
            </div>
          </div>
          <NuxtLink v-else class="app-navigation__menu-link" :class="{ 'app-navigation__menu-link--active': isActive(link.to) }" :to="link.to" role="menuitem" @click="closeMenu">
            <component :is="link.icon" aria-hidden="true" /><span>{{ link.label }}</span>
          </NuxtLink>
        </template>
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
  --nav-plan-w: 104px;
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
      var(--nav-traffic-w) + var(--nav-gap) + var(--nav-plan-w) + var(--nav-gap)
  );
  --indicator-w: var(--nav-more-w);
}

.app-navigation--active-plan {
  --indicator-x: calc(
    var(--nav-padding) + var(--nav-stations-w) + var(--nav-gap) +
      var(--nav-traffic-w) + var(--nav-gap)
  );
  --indicator-w: var(--nav-plan-w);
}

.app-navigation--plan-hidden.app-navigation--active-more {
  --indicator-x: calc(
    var(--nav-padding) + var(--nav-stations-w) + var(--nav-gap) +
      var(--nav-traffic-w) + var(--nav-gap)
  );
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

.app-navigation__link--plan {
  width: var(--nav-plan-w);
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
  overflow: visible !important;
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

.app-navigation__optimizer-toggle { width: 100%; border: 0; background: transparent; text-align: left; cursor: pointer; }
.app-navigation__chevron { margin-left: auto; }
.app-navigation__optimizer { position: relative; }
.app-navigation__optimizer-items {
  position: absolute; left: 100%; top: 0; z-index: 2;
  display: grid; gap: 4px; min-width: 0; box-sizing: border-box; padding: 8px;
  max-height: min(60vh, 400px); overflow-y: auto;
  animation: optimizer-pop 160ms ease-out both; transform-origin: left top;
  background: #fff; border: 1px solid rgba(16, 35, 63, .1); border-radius: 8px;
  box-shadow: 0 22px 50px rgba(16, 35, 63, .16), 0 2px 10px rgba(16, 35, 63, .08);
}
.app-navigation__optimizer-items--left { left: auto; right: 100%; transform-origin: right top; }
@keyframes optimizer-pop {
  from { opacity: 0; transform: scale(.96); }
  to { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .app-navigation__optimizer-items { animation: none; }
}
.app-navigation__optimizer-items .app-navigation__menu-link { min-height: 38px; }
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
    --nav-plan-w: 92px;
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

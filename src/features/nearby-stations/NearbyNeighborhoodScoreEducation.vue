<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from "vue";
import { Baby, ChevronRight, Footprints, GraduationCap, School, X } from "lucide-vue-next";
import { useI18n, type TranslationKey } from "../../i18n";
import type { EducationFactGroupId, NeighborhoodFact, NeighborhoodWalkingMetrics } from "./neighborhood/contracts";
import { EDUCATION_WALKING_LIMIT_MINUTES } from "./neighborhood/contracts";
import { classifyEducationPlace, isEducationPlace, scorePlaces } from "./neighborhood/places";
import NearbyNeighborhoodScoreFact from "./NearbyNeighborhoodScoreFact.vue";
import type { NearbyPlace } from "./nearbyPlaces";

const props = defineProps<{
  facts: readonly NeighborhoodFact[];
  places: readonly NearbyPlace[];
  walkingRoutes: Readonly<Record<string, NeighborhoodWalkingMetrics | undefined>>;
}>();

type EducationGroupDefinition = {
  id: string;
  groupIds: readonly EducationFactGroupId[];
  labelKey: TranslationKey;
  icon: Component;
  accent: string;
  surface: string;
};

type EducationDisplayPlace = {
  id: string;
  name: string;
  minutes: number;
  distanceMeters: number;
  approximate: boolean;
  typeLabelKey: TranslationKey;
};

type EducationDisplayGroup = EducationGroupDefinition & {
  places: EducationDisplayPlace[];
  walkingLimitMinutes: number;
  additionalCount: number;
};

const definitions: readonly EducationGroupDefinition[] = [
  {
    id: "primary",
    groupIds: ["elementary"],
    labelKey: "nearbyStations.neighborhoodScore.education.groups.primary",
    icon: School,
    accent: "#279447",
    surface: "#f1faf2",
  },
  {
    id: "early-childhood",
    groupIds: ["maternelle", "nursery"],
    labelKey: "nearbyStations.neighborhoodScore.education.groups.earlyChildhood",
    icon: Baby,
    accent: "#5d9959",
    surface: "#f3faf1",
  },
  {
    id: "secondary",
    groupIds: ["college", "high-school"],
    labelKey: "nearbyStations.neighborhoodScore.education.groups.secondary",
    icon: GraduationCap,
    accent: "#6942d9",
    surface: "#f6f2ff",
  },
  {
    id: "higher",
    groupIds: ["other"],
    labelKey: "nearbyStations.neighborhoodScore.education.groups.higher",
    icon: GraduationCap,
    accent: "#7b36e8",
    surface: "#f7f2ff",
  },
];

const typeLabelKeys: Record<EducationFactGroupId, TranslationKey> = {
  elementary: "nearbyStations.neighborhoodScore.education.types.elementary",
  maternelle: "nearbyStations.neighborhoodScore.education.types.maternelle",
  nursery: "nearbyStations.neighborhoodScore.education.types.nursery",
  college: "nearbyStations.neighborhoodScore.education.types.college",
  "high-school": "nearbyStations.neighborhoodScore.education.types.highSchool",
  other: "nearbyStations.neighborhoodScore.education.types.other",
};

const { t } = useI18n();
const selectedGroupId = ref<string>();
const selectedFactId = ref<string>();
const closeButton = ref<HTMLButtonElement>();
let returnFocusElement: HTMLElement | undefined;

const scoredEducationPlaces = computed(() => scorePlaces({
  places: props.places,
  walkingRoutes: props.walkingRoutes,
}, isEducationPlace, EDUCATION_WALKING_LIMIT_MINUTES));

const groups = computed<EducationDisplayGroup[]>(() => definitions.flatMap((definition) => {
  const groupPlaces = scoredEducationPlaces.value
    .filter((place) => definition.groupIds.includes(classifyEducationPlace(place.place)))
    .map((place) => {
      const type = classifyEducationPlace(place.place);
      return {
        id: place.place.id,
        name: place.place.name.trim() || place.place.brand?.trim() || place.place.operator?.trim() || "",
        minutes: place.minutes,
        distanceMeters: place.distanceMeters,
        approximate: !place.routed,
        typeLabelKey: typeLabelKeys[type],
      };
    });
  if (groupPlaces.length === 0) return [];
  return [{
    ...definition,
    places: groupPlaces,
    walkingLimitMinutes: EDUCATION_WALKING_LIMIT_MINUTES,
    additionalCount: Math.max(0, groupPlaces.length - 10),
  }];
}));

const selectedGroup = computed(() => groups.value.find((group) => group.id === selectedGroupId.value));

function groupStyle(group: EducationDisplayGroup): Record<string, string> {
  return {
    "--education-accent": group.accent,
    "--education-surface": group.surface,
  };
}

function displayName(place: EducationDisplayPlace): string {
  return place.name.trim() || t("nearbyStations.neighborhoodScore.education.unnamedPlace");
}

function walkingTime(place: EducationDisplayPlace): string {
  return place.approximate
    ? t("nearbyStations.neighborhoodScore.education.walkingTimeApprox", { minutes: place.minutes })
    : t("nearbyStations.neighborhoodScore.education.walkingTime", { minutes: place.minutes });
}

function openGroup(groupId: string, event: MouseEvent): void {
  if (!selectedGroupId.value && event.currentTarget instanceof HTMLElement) {
    returnFocusElement = event.currentTarget;
  }
  selectedGroupId.value = groupId;
  requestAnimationFrame(() => closeButton.value?.focus());
}

function closePanel(): void {
  selectedGroupId.value = undefined;
  requestAnimationFrame(() => {
    returnFocusElement?.focus();
    returnFocusElement = undefined;
  });
}

function toggleFallbackFact(factId: string): void {
  selectedFactId.value = selectedFactId.value === factId ? undefined : factId;
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && selectedGroupId.value) {
    event.preventDefault();
    closePanel();
  } else if (event.key === "Escape" && selectedFactId.value) {
    selectedFactId.value = undefined;
  }
}

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <div class="nearby-neighborhood-score-education">
    <template v-if="groups.length">
      <article
        v-for="group in groups"
        :key="group.id"
        class="nearby-neighborhood-score-education__group"
        :class="{ 'nearby-neighborhood-score-education__group--active': selectedGroupId === group.id }"
        :style="groupStyle(group)"
        :data-education-group="group.id"
      >
        <button
          class="nearby-neighborhood-score-education__summary"
          type="button"
          :aria-label="t('nearbyStations.neighborhoodScore.education.openDetails', {
            category: t(group.labelKey),
            count: group.places.length,
          })"
          :aria-expanded="selectedGroupId === group.id"
          aria-haspopup="dialog"
          aria-controls="nearby-neighborhood-score-education-panel"
          @click="openGroup(group.id, $event)"
        >
          <span class="nearby-neighborhood-score-education__icon">
            <component :is="group.icon" :size="25" stroke-width="2.2" aria-hidden="true" />
          </span>
          <span class="nearby-neighborhood-score-education__summary-copy">
            <span class="nearby-neighborhood-score-education__title">{{ t(group.labelKey) }}</span>
            <span class="nearby-neighborhood-score-education__metrics">
              <span class="nearby-neighborhood-score-education__metric nearby-neighborhood-score-education__metric--count">
                <School :size="13" aria-hidden="true" />
                {{ group.places.length }}
              </span>
              <span class="nearby-neighborhood-score-education__metric">
                <Footprints :size="13" aria-hidden="true" />
                {{ t("nearbyStations.neighborhoodScore.education.walkingLimit", { minutes: group.walkingLimitMinutes }) }}
              </span>
            </span>
          </span>
        </button>

        <div
          class="nearby-neighborhood-score-education__preview"
        >
          <span class="nearby-neighborhood-score-education__entries" role="list">
            <span
              v-for="(place, index) in group.places.slice(0, 10)"
              :key="`${place.id}-${index}`"
              role="listitem"
            >
              <button
                class="nearby-neighborhood-score-education__entry"
                type="button"
                :aria-label="t('nearbyStations.neighborhoodScore.education.openPlaceDetails', {
                  name: displayName(place),
                  category: t(group.labelKey),
                })"
                :aria-expanded="selectedGroupId === group.id"
                aria-haspopup="dialog"
                aria-controls="nearby-neighborhood-score-education-panel"
                @click="openGroup(group.id, $event)"
              >
                <span class="nearby-neighborhood-score-education__rank">{{ index + 1 }}</span>
                <span class="nearby-neighborhood-score-education__name">{{ displayName(place) }}</span>
                <span class="nearby-neighborhood-score-education__time">
                  <Footprints :size="15" aria-hidden="true" />
                  <span>{{ walkingTime(place) }}</span>
                </span>
              </button>
            </span>
          </span>
        </div>

        <button
          v-if="group.additionalCount > 0"
          class="nearby-neighborhood-score-education__more"
          type="button"
          :aria-expanded="selectedGroupId === group.id"
          aria-haspopup="dialog"
          aria-controls="nearby-neighborhood-score-education-panel"
          @click="openGroup(group.id, $event)"
        >
          <span>{{ t("nearbyStations.neighborhoodScore.education.seeMore", { count: group.additionalCount }) }}</span>
          <ChevronRight :size="17" aria-hidden="true" />
        </button>
      </article>
    </template>

    <div v-else-if="facts.length" class="nearby-neighborhood-score-education__fallback">
      <NearbyNeighborhoodScoreFact
        v-for="fact in facts"
        :key="fact.id"
        :fact="fact"
        :open="selectedFactId === fact.id"
        @toggle="toggleFallbackFact(fact.id)"
      />
    </div>
    <p v-else class="nearby-neighborhood-score-education__empty">
      {{ t("nearbyStations.neighborhoodScore.noDocumentedSignal") }}
    </p>

    <Teleport to="body">
      <div
        v-if="selectedGroup"
        class="nearby-neighborhood-score-education__backdrop"
        role="presentation"
        @click.self="closePanel"
      >
        <section
          id="nearby-neighborhood-score-education-panel"
          class="nearby-neighborhood-score-education__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nearby-neighborhood-score-education-title"
        >
          <header class="nearby-neighborhood-score-education__panel-header" :style="groupStyle(selectedGroup)">
            <span class="nearby-neighborhood-score-education__panel-icon">
              <component :is="selectedGroup.icon" :size="25" stroke-width="2.2" aria-hidden="true" />
            </span>
            <span class="nearby-neighborhood-score-education__panel-heading">
              <h3 id="nearby-neighborhood-score-education-title">{{ t(selectedGroup.labelKey) }}</h3>
              <p>{{ t("nearbyStations.neighborhoodScore.education.detailCount", {
                count: selectedGroup.places.length,
                minutes: selectedGroup.walkingLimitMinutes,
              }) }}</p>
            </span>
            <button
              ref="closeButton"
              class="nearby-neighborhood-score-education__close"
              type="button"
              :aria-label="t('common.actions.close')"
              @click="closePanel"
            >
              <X :size="19" aria-hidden="true" />
            </button>
          </header>
          <ul class="nearby-neighborhood-score-education__detail-list">
            <li
              v-for="(place, index) in selectedGroup.places"
              :key="`${place.id}-${index}`"
              class="nearby-neighborhood-score-education__detail-place"
            >
              <span class="nearby-neighborhood-score-education__detail-icon">
                <School :size="17" aria-hidden="true" />
              </span>
              <span class="nearby-neighborhood-score-education__detail-copy">
                <span class="nearby-neighborhood-score-education__detail-name">{{ displayName(place) }}</span>
                <span class="nearby-neighborhood-score-education__detail-type">{{ t(place.typeLabelKey) }}</span>
              </span>
              <span class="nearby-neighborhood-score-education__detail-time">
                <Footprints :size="15" aria-hidden="true" />
                {{ walkingTime(place) }}
              </span>
            </li>
          </ul>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.nearby-neighborhood-score-education { display: grid; gap: 9px; min-width: 0; }
.nearby-neighborhood-score-education__group { align-items: stretch; background: #fff; border: 1px solid rgba(16,35,63,.1); border-radius: 13px; display: grid; gap: 0; grid-template-columns: minmax(155px,.78fr) minmax(0,2.35fr) minmax(112px,.62fr); min-width: 0; overflow: hidden; transition: background-color .14s ease, border-color .14s ease; }
.nearby-neighborhood-score-education__group:hover { border-color: color-mix(in srgb, var(--education-accent) 30%, #dfe3ef); }
.nearby-neighborhood-score-education__group--active { background: var(--education-surface); border-color: color-mix(in srgb, var(--education-accent) 65%, #fff); }
.nearby-neighborhood-score-education__summary, .nearby-neighborhood-score-education__entry { background: transparent; border: 0; color: inherit; cursor: pointer; font: inherit; min-width: 0; text-align: left; }
.nearby-neighborhood-score-education__summary { align-items: flex-start; display: flex; gap: 10px; padding: 13px 10px; }
.nearby-neighborhood-score-education__summary:focus-visible, .nearby-neighborhood-score-education__entry:focus-visible, .nearby-neighborhood-score-education__more:focus-visible, .nearby-neighborhood-score-education__close:focus-visible { outline: 2px solid var(--education-accent, #6942d9); outline-offset: -3px; }
.nearby-neighborhood-score-education__icon, .nearby-neighborhood-score-education__panel-icon { align-items: center; background: var(--education-surface); border-radius: 11px; color: var(--education-accent); display: inline-flex; flex: 0 0 auto; height: 48px; justify-content: center; width: 48px; }
.nearby-neighborhood-score-education__summary-copy { display: grid; gap: 10px; min-width: 0; }
.nearby-neighborhood-score-education__title { color: var(--ink); font-size: .88rem; font-weight: 850; line-height: 1.25; }
.nearby-neighborhood-score-education__metrics { align-items: center; display: flex; flex-wrap: wrap; gap: 5px; }
.nearby-neighborhood-score-education__metric { align-items: center; background: #f7f7fc; border: 1px solid rgba(105,66,217,.08); border-radius: 999px; color: #6c7191; display: inline-flex; font-size: .67rem; font-weight: 750; gap: 4px; line-height: 1; padding: 6px 7px; white-space: nowrap; }
.nearby-neighborhood-score-education__metric--count { color: var(--education-accent); }
.nearby-neighborhood-score-education__preview { align-items: center; border-left: 1px solid rgba(16,35,63,.08); display: flex; min-width: 0; padding: 7px 0; }
.nearby-neighborhood-score-education__entries { display: grid; min-width: 0; width: 100%; }
.nearby-neighborhood-score-education__entries > [role="listitem"] { border-bottom: 1px solid rgba(16,35,63,.055); }
.nearby-neighborhood-score-education__entries > [role="listitem"]:last-child { border-bottom: 0; }
.nearby-neighborhood-score-education__entry { align-items: center; color: var(--ink); display: grid; gap: 7px; grid-template-columns: 22px minmax(0,1fr) 72px; min-height: 25px; padding: 2px 8px; width: 100%; }
.nearby-neighborhood-score-education__entry:hover { background: rgba(105,66,217,.045); }
.nearby-neighborhood-score-education__rank { align-items: center; background: #f2f2f9; border-radius: 50%; color: #72799b; display: inline-flex; font-size: .67rem; font-variant-numeric: tabular-nums; font-weight: 800; height: 21px; justify-content: center; width: 21px; }
.nearby-neighborhood-score-education__name { font-size: .78rem; line-height: 1.25; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-neighborhood-score-education__time, .nearby-neighborhood-score-education__detail-time { align-items: center; color: #757da0; display: inline-flex; font-size: .74rem; font-variant-numeric: tabular-nums; font-weight: 750; gap: 5px; justify-content: flex-end; white-space: nowrap; }
.nearby-neighborhood-score-education__time svg, .nearby-neighborhood-score-education__detail-time svg { color: #777eb0; flex: 0 0 auto; }
.nearby-neighborhood-score-education__more { align-items: center; align-self: center; background: transparent; border: 0; color: #6337dc; cursor: pointer; display: inline-flex; font: inherit; font-size: .75rem; font-weight: 850; gap: 3px; justify-content: center; line-height: 1.3; padding: 9px 7px; text-align: center; }
.nearby-neighborhood-score-education__more:hover { color: #4823b8; text-decoration: underline; text-underline-offset: 3px; }
.nearby-neighborhood-score-education__fallback { display: grid; gap: 4px; }
.nearby-neighborhood-score-education__empty { color: var(--muted); font-size: .76rem; line-height: 1.45; margin: 0; padding: 2px 7px 4px; }
.nearby-neighborhood-score-education__backdrop { align-items: stretch; background: rgba(16,35,63,.12); display: flex; inset: 0; justify-content: flex-end; padding: 10px; position: fixed; z-index: 9600; }
.nearby-neighborhood-score-education__panel { background: #fff; border: 1px solid rgba(16,35,63,.1); border-radius: 16px; box-shadow: 0 18px 48px rgba(16,35,63,.18); display: flex; flex-direction: column; max-height: 100%; max-width: 470px; overflow: hidden; width: min(100%,470px); }
.nearby-neighborhood-score-education__panel-header { align-items: center; border-bottom: 1px solid rgba(16,35,63,.08); display: grid; gap: 12px; grid-template-columns: 52px minmax(0,1fr) 34px; padding: 16px; }
.nearby-neighborhood-score-education__panel-icon { height: 52px; width: 52px; }
.nearby-neighborhood-score-education__panel-heading { min-width: 0; }
.nearby-neighborhood-score-education__panel-heading h3 { color: var(--ink); font-size: 1rem; font-weight: 850; line-height: 1.25; margin: 0; }
.nearby-neighborhood-score-education__panel-heading p { color: #7b829b; font-size: .76rem; line-height: 1.35; margin: 4px 0 0; }
.nearby-neighborhood-score-education__close { align-items: center; background: transparent; border: 0; border-radius: 8px; color: #737b9c; cursor: pointer; display: inline-flex; height: 34px; justify-content: center; padding: 0; width: 34px; }
.nearby-neighborhood-score-education__close:hover { background: var(--education-surface, #f6f2ff); color: #6337dc; }
.nearby-neighborhood-score-education__detail-list { display: grid; gap: 6px; list-style: none; margin: 0; overflow-y: auto; padding: 9px 11px 14px; }
.nearby-neighborhood-score-education__detail-place { align-items: center; background: #fff; border: 1px solid rgba(16,35,63,.075); border-radius: 11px; display: grid; gap: 9px; grid-template-columns: 34px minmax(0,1fr) auto; min-width: 0; padding: 8px 9px; }
.nearby-neighborhood-score-education__detail-icon { align-items: center; background: #f5f3fb; border-radius: 9px; color: #7770ac; display: inline-flex; height: 34px; justify-content: center; width: 34px; }
.nearby-neighborhood-score-education__detail-copy { display: grid; gap: 2px; min-width: 0; }
.nearby-neighborhood-score-education__detail-name { color: var(--ink); font-size: .82rem; font-weight: 720; line-height: 1.25; overflow-wrap: anywhere; }
.nearby-neighborhood-score-education__detail-type { color: #8990a6; font-size: .69rem; line-height: 1.25; }
.nearby-neighborhood-score-education__detail-time { font-size: .73rem; }
@media (max-width: 850px) {
  .nearby-neighborhood-score-education__group { grid-template-columns: minmax(135px,.8fr) minmax(0,2fr); }
  .nearby-neighborhood-score-education__more { border-left: 1px solid rgba(16,35,63,.08); grid-column: 1 / -1; justify-self: stretch; padding: 7px 9px; }
}
@media (max-width: 600px) {
  .nearby-neighborhood-score-education__group { grid-template-columns: minmax(0,1fr) auto; }
  .nearby-neighborhood-score-education__summary { grid-column: 1; padding: 11px 9px; }
  .nearby-neighborhood-score-education__preview { border-left: 0; border-top: 1px solid rgba(16,35,63,.08); grid-column: 1 / -1; padding: 5px 0; }
  .nearby-neighborhood-score-education__more { align-self: center; border-left: 0; grid-column: 2; grid-row: 1; justify-self: end; padding: 8px 9px; }
  .nearby-neighborhood-score-education__group:has(.nearby-neighborhood-score-education__more) .nearby-neighborhood-score-education__summary { padding-right: 3px; }
  .nearby-neighborhood-score-education__panel-header { gap: 9px; padding: 13px; }
  .nearby-neighborhood-score-education__detail-list { padding-left: 8px; padding-right: 8px; }
  .nearby-neighborhood-score-education__detail-place { gap: 7px; grid-template-columns: 31px minmax(0,1fr) auto; padding: 8px; }
}
@media (max-width: 420px) {
  .nearby-neighborhood-score-education__metrics { gap: 4px; }
  .nearby-neighborhood-score-education__metric { font-size: .64rem; padding: 5px 6px; }
  .nearby-neighborhood-score-education__detail-place { align-items: start; grid-template-columns: 31px minmax(0,1fr); }
  .nearby-neighborhood-score-education__detail-time { grid-column: 2; justify-content: flex-start; }
}
@media (prefers-reduced-motion: reduce) {
  .nearby-neighborhood-score-education__group { transition: none; }
}
</style>

<script setup lang="ts">
import { natureFactMarkerStrength, preferNatureTransit } from "./greenSpaceRoutingRules";
import { Check, Footprints, TrainFront } from "lucide-vue-next";
import { computed, defineAsyncComponent, nextTick, ref, useId, watch } from "vue";
import type { GreenMapReference, GreenPoint, GreenSpaceMapAccess } from "../../../shared/natureInCity";
import { useI18n } from "../../i18n";
import type { NeighborhoodFact } from "./neighborhood/contracts";
import { compareFacts, getNeighborhoodFactMarker } from "./neighborhood/facts";
import type { NearbyPlace } from "./nearbyPlaces";
import type { GreenSpaceTransitOptions } from "./useGreenSpaceTransit";
import { analyzeNearbyJourneyTiming, isNearbyJourneyTransitSection } from "./nearbyJourneyTiming";
import VerdictPanel from "./VerdictPanel.vue";

function compareFactStrength(a: NeighborhoodFact, b: NeighborhoodFact) {
  return natureFactMarkerStrength(getNeighborhoodFactMarker(b)) - natureFactMarkerStrength(getNeighborhoodFactMarker(a));
}

interface MapChoice {
  key: string;
  label: string;
  area?: string;
  reference: GreenMapReference;
  walk?: GreenSpaceMapAccess;
  transitMinutes?: number;
  fact: NeighborhoodFact;
}

const props = defineProps<{ facts: readonly NeighborhoodFact[]; origin?: GreenPoint; places?: readonly NearbyPlace[];
  transit?: GreenSpaceTransitOptions; focus?: string }>();
const emit = defineEmits<{ "update:focus": [focus: string | undefined]; prepare: [focus: string] }>();
const { n, t } = useI18n();
const messages = "nearbyStations.neighborhoodScore.natureMap" as const;
const NeighborhoodGreeneryMap = defineAsyncComponent(() => import("./NeighborhoodGreeneryMap.vue"));
const open = ref(false);
const preferred = ref<string>();
const expandedFact = ref<string>();
const controls = ref<HTMLElement>();
const groupId = useId();
function keyFor(reference: GreenMapReference): string {
  if (reference.scope === "address") return "nature:address";
  if (reference.scope === "commune") return `nature:commune:${reference.code}`;
  return `nature:${reference.scope}:${reference.id}`;
}

function walkingAccess(fact: NeighborhoodFact): GreenSpaceMapAccess | undefined {
  if (fact.greenSpaceAccess) return fact.greenSpaceAccess;
  const { name, minutes } = fact.labelValues ?? {};
  if ((fact.kind === "woodlandWalking" || fact.kind === "woodlandMainWalking" || fact.kind === "greenSpaceExceptional")
    && typeof name === "string" && typeof minutes === "number" && Number.isFinite(minutes) && minutes >= 0) {
    return { name, walkingMinutes: minutes, estimated: false };
  }
  // Older cached verdicts expose the park name and walking time only in the server label.
  if (fact.id.startsWith("backend:green-site-")) {
    const match = fact.label?.match(/^(.+) à (environ )?(\d+) min à pied(?: · .+)?$/u);
    if (match) return { name: match[1]!, walkingMinutes: Number(match[3]), estimated: Boolean(match[2]) };
  }
}

const choices = computed(() => {
  const options = new Map<string, MapChoice>();
  for (const fact of props.facts) {
    const reference = fact.greenMap;
    if (!reference) continue;
    const key = keyFor(reference);
    const previous = options.get(key);
    const access = walkingAccess(fact);
    const bestWalk = previous?.walk;
    const walk = access && (!bestWalk || (Number(access.estimated) - Number(bestWalk.estimated)
      || access.walkingMinutes - bestWalk.walkingMinutes) < 0) ? access : bestWalk;
    const label = reference.scope === "address" ? t(`${messages}.address`)
      : reference.scope === "commune" ? t(`${messages}.commune`)
      : String(walk?.name ?? fact.labelValues?.name ?? previous?.label ?? fact.label ?? "");
    const { value, unit } = fact.evidence;
    const area = reference.scope === "park" && unit === "m²" && typeof value === "number" && value > 0
      ? value >= 10_000 ? `${n(Math.round(value / 10_000))} ha` : `${n(Math.round(value))} m²`
      : undefined;
    const journey = ("id" in reference ? props.transit?.journeys?.get(reference.id) : undefined) ?? fact.travel?.journey;
    const elapsed = journey && (journey.transferCount ?? 0) === 0 && journey.sections.filter(isNearbyJourneyTransitSection).length === 1
      ? Math.ceil(analyzeNearbyJourneyTiming(journey).elapsedSeconds / 60) : Infinity;
    const best = Math.min(elapsed, previous?.transitMinutes ?? Infinity);
    const existing = previous?.fact;
    const comparison = existing && (compareFactStrength(existing, fact) || -compareFacts(fact, existing));
    const representative = existing && comparison !== undefined && comparison <= 0 ? existing : fact;
    if (label) options.set(key, { key, label, reference, walk, area: area ?? previous?.area, fact: representative,
      transitMinutes: Number.isFinite(best) ? best : undefined });
  }
  return [...options.values()];
});

function displayedWalk(choice: MapChoice): GreenSpaceMapAccess | undefined {
  const minutes = "id" in choice.reference ? props.transit?.walkingMinutes?.get(choice.reference.id) : undefined;
  return minutes === undefined ? choice.walk : { name: choice.label, walkingMinutes: minutes, estimated: false };
}

function preferTransit(choice: MapChoice) {
  return preferNatureTransit(displayedWalk(choice)?.walkingMinutes, choice.transitMinutes);
}

const groups = computed(() => {
  const spaces = choices.value.filter(({ reference }) => reference.scope === "park" || reference.scope === "woodland")
    .sort((a, b) => compareFactStrength(a.fact, b.fact)
      || (a.walk?.walkingMinutes ?? Infinity) - (b.walk?.walkingMinutes ?? Infinity)
      || a.label.localeCompare(b.label));
  const canopy = choices.value.filter(({ reference }) => reference.scope === "address" || reference.scope === "commune")
    .sort((a, b) => compareFactStrength(a.fact, b.fact)
      || Number(b.reference.scope === "address") - Number(a.reference.scope === "address"));
  return [{ title: t(`${messages}.greenSpaces`), options: spaces }, { title: t(`${messages}.canopy`), options: canopy }]
    .filter(({ options }) => options.length);
});

const selected = computed(() => choices.value.find(({ key }) => key === preferred.value)
  ?? groups.value[0]?.options[0]);

function revealSelection() {
  void nextTick(() => controls.value?.querySelector("input:checked")?.closest("label")?.scrollIntoView?.({ block: "nearest" }));
}

let appliedFocus: string | undefined;
watch([() => props.focus, choices, () => props.transit?.spaces], ([focus, options, spaces], [previousFocus]) => {
  if (focus !== previousFocus) appliedFocus = undefined;
  if (!focus) {
    if (previousFocus) open.value = false;
    return;
  }
  if (focus === appliedFocus) return;
  const alias = focus.startsWith("nature:park:") && spaces?.find(space => space.parkAliases?.includes(focus.slice("nature:park:".length)));
  const choice = options.find(option => option.key === focus || (alias && option.key === `nature:park:${alias.id}`));
  if (!choice) return;
  appliedFocus = focus;
  if (!open.value || preferred.value !== choice.key) {
    preferred.value = choice.key;
    open.value = true;
    revealSelection();
  }
}, { immediate: true });

watch([open, () => selected.value?.key], ([isOpen, focus]) => {
  if (isOpen && focus) emit("prepare", focus);
});

function setOpen(next: boolean) {
  open.value = next;
  emit("update:focus", next ? selected.value?.key : undefined);
  if (next) revealSelection();
}

function selectChoice(choice: MapChoice) {
  preferred.value = choice.key;
  emit("update:focus", choice.key);
}

function show(reference: GreenMapReference) {
  preferred.value = keyFor(reference);
  setOpen(true);
}
defineExpose({ show });
</script>

<template>
  <VerdictPanel :model-value="open" @update:model-value="setOpen" :title="t(`${messages}.title`)"
    :expand-label="t(`${messages}.expand`)" :disabled="!choices.length">
    <template #controls>
      <div ref="controls" class="nature-map-choices" role="radiogroup" :aria-label="t(`${messages}.layer`)">
        <section v-for="(group, index) in groups" :key="group.title" class="nature-map-choices__group"
          role="group" :aria-labelledby="`${groupId}-group-${index}`">
          <h3 :id="`${groupId}-group-${index}`">{{ group.title }}</h3>
          <div v-for="choice in group.options" :key="choice.key" class="nature-map-row">
          <label class="nature-map-choice">
            <input type="radio" :name="groupId" :checked="selected?.key === choice.key"
              @change="selectChoice(choice)">
            <Check class="nature-map-choice__check" :size="16" aria-hidden="true" />
            <span class="nature-map-choice__name">
              {{ choice.label }}
              <small v-if="choice.area" class="nature-map-choice__area">{{ choice.area }}</small>
            </span>
            <span v-if="displayedWalk(choice) || choice.transitMinutes !== undefined" class="nature-map-choice__walk">
              <span v-if="displayedWalk(choice)" class="nature-map-choice__duration"
                :class="{ 'nature-map-choice__duration--primary': !preferTransit(choice) }"
                :title="t(displayedWalk(choice)?.estimated ? `${messages}.walkEstimated` : `${messages}.walk`)">
                <Footprints :size="14" aria-hidden="true" />
                {{ t(displayedWalk(choice)?.estimated ? `${messages}.estimatedMinutes` : `${messages}.minutes`,
                  { minutes: Math.ceil(displayedWalk(choice)!.walkingMinutes) }) }}
              </span>
              <span v-if="choice.transitMinutes !== undefined" class="nature-map-choice__duration"
                :class="{ 'nature-map-choice__duration--primary': preferTransit(choice) }" :title="t(`${messages}.transitToggle`)">
                <TrainFront :size="14" aria-hidden="true" />
                {{ t(`${messages}.transitMinutes`, { minutes: choice.transitMinutes }) }}
              </span>
            </span>
          </label>
          <button type="button" class="nature-map-row__fact" :class="{ 'nature-map-row__fact--positive': choice.fact.polarity === 'positive' }"
            :aria-label="t(`${messages}.factDetails`, { name: choice.label, marker: getNeighborhoodFactMarker(choice.fact) })"
            :aria-expanded="expandedFact === choice.key" @click="expandedFact = expandedFact === choice.key ? undefined : choice.key">
            {{ getNeighborhoodFactMarker(choice.fact) }}
          </button>
          <div v-if="expandedFact === choice.key" class="nature-map-row__fact-details">
            <strong>{{ choice.fact.label ?? (choice.fact.labelKey ? t(choice.fact.labelKey, choice.fact.labelValues) : choice.label) }}</strong>
            <p v-if="choice.reference.scope === 'park' && transit?.subsites?.get(choice.reference.id)?.length">
              {{ t(`${messages}.subsites`) }} · {{ transit.subsites.get(choice.reference.id)?.join(" · ") }}
            </p>
            <p v-if="choice.fact.tooltip || choice.fact.tooltipKey">
              {{ choice.fact.tooltip ?? t(choice.fact.tooltipKey!, choice.fact.tooltipValues) }}
            </p>
          </div>
          </div>
        </section>
      </div>
    </template>
    <NeighborhoodGreeneryMap v-if="selected" :reference="selected.reference" :origin="origin"
      :map-label="selected.label" :places="places" :transit="transit"
 expanded />
    <p v-else role="status">{{ t('nearbyStations.neighborhoodScore.canopyLevels.mapUnavailable') }}</p>
  </VerdictPanel>
</template>

<style scoped>
.nature-map-choices {
  display: grid;
  gap: .85rem;
  padding: .5rem .45rem .65rem;
}

.nature-map-choices__group h3 {
  margin: 0;
  padding: .45rem .65rem;
  color: var(--muted);
  font-size: .85rem;
  font-weight: 700;
}

.nature-map-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  border-bottom: 1px solid var(--border);
}
.nature-map-row:last-child { border-bottom-color: transparent; }
.nature-map-row:has(:checked) { background: var(--surface-muted); }
.nature-map-row__fact {
  grid-column: 1;
  grid-row: 1;
  min-width: 2rem;
  min-height: 2rem;
  margin-inline: .25rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--ink);
  font-weight: 700;
  cursor: pointer;
}
.nature-map-row__fact--positive { color: var(--success, #176348); }
.nature-map-row__fact-details { grid-column: 1 / -1; padding: .35rem .75rem .7rem; font-size: .83rem; }
.nature-map-row__fact-details p { margin: .25rem 0 0; color: var(--muted); }
.nature-map-choice {
  grid-column: 2;
  grid-row: 1;
  position: relative;
  display: grid;
  grid-template-columns: 1rem minmax(0, 1fr) auto;
  gap: .55rem;
  align-items: center;
  min-height: 3rem;
  padding: .5rem .65rem;
  border-inline-start: 3px solid transparent;
  color: var(--ink);
  cursor: pointer;
}

.nature-map-choice:hover { background: var(--surface-muted-hover); }
.nature-map-choice:has(:checked) {
  border-inline-start-color: var(--idfm-blue);
  background: var(--surface-muted);
}
.nature-map-choice:has(:focus-visible) {
  outline: 2px solid var(--idfm-blue);
  outline-offset: -2px;
}
.nature-map-choice input {
  position: absolute;
  inset-inline-start: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.nature-map-choice__check { visibility: hidden; }
.nature-map-choice:has(:checked) .nature-map-choice__check { visibility: visible; }
.nature-map-choice__name { font-size: .92rem; font-weight: 650; overflow-wrap: anywhere; }
.nature-map-choice__area { display: block; color: var(--muted); font-size: .75rem; font-weight: 500; }
.nature-map-choice__walk { display: grid; justify-items: end; font-variant-numeric: tabular-nums; }
.nature-map-choice__duration {
  display: flex;
  align-items: center;
  gap: .2rem;
  color: var(--muted);
  font-size: .75rem;
  white-space: nowrap;
}
.nature-map-choice__duration--primary { order: -1; font-weight: 750; color: var(--ink); font-size: .94rem; }
</style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Bell, BellRing, ChevronDown, Route, Trash } from "lucide-vue-next";
import LineIconBadge from "./LineIconBadge.vue";
import type {
  Departure,
  DirectionDepartureGroup,
  TransitBoardConfig,
} from "../types/transit";

type DeparturePatternPayload = {
  board: TransitBoardConfig;
  directionGroup: DirectionDepartureGroup;
  departure: Departure;
};

const props = defineProps<{
  board: TransitBoardConfig;
  departures: Departure[];
  directionGroups: DirectionDepartureGroup[];
  collapsedDirectionIds: string[];
  loading: boolean;
  error?: string;
  updatedAt?: Date;
  removable?: boolean;
  alarmDepartureIds?: string[];
}>();

const emit = defineEmits<{
  remove: [];
  "schedule-alarm": [
    payload: {
      board: TransitBoardConfig;
      directionGroup: DirectionDepartureGroup;
      departure: Departure;
    },
  ];
  "show-pattern": [payload: DeparturePatternPayload];
  toggleDirection: [directionId: string];
}>();

const displayedDeparturesCount = computed(() =>
  props.directionGroups.reduce(
    (total, group) => total + group.departures.length,
    0,
  ),
);
const isCompactPatternInteraction = ref(false);
let compactPatternMediaQuery: MediaQueryList | undefined;

const statusLabels: Record<string, string> = {
  noReport: "À l'heure",
  onTime: "À l'heure",
  delayed: "Retardé",
  early: "En avance",
  missed: "Manqué",
  cancelled: "Supprimé",
};

function formatClock(value?: string): string {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function formatWait(value?: string, vehicleAtStop = false): string {
  if (vehicleAtStop) {
    return "À quai";
  }

  if (!value) {
    return "";
  }

  const minutes = Math.max(
    0,
    Math.round((new Date(value).getTime() - Date.now()) / 60000),
  );

  if (minutes === 0) {
    return "Maintenant";
  }

  return `${minutes} min`;
}

function statusLabel(status?: string): string {
  return status ? (statusLabels[status] ?? status) : "";
}

function isDirectionCollapsed(directionId: string): boolean {
  return props.collapsedDirectionIds.includes(directionId);
}

function formatLastDetail(group: DirectionDepartureGroup): string {
  if (!group.lastDeparture) {
    return "";
  }

  const dayHint =
    getParisDateKey(group.lastDeparture.time) === getParisDateKey(new Date())
      ? "Aujourd'hui"
      : "Après minuit";

  return `${dayHint} · ${group.lastDeparture.destination}`;
}

function getParisDateKey(value: string | Date): string {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).format(new Date(value));
}

function hasAlarm(departure: Departure): boolean {
  return props.alarmDepartureIds?.includes(departure.id) ?? false;
}

function formatDepartureMeta(departure: Departure): string {
  const normalizedLabel = normalizeText(departure.monitoringLabel);
  const normalizedDestination = normalizeText(departure.destination);
  const parts: string[] = [];

  if (
    departure.monitoringLabel &&
    normalizedLabel !== "tous quais" &&
    normalizedLabel !== "tous quais." &&
    normalizedLabel !== "horaire idfm" &&
    normalizedLabel !== normalizedDestination
  ) {
    parts.push(departure.monitoringLabel);
  }

  if (departure.platform) {
    parts.push(`Quai ${departure.platform}`);
  } else if (normalizedLabel === "tous quais") {
    parts.push("Tous quais");
  }

  return parts.join(" · ");
}

function canShowPattern(): boolean {
  return true;
}

function canAutoOpenPattern(): boolean {
  return canShowPattern() && !isCompactPatternInteraction.value;
}

function openPatternForDeparture(payload: DeparturePatternPayload): void {
  emit("show-pattern", payload);
}

function normalizeText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function syncCompactPatternInteraction(event?: MediaQueryListEvent): void {
  isCompactPatternInteraction.value =
    event?.matches ?? compactPatternMediaQuery?.matches ?? false;
}

onMounted(() => {
  compactPatternMediaQuery = window.matchMedia("(max-width: 1024px)");
  syncCompactPatternInteraction();
  compactPatternMediaQuery.addEventListener(
    "change",
    syncCompactPatternInteraction,
  );
});

onUnmounted(() => {
  compactPatternMediaQuery?.removeEventListener(
    "change",
    syncCompactPatternInteraction,
  );
});
</script>

<template>
  <article class="board" :style="{ '--line-color': board.line.color }">
    <header class="board__header">
      <LineIconBadge
        class="board-line-icon"
        :line="board.line"
        :aria-label="board.line.longName"
      />
      <div>
        <p class="board__mode">{{ board.line.longName }}</p>
        <h2>{{ board.title }}</h2>
        <p class="board__city">{{ board.city }}</p>
      </div>
      <button
        v-if="removable"
        class="delete-board-button"
        type="button"
        aria-label="Supprimer cette station"
        @click="emit('remove')"
      >
        <Trash />
      </button>
    </header>

    <div v-if="error" class="notice notice--error">
      {{ error }}
    </div>

    <div v-else-if="loading && displayedDeparturesCount === 0" class="notice">
      Chargement des passages...
    </div>

    <div v-else class="direction-groups">
      <section
        v-for="group in directionGroups"
        :key="group.id"
        class="direction-section"
        :class="{
          'direction-section--collapsed': isDirectionCollapsed(group.id),
        }"
      >
        <button
          class="direction-section__header"
          type="button"
          :aria-expanded="!isDirectionCollapsed(group.id)"
          @click="emit('toggleDirection', group.id)"
        >
          <div class="direction-section__title">
            <p>Direction</p>
            <h3 style="font-weight: 600;">{{ group.label }}</h3>
          </div>

          <div class="last-service">
            <span>Dernier passage</span>
            <strong>
              {{
                group.lastDeparture
                  ? formatClock(group.lastDeparture.time)
                  : "--:--"
              }}
            </strong>
            <small v-if="group.lastDeparture">
              {{ formatLastDetail(group) }}
            </small>
          </div>
          <span class="accordion-chevron" aria-hidden="true">
            <ChevronDown :size="20" stroke-width="2.8" />
          </span>
        </button>

        <div class="direction-section__body">
          <div class="direction-section__body-inner">
            <ol v-if="group.departures.length > 0" class="departures">
              <li
                v-for="departure in group.departures"
                :key="departure.id"
                class="departure"
                :class="{
                  'departure--cancelled': departure.status === 'cancelled',
                }"
                @click="
                  canAutoOpenPattern() &&
                  openPatternForDeparture({
                    board,
                    directionGroup: group,
                    departure,
                  })
                "
              >
                <button
                  v-if="canAutoOpenPattern()"
                  class="departure__main departure__main-button"
                  type="button"
                  @click.stop="
                    openPatternForDeparture({
                      board,
                      directionGroup: group,
                      departure,
                    })
                  "
                  @keydown.enter.prevent="
                    openPatternForDeparture({
                      board,
                      directionGroup: group,
                      departure,
                    })
                  "
                  @keydown.space.prevent="
                    openPatternForDeparture({
                      board,
                      directionGroup: group,
                      departure,
                    })
                  "
                >
                  <strong>{{ departure.destination }}</strong>
                  <span v-if="formatDepartureMeta(departure)">
                    {{ formatDepartureMeta(departure) }}
                  </span>
                </button>
                <div v-else class="departure__main">
                  <strong>{{ departure.destination }}</strong>
                  <span v-if="formatDepartureMeta(departure)">
                    {{ formatDepartureMeta(departure) }}
                  </span>
                </div>

                <div class="departure__time">
                  <strong>{{
                    formatWait(
                      departure.expectedDepartureTime,
                      departure.vehicleAtStop,
                    )
                  }}</strong>
                  <span>{{
                    formatClock(departure.expectedDepartureTime)
                  }}</span>
                </div>

                <div v-if="statusLabel(departure.status)" class="status-pill">
                  {{ statusLabel(departure.status) }}
                </div>

                <button
                  v-if="canShowPattern()"
                  class="departure-pattern-button"
                  type="button"
                  aria-label="Afficher la desserte"
                  @click.stop="
                    openPatternForDeparture({
                      board,
                      directionGroup: group,
                      departure,
                    })
                  "
                >
                  <Route :size="18" aria-hidden="true" />
                </button>

                <button
                  class="departure-alarm-button"
                  :class="{
                    'departure-alarm-button--active': hasAlarm(departure),
                  }"
                  type="button"
                  :aria-label="
                    hasAlarm(departure)
                      ? 'Alarme programmée'
                      : 'Programmer une alarme'
                  "
                  @click.stop="
                    emit('schedule-alarm', {
                      board,
                      directionGroup: group,
                      departure,
                    })
                  "
                >
                  <BellRing
                    v-if="hasAlarm(departure)"
                    :size="18"
                    aria-hidden="true"
                  />
                  <Bell v-else :size="18" aria-hidden="true" />
                </button>
              </li>
            </ol>

            <div v-else class="notice notice--compact">
              {{
                group.serviceEnded
                  ? "Service terminé"
                  : "Aucun passage imminent"
              }}
            </div>
          </div>
        </div>
      </section>
    </div>

    <footer class="board__footer">
      <span>{{ displayedDeparturesCount }} passages</span>
    </footer>
  </article>
</template>

<template>
  <main class="line-pattern-page">
    <DeparturePatternModal
      embedded
      open
      wheel-zoom
      :board="patternView?.board"
      :departure="patternView?.departure"
      :pattern="patternView?.pattern"
      :direction-options="directionOptions"
      :selected-direction-id="selectedDirectionId"
      :full-line="isFullLineSelected"
      :loading="pending"
      :error="errorMessage"
      @close="navigateHome"
      @direction-change="changeDirection"
    />

    <section
      v-if="pending || errorMessage"
      class="line-pattern-page__fallback"
      aria-live="polite"
    >
      <p class="eyebrow">Schéma de ligne</p>
      <h1>{{ pageTitle }}</h1>
      <p v-if="pending">Chargement du schéma...</p>
      <p v-else-if="errorMessage">{{ errorMessage }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useFetch, useRoute, navigateTo } from "#imports";
import { DeparturePatternModal } from "../../../src/features/service-pattern";
import type { LinePatternViewResponse } from "../../../src/types/transit";

const LINE_COMPLETE_DIRECTION_ID = "line-complete";
const route = useRoute();
const apiUrl = computed(() => {
  const params = new URLSearchParams();
  const direction = firstRouteQuery(route.query.direction);
  const startStation = firstRouteQuery(route.query.startStation);

  if (direction && direction !== LINE_COMPLETE_DIRECTION_ID) {
    params.set("direction", direction);
  }

  if (startStation) {
    params.set("startStation", startStation);
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";

  return `/api/lines/${encodeURIComponent(route.params.transportType as string)}/${encodeURIComponent(
    route.params.lineId as string,
  )}/pattern${suffix}`;
});
const { data: patternView, pending, error } =
  useFetch<LinePatternViewResponse>(apiUrl);
const selectedDirectionId = computed(
  () => firstRouteQuery(route.query.direction) ?? LINE_COMPLETE_DIRECTION_ID,
);
const isFullLineSelected = computed(
  () => selectedDirectionId.value === LINE_COMPLETE_DIRECTION_ID,
);
const directionOptions = computed(() => [
  {
    id: LINE_COMPLETE_DIRECTION_ID,
    label: "Ligne complète",
  },
  ...(patternView.value?.directionOptions ?? []),
]);

const errorMessage = computed(() =>
  error.value ? "Impossible de charger ce schéma de ligne." : "",
);
const pageTitle = computed(() => {
  if (patternView.value) {
    return `${patternView.value.board.line.longName} · ${patternView.value.pattern.destination}`;
  }

  return `${route.params.transportType}/${route.params.lineId}`;
});

function navigateHome(): void {
  void navigateTo("/");
}

function changeDirection(directionId: string): void {
  const query: Record<string, string> = {
    direction: directionId,
  };
  const startStation = firstRouteQuery(route.query.startStation);

  if (startStation) {
    query.startStation = startStation;
  }

  void navigateTo({
    path: route.path,
    query,
  });
}

function firstRouteQuery(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return typeof value === "string" ? value : undefined;
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import type {
  Departure,
  DepartureCallingPattern,
  DepartureServiceType,
  TransitBoardConfig,
} from "../../types/transit";

const props = defineProps<{
  open: boolean;
  board?: TransitBoardConfig;
  departure?: Departure;
  pattern?: DepartureCallingPattern;
  loading?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const serviceLabel = computed(() =>
  props.pattern ? formatServiceType(props.pattern.serviceType) : "Desserte",
);

function formatClock(value?: string): string {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function formatServiceType(type: DepartureServiceType): string {
  if (type === "semi-direct") {
    return "Semi-direct";
  }

  if (type === "direct") {
    return "Direct";
  }

  if (type === "omnibus") {
    return "Omnibus";
  }

  return "Desserte";
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-scale">
      <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
        <section
          class="modal-panel modal-panel--wide pattern-modal"
          aria-modal="true"
          role="dialog"
        >
          <header class="modal-panel__header">
            <div class="pattern-modal__title">
              <div
                v-if="board"
                class="line-badge pattern-modal__line"
                :style="{
                  backgroundColor: board.line.color,
                  color: board.line.textColor,
                }"
              >
                {{ board.line.shortName }}
              </div>
              <div>
                <p class="eyebrow">{{ serviceLabel }}</p>
                <h2>{{ departure?.destination ?? "Desserte du passage" }}</h2>
                <span v-if="board">
                  {{ board.title }}
                  <template v-if="departure?.platform"> · Quai {{ departure.platform }}</template>
                </span>
              </div>
            </div>
            <button
              class="icon-button"
              type="button"
              aria-label="Fermer"
              @click="emit('close')"
            >
              ×
            </button>
          </header>

          <div class="pattern-modal__body">
            <div v-if="loading" class="pattern-modal__state">
              <span aria-hidden="true" class="loader-dot"></span>
              Chargement de la desserte
            </div>

            <div v-else-if="error || pattern?.error" class="pattern-modal__state pattern-modal__state--error">
              {{ error ?? pattern?.error }}
            </div>

            <div
              v-else-if="pattern && pattern.calls.length > 0"
              class="pattern-timeline"
              :style="{ '--line-color': board?.line.color ?? '#0064ff' }"
            >
              <ol class="pattern-timeline__rail">
                <li
                  v-for="call in pattern.calls"
                  :key="call.id"
                  class="pattern-stop"
                  :class="{ 'pattern-stop--current': call.current }"
                >
                  <span class="pattern-stop__dot" aria-hidden="true"></span>
                  <strong>{{ call.label }}</strong>
                  <small v-if="call.time">{{ formatClock(call.time) }}</small>
                </li>
              </ol>
            </div>

            <div v-else class="pattern-modal__state">
              Desserte indisponible pour ce passage.
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>


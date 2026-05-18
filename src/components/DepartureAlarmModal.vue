<script setup lang="ts">
import { BellRing, Volume2 } from "lucide-vue-next";
import { reactive, watch } from "vue";
import LineIconBadge from "./LineIconBadge.vue";
import type {
  AlarmDraft,
  Departure,
  TransitBoardConfig,
} from "../types/transit";

const props = defineProps<{
  board?: TransitBoardConfig;
  departure?: Departure;
  open: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [draft: AlarmDraft];
}>();

const draft = reactive<AlarmDraft>({
  minutesBefore: 5,
  soundEnabled: true,
});

watch(
  () => props.open,
  (open) => {
    if (open) {
      draft.minutesBefore = 5;
      draft.soundEnabled = true;
    }
  },
);

function confirmAlarm(): void {
  emit("confirm", {
    minutesBefore: Math.max(1, Math.min(120, Math.round(draft.minutesBefore))),
    soundEnabled: draft.soundEnabled,
  });
}

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

function departureTime(departure?: Departure): string | undefined {
  return (
    departure?.expectedDepartureTime ??
    departure?.expectedArrivalTime ??
    departure?.aimedDepartureTime
  );
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-scale">
      <div v-if="open" class="modal-backdrop" @click.self="emit('cancel')">
        <section
          class="modal-panel alarm-modal"
          aria-modal="true"
          role="dialog"
        >
          <header class="modal-panel__header">
            <div>
              <p class="eyebrow">Alarme</p>
              <h2>Prévenir avant le passage</h2>
            </div>
            <button
              class="icon-button"
              type="button"
              aria-label="Fermer"
              @click="emit('cancel')"
            >
              ×
            </button>
          </header>

          <div class="alarm-form">
            <div class="alarm-summary">
              <LineIconBadge
                v-if="board"
                class="alarm-summary__line"
                :line="board.line"
              />
              <div>
                <strong>{{ departure?.destination ?? "Passage" }}</strong>
                <span>
                  {{ departure?.monitoringLabel }}
                  <template v-if="departure?.platform">
                    · Quai {{ departure.platform }}</template
                  >
                  · {{ formatClock(departureTime(departure)) }}
                </span>
              </div>
            </div>

            <label>
              <span>Lancer l'alarme combien de minutes avant le passage</span>
              <input
                v-model.number="draft.minutesBefore"
                inputmode="numeric"
                max="120"
                min="1"
                pattern="[0-9]*"
                step="1"
                type="text"
              />
            </label>

            <label class="checkbox-row" style="display: flex">
              <input v-model="draft.soundEnabled" type="checkbox" />
              <span>
                <Volume2 :size="18" aria-hidden="true" />
                Activer le son
              </span>
            </label>
          </div>

          <footer class="modal-panel__footer">
            <button
              class="button-secondary"
              type="button"
              @click="emit('cancel')"
            >
              Annuler
            </button>
            <button type="button" @click="confirmAlarm">
              <BellRing :size="18" aria-hidden="true" />
              Confirmer
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>


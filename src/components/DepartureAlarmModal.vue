<script setup lang="ts">
import { BellOff, BellRing, ShieldCheck, Volume2 } from "lucide-vue-next";
import { computed, nextTick, reactive, ref, watch } from "vue";
import LineIconBadge from "./LineIconBadge.vue";
import { useI18n } from "../i18n";
import type {
  AlarmDraft,
  Departure,
  DepartureAlarm,
  TransitBoardConfig,
} from "../types/transit";

const props = defineProps<{
  board?: TransitBoardConfig;
  departure?: Departure;
  activeAlarm?: DepartureAlarm;
  open: boolean;
  nativeSoundRequired?: boolean;
  nativePermissionState?: "ready" | "required" | "checking";
  busy?: boolean;
  error?: string;
  aboveFullscreen?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [draft: AlarmDraft];
  remove: [];
  "request-native-permissions": [];
}>();

const draft = reactive<AlarmDraft>({
  minutesBefore: 5,
  soundEnabled: true,
});
const dialog = ref<HTMLElement>();
const { d, t } = useI18n();
const isRemovalMode = computed(() => Boolean(props.activeAlarm));
const displayDestination = computed(
  () =>
    props.departure?.destination ??
    props.activeAlarm?.destination ??
    t("alarm.fallbackDeparture"),
);
const displayMonitoringLabel = computed(
  () => props.departure?.monitoringLabel ?? props.activeAlarm?.monitoringLabel ?? "",
);
const displayPlatform = computed(
  () => props.departure?.platform ?? props.activeAlarm?.platform,
);
const displayDepartureTime = computed(
  () => departureTime(props.departure) ?? props.activeAlarm?.scheduledDepartureTime,
);

watch(
  () => [props.open, props.activeAlarm?.id] as const,
  ([open]) => {
    if (open) {
      draft.minutesBefore = 5;
      draft.soundEnabled = true;
      void nextTick(() => dialog.value?.focus());
    }
  },
);

function confirmAlarm(): void {
  if (props.busy || props.nativePermissionState === "required") {
    return;
  }

  emit("confirm", {
    minutesBefore: Math.max(1, Math.min(120, Math.round(draft.minutesBefore))),
    soundEnabled: props.nativeSoundRequired ? true : draft.soundEnabled,
  });
}

function closeModal(): void {
  if (!props.busy) {
    emit("cancel");
  }
}

function formatClock(value?: string): string {
  if (!value) {
    return "--:--";
  }

  return d(new Date(value), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
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
      <div
        v-if="open"
        class="modal-backdrop"
        :class="{ 'alarm-modal-backdrop--above-fullscreen': aboveFullscreen }"
        @click.self="closeModal"
      >
        <section
          ref="dialog"
          class="modal-panel alarm-modal"
          aria-modal="true"
          role="dialog"
          tabindex="-1"
          :aria-busy="busy || nativePermissionState === 'checking'"
          @keydown.esc.prevent="closeModal"
        >
          <header class="modal-panel__header">
            <div>
              <p class="eyebrow">{{ t("alarm.eyebrow") }}</p>
              <h2>
                {{ isRemovalMode ? t("alarm.cancelTitle") : t("alarm.title") }}
              </h2>
            </div>
            <button
              class="icon-button"
              type="button"
              :aria-label="t('common.actions.close')"
              :disabled="busy"
              @click="closeModal"
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
                <strong>{{ displayDestination }}</strong>
                <span>
                  {{ displayMonitoringLabel }}
                  <template v-if="displayPlatform">
                    · {{ t("app.platform", { platform: displayPlatform }) }}</template
                  >
                  · {{ formatClock(displayDepartureTime) }}
                </span>
              </div>
            </div>

            <template v-if="activeAlarm">
              <dl class="alarm-modal__details">
                <div>
                  <dt>{{ t("alarm.triggerTime") }}</dt>
                  <dd>{{ formatClock(activeAlarm.alarmTime) }}</dd>
                </div>
                <div>
                  <dt>{{ t("alarm.advance") }}</dt>
                  <dd>{{ t("alarm.minutesBeforeValue", { count: activeAlarm.minutesBefore }) }}</dd>
                </div>
              </dl>
              <p class="alarm-modal__removal-copy">{{ t("alarm.cancelDescription") }}</p>
            </template>

            <template v-else>
              <div
                v-if="nativePermissionState !== 'ready' && nativeSoundRequired"
                class="alarm-modal__permission"
              >
                <ShieldCheck :size="22" aria-hidden="true" />
                <div>
                  <strong>{{ t("alarm.permissionTitle") }}</strong>
                  <p>{{ t("alarm.permissionDescription") }}</p>
                </div>
                <button
                  v-if="nativePermissionState === 'required'"
                  class="button-secondary"
                  type="button"
                  :disabled="busy"
                  @click="emit('request-native-permissions')"
                >
                  {{ t("alarm.authorize") }}
                </button>
                <span v-else>{{ t("alarm.checkingPermissions") }}</span>
              </div>

              <label>
                <span>{{ t("alarm.minutesLabel") }}</span>
                <input
                  v-model.number="draft.minutesBefore"
                  inputmode="numeric"
                  max="120"
                  min="1"
                  pattern="[0-9]*"
                  step="1"
                  type="text"
                  :disabled="busy"
                />
              </label>

              <div v-if="nativeSoundRequired" class="alarm-modal__native-sound">
                <Volume2 :size="18" aria-hidden="true" />
                <span>{{ t("alarm.nativeSound") }}</span>
              </div>
              <label v-else class="checkbox-row" style="display: flex">
                <input v-model="draft.soundEnabled" type="checkbox" :disabled="busy" />
                <span>
                  <Volume2 :size="18" aria-hidden="true" />
                  {{ t("alarm.sound") }}
                </span>
              </label>
            </template>

            <p v-if="error" class="alarm-modal__error" role="alert">{{ error }}</p>
          </div>

          <footer class="modal-panel__footer">
            <template v-if="isRemovalMode">
              <button class="button-secondary" type="button" :disabled="busy" @click="closeModal">
                {{ t("alarm.keep") }}
              </button>
              <button class="alarm-modal__danger" type="button" :disabled="busy" @click="emit('remove')">
                <BellOff :size="18" aria-hidden="true" />
                {{ busy ? t("alarm.cancelling") : t("alarm.cancelAction") }}
              </button>
            </template>
            <template v-else>
              <button class="button-secondary" type="button" :disabled="busy" @click="closeModal">
                {{ t("common.actions.cancel") }}
              </button>
              <button
                type="button"
                :disabled="busy || nativePermissionState === 'required' || nativePermissionState === 'checking'"
                @click="confirmAlarm"
              >
                <BellRing :size="18" aria-hidden="true" />
                {{ busy ? t("alarm.scheduling") : t("common.actions.confirm") }}
              </button>
            </template>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.alarm-modal-backdrop--above-fullscreen {
  z-index: 12080;
}

.alarm-modal:focus {
  outline: none;
}

.alarm-modal__details {
  display: grid;
  gap: 10px;
  margin: 0;
}

.alarm-modal__details > div {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.alarm-modal__details dt,
.alarm-modal__removal-copy,
.alarm-modal__permission p {
  color: var(--muted);
}

.alarm-modal__details dd,
.alarm-modal__removal-copy,
.alarm-modal__permission p {
  margin: 0;
}

.alarm-modal__details dd {
  font-weight: 800;
}

.alarm-modal__permission {
  align-items: start;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
  border-radius: 14px;
  display: grid;
  gap: 10px;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 14px;
}

.alarm-modal__permission button,
.alarm-modal__permission > span {
  grid-column: 2;
  justify-self: start;
}

.alarm-modal__native-sound {
  align-items: center;
  display: flex;
  font-weight: 700;
  gap: 9px;
}

.alarm-modal__error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  color: #991b1b;
  margin: 0;
  padding: 10px 12px;
}

.alarm-modal__danger {
  background: #b91c1c;
}

.alarm-modal__danger:hover:not(:disabled) {
  background: #991b1b;
}
</style>


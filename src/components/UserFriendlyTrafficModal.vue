<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { useI18n } from "../i18n";
import type { TrafficAlertModalData } from "../features/traffic";
import UserFriendlyTraffic from "./UserFriendlyTraffic.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    alert?: TrafficAlertModalData;
    smartFormattingEnabled?: boolean;
    showGoToTraficPage?: boolean;
  }>(),
  {
    alert: undefined,
    smartFormattingEnabled: true,
    showGoToTraficPage: false,
  },
);

const emit = defineEmits<{
  close: [];
  "go-to-traffic-page": [];
}>();

const { t } = useI18n();
const dialog = ref<HTMLElement>();
const activeTrafficModalDisruptionIndex = ref(0);
let previousFocus: HTMLElement | undefined;

const trafficModalDisruptions = computed(() => {
  const alert = props.alert;
  if (!alert) return [];
  if (alert.disruptions?.length) return alert.disruptions;

  return alert.disruption ? [alert.disruption] : [];
});

const activeTrafficModalDisruption = computed(
  () =>
    trafficModalDisruptions.value[activeTrafficModalDisruptionIndex.value] ??
    trafficModalDisruptions.value[0],
);

const hasMultipleTrafficModalDisruptions = computed(
  () => trafficModalDisruptions.value.length > 1,
);

const trafficModalTitle = computed(
  () =>
    props.alert?.title ||
    activeTrafficModalDisruption.value?.title ||
    props.alert?.label ||
    "",
);

function focusDialog(): void {
  void nextTick(() => dialog.value?.focus());
}

function restorePreviousFocus(): void {
  if (previousFocus?.isConnected) {
    previousFocus.focus();
  }

  previousFocus = undefined;
}

function openModal(): void {
  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
  focusDialog();
}

function closeModal(): void {
  emit("close");
}

function selectTrafficModalDisruption(index: number): void {
  if (index < 0 || index >= trafficModalDisruptions.value.length) return;

  activeTrafficModalDisruptionIndex.value = index;
}

watch(
  () =>
    [
      props.open,
      trafficModalDisruptions.value
        .map((disruption) => disruption.id)
        .join("|"),
      props.alert?.label,
    ] as const,
  ([open]) => {
    activeTrafficModalDisruptionIndex.value = 0;
    if (open) {
      openModal();
    } else {
      restorePreviousFocus();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  restorePreviousFocus();
});
</script>

<template>
  <Transition name="traffic-alert-modal">
    <div
      v-if="open && alert"
      class="modal-backdrop traffic-alert-modal-backdrop fullscreen-station-panel__traffic-modal-backdrop"
      @click.self="closeModal"
      @pointerdown.stop
    >
      <article
        ref="dialog"
        class="traffic-alert-modal fullscreen-station-panel__traffic-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="trafficModalTitle"
        tabindex="-1"
        @keydown.esc.prevent.stop="closeModal"
      >
        <header
          class="traffic-alert-modal__header fullscreen-station-panel__traffic-modal-header"
        >
          <button
            class="traffic-alert-modal__close fullscreen-station-panel__traffic-modal-close"
            type="button"
            :aria-label="t('app.closeTrafficModalAria')"
            @click="closeModal"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div
          class="traffic-alert-modal__body fullscreen-station-panel__traffic-modal-body"
        >
          <UserFriendlyTraffic
            v-if="activeTrafficModalDisruption"
            :alert="alert"
            collapsible
            compact
            :critical="alert.tone === 'red'"
            :disruption="activeTrafficModalDisruption"
            :smart-formatting-enabled="smartFormattingEnabled"
            surface="plain"
          />

          <footer
            v-if="hasMultipleTrafficModalDisruptions || showGoToTraficPage"
            class="traffic-alert-modal__footer"
          >
            <nav
              v-if="hasMultipleTrafficModalDisruptions"
              class="traffic-alert-modal__stepper"
              :aria-label="t('app.trafficModalMultipleInterruptionsAria')"
            >
              <button
                v-for="(disruption, index) in trafficModalDisruptions"
                :key="disruption.id"
                class="traffic-alert-modal__stepper-dot"
                :class="{
                  'traffic-alert-modal__stepper-dot--active':
                    index === activeTrafficModalDisruptionIndex,
                }"
                type="button"
                :aria-current="
                  index === activeTrafficModalDisruptionIndex
                    ? 'step'
                    : undefined
                "
                :aria-label="
                  t('app.trafficModalInterruptionStepAria', {
                    index: index + 1,
                    count: trafficModalDisruptions.length,
                  })
                "
                @click="selectTrafficModalDisruption(index)"
              />
            </nav>
            <div v-if="showGoToTraficPage" class="traffic-alert-modal__actions">
              <button
                class="traffic-alert-modal__go-to-traffic"
                type="button"
                @click="emit('go-to-traffic-page')"
              >
                {{ t("app.openTrafficPage") }}
              </button>
            </div>
          </footer>
        </div>
      </article>
    </div>
  </Transition>
</template>

<style scoped>
.traffic-alert-modal-backdrop {
  align-items: center;
  background: rgba(2, 6, 23, 0.74);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: clamp(16px, 4vw, 48px);
  position: fixed;
  z-index: 12020;
}

.traffic-alert-modal {
  background: #ffffff;
  border-radius: 24px;
  box-shadow: 0 32px 90px rgba(0, 0, 0, 0.42);
  color: #0f172a;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  max-height: min(76dvh, 680px);
  max-width: 700px;
  overflow: hidden;
  width: min(100%, 700px);
}

.traffic-alert-modal__header {
  display: flex;
  justify-content: flex-end;
  padding: 14px 16px 0;
}

.traffic-alert-modal__close {
  align-items: center;
  background: #f1f5f9;
  border: 0;
  border-radius: 999px;
  color: #0f172a;
  display: inline-flex;
  flex: 0 0 auto;
  height: 44px;
  justify-content: center;
  padding: 0;
  width: 44px;
}

.traffic-alert-modal__close svg {
  height: 22px;
  width: 22px;
}

.traffic-alert-modal__body {
  display: grid;
  gap: 18px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px clamp(20px, 4vw, 32px) clamp(20px, 4vw, 32px);
}

.traffic-alert-modal__footer {
  align-items: center;
  border-top: 1px solid #e2e8f0;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  padding-top: 18px;
}

.traffic-alert-modal__stepper {
  align-items: center;
  display: flex;
  gap: 2px;
  grid-column: 2;
  justify-content: center;
}

.traffic-alert-modal__stepper-dot {
  align-items: center;
  background: transparent;
  border: 0;
  display: inline-flex;
  height: 28px;
  justify-content: center;
  padding: 0;
  width: 18px;
}

.traffic-alert-modal__stepper-dot::before {
  background: #d1d5db;
  border-radius: 999px;
  content: "";
  height: 7px;
  transition:
    background-color 140ms ease,
    transform 140ms ease;
  width: 7px;
}

.traffic-alert-modal__stepper-dot:hover::before,
.traffic-alert-modal__stepper-dot:focus-visible::before {
  background: #a78bfa;
}

.traffic-alert-modal__stepper-dot:focus-visible {
  border-radius: 999px;
  outline: 2px solid rgba(124, 58, 237, 0.34);
  outline-offset: 0;
}

.traffic-alert-modal__stepper-dot--active::before {
  background: #6d4aff;
  transform: scale(1.12);
}

.traffic-alert-modal__actions {
  display: flex;
  grid-column: 3;
  justify-content: flex-end;
}

.traffic-alert-modal__go-to-traffic {
  background: #0f172a;
  border: 0;
  border-radius: 999px;
  color: #ffffff;
  font: inherit;
  font-weight: 800;
  min-height: 44px;
  padding: 10px 18px;
}

.traffic-alert-modal-enter-active,
.traffic-alert-modal-leave-active {
  transition: opacity 160ms ease;
}

.traffic-alert-modal-enter-from,
.traffic-alert-modal-leave-to {
  opacity: 0;
}

@media (max-width: 560px) {
  .traffic-alert-modal-backdrop {
    padding: 0;
  }

  .traffic-alert-modal {
    border-radius: 0;
    max-height: 100dvh;
    max-width: none;
    width: 100%;
  }

  .traffic-alert-modal__footer {
    grid-template-columns: 1fr auto 1fr;
  }

  .traffic-alert-modal__go-to-traffic {
    font-size: 0.86rem;
    padding-inline: 14px;
  }
}
</style>

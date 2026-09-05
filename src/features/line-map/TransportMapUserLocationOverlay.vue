<template>
  <Transition name="global-map-location-request">
    <div
      v-if="requestVisible"
      class="global-transport-plan__location-request"
      role="status"
      aria-live="polite"
    >
      <span>{{ t("globalMap.page.location.requestDescription") }}</span>
      <button
        type="button"
        class="global-transport-plan__location-request-button"
        :disabled="loading"
        @click="emit('request')"
      >
        {{ loading ? t("globalMap.page.location.checking") : t("globalMap.page.location.enable") }}
      </button>
    </div>
  </Transition>

  <div
    v-if="markerVisible"
    class="global-transport-plan__user-location"
    :class="{ 'global-transport-plan__user-location--stale': stale }"
    :style="markerStyle"
    role="img"
    :aria-label="t('globalMap.page.location.markerAria')"
  >
    <span class="global-transport-plan__user-location-halo" aria-hidden="true" />
    <span class="global-transport-plan__user-location-dot" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "../../i18n";

defineProps<{
  requestVisible: boolean;
  loading: boolean;
  markerVisible: boolean;
  stale: boolean;
  markerStyle: Record<string, string>;
}>();

const emit = defineEmits<{
  request: [];
}>();

const { t } = useI18n();
</script>

<style scoped>
.global-transport-plan__location-request {
  position: absolute;
  z-index: 4;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(390px, calc(100% - 32px));
  padding: 9px 10px 9px 12px;
  border: 1px solid rgba(59, 130, 246, 0.28);
  border-radius: 12px;
  background: rgba(239, 246, 255, 0.94);
  color: #1e3a8a;
  box-shadow: 0 8px 24px rgba(30, 64, 175, 0.16);
  backdrop-filter: blur(12px);
  font-size: 0.74rem;
  line-height: 1.35;
}
.global-transport-plan__location-request-button {
  flex: 0 0 auto;
  padding: 6px 9px;
  border: 0;
  border-radius: 8px;
  background: #1457d9;
  color: #fff;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.global-transport-plan__location-request-button:hover,
.global-transport-plan__location-request-button:focus-visible {
  background: #0f46b2;
}
.global-transport-plan__location-request-button:disabled {
  cursor: wait;
  opacity: 0.62;
}
.global-map-location-request-enter-active,
.global-map-location-request-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}
.global-map-location-request-enter-from,
.global-map-location-request-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.global-transport-plan__user-location {
  position: absolute;
  z-index: 3;
  width: 24px;
  height: 24px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.global-transport-plan__user-location-halo {
  position: absolute;
  inset: -12px;
  border: 1px solid rgba(37, 99, 235, 0.34);
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    rgba(96, 165, 250, 0.06),
    rgba(37, 99, 235, 0.56),
    rgba(59, 130, 246, 0.04),
    rgba(37, 99, 235, 0.46),
    rgba(96, 165, 250, 0.06)
  );
  box-shadow:
    0 0 0 5px rgba(37, 99, 235, 0.08),
    0 0 22px rgba(37, 99, 235, 0.34);
  animation:
    global-map-user-location-rotate 4.8s linear infinite,
    global-map-user-location-halo 2.6s ease-out infinite;
}
.global-transport-plan__user-location-dot {
  position: absolute;
  inset: 4px;
  border: 2px solid rgba(255, 255, 255, 0.96);
  border-radius: 50%;
  background: linear-gradient(145deg, #60a5fa 0%, #1464e8 42%, #003ecb 100%);
  box-shadow:
    0 0 0 2px rgba(0, 64, 210, 0.22),
    0 3px 12px rgba(0, 54, 180, 0.44);
  animation: global-map-user-location-glow 2.6s ease-in-out infinite;
}
.global-transport-plan__user-location--stale .global-transport-plan__user-location-halo {
  filter: grayscale(0.8);
  opacity: 0.38;
}
.global-transport-plan__user-location--stale .global-transport-plan__user-location-dot {
  background: linear-gradient(145deg, #cbd5e1, #94a3b8);
  box-shadow:
    0 0 0 2px rgba(100, 116, 139, 0.2),
    0 3px 10px rgba(71, 85, 105, 0.22);
  animation: none;
}
@keyframes global-map-user-location-rotate {
  to {
    transform: rotate(360deg);
  }
}
@keyframes global-map-user-location-halo {
  0% {
    opacity: 0.76;
    transform: scale(0.72);
  }
  58% {
    opacity: 0.3;
  }
  100% {
    opacity: 0;
    transform: scale(1.28);
  }
}
@keyframes global-map-user-location-glow {
  0%,
  100% {
    transform: scale(0.92);
  }
  50% {
    transform: scale(1.08);
  }
}

@media (max-width: 700px) {
  .global-transport-plan__location-request {
    top: 10px;
    right: 10px;
    left: 10px;
    max-width: none;
    justify-content: space-between;
  }
}

@media (prefers-reduced-motion: reduce) {
  .global-transport-plan__user-location-halo,
  .global-transport-plan__user-location-dot,
  .global-map-location-request-enter-active,
  .global-map-location-request-leave-active {
    animation: none;
    transition: none;
  }
  .global-transport-plan__user-location-halo {
    opacity: 0.34;
    transform: scale(0.92);
  }
}
</style>

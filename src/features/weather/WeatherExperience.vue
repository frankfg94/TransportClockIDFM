<script setup lang="ts">
import { computed } from "vue";
import {
  CloudLightning,
  CloudRain,
  CloudSnow,
  Flame,
  X,
} from "lucide-vue-next";
import { useWeatherExperience } from "./useWeatherExperience";
import type { WeatherAlert, WeatherConditionKind } from "./types";

const {
  settings,
  weather,
  enabled,
  alertKey,
  dismissedAlertKey,
  dismissAlert,
} = useWeatherExperience();

const alert = computed(() => weather.value?.alert);
const effectiveMode = computed(() =>
  settings.value.reduceMotion && settings.value.weatherMode === "animated"
    ? "static"
    : settings.value.weatherMode,
);
const showBackground = computed(
  () =>
    enabled.value &&
    effectiveMode.value !== "alerts_only" &&
    effectiveMode.value !== "disabled" &&
    weather.value?.condition.kind !== "normal",
);
const showAnimation = computed(
  () => showBackground.value && effectiveMode.value === "animated",
);
const showAlert = computed(
  () =>
    enabled.value &&
    Boolean(alert.value) &&
    alertKey.value !== dismissedAlertKey.value,
);
const backgroundKind = computed<WeatherConditionKind>(
  () => weather.value?.condition.kind ?? "normal",
);
const showRainDroplets = computed(
  () =>
    showAnimation.value &&
    (backgroundKind.value === "rain" || backgroundKind.value === "storm"),
);
const showRainParticles = computed(
  () =>
    showAnimation.value &&
    (backgroundKind.value === "rain" || backgroundKind.value === "storm"),
);
const showSnowParticles = computed(
  () => showAnimation.value && backgroundKind.value === "snow",
);
const rainParticleOptions = computed(() => {
  const storm = backgroundKind.value === "storm";

  return {
    background: {
      color: "transparent",
    },
    detectRetina: true,
    fpsLimit: 90,
    fullScreen: {
      enable: false,
    },
    particles: {
      move: {
        direction: "bottom-left",
        enable: true,
        outModes: {
          default: "out",
        },
        random: true,
        speed: {
          min: storm ? 24 : 15,
          max: storm ? 42 : 28,
        },
        straight: true,
      },
      number: {
        density: {
          enable: true,
          area: storm ? 520 : 680,
        },
        value: storm ? 210 : 145,
      },
      opacity: {
        value: {
          min: storm ? 0.34 : 0.28,
          max: storm ? 0.86 : 0.78,
        },
        animation: {
          enable: true,
          speed: 1,
          sync: false,
          startValue: "random",
        },
      },
      paint: {
        fill: {
          enable: false,
        },
        stroke: {
          color: {
            value: storm
              ? ["#f8fafc", "#cbd5e1", "#94a3b8", "#64748b"]
              : ["#ffffff", "#bfdbfe", "#7fa6ca", "#47779f"],
          },
          opacity: {
            min: storm ? 0.46 : 0.38,
            max: storm ? 0.95 : 0.9,
          },
          width: {
            min: storm ? 2.2 : 1.8,
            max: storm ? 3.8 : 3,
          },
        },
      },
      rotate: {
        value: 135,
        animation: {
          enable: false,
        },
      },
      shape: {
        type: "line",
        options: {
          line: {
            cap: "round",
          },
        },
      },
      size: {
        value: {
          min: storm ? 18 : 14,
          max: storm ? 52 : 42,
        },
        animation: {
          enable: true,
          speed: 3,
          sync: false,
          startValue: "random",
        },
      },
    },
  };
});
const snowParticleOptions = computed(() => ({
  background: {
    color: "transparent",
  },
  detectRetina: true,
  fpsLimit: 60,
  fullScreen: {
    enable: false,
  },
  particles: {
    color: {
      value: ["#f8fbff", "#dbeafe", "#93c5fd", "#60a5fa"],
    },
    move: {
      direction: "bottom",
      enable: true,
      outModes: {
        default: "out",
      },
      random: true,
      speed: {
        min: 0.45,
        max: 1.8,
      },
      straight: false,
    },
    number: {
      density: {
        enable: true,
        area: 920,
      },
      value: 120,
    },
    opacity: {
      value: {
        min: 0.5,
        max: 0.95,
      },
      animation: {
        enable: true,
        speed: 0.45,
        sync: false,
        startValue: "random",
      },
    },
    shape: {
      type: "circle",
    },
    size: {
      value: {
        min: 2,
        max: 5,
      },
      animation: {
        enable: true,
        speed: 1,
        sync: false,
        startValue: "random",
      },
    },
    wobble: {
      distance: 14,
      enable: true,
      speed: {
        min: 0.9,
        max: 1.8,
      },
    },
  },
}));

const rainDroplets = [
  {
    id: "a",
    left: "12%",
    top: "16%",
    size: "34px",
    delay: "0.4s",
    duration: "6.8s",
  },
  {
    id: "b",
    left: "28%",
    top: "38%",
    size: "18px",
    delay: "2.9s",
    duration: "7.6s",
  },
  {
    id: "c",
    left: "46%",
    top: "12%",
    size: "26px",
    delay: "5.1s",
    duration: "8.4s",
  },
  {
    id: "d",
    left: "62%",
    top: "58%",
    size: "42px",
    delay: "1.7s",
    duration: "9.2s",
  },
  {
    id: "e",
    left: "78%",
    top: "25%",
    size: "22px",
    delay: "4.2s",
    duration: "7.2s",
  },
  {
    id: "f",
    left: "88%",
    top: "68%",
    size: "30px",
    delay: "6.4s",
    duration: "8.8s",
  },
] as const;

function alertTitle(value: WeatherAlert): string {
  if (value.kind === "heat") {
    return `Canicule aujourd'hui`;
  }

  if (value.kind === "snow") {
    return `Neige prévue dans ${value.startsInMinutes} min`;
  }

  if (value.kind === "storm") {
    return `Orage prévu dans ${value.startsInMinutes} min`;
  }

  return `Pluie prévue dans ${value.startsInMinutes} min`;
}

function alertAdvice(value: WeatherAlert): string {
  if (value.kind === "heat") {
    return "Prends de l'eau et évite les trajets exposés.";
  }

  if (value.kind === "snow") {
    return "Prévois plus de marge pour rejoindre la station.";
  }

  if (value.kind === "storm") {
    return `Prends un parapluie si tu pars après ${formatTime(value.umbrellaAfter ?? value.startsAt)}.`;
  }

  return `Prends un parapluie si tu pars après ${formatTime(value.umbrellaAfter ?? value.startsAt)}.`;
}

function formatEnd(value: WeatherAlert): string {
  return typeof value.endsInMinutes === "number"
    ? `fin dans ${value.endsInMinutes} min`
    : "";
}

function formatTemperature(value: WeatherAlert): string {
  const temperature = value.apparentTemperatureC ?? value.temperatureC;
  return typeof temperature === "number" ? `${Math.round(temperature)} °C` : "";
}

function formatTime(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "--:--"
    : new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function intensityDrops(value: WeatherAlert): string[] {
  return Array.from({ length: value.intensity }, (_, index) => `drop-${index}`);
}

function alertIcon(value: WeatherAlert) {
  if (value.kind === "heat") {
    return Flame;
  }

  if (value.kind === "snow") {
    return CloudSnow;
  }

  if (value.kind === "storm") {
    return CloudLightning;
  }

  return CloudRain;
}
</script>

<template>
  <div
    v-if="showBackground"
    class="weather-backdrop"
    :class="[
      `weather-backdrop--${backgroundKind}`,
      { 'weather-backdrop--animated': showAnimation },
    ]"
    aria-hidden="true"
  >
    <span v-if="showAnimation" class="weather-backdrop__layer"></span>
    <VueParticles
      v-if="showRainParticles"
      id="weather-rain-particles"
      class="weather-backdrop__particles weather-backdrop__particles--rain"
      :options="rainParticleOptions"
    />
    <VueParticles
      v-if="showSnowParticles"
      id="weather-snow-particles"
      class="weather-backdrop__particles weather-backdrop__particles--snow"
      :options="snowParticleOptions"
    />
    <span v-if="showRainDroplets" class="weather-backdrop__glass"></span>
    <template v-if="showRainDroplets">
      <span
        v-for="drop in rainDroplets"
        :key="drop.id"
        class="weather-backdrop__droplet"
        :style="{
          '--drop-left': drop.left,
          '--drop-top': drop.top,
          '--drop-size': drop.size,
          '--drop-delay': drop.delay,
          '--drop-duration': drop.duration,
        }"
      ></span>
    </template>
  </div>

  <Transition name="weather-alert">
    <section
      v-if="showAlert && alert"
      class="weather-alert"
      :class="`weather-alert--${alert.kind}`"
      role="status"
      aria-live="polite"
    >
      <div class="weather-alert__icon" aria-hidden="true">
        <component :is="alertIcon(alert)" class="weather-alert__main-icon" />
        <div class="weather-alert__intensity">
          <span v-for="drop in intensityDrops(alert)" :key="drop"></span>
        </div>
      </div>
      <div class="weather-alert__content">
        <strong>{{ alertTitle(alert) }}</strong>
        <span>
          {{ alertAdvice(alert) }}
          <template v-if="formatTemperature(alert)">
            · {{ formatTemperature(alert) }}
          </template>
          <template v-if="formatEnd(alert)">
            · {{ formatEnd(alert) }}
          </template>
        </span>
      </div>
      <button
        class="weather-alert__close"
        type="button"
        aria-label="Masquer l'alerte météo"
        @click="dismissAlert"
      >
        <X aria-hidden="true" />
      </button>
    </section>
  </Transition>
</template>

<style scoped>
.weather-backdrop {
  inset: 0;
  pointer-events: none;
  position: fixed;
  z-index: -1;
}

.weather-backdrop--rain {
  background:
    linear-gradient(120deg, rgba(91, 119, 153, 0.35), rgba(238, 243, 251, 0.7)),
    #eef3fb;
}

.weather-backdrop--storm {
  background:
    linear-gradient(120deg, rgba(42, 50, 67, 0.44), rgba(148, 163, 184, 0.42)),
    #e8edf5;
}

.weather-backdrop--snow {
  background:
    radial-gradient(
      circle at 18% 22%,
      rgba(255, 255, 255, 0.84),
      transparent 26%
    ),
    radial-gradient(
      circle at 82% 12%,
      rgba(96, 165, 250, 0.32),
      transparent 34%
    ),
    linear-gradient(
      125deg,
      rgba(180, 213, 245, 0.72),
      rgba(226, 240, 255, 0.9) 46%,
      rgba(165, 198, 232, 0.58)
    ),
    #dcecff;
  background-size:
    130% 130%,
    150% 150%,
    180% 180%;
}

.weather-backdrop--heat {
  background:
    radial-gradient(
      circle at 20% 18%,
      rgba(255, 197, 107, 0.48),
      transparent 30%
    ),
    radial-gradient(
      circle at 78% 26%,
      rgba(248, 113, 113, 0.3),
      transparent 28%
    ),
    linear-gradient(
      125deg,
      rgba(255, 157, 72, 0.42),
      rgba(255, 247, 237, 0.78) 48%,
      rgba(251, 146, 60, 0.3)
    ),
    #fff7ed;
  background-size:
    145% 145%,
    160% 160%,
    190% 190%;
}

.weather-backdrop__layer {
  background-image: linear-gradient(
    115deg,
    rgba(255, 255, 255, 0) 0 44%,
    rgba(255, 255, 255, 0.52) 45% 48%,
    rgba(255, 255, 255, 0) 49% 100%
  );
  background-size: 36px 90px;
  display: block;
  inset: 0;
  opacity: 0.28;
  position: absolute;
  z-index: 0;
}

.weather-backdrop__particles {
  height: 100%;
  inset: 0;
  position: absolute;
  width: 100%;
  z-index: 1;
}

.weather-backdrop__particles :deep(canvas) {
  display: block;
  height: 100% !important;
  width: 100% !important;
}

.weather-backdrop__particles--rain {
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.5))
    drop-shadow(0 0 12px rgba(59, 130, 246, 0.24));
  mix-blend-mode: multiply;
  opacity: 0.95;
  z-index: 2;
}

.weather-backdrop--storm .weather-backdrop__particles--rain {
  mix-blend-mode: screen;
  opacity: 0.9;
}

.weather-backdrop__particles--snow {
  filter: drop-shadow(0 0 4px rgba(37, 99, 235, 0.35));
  opacity: 0.95;
}

.weather-backdrop--rain.weather-backdrop--animated .weather-backdrop__layer,
.weather-backdrop--storm.weather-backdrop--animated .weather-backdrop__layer {
  animation: weather-rain-glass 7200ms ease-in-out infinite alternate;
  background-image:
    radial-gradient(
      ellipse at 18% 28%,
      rgba(255, 255, 255, 0.44),
      transparent 30%
    ),
    radial-gradient(
      ellipse at 72% 18%,
      rgba(125, 164, 202, 0.24),
      transparent 34%
    ),
    linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.16),
      transparent 52%,
      rgba(80, 113, 145, 0.12)
    );
  background-size:
    140% 140%,
    160% 160%,
    180% 180%;
  opacity: 0.5;
}

.weather-backdrop__glass {
  background:
    radial-gradient(
      circle at 22% 24%,
      rgba(255, 255, 255, 0.18),
      transparent 18%
    ),
    radial-gradient(circle at 76% 64%, rgba(17, 24, 39, 0.08), transparent 20%),
    linear-gradient(110deg, transparent, rgba(255, 255, 255, 0.18), transparent);
  filter: blur(12px);
  inset: -6%;
  opacity: 0.42;
  position: absolute;
  transform: translateZ(0);
  z-index: 1;
}

.weather-backdrop__droplet {
  animation: weather-droplet var(--drop-duration) ease-in-out var(--drop-delay)
    infinite;
  border-radius: 48% 52% 55% 45% / 58% 48% 52% 42%;
  box-shadow:
    inset 3px 4px 8px rgba(255, 255, 255, 0.78),
    inset -5px -7px 12px rgba(40, 71, 101, 0.24),
    0 8px 18px rgba(16, 35, 63, 0.12);
  height: var(--drop-size);
  left: var(--drop-left);
  opacity: 0;
  position: absolute;
  top: var(--drop-top);
  transform: translate3d(0, -18px, 0) scale(0.78);
  width: calc(var(--drop-size) * 0.72);
  z-index: 3;
}

.weather-backdrop__droplet::before {
  background: rgba(255, 255, 255, 0.72);
  border-radius: 999px;
  content: "";
  height: 28%;
  left: 24%;
  position: absolute;
  top: 18%;
  transform: rotate(-24deg);
  width: 18%;
}

.weather-backdrop__droplet::after {
  background: rgba(9, 30, 48, 0.12);
  border-radius: 999px;
  bottom: -18%;
  content: "";
  filter: blur(7px);
  height: 28%;
  left: 18%;
  position: absolute;
  width: 74%;
}

.weather-backdrop--snow.weather-backdrop--animated .weather-backdrop__layer {
  animation: weather-snow 5200ms ease-in-out infinite alternate;
  background-image: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.62),
    transparent 46%,
    rgba(147, 197, 253, 0.2)
  );
  background-size: 180% 180%;
  opacity: 0.5;
}

.weather-backdrop--heat.weather-backdrop--animated .weather-backdrop__layer {
  animation: weather-heat 5200ms ease-in-out infinite alternate;
  background-image:
    radial-gradient(
      ellipse at 18% 72%,
      rgba(255, 204, 128, 0.36),
      transparent 34%
    ),
    radial-gradient(
      ellipse at 74% 28%,
      rgba(239, 68, 68, 0.2),
      transparent 30%
    ),
    linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.34), transparent);
  background-size:
    150% 150%,
    170% 170%,
    320px 100%;
}

.weather-alert {
  align-items: center;
  backdrop-filter: blur(18px);
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(16, 35, 63, 0.12);
  border-left: 8px solid #64748b;
  border-radius: 8px;
  box-shadow: 0 18px 48px rgba(16, 35, 63, 0.12);
  display: grid;
  gap: 18px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  margin: 0 auto 24px;
  max-width: 1180px;
  padding: 14px 16px;
}

.weather-alert--rain {
  border-left-color: #5b7ea8;
}

.weather-alert--storm {
  border-left-color: #334155;
}

.weather-alert--snow {
  border-left-color: #7cb8e8;
}

.weather-alert--heat {
  border-left-color: #f97316;
}

.weather-alert__icon {
  align-items: center;
  background: #eef3fb;
  border-radius: 8px;
  display: inline-flex;
  gap: 8px;
  min-height: 46px;
  padding: 0 12px;
}

.weather-alert__main-icon {
  height: 24px;
  width: 24px;
}

.weather-alert__intensity {
  align-items: end;
  display: inline-flex;
  gap: 3px;
}

.weather-alert__intensity span {
  background: currentColor;
  border-radius: 999px;
  display: block;
  height: 7px;
  opacity: 0.45;
  width: 4px;
}

.weather-alert__intensity span:nth-child(2) {
  height: 12px;
  opacity: 0.68;
}

.weather-alert__intensity span:nth-child(3) {
  height: 17px;
  opacity: 0.9;
}

.weather-alert--rain .weather-alert__icon {
  color: #3f6f9f;
}

.weather-alert--storm .weather-alert__icon {
  color: #334155;
}

.weather-alert--snow .weather-alert__icon {
  color: #4f9fd9;
}

.weather-alert--heat .weather-alert__icon {
  background: #fff1e8;
  color: #ea580c;
}

.weather-alert__content {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.weather-alert__content strong {
  color: var(--ink);
  font-size: 1.05rem;
  font-weight: 950;
}

.weather-alert__content span {
  color: #334155;
  font-weight: 740;
}

.weather-alert__close {
  background: #eef3fb;
  border-radius: 999px;
  color: var(--ink);
  height: 42px;
  min-height: 42px;
  padding: 0;
  width: 42px;
}

.weather-alert__close svg {
  height: 18px;
  width: 18px;
}

.weather-alert-enter-active,
.weather-alert-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.weather-alert-enter-from,
.weather-alert-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@keyframes weather-rain-glass {
  from {
    background-position:
      0 0,
      100% 35%,
      0 0;
  }

  to {
    background-position:
      100% 42%,
      0 0,
      40px 20px;
  }
}

@keyframes weather-droplet {
  0%,
  58% {
    opacity: 0;
    transform: translate3d(0, -18px, 0) scale(0.78);
  }

  64% {
    opacity: 0.72;
    transform: translate3d(0, 0, 0) scale(1);
  }

  78% {
    opacity: 0.58;
    transform: translate3d(2px, 18px, 0) scaleX(0.9) scaleY(1.18);
  }

  100% {
    opacity: 0;
    transform: translate3d(4px, 64px, 0) scaleX(0.72) scaleY(1.34);
  }
}

@keyframes weather-snow {
  from {
    background-position: 0 0;
  }

  to {
    background-position: 46px 42px;
  }
}

@keyframes weather-heat {
  from {
    background-position:
      0 0,
      100% 35%,
      -180px 0;
    opacity: 0.18;
  }

  to {
    background-position:
      100% 45%,
      0 0,
      180px 0;
    opacity: 0.44;
  }
}

@media (max-width: 760px) {
  .weather-alert {
    align-items: stretch;
    grid-template-columns: 1fr auto;
  }

  .weather-alert__icon {
    grid-column: 1 / -1;
    width: fit-content;
  }
}
</style>

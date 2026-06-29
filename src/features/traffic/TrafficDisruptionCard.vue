  <script setup lang="ts">
  import { computed } from "vue";
  import {
    formatTrafficDisruptionPeriod,
    getDisruptionIcon,
    getDisruptionTone,
  } from "./trafficPresentation";
  import type { TrafficDisruption } from "./types";

  const props = withDefaults(
    defineProps<{
      disruption: TrafficDisruption;
      compact?: boolean;
      statusLabel?: string;
      showHeader?: boolean;
      impactedStopLimit?: number;
    }>(),
    {
      compact: false,
      statusLabel: "",
      showHeader: true,
      impactedStopLimit: 8,
    },
  );

  const tone = computed(() => getDisruptionTone(props.disruption));
  const icon = computed(() => getDisruptionIcon(props.disruption));
  const periodLabel = computed(() =>
    formatTrafficDisruptionPeriod(props.disruption),
  );
  const impactedStopNames = computed(() =>
    props.disruption.impactedStopNames.slice(0, props.impactedStopLimit),
  );
  </script>

  <template>
    <article
      class="traffic-disruption"
      :class="[
        `traffic-disruption--${tone}`,
        { 'traffic-disruption--compact': compact },
      ]"
    >
      <header v-if="showHeader && (statusLabel || periodLabel)">
        <span v-if="statusLabel">{{ statusLabel }}</span>
        <small v-if="periodLabel">{{ periodLabel }}</small>
      </header>

      <div class="traffic-disruption__title">
        <span class="traffic-disruption__icon">
          {{ icon }}
        </span>
        <h3>{{ disruption.title }}</h3>
      </div>

      <p v-if="disruption.message">{{ disruption.message }}</p>

      <small v-if="!showHeader && periodLabel">
        {{ periodLabel }}
      </small>
      <small v-if="impactedStopNames.length">
        Arrêts concernés:
        {{ impactedStopNames.join(", ") }}
      </small>
    </article>
  </template>

  <style scoped>
  .traffic-disruption {
    background: #ffffff;
    border: 1px solid rgba(16, 35, 63, 0.1);
    border-radius: 8px;
    display: grid;
    gap: 8px;
    padding: 12px;
  }

  .traffic-disruption--orange {
    border-color: #f59e0b;
  }

  .traffic-disruption--red {
    border-color: #ef4444;
  }

  .traffic-disruption__title {
    align-items: flex-start;
    display: flex;
    gap: 10px;
  }

  .traffic-disruption__icon {
    align-items: center;
    border-radius: 6px;
    color: #ffffff;
    display: inline-flex;
    flex: 0 0 auto;
    font-size: 0.86rem;
    font-weight: 950;
    height: 24px;
    justify-content: center;
    line-height: 1;
    text-transform: uppercase;
    width: 24px;
  }

  .traffic-disruption--orange .traffic-disruption__icon {
    background: #f59e0b;
    box-shadow: 0 0 0 2px #f59e0b;
  }

  .traffic-disruption--red .traffic-disruption__icon {
    background: #ef4444;
    box-shadow: 0 0 0 2px #ef4444;
  }

  .traffic-disruption header {
    align-items: center;
    display: flex;
    gap: 10px;
    justify-content: space-between;
  }

  .traffic-disruption header span {
    color: #5136ff;
    font-size: 0.74rem;
    font-weight: 950;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .traffic-disruption header small,
  .traffic-disruption > small {
    color: var(--muted);
    font-weight: 780;
  }

  .traffic-disruption h3 {
    color: var(--ink);
    font-size: 1rem;
    margin: 0;
  }

  .traffic-disruption p {
    color: #334155;
    font-weight: 720;
    line-height: 1.45;
    margin: 0;
    white-space: pre-line;
  }
  </style>

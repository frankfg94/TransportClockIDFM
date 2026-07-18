<script setup lang="ts">
import type {
  TransportPositionConfidence,
  TransportPositionState,
} from "../transportPositions";

defineProps<{
  data: {
    angleDegrees: number;
    ariaLabel: string;
    confidence: TransportPositionConfidence;
    fallbackLabel: string;
    imageUrl?: string;
    state: TransportPositionState;
  };
}>();
</script>

<template>
  <div
    class="pattern-flow-vehicle"
    :class="[
      `pattern-flow-vehicle--${data.state}`,
      `pattern-flow-vehicle--confidence-${data.confidence}`,
    ]"
    :style="{ '--pattern-vehicle-angle': `${data.angleDegrees}deg` }"
    role="img"
    :aria-label="data.ariaLabel"
  >
    <span class="pattern-flow-vehicle__visual" aria-hidden="true">
      <img v-if="data.imageUrl" :src="data.imageUrl" alt="" draggable="false" />
      <span v-else class="pattern-flow-vehicle__fallback">
        {{ data.fallbackLabel }}
      </span>
    </span>
  </div>
</template>
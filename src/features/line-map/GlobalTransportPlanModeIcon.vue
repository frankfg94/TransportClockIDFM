<script setup lang="ts">
import {
  Bike,
  BusFront,
  CableCar,
  MoonStar,
  TrainFront,
  TrainFrontTunnel,
  TramFront,
} from "lucide-vue-next";
import type { Component } from "vue";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";

const props = withDefaults(defineProps<{
  mode: GlobalMapMode;
  size?: number;
  strokeWidth?: number;
}>(), {
  size: 19,
  strokeWidth: 2.1,
});

const modeIcons: Record<GlobalMapMode, Component> = {
  BUS: BusFront,
  METRO: TrainFront,
  RER: TrainFrontTunnel,
  TRAIN: TrainFront,
  TRANSILIEN: TrainFrontTunnel,
  TRAM: TramFront,
  CABLE: CableCar,
  NOCTILIEN: MoonStar,
  BIKE: Bike,
};
</script>

<template>
  <component
    :is="modeIcons[props.mode]"
    :size="props.size"
    :stroke-width="props.strokeWidth"
    aria-hidden="true"
  />
</template>

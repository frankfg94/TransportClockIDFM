<script setup lang="ts">
import LineOptimizerPage from "../../src/features/line-optimizer/LineOptimizerPage.vue";
import { velizyOptimizerConfig } from "../../src/features/line-optimizer/optimizerConfig";
</script>

<template>
  <LineOptimizerPage :config="velizyOptimizerConfig" />
</template>

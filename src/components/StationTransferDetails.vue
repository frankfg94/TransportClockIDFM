<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import LineIconBadge from "./LineIconBadge.vue";
import { loadTransferLineDirections } from "../features/line-map/lineMapData";
import { isBusLikeTransfer } from "../features/service-pattern/transferVisibility";
import {
  createTransferGroups,
  getTransferDetailTitle,
} from "../services/transferGroups";
import type { TransferLineOption } from "../types/transit";

interface TransferDirectionState {
  loading: boolean;
  directions: string[];
  error?: boolean;
}

const props = withDefaults(
  defineProps<{
    stationLabel: string;
    city?: string;
    transfers?: TransferLineOption[];
    loading?: boolean;
    error?: string | boolean;
    richDetails?: boolean;
    lineColor?: string;
  }>(),
  {
    transfers: () => [],
    loading: false,
    error: false,
    richDetails: true,
    lineColor: "#0064ff",
  },
);

const activeTransfer = ref<TransferLineOption>();
const directionStates = reactive<Record<string, TransferDirectionState>>({});
const transferGroups = computed(() => createTransferGroups(props.transfers));
const activeDirectionState = computed(() =>
  activeTransfer.value ? directionStates[activeTransfer.value.id] : undefined,
);

watch(
  () => props.stationLabel,
  () => {
    activeTransfer.value = undefined;
  },
);

function showTransferDetails(transfer: TransferLineOption): void {
  if (!props.richDetails) {
    return;
  }

  activeTransfer.value = transfer;

  if (isBusLikeTransfer(transfer)) {
    void loadTransferDirections(transfer);
  }
}

async function loadTransferDirections(
  transfer: TransferLineOption,
): Promise<void> {
  if (directionStates[transfer.id]) {
    return;
  }

  directionStates[transfer.id] = {
    loading: true,
    directions: [],
  };

  try {
    const result = await loadTransferLineDirections(transfer.id);

    directionStates[transfer.id] = {
      loading: false,
      directions: result.directions,
    };
  } catch {
    directionStates[transfer.id] = {
      loading: false,
      directions: [],
      error: true,
    };
  }
}
</script>

<template>
  <div
    class="station-transfer-details"
    :style="{ '--station-line-color': lineColor }"
  >
    <header class="station-transfer-details__header">
      <div>
        <strong>{{ stationLabel }}</strong>
        <span v-if="city">{{ city }}</span>
        <small>Correspondances</small>
      </div>
    </header>

    <div v-if="loading" class="station-transfer-details__state" role="status">
      <span aria-hidden="true" class="loader-dot"></span>
      Chargement des correspondances
    </div>

    <div
      v-else-if="error"
      class="station-transfer-details__state station-transfer-details__state--error"
    >
      Correspondances indisponibles
    </div>

    <div
      v-else-if="transferGroups.length === 0"
      class="station-transfer-details__state"
    >
      Aucune autre ligne
    </div>

    <template v-else>
      <section
        v-for="group in transferGroups"
        :key="group.key"
        class="station-transfer-details__group"
        :data-transfer-group="group.key"
      >
        <div class="station-transfer-details__group-title">
          <span aria-hidden="true">{{ group.iconLabel }}</span>
          <strong>{{ group.label }}</strong>
          <small>{{ group.countLabel }}</small>
        </div>
        <div class="station-transfer-details__list">
          <button
            v-for="transfer in group.transfers"
            :key="`${group.key}-${transfer.id}-${transfer.label}`"
            class="station-transfer-details__item"
            :class="{
              'station-transfer-details__item--active':
                activeTransfer?.id === transfer.id,
            }"
            type="button"
            :aria-label="`Afficher les détails de la ligne ${transfer.label}`"
            @focus="showTransferDetails(transfer)"
            @mouseenter="showTransferDetails(transfer)"
            @click="showTransferDetails(transfer)"
          >
            <LineIconBadge :line="transfer" compact />
          </button>
        </div>
      </section>

      <aside
        v-if="richDetails && activeTransfer"
        class="station-transfer-details__detail"
      >
        <strong>{{ getTransferDetailTitle(activeTransfer) }}</strong>
        <span
          v-if="isBusLikeTransfer(activeTransfer)"
          class="station-transfer-details__detail-kicker"
        >
          Directions possibles
        </span>
        <span
          v-if="
            isBusLikeTransfer(activeTransfer) && activeDirectionState?.loading
          "
          class="station-transfer-details__detail-muted"
        >
          Chargement...
        </span>
        <span
          v-else-if="
            isBusLikeTransfer(activeTransfer) &&
            activeDirectionState?.directions.length
          "
          class="station-transfer-details__directions"
        >
          <span
            v-for="direction in activeDirectionState.directions"
            :key="`${activeTransfer.id}-${direction}`"
          >
            {{ direction }}
          </span>
        </span>
        <span
          v-else-if="isBusLikeTransfer(activeTransfer)"
          class="station-transfer-details__detail-muted"
        >
          Directions indisponibles
        </span>
        <span v-else class="station-transfer-details__detail-muted">
          {{ activeTransfer.label }}
        </span>
      </aside>
    </template>
  </div>
</template>

<style scoped>
.station-transfer-details {
  color: var(--ink);
  display: grid;
  gap: 12px;
  text-align: left;
}

.station-transfer-details__header {
  border-bottom: 1px solid rgba(16, 35, 63, 0.1);
  padding-bottom: 12px;
}

.station-transfer-details__header strong,
.station-transfer-details__header span,
.station-transfer-details__header small {
  display: block;
}

.station-transfer-details__header strong {
  font-size: 1.02rem;
  line-height: 1.1;
}

.station-transfer-details__header span {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 750;
  margin-top: 4px;
}

.station-transfer-details__header small {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 950;
  margin-top: 5px;
  text-transform: uppercase;
}

.station-transfer-details__state {
  align-items: center;
  color: var(--muted);
  display: flex;
  font-size: 0.8rem;
  font-weight: 800;
  gap: 8px;
  min-height: 38px;
}

.station-transfer-details__state--error {
  color: #b91c1c;
}

.station-transfer-details__group {
  display: grid;
  gap: 9px;
  align-content: start;
}

.station-transfer-details__group + .station-transfer-details__group {
  border-top: 1px solid rgba(16, 35, 63, 0.08);
  padding-top: 12px;
}

.station-transfer-details__group-title {
  align-items: start;
  display: grid;
  gap: 8px;
  grid-template-columns: auto 1fr auto;
}

.station-transfer-details__group-title > span {
  align-items: center;
  border: 2px solid color-mix(in srgb, var(--station-line-color), #0f172a 18%);
  border-radius: 999px;
  color: color-mix(in srgb, var(--station-line-color), #0f172a 22%);
  display: inline-flex;
  font-size: 0.6rem;
  font-weight: 950;
  height: 25px;
  justify-content: center;
  min-width: 25px;
  padding: 0 5px;
}

.station-transfer-details__group-title strong {
  color: color-mix(in srgb, var(--station-line-color), #0f172a 28%);
  font-size: 0.88rem;
  line-height: 1;
}

.station-transfer-details__group-title small {
  background: #eef2f7;
  border-radius: 7px;
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 950;
  padding: 5px 8px;
}

.station-transfer-details__list {
  align-items: start;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.station-transfer-details__item {
  background: transparent;
  border-radius: 6px;
  display: inline-flex;
  min-height: 0;
  padding: 0;
  transition:
    box-shadow 140ms ease,
    transform 140ms ease;
}

.station-transfer-details__item:hover:not(:disabled),
.station-transfer-details__item:focus-visible,
.station-transfer-details__item--active {
  background: transparent;
  box-shadow: 0 0 0 3px rgba(16, 35, 63, 0.1);
  outline: 0;
  transform: translateY(-1px);
}

.station-transfer-details__detail {
  background: rgba(248, 250, 252, 0.96);
  border: 1px solid rgba(16, 35, 63, 0.12);
  border-radius: 10px;
  display: grid;
  gap: 7px;
  padding: 10px;
  align-content: baseline;
}

.station-transfer-details__detail strong {
  font-size: 0.84rem;
  line-height: 1.12;
}

.station-transfer-details__detail-kicker,
.station-transfer-details__detail-muted {
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 950;
  text-transform: uppercase;
}

.station-transfer-details__detail-muted {
  text-transform: none;
}

.station-transfer-details__directions {
  display: grid;
  gap: 5px;
}

.station-transfer-details__directions span {
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 7px;
  color: var(--ink);
  font-size: 0.72rem;
  font-weight: 850;
  line-height: 1.2;
  padding: 6px 8px;
}
</style>

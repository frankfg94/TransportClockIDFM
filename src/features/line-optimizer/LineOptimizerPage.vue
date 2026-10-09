<script setup lang="ts">
import { computed, ref } from "vue";
import {
  BookUser,
  Clock3,
  Footprints,
  House,
  RefreshCw,
  TrainFront,
  TramFront,
} from "lucide-vue-next";
import AdressBook from "../address-book/AdressBook.vue";
import { useI18n } from "../../i18n";
import { useLineOptimizer } from "./useLineOptimizer";
import type { LineOptimizerConfig } from "./optimizerConfig";
import type { LineOptimizerCandidate } from "./lineOptimizer";

const props = defineProps<{ config: LineOptimizerConfig }>();
const { t, d, n } = useI18n();
const optimizer = useLineOptimizer(props.config);
const {
  originQuery,
  destinationQuery,
  originPoint,
  destinationPoint,
  settings,
  result,
  status,
  errorPhase,
  candidates,
  winner,
  now,
} = optimizer;
const addressSide = ref<"origin" | "destination">();
const useProviderWalk = computed({
  get: () => settings.value.walkSeconds === undefined,
  set: (value: boolean) => {
    settings.value.walkSeconds = value ? undefined : 90;
  },
});
const useProviderTransfer = computed({
  get: () => settings.value.transferSeconds === undefined,
  set: (value: boolean) => {
    settings.value.transferSeconds = value ? undefined : 180;
  },
});
const arrivalDelayMinutes = computed({
  get: () => settings.value.maxArrivalDelaySeconds / 60,
  set: (value: number) => {
    settings.value.maxArrivalDelaySeconds = value * 60;
  },
});
const departureWindowMinutes = computed({
  get: () => settings.value.departureWindowSeconds / 60,
  set: (value: number) => {
    settings.value.departureWindowSeconds = value * 60;
  },
});
const clock = (epoch: number) =>
  d(new Date(epoch), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
const duration = (seconds: number) =>
  t("lineOptimizer.minutes", { value: n(seconds / 60, { maximumFractionDigits: 1 }) });
const serviceLabel = (candidate: LineOptimizerCandidate) =>
  candidate.serviceType === "semi-direct"
    ? t("lineOptimizer.semiDirect")
    : candidate.serviceType === "omnibus"
      ? t("lineOptimizer.omnibus")
      : t("lineOptimizer.unknownService");
const timingLabel = (source: string) =>
  source === "realtime"
    ? t("lineOptimizer.realtime")
    : source === "estimated"
      ? t("lineOptimizer.estimated")
      : t("lineOptimizer.schedule");
const legs = computed(() => winner.value?.route.transitSections ?? []);
const remaining = computed(() =>
  winner.value ? duration(Math.max(0, (winner.value.leaveAt - now.value) / 1000)) : "",
);
</script>

<template>
  <main class="line-optimizer">
    <header class="line-optimizer__header">
      <span class="line-optimizer__eyebrow"
        ><TramFront :size="18" aria-hidden="true" /> {{ t("lineOptimizer.eyebrow") }}</span
      >
      <h1>{{ t("lineOptimizer.title", { line: config.lineCode }) }}</h1>
      <p>
        {{
          t("lineOptimizer.description", {
            line: config.lineCode,
            connection: config.connectingLineCode,
            station: config.transferName,
          })
        }}
      </p>
    </header>

    <form class="line-optimizer__form" @submit.prevent="optimizer.refresh()">
      <div class="line-optimizer__addresses">
        <div class="line-optimizer__field">
          <label for="optimizer-origin">{{ t("lineOptimizer.origin") }}</label>
          <div class="line-optimizer__address-control">
            <input
              id="optimizer-origin"
              v-model="originQuery"
              required
              autocomplete="street-address"
            /><button
              type="button"
              :aria-label="t('lineOptimizer.originBook')"
              @click="addressSide = 'origin'"
            >
              <BookUser :size="20" aria-hidden="true" />
            </button>
          </div>
          <small v-if="originPoint?.label">{{ originPoint.label }}</small>
        </div>
        <div class="line-optimizer__field">
          <label for="optimizer-destination">{{ t("lineOptimizer.destination") }}</label>
          <div class="line-optimizer__address-control">
            <input id="optimizer-destination" v-model="destinationQuery" required /><button
              type="button"
              :aria-label="t('lineOptimizer.destinationBook')"
              @click="addressSide = 'destination'"
            >
              <BookUser :size="20" aria-hidden="true" />
            </button>
          </div>
          <small v-if="destinationPoint?.label">{{ destinationPoint.label }}</small>
        </div>
      </div>
      <div class="line-optimizer__parameters">
        <label
          >{{ t("lineOptimizer.exitSeconds")
          }}<input
            v-model.number="settings.exitSeconds"
            type="number"
            min="0"
            max="3600"
            step="15"
            required
        /></label>
        <label
          >{{ t("lineOptimizer.walkSeconds")
          }}<input
            v-model.number="settings.walkSeconds"
            type="number"
            min="0"
            max="7200"
            step="15"
            :disabled="useProviderWalk"
            :required="!useProviderWalk"
        /></label>
        <label
          >{{ t("lineOptimizer.transferSeconds")
          }}<input
            v-model.number="settings.transferSeconds"
            type="number"
            min="0"
            max="3600"
            step="15"
            :disabled="useProviderTransfer"
            :required="!useProviderTransfer"
        /></label>
        <label
          >{{ t("lineOptimizer.marginSeconds")
          }}<input
            v-model.number="settings.marginSeconds"
            type="number"
            min="0"
            max="600"
            step="15"
            required
        /></label>
      </div>
      <div class="line-optimizer__checks">
        <label
          ><input v-model="useProviderWalk" type="checkbox" />{{
            t("lineOptimizer.providerWalk")
          }}</label
        >
        <label
          ><input v-model="useProviderTransfer" type="checkbox" />{{
            t("lineOptimizer.providerTransfer")
          }}</label
        >
        <label
          ><input v-model="settings.preferSemiDirect" type="checkbox" />{{
            t("lineOptimizer.preferSemiDirect")
          }}</label
        >
      </div>
      <details class="line-optimizer__advanced">
        <summary>{{ t("lineOptimizer.advanced") }}</summary>
        <div class="line-optimizer__parameters">
          <label
            >{{ t("lineOptimizer.arrivalDelay")
            }}<input v-model.number="arrivalDelayMinutes" type="number" min="0" max="60" required
          /></label>
          <label
            >{{ t("lineOptimizer.semiDirectTolerance")
            }}<input
              v-model.number="settings.semiDirectWaitToleranceSeconds"
              type="number"
              min="0"
              max="600"
              step="15"
              required
          /></label>
          <label
            >{{ t("lineOptimizer.departureWindow")
            }}<input
              v-model.number="departureWindowMinutes"
              type="number"
              min="5"
              max="60"
              required
          /></label>
        </div>
      </details>
      <button class="line-optimizer__calculate" type="submit" :disabled="status === 'loading'">
        <RefreshCw
          :size="18"
          :class="{ 'line-optimizer__spin': status === 'loading' }"
          aria-hidden="true"
        />{{ t(status === "loading" ? "lineOptimizer.loading" : "lineOptimizer.calculate") }}
      </button>
    </form>

    <div class="line-optimizer__state" role="status" aria-live="polite">
      <p v-if="status === 'loading'">{{ t("lineOptimizer.loadingDetails") }}</p>
      <p v-else-if="status === 'error'" class="line-optimizer__error">
        {{
          t(
            errorPhase === "locations"
              ? "lineOptimizer.locationError"
              : "lineOptimizer.journeyError",
          )
        }}
      </p>
      <p v-else-if="status === 'empty' || (result && !winner)">
        {{ t("lineOptimizer.empty", { line: config.lineCode, station: config.transferName }) }}
      </p>
      <p v-else-if="status === 'idle'">{{ t("lineOptimizer.idle") }}</p>
    </div>

    <section
      v-if="winner"
      class="line-optimizer__recommendation"
      :aria-label="t('lineOptimizer.recommendation')"
    >
      <div class="line-optimizer__recommendation-head">
        <span>{{ t("lineOptimizer.recommendation") }}</span
        ><span class="line-optimizer__wait"
          ><Clock3 :size="16" aria-hidden="true" />{{
            t("lineOptimizer.waitAtRer", { duration: duration(winner.waitSeconds) })
          }}</span
        >
      </div>
      <div class="line-optimizer__totals">
        <div><span>{{ t("lineOptimizer.totalTravel") }}</span><strong>{{ duration((winner.arriveAt - winner.leaveAt) / 1000) }}</strong><small>{{ t("lineOptimizer.doorToDoor") }}</small></div>
        <div><span>{{ t("lineOptimizer.totalWaiting") }}</span><strong>{{ duration(winner.waitSeconds) }}</strong><small>{{ t("lineOptimizer.waitingBreakdown", { duration: duration(winner.waitSeconds) }) }}</small></div>
      </div>
      <h2>{{ t("lineOptimizer.leaveAt", { time: clock(winner.leaveAt) }) }}</h2>
      <p>{{ t("lineOptimizer.stayHome", { duration: remaining }) }}</p>
      <ol class="line-optimizer__timeline">
        <li>
          <House :size="22" aria-hidden="true" />
          <div>
            <strong>{{ clock(winner.leaveAt) }}</strong
            ><span>{{ t("lineOptimizer.leaveHome") }}</span
            ><small>{{
              t("lineOptimizer.preparation", { duration: duration(settings.exitSeconds) })
            }}</small>
          </div>
        </li>
        <li>
          <Footprints :size="22" aria-hidden="true" />
          <div>
            <strong>{{ clock(winner.walkAt) }}</strong
            ><span>{{
              t("lineOptimizer.walkTo", { station: legs[0]?.fromName ?? config.lineCode })
            }}</span
            ><small>{{ duration(winner.walkSeconds) }}</small>
          </div>
        </li>
        <li>
          <TramFront :size="22" aria-hidden="true" />
          <div>
            <strong>{{ clock(winner.tram.departure) }}</strong
            ><span>{{
              t("lineOptimizer.boardTram", {
                line: config.lineCode,
                direction: winner.tram.direction ?? legs[0]?.direction ?? config.transferName,
              })
            }}</span
            ><small
              >{{
                t("lineOptimizer.arriveTransfer", {
                  time: clock(winner.tram.arrival),
                  station: config.transferName,
                })
              }}
              · {{ timingLabel(winner.tram.source) }}</small
            >
          </div>
        </li>
        <li>
          <Footprints :size="22" aria-hidden="true" />
          <div>
            <strong>{{ clock(winner.platformAt) }}</strong
            ><span>{{ t("lineOptimizer.platformReady") }}</span
            ><small>{{
              t("lineOptimizer.transferDuration", {
                duration: duration(winner.transferSeconds),
                margin: duration(settings.marginSeconds),
              })
            }}</small>
          </div>
        </li>
        <li>
          <TrainFront :size="22" aria-hidden="true" />
          <div>
            <strong>{{ clock(winner.train.departure) }}</strong
            ><span
              >{{
                t("lineOptimizer.boardRer", {
                  line: config.connectingLineCode,
                  mission: winner.train.mission ?? "—",
                })
              }}
              · {{ serviceLabel(winner) }}</span
            ><small
              >{{ winner.train.direction ?? legs[1]?.direction }} ·
              {{ timingLabel(winner.train.source) }}</small
            >
          </div>
        </li>
        <li>
          <Clock3 :size="22" aria-hidden="true" />
          <div>
            <strong>{{ clock(winner.arriveAt) }}</strong
            ><span>{{
              t("lineOptimizer.arrival", {
                destination: destinationPoint?.label ?? destinationQuery,
              })
            }}</span
            ><small>{{
              t("lineOptimizer.totalDuration", {
                duration: duration((winner.arriveAt - winner.leaveAt) / 1000),
              })
            }}</small>
          </div>
        </li>
      </ol>
      <p class="line-optimizer__evidence">
        {{
          t("lineOptimizer.providerDurations", {
            walk: duration(winner.providerWalkSeconds),
            transfer: duration(winner.providerTransferSeconds),
          })
        }}
      </p>
      <p
        v-if="
          winner.transferSeconds < winner.providerTransferSeconds ||
          winner.walkSeconds < winner.providerWalkSeconds
        "
        class="line-optimizer__evidence"
      >
        {{ t("lineOptimizer.personalTiming") }}
      </p>
      <details v-if="winner.train.stopNames?.length" class="line-optimizer__stops">
        <summary>{{ t("lineOptimizer.stops") }}</summary>
        <p>{{ winner.train.stopNames.join(" → ") }}</p>
      </details>
      <p class="line-optimizer__evidence">
        {{ t(result?.complete ? "lineOptimizer.coverageReady" : "lineOptimizer.coveragePartial") }}
      </p>
    </section>

    <section
      v-if="candidates.length > 1"
      class="line-optimizer__alternatives"
      :aria-label="t('lineOptimizer.alternatives')"
    >
      <h2>{{ t("lineOptimizer.alternatives") }}</h2>
      <div class="line-optimizer__table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t("lineOptimizer.home") }}</th>
              <th>{{ config.lineCode }}</th>
              <th>{{ t("lineOptimizer.rer", { line: config.connectingLineCode }) }}</th>
              <th>{{ t("lineOptimizer.wait") }}</th>
              <th>{{ t("lineOptimizer.arrivalColumn") }}</th>
              <th>{{ t("lineOptimizer.service") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="candidate in candidates.slice(1, 6)" :key="candidate.id">
              <td>{{ clock(candidate.leaveAt) }}</td>
              <td>{{ clock(candidate.tram.departure) }}</td>
              <td>{{ clock(candidate.train.departure) }}</td>
              <td>{{ duration(candidate.waitSeconds) }}</td>
              <td>{{ clock(candidate.arriveAt) }}</td>
              <td>{{ serviceLabel(candidate) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <footer class="line-optimizer__footer">
      <p v-if="result">
        {{
          t("lineOptimizer.updated", { time: clock(result.analyzedAt), count: result.courseCount })
        }}
      </p>
      <p>{{ t("lineOptimizer.method") }}</p>
      <p>{{ t("lineOptimizer.autoRefresh") }}</p>
    </footer>
    <AdressBook
      :open="Boolean(addressSide)"
      selection-mode
      :selection-description="t('lineOptimizer.bookDescription')"
      @close="addressSide = undefined"
      @select="
        (entry) => {
          optimizer.selectAddress(entry, addressSide ?? 'origin');
          addressSide = undefined;
        }
      "
    />
  </main>
</template>

<style scoped>
.line-optimizer {
  max-width: 980px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4) 120px;
  color: var(--ink);
}
.line-optimizer__header {
  margin-bottom: var(--space-6);
}
.line-optimizer__eyebrow {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--idfm-blue);
  font-weight: 700;
}
h1 {
  font-size: clamp(2rem, 5vw, 3rem);
  margin: var(--space-2) 0;
  letter-spacing: -0.035em;
}
.line-optimizer__header p,
.line-optimizer__footer,
small {
  color: var(--muted);
}
.line-optimizer__form,
.line-optimizer__recommendation,
.line-optimizer__alternatives {
  padding: var(--space-6);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
}
.line-optimizer__addresses {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}
.line-optimizer__field {
  min-width: 0;
}
label {
  display: grid;
  gap: var(--space-2);
  font-size: 0.95rem;
  font-weight: 600;
}
.line-optimizer__address-control {
  display: flex;
  gap: var(--space-2);
}
input:not([type="checkbox"]) {
  width: 100%;
  min-width: 0;
  min-height: var(--control-height);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  color: var(--ink);
  background: var(--surface-soft);
  font: inherit;
}
input:disabled {
  opacity: 0.5;
}
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--control-height);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  background: var(--surface-soft);
  color: var(--ink);
  font: inherit;
}
button:focus-visible,
input:focus-visible,
summary:focus-visible {
  outline: 3px solid var(--idfm-blue);
  outline-offset: 2px;
}
.line-optimizer__parameters {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-5);
}
.line-optimizer__checks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin-top: var(--space-4);
}
.line-optimizer__checks label {
  display: flex;
  align-items: center;
  font-weight: 400;
}
.line-optimizer__checks input {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.line-optimizer__advanced {
  margin: var(--space-4) 0;
}
summary {
  cursor: pointer;
  color: var(--muted);
}
.line-optimizer__calculate {
  background: var(--idfm-blue);
  color: var(--surface);
  font-weight: 700;
  width: 100%;
  margin-top: var(--space-4);
}
button:disabled {
  opacity: 0.65;
  cursor: wait;
}
.line-optimizer__state {
  min-height: var(--space-5);
}
.line-optimizer__error {
  color: var(--danger);
}
.line-optimizer__recommendation {
  margin-top: var(--space-4);
  border-top: 4px solid var(--idfm-blue);
}
.line-optimizer__totals { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); margin: var(--space-5) 0; }
.line-optimizer__totals > div { display: grid; gap: var(--space-2); padding: var(--space-3); background: var(--surface-soft); border-radius: var(--radius-sm); }
.line-optimizer__totals strong { font-size: 1.7rem; font-variant-numeric: tabular-nums; }
.line-optimizer__totals small { line-height: 1.4; }
.line-optimizer__recommendation-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  justify-content: space-between;
  align-items: center;
  font-weight: 700;
  color: var(--idfm-blue);
}
.line-optimizer__wait {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  padding: var(--space-2) var(--space-3);
}
h2 {
  margin: var(--space-4) 0 var(--space-2);
  font-size: 1.5rem;
}
.line-optimizer__timeline {
  list-style: none;
  padding: 0;
  margin: var(--space-6) 0;
  display: grid;
  gap: var(--space-4);
}
.line-optimizer__timeline li {
  display: grid;
  grid-template-columns: 30px 1fr;
  gap: var(--space-3);
}
.line-optimizer__timeline li > svg {
  color: var(--idfm-blue);
  margin-top: 2px;
}
.line-optimizer__timeline li div {
  display: grid;
  grid-template-columns: 95px minmax(0, 1fr);
  gap: var(--space-1) var(--space-3);
}
.line-optimizer__timeline small {
  grid-column: 2;
}
.line-optimizer__evidence {
  font-size: 0.9rem;
  color: var(--muted);
}
.line-optimizer__stops p {
  line-height: 1.7;
}
.line-optimizer__alternatives {
  margin-top: var(--space-5);
}
.line-optimizer__alternatives h2 {
  margin-top: 0;
}
.line-optimizer__table-wrap {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
}
th,
td {
  text-align: left;
  padding: var(--space-3) var(--space-2);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.line-optimizer__footer {
  font-size: 0.9rem;
  margin-top: var(--space-5);
  line-height: 1.6;
}
.line-optimizer__spin {
  animation: optimizer-spin 1s linear infinite;
}
@keyframes optimizer-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 600px) {
  .line-optimizer__addresses {
    grid-template-columns: 1fr;
  }
  .line-optimizer__parameters {
    grid-template-columns: 1fr 1fr;
  }
  .line-optimizer__form,
  .line-optimizer__recommendation,
  .line-optimizer__alternatives {
    padding: var(--space-4);
  }
  .line-optimizer__timeline li div {
    grid-template-columns: 1fr;
  }
  .line-optimizer__timeline small {
    grid-column: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .line-optimizer__spin {
    animation: none;
  }
}
</style>

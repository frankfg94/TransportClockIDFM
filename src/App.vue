<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import BoardVisibilityControls from "./components/BoardVisibilityControls.vue";
import DepartureAlarmModal from "./components/DepartureAlarmModal.vue";
import StationBoardModal from "./components/StationBoardModal.vue";
import TransitBoard from "./components/TransitBoard.vue";
import { transitBoards } from "./config/transitBoards";
import { DeparturePatternModal } from "./features/service-pattern";
import {
  fetchBoardDepartures,
  fetchDepartureCallingPattern,
} from "./services/idfm";
import {
  createDefaultPreferences,
  loadTransitPreferences,
  saveTransitPreferences,
} from "./storage/transitPreferences";
import {
  createDepartureAlarm,
  loadDepartureAlarms,
  markAlarmNotified,
  reconcileBoardAlarms,
  removeAlarmsForBoard,
  saveDepartureAlarms,
} from "./storage/transitAlarms";
import type {
  AlarmDraft,
  Departure,
  DepartureAlarm,
  DepartureCallingPattern,
  DirectionDepartureGroup,
  TransitBoardConfig,
} from "./types/transit";
import { BellRing } from "lucide-vue-next";

interface BoardState {
  departures: Departure[];
  directionGroups: DirectionDepartureGroup[];
  loading: boolean;
  error?: string;
  updatedAt?: Date;
}

const REFRESH_INTERVAL_MS = 30_000;
const preferences = reactive(createDefaultPreferences(transitBoards));

const states = reactive<Record<string, BoardState>>({});
const refreshing = ref(false);
const lastRefresh = ref<Date>();
const stationModalOpen = ref(false);
const alarmTarget = ref<{
  board: TransitBoardConfig;
  directionGroup: DirectionDepartureGroup;
  departure: Departure;
}>();
const alarmToast = ref<DepartureAlarm>();
const departureAlarms = ref<DepartureAlarm[]>([]);
const patternTarget = ref<{
  board: TransitBoardConfig;
  directionGroup: DirectionDepartureGroup;
  departure: Departure;
}>();
const patternData = ref<DepartureCallingPattern>();
const patternLoading = ref(false);
const patternError = ref("");
const pageVisible = ref(true);
const nowTick = ref(Date.now());
let refreshTimer: number | undefined;
const alarmTimers = new Map<string, number>();
let toastTimer: number | undefined;
let clockTimer: number | undefined;

const allBoards = computed(() => [
  ...transitBoards,
  ...preferences.customBoards,
]);

const visibleBoards = computed(() =>
  allBoards.value.filter((board) =>
    preferences.visibleBoardIds.includes(board.id),
  ),
);

const totalDepartures = computed(() =>
  visibleBoards.value.reduce(
    (total, board) => total + (states[board.id]?.departures.length ?? 0),
    0,
  ),
);

const nextAlarm = computed(
  () =>
    departureAlarms.value
      .filter((alarm) => !alarm.notified)
      .sort(
        (left, right) =>
          new Date(left.alarmTime).getTime() -
          new Date(right.alarmTime).getTime(),
      )[0],
);

const nextAlarmRemaining = computed(() =>
  nextAlarm.value ? formatAlarmRemaining(nextAlarm.value, nowTick.value) : "",
);

function getBoardAlarmDepartureIds(boardId: string): string[] {
  return departureAlarms.value
    .filter((alarm) => alarm.boardId === boardId && !alarm.notified)
    .map((alarm) => alarm.departureId);
}

function ensureBoardState(boardId: string): BoardState {
  const board = allBoards.value.find((item) => item.id === boardId);

  if (!board) {
    throw new Error(`Tableau inconnu: ${boardId}`);
  }

  states[board.id] ??= {
    departures: [],
    directionGroups: board.directionGroups.map((group) => ({
      id: group.id,
      label: group.label,
      subtitle: group.subtitle,
      departures: [],
      serviceEnded: false,
    })),
    loading: false,
  };

  return states[board.id];
}

async function refreshBoard(boardId: string): Promise<void> {
  if (!isPageVisible()) {
    return;
  }

  const board = allBoards.value.find((item) => item.id === boardId);

  if (!board) {
    return;
  }

  const state = ensureBoardState(board.id);
  state.loading = true;
  state.error = undefined;

  try {
    const result = await fetchBoardDepartures(board);

    state.departures = result.departures;
    state.directionGroups = result.directionGroups;
    state.updatedAt = new Date();
    updateAlarms(
      reconcileBoardAlarms(board, result.departures, departureAlarms.value),
    );
  } catch (error) {
    state.error =
      error instanceof Error ? error.message : "Erreur de récupération";
  } finally {
    state.loading = false;
  }
}

async function refreshAll(): Promise<void> {
  if (!isPageVisible()) {
    refreshing.value = false;
    return;
  }

  refreshing.value = true;

  await Promise.all(visibleBoards.value.map((board) => refreshBoard(board.id)));
  lastRefresh.value = new Date();
  refreshing.value = false;
}

function toggleBoardVisibility(boardId: string): void {
  const visibleIds = new Set(preferences.visibleBoardIds);

  if (visibleIds.has(boardId)) {
    visibleIds.delete(boardId);
  } else {
    visibleIds.add(boardId);
  }

  preferences.visibleBoardIds = allBoards.value
    .map((board) => board.id)
    .filter((id) => visibleIds.has(id));
  saveTransitPreferences(preferences);

  if (visibleIds.has(boardId)) {
    void refreshBoard(boardId);
  }
}

function addCustomBoard(board: TransitBoardConfig): void {
  const existingBoardIndex = preferences.customBoards.findIndex(
    (item) => item.id === board.id,
  );

  if (existingBoardIndex >= 0) {
    preferences.customBoards[existingBoardIndex] = board;
  } else {
    preferences.customBoards.push(board);
  }

  if (!preferences.visibleBoardIds.includes(board.id)) {
    preferences.visibleBoardIds.push(board.id);
  }

  ensureBoardState(board.id);
  saveTransitPreferences(preferences);
  void refreshBoard(board.id);
}

function removeCustomBoard(boardId: string): void {
  preferences.customBoards = preferences.customBoards.filter(
    (board) => board.id !== boardId,
  );
  preferences.visibleBoardIds = preferences.visibleBoardIds.filter(
    (id) => id !== boardId,
  );
  preferences.collapsedDirectionIds = preferences.collapsedDirectionIds.filter(
    (id) => !id.startsWith(`${boardId}:`),
  );
  delete states[boardId];
  saveTransitPreferences(preferences);
  updateAlarms(removeAlarmsForBoard(boardId, departureAlarms.value));
}

function isCustomBoard(boardId: string): boolean {
  return preferences.customBoards.some((board) => board.id === boardId);
}

function toggleDirection(boardId: string, directionId: string): void {
  const scopedId = getScopedDirectionId(boardId, directionId);
  const collapsedIds = new Set(preferences.collapsedDirectionIds);

  if (collapsedIds.has(scopedId)) {
    collapsedIds.delete(scopedId);
  } else {
    collapsedIds.add(scopedId);
  }

  preferences.collapsedDirectionIds = Array.from(collapsedIds);
  saveTransitPreferences(preferences);
}

function getBoardCollapsedDirectionIds(boardId: string): string[] {
  const prefix = `${boardId}:`;

  return preferences.collapsedDirectionIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => id.slice(prefix.length));
}

function getScopedDirectionId(boardId: string, directionId: string): string {
  return `${boardId}:${directionId}`;
}

function openAlarmModal(payload: {
  board: TransitBoardConfig;
  directionGroup: DirectionDepartureGroup;
  departure: Departure;
}): void {
  alarmTarget.value = payload;
}

async function openPatternModal(payload: {
  board: TransitBoardConfig;
  directionGroup: DirectionDepartureGroup;
  departure: Departure;
}): Promise<void> {
  if (
    patternLoading.value &&
    patternTarget.value?.departure.id === payload.departure.id
  ) {
    return;
  }

  patternTarget.value = payload;
  patternData.value = undefined;
  patternError.value = "";
  patternLoading.value = true;

  try {
    patternData.value = await fetchDepartureCallingPattern(
      payload.board,
      payload.departure,
    );
  } catch (error) {
    patternError.value =
      error instanceof Error
        ? error.message
        : "Impossible de charger la desserte.";
  } finally {
    patternLoading.value = false;
  }
}

function closePatternModal(): void {
  patternTarget.value = undefined;
  patternData.value = undefined;
  patternError.value = "";
  patternLoading.value = false;
}

async function confirmAlarm(draft: AlarmDraft): Promise<void> {
  if (!alarmTarget.value) {
    return;
  }

  await requestNotificationPermission();

  const alarm = createDepartureAlarm(
    alarmTarget.value.board,
    alarmTarget.value.departure,
    draft,
  );
  const nextAlarms = departureAlarms.value.filter(
    (item) =>
      !(
        item.boardId === alarm.boardId &&
        item.departureId === alarm.departureId &&
        !item.notified
      ),
  );

  updateAlarms([...nextAlarms, alarm]);
  alarmTarget.value = undefined;
}

function cancelAlarmModal(): void {
  alarmTarget.value = undefined;
}

function updateAlarms(alarms: DepartureAlarm[]): void {
  departureAlarms.value = alarms;
  saveDepartureAlarms(departureAlarms.value);
  scheduleAlarmTimers();
}

function scheduleAlarmTimers(): void {
  alarmTimers.forEach((timer) => window.clearTimeout(timer));
  alarmTimers.clear();

  const dueAlarms: DepartureAlarm[] = [];

  departureAlarms.value
    .filter((alarm) => !alarm.notified)
    .forEach((alarm) => {
      const delay = new Date(alarm.alarmTime).getTime() - Date.now();

      if (delay <= 0) {
        dueAlarms.push(alarm);
        return;
      }

      const timer = window.setTimeout(
        () => {
          void triggerAlarm(alarm);
        },
        Math.min(delay, 2_147_483_647),
      );

      alarmTimers.set(alarm.id, timer);
    });

  dueAlarms.forEach((alarm) => {
    window.setTimeout(() => {
      void triggerAlarm(alarm);
    }, 0);
  });
}

async function triggerAlarm(alarm: DepartureAlarm): Promise<void> {
  if (departureAlarms.value.find((item) => item.id === alarm.id)?.notified) {
    return;
  }

  updateAlarms(markAlarmNotified(alarm.id, departureAlarms.value));
  showAlarmToast(alarm);
  showNativeNotification(alarm);

  if (alarm.soundEnabled) {
    playSoftAlarm();
  }
}

function showAlarmToast(alarm: DepartureAlarm): void {
  alarmToast.value = alarm;

  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }

  toastTimer = window.setTimeout(() => {
    alarmToast.value = undefined;
  }, 60_000);
}

function dismissAlarmToast(): void {
  alarmToast.value = undefined;

  if (toastTimer) {
    window.clearTimeout(toastTimer);
    toastTimer = undefined;
  }
}

function showNativeNotification(alarm: DepartureAlarm): void {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const body = [
    `${alarm.lineLabel} vers ${alarm.destination}`,
    `${alarm.monitoringLabel}${alarm.platform ? ` · Quai ${alarm.platform}` : ""}`,
  ].join("\n");

  new Notification(`Il est temps de partir pour ${alarm.boardTitle}`, {
    body,
    tag: alarm.id,
  });
}

async function requestNotificationPermission(): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "default") {
    return;
  }

  await Notification.requestPermission();
}

function playSoftAlarm(): void {
  const AudioContextClass =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const audioContext = new AudioContextClass();
  const gain = audioContext.createGain();
  const oscillator = audioContext.createOscillator();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
  oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.18);
  oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.36);
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.04);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    audioContext.currentTime + 0.85,
  );
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.9);
}

transitBoards.forEach((board) => ensureBoardState(board.id));

function isPageVisible(): boolean {
  return (
    typeof document === "undefined" || document.visibilityState === "visible"
  );
}

function startRefreshTimer(): void {
  stopRefreshTimer();
  refreshTimer = window.setInterval(() => {
    void refreshAll();
  }, REFRESH_INTERVAL_MS);
}

function stopRefreshTimer(): void {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}

function refreshOnReturn(): void {
  if (!isPageVisible()) {
    return;
  }

  pageVisible.value = true;
  startRefreshTimer();
  scheduleAlarmTimers();
  void refreshAll();
}

function handlePatternRequest(event: Event): void {
  const payload = (
    event as CustomEvent<{
      board: TransitBoardConfig;
      directionGroup: DirectionDepartureGroup;
      departure: Departure;
    }>
  ).detail;

  if (payload?.board && payload.departure) {
    void openPatternModal(payload);
  }
}

function handleVisibilityChange(): void {
  pageVisible.value = isPageVisible();

  if (pageVisible.value) {
    refreshOnReturn();
  } else {
    stopRefreshTimer();
  }
}

function formatClock(date?: Date): string {
  if (!date) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(date);
}

function formatAlarmRemaining(alarm: DepartureAlarm, now: number): string {
  const remainingMs = new Date(alarm.alarmTime).getTime() - now;

  if (remainingMs <= 0) {
    return "maintenant";
  }

  const minutes = Math.ceil(remainingMs / 60_000);

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  return restMinutes ? `${hours} h ${restMinutes}` : `${hours} h`;
}

onMounted(() => {
  Object.assign(preferences, loadTransitPreferences(transitBoards));
  departureAlarms.value = loadDepartureAlarms();
  allBoards.value.forEach((board) => ensureBoardState(board.id));
  pageVisible.value = isPageVisible();
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("transport-clock:show-pattern", handlePatternRequest);
  window.addEventListener("focus", refreshOnReturn);
  clockTimer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
  scheduleAlarmTimers();

  if (pageVisible.value) {
    startRefreshTimer();
    void refreshAll();
  }
});

onBeforeUnmount(() => {
  stopRefreshTimer();
  alarmTimers.forEach((timer) => window.clearTimeout(timer));
  alarmTimers.clear();
  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }
  if (clockTimer) {
    window.clearInterval(clockTimer);
  }
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener(
    "transport-clock:show-pattern",
    handlePatternRequest,
  );
  window.removeEventListener("focus", refreshOnReturn);
});
</script>

<template>
  <main class="app-shell">
    <section class="topbar" aria-label="État des prochains passages">
      <div>
        <p class="eyebrow">Île-de-France Mobilités</p>
        <h1>Prochains passages</h1>
      </div>

      <div class="topbar__meta">
        <div v-if="nextAlarmRemaining" class="topbar__alarm">
          <div class="topbar__alarm_without_icon">
            <BellRing />
            <div>
              <span>{{ nextAlarmRemaining }}</span>
              <small>avant alarme</small>
            </div>
          </div>
        </div>
        <div>
          <span>{{ totalDepartures }}</span>
          <small>passages suivis</small>
        </div>
        <div>
          <span>{{ formatClock(lastRefresh) }}</span>
          <small>dernière màj</small>
        </div>
        <button type="button" :disabled="refreshing" @click="refreshAll">
          {{ refreshing ? "Actualisation..." : "Actualiser" }}
        </button>
      </div>

      <div class="topbar__controls">
        <BoardVisibilityControls
          :boards="allBoards"
          :visible-board-ids="preferences.visibleBoardIds"
          @toggle="toggleBoardVisibility"
        />
        <button
          class="button-secondary"
          type="button"
          @click="stationModalOpen = true"
        >
          <span class="button-plus" aria-hidden="true">+</span>
          Ajouter
        </button>
      </div>
    </section>

    <section class="boards-grid" aria-label="Horaires par arrêt">
      <TransitBoard
        v-for="board in visibleBoards"
        :key="board.id"
        :board="board"
        :departures="states[board.id].departures"
        :direction-groups="states[board.id].directionGroups"
        :collapsed-direction-ids="getBoardCollapsedDirectionIds(board.id)"
        :loading="states[board.id].loading"
        :error="states[board.id].error"
        :updated-at="states[board.id].updatedAt"
        :removable="isCustomBoard(board.id)"
        :alarm-departure-ids="getBoardAlarmDepartureIds(board.id)"
        @remove="removeCustomBoard(board.id)"
        @schedule-alarm="openAlarmModal"
        @toggle-direction="toggleDirection(board.id, $event)"
      />
    </section>

    <StationBoardModal
      :open="stationModalOpen"
      @add="addCustomBoard"
      @close="stationModalOpen = false"
    />

    <DepartureAlarmModal
      :board="alarmTarget?.board"
      :departure="alarmTarget?.departure"
      :open="Boolean(alarmTarget)"
      @cancel="cancelAlarmModal"
      @confirm="confirmAlarm"
    />

    <DeparturePatternModal
      :board="patternTarget?.board"
      :departure="patternTarget?.departure"
      :error="patternError"
      :loading="patternLoading"
      :open="Boolean(patternTarget)"
      :pattern="patternData"
      @close="closePatternModal"
    />

    <div v-if="alarmToast" class="alarm-alert-backdrop" role="presentation">
      <section
        class="alarm-toast"
        role="dialog"
        aria-live="assertive"
        aria-modal="true"
      >
        <div
          class="alarm-toast__line"
          :style="{ backgroundColor: alarmToast.lineColor }"
        >
          {{ alarmToast.lineLabel }}
        </div>
        <div>
          <p class="eyebrow">Alarme de passage</p>
          <strong>{{ alarmToast.destination }}</strong>
          <span>
            {{ alarmToast.boardTitle }} · {{ alarmToast.monitoringLabel }}
            <template v-if="alarmToast.platform">
              · Quai {{ alarmToast.platform }}</template
            >
          </span>
        </div>
        <button
          class="icon-button"
          type="button"
          aria-label="Fermer l'alerte"
          @click="dismissAlarmToast"
        >
          ×
        </button>
      </section>
    </div>
  </main>
</template>

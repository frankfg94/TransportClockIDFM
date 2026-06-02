<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import BoardVisibilityControls from "./components/BoardVisibilityControls.vue";
import DepartureAlarmModal from "./components/DepartureAlarmModal.vue";
import StationBoardModal from "./components/StationBoardModal.vue";
import TransitBoard from "./components/TransitBoard.vue";
import { transitBoards } from "./config/transitBoards";
import { DeparturePatternModal } from "./features/service-pattern";
import {
  filterTerminalOnly,
  requestTemporaryAlarmWakeLock,
  useAppSettings,
} from "./features/app-settings";
import { WeatherExperience, WeatherForecastModal } from "./features/weather";
import {
  getCurrentTrafficDisruptions,
  normalizeTrafficLineRef,
} from "./features/traffic";
import { fetchBoardDepartures } from "./services/idfm";
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
  LinePatternViewResponse,
  TransitBoardConfig,
} from "./types/transit";
import type {
  TrafficLineReport,
  TrafficResponse,
} from "./features/traffic/types";
import {
  BellRing,
  CloudSun,
  MoreVertical,
  Plus,
  RefreshCw,
} from "lucide-vue-next";
import { useRouter } from "nuxt/app";

type BoardTrafficAlert = {
  label: "Perturbation" | "Interruption";
  tone: "orange" | "red";
};

interface BoardState {
  departures: Departure[];
  directionGroups: DirectionDepartureGroup[];
  loading: boolean;
  error?: string;
  updatedAt?: Date;
}

interface NetexCacheStatus {
  available: boolean;
  source?: {
    kind: "remote" | "directory" | "auto";
    location: string;
  };
  generatedAt?: string;
  lineCount?: number;
  warning?: string;
  message?: string;
}

const REFRESH_INTERVAL_MS = 30_000;
const preferences = reactive(createDefaultPreferences(transitBoards));
const { settings, effectiveMaxDeparturesPerDirection } = useAppSettings();
let activeAlarmAudio:
  | {
      audioContext: AudioContext;
      closeTimer?: number;
    }
  | undefined;
const states = reactive<Record<string, BoardState>>({});
const refreshing = ref(false);
const lastRefresh = ref<Date>();
const stationModalOpen = ref(false);
const topbarMenuOpen = ref(false);
const weatherModalOpen = ref(false);
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
const netexCacheStatus = ref<NetexCacheStatus>();
const netexCacheStatusLoaded = ref(false);
const trafficReports = ref<TrafficLineReport[]>([]);
const primApiKeyConfigured = __IDFM_API_KEY_CONFIGURED__;
let refreshTimer: number | undefined;
const alarmTimers = new Map<string, number>();
let toastTimer: number | undefined;
let clockTimer: number | undefined;

const allBoards = computed<TransitBoardConfig[]>(() => [
  ...transitBoards,
  ...preferences.customBoards,
]);

const visibleBoards = computed(() =>
  allBoards.value.filter((board) =>
    preferences.visibleBoardIds.includes(board.id),
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

const netexCacheAlert = computed(() => {
  if (!netexCacheStatusLoaded.value || netexCacheStatus.value?.available) {
    return "";
  }

  return (
    netexCacheStatus.value?.message ||
    "Données NeTEx introuvables. Les plans de ligne et dessertes détaillées peuvent être indisponibles."
  );
});
const trafficReportByLineRef = computed(
  () => new Map(trafficReports.value.map((report) => [report.lineRef, report])),
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
      isTerminal: group.isTerminal,
      departures: [],
      serviceEnded: false,
    })),
    loading: false,
  };

  return states[board.id];
}

async function refreshBoard(boardId: string): Promise<void> {
  if (!primApiKeyConfigured || !isPageVisible()) {
    return;
  }

  const board = allBoards.value.find((item) => item.id === boardId);

  if (!board) {
    return;
  }

  const state = ensureBoardState(board.id);

  if (state.loading) {
    return;
  }

  state.loading = true;
  state.error = undefined;

  try {
    const result = await fetchBoardDepartures(
      createBoardRequestForSettings(board),
    );

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
  if (!primApiKeyConfigured || !isPageVisible()) {
    refreshing.value = false;
    return;
  }

  if (refreshing.value) {
    return;
  }

  refreshing.value = true;

  try {
    await runWithConcurrency(visibleBoards.value, 3, (board) =>
      refreshBoard(board.id),
    );
    void refreshTrafficSummary();
    lastRefresh.value = new Date();
  } finally {
    refreshing.value = false;
  }
}

async function refreshTrafficSummary(): Promise<void> {
  if (!primApiKeyConfigured || !isPageVisible()) {
    return;
  }

  const lineRefs = Array.from(
    new Set(
      visibleBoards.value
        .filter((board) => board.line.mode !== "bus")
        .map(resolveBoardTrafficLineRef),
    ),
  );

  if (lineRefs.length === 0) {
    trafficReports.value = [];
    return;
  }

  try {
    const params = new URLSearchParams({
      lineRefs: lineRefs.join(","),
    });
    const response = await fetch(`/api/traffic?${params}`);

    if (!response.ok) {
      throw new Error("Impossible de charger l'info trafic.");
    }

    const payload = (await response.json()) as TrafficResponse;
    trafficReports.value = payload.lines;
  } catch {
    trafficReports.value = [];
  }
}

function toggleTopbarMenu(): void {
  topbarMenuOpen.value = !topbarMenuOpen.value;
}

function closeTopbarMenu(): void {
  topbarMenuOpen.value = false;
}

function refreshFromTopbarMenu(): void {
  closeTopbarMenu();
  void refreshAll();
}

function openWeatherModal(): void {
  closeTopbarMenu();
  weatherModalOpen.value = true;
}

function createBoardRequestForSettings(
  board: TransitBoardConfig,
): TransitBoardConfig {
  const maxDeparturesPerDirection = effectiveMaxDeparturesPerDirection.value;

  return typeof maxDeparturesPerDirection === "number"
    ? {
        ...board,
        maxDeparturesPerDirection,
      }
    : board;
}

function getVisibleDirectionGroupsForBoard(
  boardId: string,
): DirectionDepartureGroup[] {
  return filterTerminalOnly(
    states[boardId]?.directionGroups ?? [],
    settings.value.terminalDirectionsOnly,
  );
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(limit, queue.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift();

        if (item) {
          await worker(item);
        }
      }
    },
  );

  await Promise.all(workers);
}

async function loadNetexCacheStatus(): Promise<void> {
  try {
    const response = await fetch("/api/netex/status");

    if (!response.ok) {
      throw new Error("Impossible de vérifier le cache NeTEx.");
    }

    netexCacheStatus.value = (await response.json()) as NetexCacheStatus;
  } catch (error) {
    netexCacheStatus.value = {
      available: false,
      message:
        error instanceof Error ? error.message : "Données NeTEx introuvables.",
    };
  } finally {
    netexCacheStatusLoaded.value = true;
  }
}

function stopSoftAlarm(): void {
  if (!activeAlarmAudio) {
    return;
  }

  if (activeAlarmAudio.closeTimer) {
    window.clearTimeout(activeAlarmAudio.closeTimer);
  }

  const { audioContext } = activeAlarmAudio;
  activeAlarmAudio = undefined;

  if (audioContext.state !== "closed") {
    void audioContext.close().catch(() => undefined);
  }
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

function changeBoardStation(
  previousBoard: TransitBoardConfig,
  nextBoard: TransitBoardConfig,
): void {
  preferences.customBoards = preferences.customBoards.filter(
    (board) => board.id !== previousBoard.id && board.id !== nextBoard.id,
  );
  preferences.customBoards.push(nextBoard);
  preferences.visibleBoardIds = preferences.visibleBoardIds.map((id) =>
    id === previousBoard.id ? nextBoard.id : id,
  );

  if (!preferences.visibleBoardIds.includes(nextBoard.id)) {
    preferences.visibleBoardIds.push(nextBoard.id);
  }

  preferences.collapsedDirectionIds = preferences.collapsedDirectionIds.filter(
    (id) => !id.startsWith(`${previousBoard.id}:`),
  );
  delete states[previousBoard.id];
  ensureBoardState(nextBoard.id);
  saveTransitPreferences(preferences);
  updateAlarms(removeAlarmsForBoard(previousBoard.id, departureAlarms.value));
  void refreshBoard(nextBoard.id);
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

function openLinePage(board: TransitBoardConfig): void {
  const transportType =
    board.line.mode === "train" ? "transilien" : board.line.mode;
  const lineId = board.line.shortName || board.line.ref;
  const startStation = board.title || board.schedule?.stopAreaRef;
  const params = new URLSearchParams();

  if (startStation) {
    params.set("startStation", startStation);
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  window.open(
    `/line/${encodeURIComponent(transportType)}/${encodeURIComponent(lineId)}${suffix}`,
    "_blank",
    "noopener,noreferrer",
  );
}

function openTrafficPage(): void {
  const router = useRouter();
  router.push("/traffic");
}

function getBoardTrafficAlert(
  board: TransitBoardConfig,
): BoardTrafficAlert | undefined {
  if (board.line.mode === "bus") {
    return undefined;
  }

  const report = trafficReportByLineRef.value.get(
    resolveBoardTrafficLineRef(board),
  );
  const currentDisruptions = report
    ? getCurrentTrafficDisruptions(report.disruptions)
    : [];

  if (
    !report ||
    currentDisruptions.length === 0 ||
    ["normal", "unknown", "error"].includes(report.status)
  ) {
    return undefined;
  }

  return isTrafficInterruption(currentDisruptions)
    ? { label: "Interruption", tone: "red" }
    : { label: "Perturbation", tone: "orange" };
}

function isTrafficInterruption(
  disruptions: TrafficLineReport["disruptions"],
): boolean {
  return disruptions.some((disruption) => {
    const searchable = normalizeTrafficText(
      `${disruption.title} ${disruption.message ?? ""} ${disruption.severity ?? ""}`,
    );

    return [
      "interrompu",
      "interruption",
      "no service",
      "no-service",
      "bloquant",
      "bloquante",
    ].some((needle) => searchable.includes(needle));
  });
}

function resolveBoardTrafficLineRef(board: TransitBoardConfig): string {
  return normalizeTrafficLineRef(board.schedule?.lineRef ?? board.line.ref);
}

function normalizeTrafficText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
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
    const patternView = await fetchLinePatternView(
      payload.board,
      payload.departure,
      payload.directionGroup,
    );

    patternData.value = patternView.pattern;
  } catch (error) {
    patternError.value =
      error instanceof Error
        ? error.message
        : "Impossible de charger la desserte.";
  } finally {
    patternLoading.value = false;
  }
}

async function fetchLinePatternView(
  board: TransitBoardConfig,
  departure: Departure,
  directionGroup: DirectionDepartureGroup,
): Promise<LinePatternViewResponse> {
  const transportType =
    board.line.mode === "train" ? "transilien" : board.line.mode;
  const lineId = board.line.shortName || board.line.ref;
  const direction =
    departure.destination || directionGroup.id || directionGroup.label;
  const startStation =
    departure.stopName ||
    board.title ||
    board.schedule?.stopAreaRef ||
    departure.monitoringRef;
  const params = new URLSearchParams();

  if (direction) {
    params.set("direction", direction);
  }

  if (startStation) {
    params.set("startStation", startStation);
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(
    `/api/lines/${encodeURIComponent(transportType)}/${encodeURIComponent(
      lineId,
    )}/pattern${suffix}`,
  );

  if (!response.ok) {
    throw new Error("Impossible de charger la desserte.");
  }

  return response.json() as Promise<LinePatternViewResponse>;
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
  if (settings.value.wakeDeviceOnAlarm) {
    void requestTemporaryAlarmWakeLock("1m");
  }

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
    dismissAlarmToast();
  }, 60_000);
}

function dismissAlarmToast(): void {
  alarmToast.value = undefined;
  stopSoftAlarm();

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
  stopSoftAlarm();

  const AudioContextClass =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const audioContext = new AudioContextClass();

  const masterGain = audioContext.createGain();
  const alarmVolume = 0.6;
  const durationSeconds = 30;
  const patternDuration = 1.2;

  masterGain.gain.setValueAtTime(alarmVolume, audioContext.currentTime);
  masterGain.connect(audioContext.destination);

  activeAlarmAudio = {
    audioContext,
  };

  const notes = [
    { frequency: 523.25, offset: 0 },
    { frequency: 659.25, offset: 0.18 },
    { frequency: 783.99, offset: 0.36 },
  ];

  const playTone = (frequency: number, startTime: number): void => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(1, startTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.28);

    oscillator.connect(gain);
    gain.connect(masterGain);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.35);
  };

  const now = audioContext.currentTime;

  for (let time = 0; time < durationSeconds; time += patternDuration) {
    for (const note of notes) {
      const startTime = now + time + note.offset;

      if (startTime < now + durationSeconds) {
        playTone(note.frequency, startTime);
      }
    }
  }

  masterGain.gain.setValueAtTime(alarmVolume, now);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

  activeAlarmAudio.closeTimer = window.setTimeout(
    () => {
      stopSoftAlarm();
    },
    (durationSeconds + 1) * 1000,
  );
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
  if (!primApiKeyConfigured || !isPageVisible()) {
    return;
  }

  pageVisible.value = true;
  startRefreshTimer();
  scheduleAlarmTimers();
  void refreshAll();
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
  window.addEventListener("focus", refreshOnReturn);
  clockTimer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
  scheduleAlarmTimers();
  void loadNetexCacheStatus();

  if (primApiKeyConfigured && pageVisible.value) {
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
  stopSoftAlarm();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("focus", refreshOnReturn);
});
</script>

<template>
  <main class="app-shell">
    <div
      class="app-content"
      :class="{ 'app-content--locked': !primApiKeyConfigured }"
      :aria-hidden="!primApiKeyConfigured"
    >
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
            <span>{{ formatClock(lastRefresh) }}</span>
            <small>dernière mise à jour</small>
          </div>
          <div class="topbar-actions" @keydown.esc="closeTopbarMenu">
            <button
              class="topbar-actions__trigger icon-button"
              type="button"
              aria-label="Ouvrir les actions du dashboard"
              :aria-expanded="topbarMenuOpen"
              aria-haspopup="menu"
              @click="toggleTopbarMenu"
            >
              <MoreVertical aria-hidden="true" />
            </button>
            <div v-if="topbarMenuOpen" class="topbar-actions__menu" role="menu">
              <button
                type="button"
                role="menuitem"
                :disabled="refreshing"
                @click="refreshFromTopbarMenu"
              >
                <RefreshCw
                  aria-hidden="true"
                  :class="{ 'topbar-actions__spin': refreshing }"
                />
                {{ refreshing ? "Actualisation..." : "Actualiser" }}
              </button>
              <button type="button" role="menuitem" @click="openWeatherModal">
                <CloudSun aria-hidden="true" />
                Météo
              </button>
            </div>
          </div>
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
            <Plus />
            Ajouter
          </button>
        </div>
      </section>

      <WeatherExperience />
      <WeatherForecastModal
        :open="weatherModalOpen"
        @close="weatherModalOpen = false"
      />

      <section
        v-if="netexCacheAlert"
        class="netex-cache-alert"
        role="status"
        aria-live="polite"
      >
        <strong>Données NeTEx introuvables</strong>
        <span>
          {{ netexCacheAlert }}
          Configurez <code>IDFM_NETEX_CACHE_REMOTE</code> avec une URL R2/HTTP
          ou <code>IDFM_NETEX_CACHE_LOCAL</code> avec un dossier contenant
          <code>index.json</code>.
        </span>
      </section>

      <section class="boards-grid" aria-label="Horaires par arrêt">
        <TransitBoard
          v-for="board in visibleBoards"
          :key="board.id"
          :board="board"
          :departures="states[board.id].departures"
          :direction-groups="getVisibleDirectionGroupsForBoard(board.id)"
          :collapsed-direction-ids="getBoardCollapsedDirectionIds(board.id)"
          :loading="states[board.id].loading"
          :error="states[board.id].error"
          :updated-at="states[board.id].updatedAt"
          :removable="isCustomBoard(board.id)"
          :alarm-departure-ids="getBoardAlarmDepartureIds(board.id)"
          :closed-summary-mode="settings.closedDirectionSummaryMode"
          :traffic-alert="getBoardTrafficAlert(board)"
          @change-station="changeBoardStation(board, $event)"
          @open-traffic="openTrafficPage"
          @remove="removeCustomBoard(board.id)"
          @open-line-page="openLinePage"
          @schedule-alarm="openAlarmModal"
          @show-pattern="openPatternModal"
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
        :show-mini-map="settings.showPatternMiniMap"
        :compact-mode="settings.compactLinePlanMode"
        :rich-transfer-tooltips="settings.richTransferTooltips"
        :transfer-bundle-retention-days="settings.transferBundleRetentionDays"
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
    </div>

    <Transition name="modal-scale">
      <section
        v-if="!primApiKeyConfigured"
        class="api-key-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-key-title"
      >
        <p class="eyebrow">Configuration PRIM</p>
        <h2 id="api-key-title">Clé API IDFM PRIM manquante</h2>
        <p>
          Ajoutez une clé d'API PRIM Île-De-France Mobilités gratuite dans le
          fichier d'environnement pour activer les prochains passages.
        </p>
        <ol>
          <li>
            <a
              href="https://prim.iledefrance-mobilites.fr/"
              target="_blank"
              rel="noreferrer"
            >
              Créer votre clé API PRIM
            </a>
          </li>
          <li>Assignez <code>IDFM_API_KEY</code></li>
          <li>Redémarrez le serveur</li>
          <li>Enjoy</li>
        </ol>
      </section>
    </Transition>
  </main>
</template>

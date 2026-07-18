import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import type { LoadingClockDirection } from "../../components/LoadingClock.vue";
import type {
  TrafficCalendarImpactScope,
  TrafficLineReport,
} from "../traffic";
import type {
  PatternTrafficEdge,
  PatternTrafficStation,
} from "./trafficImpactAnalysis";
import {
  addTrafficCalendarMonths,
  createPatternTrafficCalendarEvents,
  createPatternTrafficCalendarMonth,
  getLocalDateKey,
  getPatternTrafficCalendarBounds,
  getTrafficCalendarEvaluationTimestamp,
  type PatternTrafficCalendarDay,
} from "./trafficCalendar";

interface UsePatternTrafficCalendarOptions {
  report: ComputedRef<TrafficLineReport | undefined>;
  stations: ComputedRef<PatternTrafficStation[]>;
  edges: ComputedRef<PatternTrafficEdge[]>;
  impactScope: ComputedRef<TrafficCalendarImpactScope>;
  now: Ref<number>;
  reduceMotion: ComputedRef<boolean>;
  selectedDisruptionIds: Ref<string[]>;
  selectedTimestamp: Ref<number | undefined>;
}

export interface PatternTrafficCalendarSelection {
  day: PatternTrafficCalendarDay;
  disruptionIds: string[];
  timestamp?: number;
  realtime: boolean;
}

export function usePatternTrafficCalendar({
  report,
  stations,
  edges,
  impactScope,
  now,
  reduceMotion,
  selectedDisruptionIds,
  selectedTimestamp,
}: UsePatternTrafficCalendarOptions) {
  const open = ref(false);
  const expanded = ref(false);
  const visibleMonth = ref(new Date(now.value));
  const selectedDateKey = ref(getLocalDateKey(new Date(now.value)));
  const loadingDateKey = ref<string>();
  const loadingDirection = ref<LoadingClockDirection>("idle");
  let loadingTimer: number | undefined;

  const events = computed(() => {
    if (!report.value) return [];

    return createPatternTrafficCalendarEvents(
      report.value.disruptions,
      stations.value,
      edges.value,
      impactScope.value,
      now.value,
    );
  });
  const bounds = computed(() =>
    getPatternTrafficCalendarBounds(events.value, now.value),
  );
  const calendar = computed(() =>
    createPatternTrafficCalendarMonth(
      events.value,
      stations.value,
      edges.value,
      visibleMonth.value,
      now.value,
    ),
  );
  const selectedCalendar = computed(() =>
    createPatternTrafficCalendarMonth(
      events.value,
      stations.value,
      edges.value,
      new Date(`${selectedDateKey.value}T12:00:00`),
      now.value,
    ),
  );
  const selectedDay = computed(() =>
    selectedCalendar.value.days.find(
      (day) => day.dateKey === selectedDateKey.value,
    ),
  );
  const selectedDisruptions = computed(() => {
    const unique = new Map(
      (selectedDay.value?.events ?? []).map((event) => [
        event.disruption.id,
        event.disruption,
      ]),
    );
    return Array.from(unique.values());
  });
  const eventCount = computed(
    () => new Set(events.value.map((event) => event.disruption.id)).size,
  );
  const nextEvent = computed(() => events.value[0]);
  const nextDelayLabel = computed(() =>
    nextEvent.value ? formatTrafficCalendarDelay(nextEvent.value.start, now.value) : "",
  );
  const hasPrevious = computed(
    () => calendar.value.monthStart.getTime() > bounds.value.firstMonth.getTime(),
  );
  const hasNext = computed(
    () => calendar.value.monthStart.getTime() < bounds.value.lastMonth.getTime(),
  );

  watch(events, (value) => {
    if (value.length > 0) return;
    open.value = false;
    expanded.value = false;
  });

  onBeforeUnmount(clearLoadingTimer);

  function toggle(): void {
    open.value = !open.value;
    if (open.value) {
      visibleMonth.value = new Date(bounds.value.firstMonth);
      return;
    }
    expanded.value = false;
  }

  function close(): void {
    open.value = false;
    expanded.value = false;
  }

  function expand(): void {
    open.value = true;
    expanded.value = true;
  }

  function closeExpanded(): void {
    expanded.value = false;
  }

  async function selectDay(
    day: PatternTrafficCalendarDay,
  ): Promise<PatternTrafficCalendarSelection | undefined> {
    if (day.isPast) return undefined;

    beginLoading(day.dateKey, day.date);
    selectedDateKey.value = day.dateKey;

    if (!day.inCurrentMonth) {
      visibleMonth.value = new Date(
        day.date.getFullYear(),
        day.date.getMonth(),
        1,
      );
    }

    const timestamp = getTrafficCalendarEvaluationTimestamp(day.date, now.value);
    const disruptionIds =
      timestamp === undefined
        ? []
        : Array.from(new Set(day.events.map((event) => event.disruption.id)));
    selectedTimestamp.value = timestamp;
    selectedDisruptionIds.value = disruptionIds;

    await nextTick();
    scheduleLoadingClear(day.dateKey);

    return {
      day,
      disruptionIds,
      timestamp,
      realtime: timestamp === undefined,
    };
  }

  async function resetToday(): Promise<PatternTrafficCalendarSelection | undefined> {
    const today = new Date(now.value);
    const todayKey = getLocalDateKey(today);
    beginLoading(todayKey, today);
    selectedDateKey.value = todayKey;
    visibleMonth.value = new Date(today.getFullYear(), today.getMonth(), 1);
    selectedDisruptionIds.value = [];
    selectedTimestamp.value = undefined;

    await nextTick();
    scheduleLoadingClear(todayKey);

    const day = selectedDay.value;
    return day
      ? {
          day,
          disruptionIds: [],
          timestamp: undefined,
          realtime: true,
        }
      : undefined;
  }

  function resetSelection(): void {
    clearLoading();
    selectedDateKey.value = getLocalDateKey(new Date(now.value));
    selectedDisruptionIds.value = [];
    selectedTimestamp.value = undefined;
  }

  function previousMonth(): void {
    if (!hasPrevious.value) return;
    visibleMonth.value = addTrafficCalendarMonths(visibleMonth.value, -1);
  }

  function nextMonth(): void {
    if (!hasNext.value) return;
    visibleMonth.value = addTrafficCalendarMonths(visibleMonth.value, 1);
  }

  function beginLoading(dateKey: string, target: Date): void {
    clearLoadingTimer();
    const previous = new Date(`${selectedDateKey.value}T12:00:00`);
    loadingDirection.value =
      target.getTime() >= previous.getTime() ? "future" : "past";
    loadingDateKey.value = dateKey;
  }

  function scheduleLoadingClear(dateKey: string): void {
    clearLoadingTimer();

    if (typeof window === "undefined") {
      if (loadingDateKey.value === dateKey) loadingDateKey.value = undefined;
      return;
    }

    loadingTimer = window.setTimeout(() => {
      loadingTimer = undefined;
      if (loadingDateKey.value === dateKey) loadingDateKey.value = undefined;
    }, reduceMotion.value ? 0 : 680);
  }

  function clearLoading(): void {
    clearLoadingTimer();
    loadingDateKey.value = undefined;
    loadingDirection.value = "idle";
  }

  function clearLoadingTimer(): void {
    if (loadingTimer !== undefined && typeof window !== "undefined") {
      window.clearTimeout(loadingTimer);
    }
    loadingTimer = undefined;
  }

  return {
    bounds,
    calendar,
    close,
    closeExpanded,
    eventCount,
    events,
    expand,
    expanded,
    hasNext,
    hasPrevious,
    loadingDateKey,
    loadingDirection,
    nextDelayLabel,
    nextMonth,
    open,
    previousMonth,
    resetSelection,
    resetToday,
    selectDay,
    selectedDateKey,
    selectedDay,
    selectedDisruptions,
    toggle,
    visibleMonth,
  };
}

function formatTrafficCalendarDelay(date: Date, now: number): string {
  const days = Math.max(0, Math.ceil((date.getTime() - now) / 86_400_000));
  return days <= 0 ? "J" : `J-${days}`;
}

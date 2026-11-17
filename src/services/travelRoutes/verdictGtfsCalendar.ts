import { computed, onBeforeUnmount, onMounted, ref, shallowRef, type ComputedRef } from "vue";
import type { GtfsPublicStatus } from "../../../server/services/gtfs/types";
import { NEIGHBORHOOD_TRANSPORT_TIMEOUT_MS } from "../../../shared/gtfs/neighborhoodTimeout";
import { gtfsServiceEpoch, parisCivilEpoch } from "../../../shared/gtfs/routingTime";
import { shiftGtfsDate } from "../../../shared/gtfs/timetableCalendar";
import { getGtfsServiceDate } from "../lineFrequency";
import { toServerApiUrl } from "../serverApi";
import { createNeighborhoodGtfsAssetReader } from "./neighborhoodGtfsAssets";
import { isNeighborhoodGtfsColdStart } from "./neighborhoodGtfsDebug";
import { canUseBrowserNeighborhoodGtfs } from "./browserNeighborhoodGtfs";

type Coverage = { startDate: string; endDate: string };
type Calendar = NonNullable<GtfsPublicStatus["calendar"]>;

/** The latest covered occurrence of the requested weekday. A short feed
 * without that weekday still provides an explicitly dated last service day. */
export function verdictReferenceDate(requested: string, coverage?: Coverage): string {
  if (!coverage || requested <= coverage.endDate || coverage.startDate > coverage.endDate) return requested;
  const civilDay = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)) / 86_400_000;
  const weeks = Math.ceil((civilDay(requested) - civilDay(coverage.endDate)) / 7);
  const candidate = shiftGtfsDate(requested, -7 * weeks);
  return candidate >= coverage.startDate ? candidate : coverage.endDate;
}

export function verdictReferenceDatetime(requested: string, coverage?: Coverage, maxTimeSeconds?: number): string {
  const day = requested.slice(0, 8);
  if (!coverage || day <= coverage.endDate) return requested;
  if (maxTimeSeconds !== undefined) {
    try { if (parisCivilEpoch(requested) / 1000 <= gtfsServiceEpoch(coverage.endDate) + maxTimeSeconds) return requested; }
    catch { return requested; }
  }
  const time = requested.slice(8);
  let reference = verdictReferenceDate(day, coverage);
  // A spring-forward Sunday may lack the requested local clock time.
  while (reference >= coverage.startDate) {
    try { parisCivilEpoch(reference + time); return reference + time; }
    catch { reference = shiftGtfsDate(reference, -7); }
  }
  return requested;
}

export function useVerdictGtfsCalendar(requestedDay: ComputedRef<string>, requestedNight: ComputedRef<string>) {
  const read = createNeighborhoodGtfsAssetReader();
  const pack = shallowRef<Calendar>();
  const ready = ref(false);
  let disposed = false;
  let pending: Promise<boolean> | undefined;
  const version = computed(() => pack.value
    ? [pack.value.routing?.path, pack.value.timetable?.path, pack.value.cacheGeneration].join("|") : "");
  const day = computed(() => verdictReferenceDatetime(requestedDay.value, pack.value?.routing, pack.value?.routing?.maxTimeSeconds));
  const night = computed(() => verdictReferenceDatetime(requestedNight.value, pack.value?.timetable,
    pack.value?.routing?.endDate === pack.value?.timetable?.endDate ? pack.value?.routing?.maxTimeSeconds : undefined));
  const requestedTimetable = ref(getGtfsServiceDate());
  const timetable = computed(() => verdictReferenceDate(requestedTimetable.value, pack.value?.timetable));
  const historical = computed(() => day.value !== requestedDay.value || night.value !== requestedNight.value || timetable.value !== requestedTimetable.value);

  function reload(fresh = false): Promise<boolean> {
    if (pending) return pending;
    requestedTimetable.value = getGtfsServiceDate();
    pending = (async () => {
      const base = new URL(toServerApiUrl("/"), window.location.href).href;
      const cold = isNeighborhoodGtfsColdStart();
      let next: Calendar | undefined;
      if (!canUseBrowserNeighborhoodGtfs()) {
        // The HTTP router may use an R2 manifest newer than the static site.
        const status = await fetch(toServerApiUrl(`/api/gtfs/status?calendar=1${fresh ? "&fresh=1" : ""}`), {
          cache: "no-store", signal: AbortSignal.timeout(NEIGHBORHOOD_TRANSPORT_TIMEOUT_MS),
        }).then(async response => response.ok ? await response.json() as GtfsPublicStatus : undefined).catch(() => undefined);
        next = status?.calendar;
      }
      next ??= await read<Calendar>(base, "current.json", cold);
      if (!next || next.schemaVersion !== 1 || (!next.timetable && !next.routing)) return false;
      const routing = next.routing;
      if (routing && routing.maxTimeSeconds === undefined && (requestedDay.value.slice(0, 8) > routing.endDate || requestedNight.value.slice(0, 8) > routing.endDate)) {
        // Older packs predate the small manifest field. Read their index only
        // when after-midnight coverage matters; retain only the numeric bound.
        const previous = pack.value?.routing;
        const index = previous?.path === routing.path && previous.maxTimeSeconds !== undefined ? previous
          : await read<{ maxTimeSeconds: number }>(base, routing.path + "/index.json", cold).catch(() => undefined);
        if (index && Number.isFinite(index.maxTimeSeconds)) routing.maxTimeSeconds = index.maxTimeSeconds;
      }
      if (disposed) return false;
      const before = version.value;
      pack.value = next;
      return before !== version.value;
    })().catch(() => false).finally(() => { if (!disposed) ready.value = true; pending = undefined; });
    return pending;
  }

  onMounted(() => { void reload(); });
  onBeforeUnmount(() => { disposed = true; });
  return { day, night, timetable, requestedTimetable, historical, ready, version, reload };
}

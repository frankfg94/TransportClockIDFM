import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useAppSettings } from "../app-settings/appSettings";
import { toAddressBookPoint, useAddressBook, type AddressBookEntry } from "../address-book/addressBook";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type { TravelRoutesProvider } from "./nearbyHeavyTransports";
import type { NeighborhoodDatasetStatus } from "./neighborhood/criterionRegistry";
import {
  DEFAULT_PERSONAL_JOURNEY_THRESHOLDS, resolvedPersonalJourney,
  samePersonalJourneyDestination, validPersonalJourneyThresholds,
  type PersonalJourneyPreference, type PersonalJourneyResult, type PersonalJourneyThresholds,
} from "./neighborhood/personalJourneys";

export function useVerdictPersonalJourneys(options: {
  origin: { readonly value: GeocoderPoint | undefined };
  datetime: { readonly value: string };
  provider: TravelRoutesProvider;
}) {
  const directory = useAddressBook();
  const settings = useAppSettings();
  const initialized = ref(false);
  const revision = ref(0);
  const measurements = shallowRef(new Map<string, Pick<PersonalJourneyResult, "status" | "journey">>());
  const routeKey = (row: PersonalJourneyResult) => JSON.stringify([
    row.origin?.lon, row.origin?.lat, row.destination?.lon, row.destination?.lat, options.datetime.value,
  ]);
  const preferences = computed(() => settings.settings.value.verdictPersonalJourneys ?? []);
  const targets = computed<PersonalJourneyResult[]>(() => {
    if (!initialized.value || directory.error.value) return [];
    const entries = directory.entries.value.filter(entry => entry.kind === "address");
    const home = directory.primaryAddress.value;
    const work = directory.workplaceAddress.value;
    const rows: PersonalJourneyResult[] = [];
    const workPreference = preferences.value.find(pref => pref.destinationId === work?.id
      || (work && entries.some(entry => entry.id === pref.destinationId && samePersonalJourneyDestination(entry, work))));
    if (home && work && !workPreference?.disabled) rows.push({
      ...DEFAULT_PERSONAL_JOURNEY_THRESHOLDS, ...workPreference,
      id: `commute:${home.id}:${work.id}`, destinationId: work.id,
      destination: work, origin: toAddressBookPoint(home), commute: true, status: "loading",
    });
    for (const preference of preferences.value) {
      if (preference.disabled) continue;
      const destination = entries.find(entry => entry.id === preference.destinationId);
      if (destination && rows.some(row => row.destination && samePersonalJourneyDestination(row.destination, destination))) continue;
      rows.push({ ...preference, id: preference.destinationId, destination, origin: options.origin.value,
        commute: false, status: "loading" });
    }
    return rows;
  });
  const rows = computed<PersonalJourneyResult[]>(() => targets.value.map(row => ({ ...row,
    ...(!row.origin || !row.destination ? { status: "unavailable" as const }
      : measurements.value.get(routeKey(row)) ?? { status: "loading" as const }),
  })));
  const loading = computed(() => !initialized.value || rows.value.some(row => row.status === "loading"));
  const hasError = computed(() => directory.error.value || settings.storageError.value || rows.value.some(row => row.status === "error"));
  const datasets = computed(() => {
    const aggregate = (selected: readonly PersonalJourneyResult[]): NeighborhoodDatasetStatus =>
      !initialized.value || selected.some(row => row.status === "loading") ? "loading"
        : selected.some(row => row.status === "error") ? "error"
          : selected.length > 0 && selected.every(row => row.status === "ready") ? "ready" : "missing";
    return [
      { id: "address-book", required: false, status: (!initialized.value ? "loading" : directory.error.value ? "error" : "ready") as NeighborhoodDatasetStatus },
      { id: "personal-addresses", required: false, status: (!initialized.value ? "loading" : settings.storageError.value ? "error" : "ready") as NeighborhoodDatasetStatus },
      { id: "home-work-journey", required: false, status: directory.error.value ? "error" as const : aggregate(rows.value.filter(row => row.commute)) },
      { id: "personal-journeys", required: false, status: directory.error.value ? "error" as const : aggregate(rows.value.filter(row => !row.commute)) },
    ];
  });

  watch(() => [initialized.value, revision.value, targets.value.map(routeKey).join("|")], async (_, __, onCleanup) => {
    if (!initialized.value) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    await Promise.allSettled(targets.value.map(async row => {
      if (!row.origin || !row.destination) return;
      const key = routeKey(row);
      if (measurements.value.has(key)) return;
      const save = (value: Pick<PersonalJourneyResult, "status" | "journey">) => {
        if (!controller.signal.aborted) measurements.value = new Map(measurements.value).set(key, value);
      };
      try {
        const journeys = await options.provider.findJourneys({ origin: row.origin,
          destination: toAddressBookPoint(row.destination), datetime: options.datetime.value,
          purpose: "transport", count: 3 }, controller.signal);
        const journey = resolvedPersonalJourney(journeys);
        save(journey ? { status: "ready", journey } : { status: "unavailable" });
      } catch {
        save({ status: "error" });
      }
    }));
  }, { immediate: true });

  function save(destination: AddressBookEntry, thresholds: PersonalJourneyThresholds): void {
    if (!validPersonalJourneyThresholds(thresholds)) return;
    const aliases = directory.entries.value.filter(entry => samePersonalJourneyDestination(entry, destination)).map(entry => entry.id);
    settings.updateSettings({ verdictPersonalJourneys: [
      ...preferences.value.filter(pref => !aliases.includes(pref.destinationId)),
      { destinationId: destination.id, ...thresholds },
    ] });
  }
  function remove(row: PersonalJourneyResult): void {
    const next: PersonalJourneyPreference[] = preferences.value.filter(pref => pref.destinationId !== row.destinationId
      && !directory.entries.value.some(entry => entry.id === pref.destinationId && row.destination && samePersonalJourneyDestination(entry, row.destination)));
    if (row.commute) next.push({ destinationId: row.destinationId,
      positiveBelowMinutes: row.positiveBelowMinutes, neutralThroughMinutes: row.neutralThroughMinutes, disabled: true });
    settings.updateSettings({ verdictPersonalJourneys: next });
  }
  function retry(): void {
    directory.reloadFromStorage();
    measurements.value = new Map();
    revision.value++;
  }
  onMounted(async () => { await nextTick(); initialized.value = true; });
  onBeforeUnmount(() => { initialized.value = false; });
  return { rows, loading, hasError, datasets, save, remove, retry,
    directoryError: directory.error, settingsError: settings.storageError };
}

export type VerdictPersonalJourneys = ReturnType<typeof useVerdictPersonalJourneys>;

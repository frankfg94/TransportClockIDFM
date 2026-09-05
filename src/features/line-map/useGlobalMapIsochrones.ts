import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import {
  createGlobalIsochroneSettings,
  emptyGlobalIsochroneCoverage,
  GLOBAL_ISOCHRONE_ATTRIBUTION,
  GlobalIsochroneError,
  type GlobalIsochroneCoverage,
  type GlobalIsochroneStatus,
  type GlobalIsochroneSurface,
} from "../transport-map/isochrones/contracts";
import { createGlobalIsochroneClient, type GlobalIsochroneClient } from "../transport-map/isochrones/client";
import { globalIsochroneEligibleModes, selectGlobalIsochroneScopes, type GlobalIsochroneContext } from "../transport-map/isochrones/selection";

export interface UseGlobalMapIsochronesOptions {
  getContext: () => GlobalIsochroneContext;
  getMapDataVersion: () => string | undefined;
  getSuspended: () => boolean;
  createClient?: () => GlobalIsochroneClient;
}

const EMPTY_SURFACES: GlobalIsochroneSurface[] = [];

export function useGlobalMapIsochrones(options: UseGlobalMapIsochronesOptions) {
  const enabled = ref(false);
  const settings = ref(createGlobalIsochroneSettings());
  const panelOpen = ref(false);
  const modalOpen = ref(false);
  const status = ref<GlobalIsochroneStatus>("idle");
  const surfaces = shallowRef<GlobalIsochroneSurface[]>(EMPTY_SURFACES);
  const coverage = shallowRef<GlobalIsochroneCoverage>(emptyGlobalIsochroneCoverage());
  const attribution = ref(GLOBAL_ISOCHRONE_ATTRIBUTION);
  const eligibleModes = computed(() => globalIsochroneEligibleModes(options.getContext()));
  const requests = computed(() => selectGlobalIsochroneScopes(options.getContext(), settings.value));
  const requestKey = computed(() => JSON.stringify(requests.value));
  let client: GlobalIsochroneClient | undefined;
  let generation = 0;
  let disposed = false;
  let lastNotice = "";

  async function load(reload = false): Promise<void> {
    const token = ++generation;
    surfaces.value = EMPTY_SURFACES;
    coverage.value = emptyGlobalIsochroneCoverage();
    modalOpen.value = false;
    const version = options.getMapDataVersion();
    if (!enabled.value || options.getSuspended() || !version || !requests.value.length) {
      if (status.value === "loading") {
        client?.dispose();
        client = undefined;
      }
      if (!enabled.value) lastNotice = "";
      status.value = "idle";
      return;
    }
    status.value = "loading";
    try {
      if (reload) {
        client?.dispose();
        client = undefined;
        lastNotice = "";
      }
      client ??= (options.createClient ?? createGlobalIsochroneClient)();
      const result = await client.select(requests.value, version, reload);
      if (disposed || token !== generation) return;
      surfaces.value = result.surfaces;
      coverage.value = result.coverage;
      attribution.value = result.attribution;
      const incomplete = result.coverage.missing > 0 || result.coverage.missingScopes.length > 0;
      status.value = incomplete ? "partial" : "ready";
      if (incomplete) showNotice(`${version}|${requestKey.value}|${JSON.stringify(result.coverage)}`);
    } catch (error) {
      if (disposed || token !== generation) return;
      status.value = error instanceof GlobalIsochroneError && (error.code === "missing" || error.code === "incompatible")
        ? error.code : "error";
      showNotice(`${version}|${requestKey.value}|${status.value}`);
      client?.dispose();
      client = undefined;
    }
  }

  function showNotice(key: string): void {
    if (key === lastNotice) return;
    lastNotice = key;
    modalOpen.value = true;
  }

  watch([enabled, requestKey, () => options.getMapDataVersion(), () => enabled.value && options.getSuspended()], () => { void load(); });
  onBeforeUnmount(() => {
    disposed = true;
    generation += 1;
    client?.dispose();
  });

  return {
    enabled, settings, panelOpen, modalOpen, status, surfaces, coverage, eligibleModes, attribution,
    retry: () => load(true),
    closeModal: () => {
      modalOpen.value = false;
      if (status.value !== "partial") enabled.value = false;
    },
  };
}

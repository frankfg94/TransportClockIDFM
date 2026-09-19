import { computed, onBeforeUnmount, ref, shallowRef, type Ref } from "vue";
import { createTravelTurboProvider } from "../../services/travelRoutes/travelTurboProvider";
import { sameTurboJourney, turboSignature, turboTime, type TravelTurboProvider, type TurboResult, type TurboStrategy, type TurboStatus } from "./travelTurbo";
import type { TravelRoute } from "./useTravelRoutes";

export function useTravelTurbo(options: {
  routes: Ref<TravelRoute[]>;
  departureDateTime: Ref<string>;
  provider?: TravelTurboProvider;
  now?: () => number;
}) {
  const provider = options.provider ?? createTravelTurboProvider();
  const now = options.now ?? Date.now;
  const result = shallowRef<TurboResult>();
  const status = ref<TurboStatus>();
  const strategy = ref<TurboStrategy>("fastest");
  const analyzing = ref(false);
  const focused = shallowRef<TravelRoute>();
  let anchor: TravelRoute | undefined;
  let generation = 0;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let visible = false;
  const mergedRoutes = computed(() => {
    if (!result.value) return options.routes.value;
    const combined = new Map(options.routes.value.map((r) => [r.id, r]));
    if (focused.value && !combined.has(focused.value.id)) combined.set(focused.value.id, focused.value);
    for (const route of result.value.proposals) combined.set(route.id, route);
    return [...combined.values()].sort((a, b) => (turboTime(a.departureDateTime) ?? Infinity) - (turboTime(b.departureDateTime) ?? Infinity));
  });
  const winnerId = computed(() => result.value?.winners[strategy.value]);
  const alreadyOptimal = computed(() => status.value === "ready" && result.value?.currentOptimal[strategy.value] === true);

  function stop() {
    generation++;
    controller?.abort();
    clearTimeout(timer);
    analyzing.value = false;
  }
  async function analyze() {
    if (!anchor || !visible) return;
    stop();
    const token = generation;
    const requestRoute = anchor;
    controller = new AbortController();
    const signal = controller.signal;
    analyzing.value = true;
    status.value = "loading";
    try {
      const next = await provider.analyze({ route: requestRoute, start: Math.max(now(), turboTime(options.departureDateTime.value) ?? now()), signal });
      if (token !== generation || signal.aborted) return;
      const replacements = new Map<string, string>();
      next.proposals = next.proposals.map((proposal) => {
        const existing = options.routes.value.find((r) => sameTurboJourney(r, proposal));
        if (!existing) return proposal;
        replacements.set(proposal.id, existing.id);
        return { ...proposal, id: existing.id };
      });
      for (const s of ["fastest", "smooth"] as const) {
        const id = next.winners[s];
        if (id && replacements.has(id)) next.winners[s] = replacements.get(id);
      }
      result.value = next;
      status.value = next.status;
    } catch {
      if (token !== generation || signal.aborted) return;
      status.value = "error";
    } finally {
      if (token === generation) {
        analyzing.value = false;
        if (visible) timer = setTimeout(() => void analyze(), 30_000);
      }
    }
  }
  function open(route: TravelRoute) {
    focused.value = route;
    if (visible && anchor && turboSignature(anchor) === turboSignature(route)) return;
    const same = anchor && turboSignature(anchor) === turboSignature(route);
    anchor = same ? anchor : route;
    if (!same) result.value = undefined;
    visible = true;
    void analyze();
  }
  function close() {
    visible = false;
    stop();
  }
  function reset() {
    close(); anchor = undefined; focused.value = undefined; result.value = undefined; status.value = undefined;
  }
  const onVisibility = () => {
    if (document.hidden) stop();
    else if (visible) void analyze();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  onBeforeUnmount(() => {
    reset();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  });
  return { result, status, strategy, analyzing, mergedRoutes, winnerId, alreadyOptimal, open, close, reset };
}
export type TravelTurboController = ReturnType<typeof useTravelTurbo>;

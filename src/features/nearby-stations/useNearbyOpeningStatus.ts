import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { nearbyOpeningStatusLookup } from "./nearbyOpeningHours";

/** Keep the status current across minute boundaries and when returning to a tab. */
export function useNearbyOpeningStatus() {
  const now = ref(Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  function refresh(): void {
    if (timer !== undefined) clearTimeout(timer);
    now.value = Date.now();
    timer = setTimeout(refresh, 60_000 - now.value % 60_000 + 20);
  }
  function handleVisibility(): void {
    if (document.visibilityState === "visible") refresh();
  }
  onMounted(() => {
    refresh();
    document.addEventListener("visibilitychange", handleVisibility);
  });
  onBeforeUnmount(() => {
    if (timer !== undefined) clearTimeout(timer);
    document.removeEventListener("visibilitychange", handleVisibility);
  });
  return computed(() => nearbyOpeningStatusLookup(new Date(now.value)));
}

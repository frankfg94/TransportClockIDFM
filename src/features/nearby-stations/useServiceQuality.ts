import { onMounted, readonly, ref, shallowRef } from "vue";
import { fetchServiceQuality, type PublicServiceQuality } from "./serviceQualityApi";

let cached: PublicServiceQuality | undefined;
let pending: Promise<PublicServiceQuality> | undefined;

export function useServiceQuality() {
  const data = shallowRef<PublicServiceQuality | undefined>(cached);
  const isLoading = ref(!cached);
  const error = ref<Error>();
  function load(force = false): Promise<void> {
    if (!force && data.value) return Promise.resolve();
    isLoading.value = true;
    error.value = undefined;
    pending ??= fetchServiceQuality().finally(() => {
      pending = undefined;
    });
    return pending
      .then((next) => {
        cached = next;
        data.value = next;
      })
      .catch((cause) => {
        if (cause instanceof Error && cause.name === "AbortError") return;
        error.value = cause instanceof Error ? cause : new Error("service-quality-unavailable");
      })
      .finally(() => {
        isLoading.value = false;
      });
  }

  onMounted(() => {
    void load();
  });

  return {
    data: readonly(data),
    isLoading: readonly(isLoading),
    error: readonly(error),
    retry: () => load(true),
  };
}

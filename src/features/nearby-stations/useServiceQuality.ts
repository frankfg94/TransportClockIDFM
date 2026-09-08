import { onMounted, readonly, ref, shallowRef } from "vue";
import { fetchServiceQuality, type PublicServiceQuality } from "./serviceQualityApi";

let cached: PublicServiceQuality | undefined;
let pending: Promise<PublicServiceQuality> | undefined;

export function useServiceQuality() {
  const data = shallowRef<PublicServiceQuality | undefined>(cached);
  const isLoading = ref(!cached);
  const error = ref<Error>();
  onMounted(() => {
    if (data.value) return;
    isLoading.value = true;
    pending ??= fetchServiceQuality().finally(() => {
      pending = undefined;
    });
    void pending
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
  });

  return {
    data: readonly(data),
    isLoading: readonly(isLoading),
    error: readonly(error),
  };
}

import { ref, type Ref } from "vue";

const stateStore = new Map<string, Ref<unknown>>();

export function useState<T>(key: string, init: () => T): Ref<T> {
  if (!stateStore.has(key)) {
    stateStore.set(key, ref(init()));
  }

  return stateStore.get(key) as Ref<T>;
}

export function useRoute(): { path: string; query: Record<string, unknown>; params: Record<string, unknown> } {
  return {
    path: "/",
    query: {},
    params: {},
  };
}

export function useFetch<T>(): {
  data: Ref<T | null>;
  pending: Ref<boolean>;
  error: Ref<unknown>;
} {
  return {
    data: ref(null),
    pending: ref(false),
    error: ref(null),
  };
}

export function navigateTo(): Promise<void> {
  return Promise.resolve();
}

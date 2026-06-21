/// <reference types="vite/client" />
/// <reference types="nuxt" />

declare const __IDFM_API_KEY_CONFIGURED__: boolean;
declare const __SERVER_API_BASE_URL__: string;

declare module "#imports" {
  import type { Ref } from "vue";

  export function useState<T>(key: string, init: () => T): Ref<T>;

  export function useRoute(): {
    path: string;
    query: Record<string, unknown>;
    params: Record<string, string | string[]>;
  };

  export function useFetch<T>(url: string): {
    data: Ref<T | null>;
    pending: Ref<boolean>;
    error: Ref<unknown>;
  };

  export function navigateTo(
    to: string | { path?: string; query?: Record<string, unknown> },
  ): Promise<void> | void;
}

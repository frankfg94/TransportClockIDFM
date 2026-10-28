import { onBeforeUnmount, onMounted, ref } from "vue";

export interface CustomOptimizer { id: string; name: string; origin: string; destination: string }
const KEY = "transport-clock-custom-optimizers-v1";
const CHANGED = "transport-clock-custom-optimizers-changed";

export function readCustomOptimizers(): CustomOptimizer[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is CustomOptimizer =>
      !!item && typeof item.id === "string" && typeof item.name === "string" &&
      typeof item.origin === "string" && typeof item.destination === "string") : [];
  } catch { return []; }
}
function save(items: CustomOptimizer[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CHANGED));
}
export function createCustomOptimizer(name: string, origin: string, destination: string): CustomOptimizer {
  const item = { id: crypto.randomUUID(), name: name.trim(), origin: origin.trim(), destination: destination.trim() };
  if (!item.name || !item.origin || !item.destination) throw new Error("invalid optimizer");
  save([...readCustomOptimizers(), item]);
  return item;
}
export function deleteCustomOptimizer(id: string) { save(readCustomOptimizers().filter((item) => item.id !== id)); }
export function useCustomOptimizers() {
  const items = ref<CustomOptimizer[]>([]);
  const sync = () => { items.value = readCustomOptimizers(); };
  onMounted(() => { sync(); window.addEventListener(CHANGED, sync); window.addEventListener("storage", sync); });
  onBeforeUnmount(() => { window.removeEventListener(CHANGED, sync); window.removeEventListener("storage", sync); });
  return items;
}

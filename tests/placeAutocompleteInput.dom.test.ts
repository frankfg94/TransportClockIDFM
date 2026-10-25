import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import PlaceAutocompleteInput from "../src/features/transport-map/search/PlaceAutocompleteInput.vue";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../src/features/transport-map/config/globalTransportPlanConfig";

afterEach(() => vi.useRealTimers());
it("debounces input and selects the precise point with the keyboard", async () => {
  vi.useFakeTimers();
  const point = { id: "place:1", label: "Paris", lon: 2.35, lat: 48.86 };
  const search = vi.fn().mockResolvedValue([point]);
  const select = vi.fn();
  const wrapper = mount(defineComponent({
    components: { PlaceAutocompleteInput },
    setup() { return { query: ref(""), search, select }; },
    template: '<PlaceAutocompleteInput id="test-place" v-model="query" :search="search" @select="select" />',
  }));
  const input = wrapper.get("input");
  await input.setValue("Paris");
  expect(search).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(GLOBAL_TRANSPORT_PLAN_CONFIG.search.debounceMs);
  await flushPromises();
  expect(wrapper.findAll('[role="option"]')).toHaveLength(1);
  await input.trigger("keydown", { key: "ArrowDown" });
  await input.trigger("keydown", { key: "Enter" });
  expect(select).toHaveBeenCalledWith(point);
  expect((input.element as HTMLInputElement).value).toBe("Paris");
  expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
  wrapper.unmount();
});

it.each([
  { key: "ArrowUp", selected: 2 },
  { key: "ArrowDown", selected: 0 },
])("starts at the correct result with $key and selects its coordinates", async ({ key, selected }) => {
  vi.useFakeTimers();
  const points = ["Paris", "Paris Gare de Lyon", "Paris Montparnasse"].map((label, index) => ({
    id: `place:${index}`, label, lon: 2.35 + index / 100, lat: 48.86,
  }));
  const select = vi.fn();
  const wrapper = mount(defineComponent({
    components: { PlaceAutocompleteInput },
    setup: () => ({ query: ref(""), search: vi.fn().mockResolvedValue(points), select }),
    template: '<PlaceAutocompleteInput id="keyboard-place" v-model="query" :search="search" @select="select" />',
  }));
  try {
    const input = wrapper.get("input");
    await input.setValue("Paris");
    await vi.advanceTimersByTimeAsync(GLOBAL_TRANSPORT_PLAN_CONFIG.search.debounceMs);
    await flushPromises();
    await input.trigger("keydown", { key });
    expect(wrapper.get('[aria-selected="true"]').text()).toContain(points[selected]!.label);
    await input.trigger("keydown", { key: "Enter" });
    expect(select).toHaveBeenCalledExactlyOnceWith(points[selected]);
  } finally {
    wrapper.unmount();
  }
});

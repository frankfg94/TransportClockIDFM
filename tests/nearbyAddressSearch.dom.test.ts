import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import NearbyAddressSearch from "../src/features/nearby-stations/NearbyAddressSearch.vue";

const points = [
  { id: "place-1", label: "Châtelet-les-Halles", type: "place", lon: 2.347, lat: 48.862 },
  { id: "address-1", label: "9 rue Chateaubriand, 92320", type: "address", lon: 2.28, lat: 48.81 },
] as const;
const attachedWrappers: VueWrapper[] = [];

afterEach(() => {
  attachedWrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.useRealTimers();
});

async function focusedSuggestions() {
  vi.useFakeTimers();
  const search = vi.fn().mockResolvedValue(points);
  const wrapper = mount(NearbyAddressSearch, { attachTo: document.body, props: { search, autocompletePlaces: true } });
  attachedWrappers.push(wrapper);
  const input = wrapper.get("input");
  input.element.focus();
  await input.setValue("chatelet");
  await vi.advanceTimersByTimeAsync(220);
  await flushPromises();
  return { wrapper, input, search };
}

describe("NearbyAddressSearch place autocomplete", () => {
  it("cancels a suggestion click's default label activation while emitting once", async () => {
    const { wrapper, input } = await focusedSuggestions();
    const button = wrapper.findAll<HTMLButtonElement>(".nearby-address-search__suggestions button")[1]!;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    button.element.dispatchEvent(click);
    await flushPromises();
    expect(click.defaultPrevented).toBe(true);
    expect(wrapper.emitted("update:modelValue")).toEqual([[points[1]]]);
    expect(input.element.value).toBe(points[1].label);
  });

  it("does not reopen suggestions when an old request resolves after selection", async () => {
    vi.useFakeTimers();
    let resolve!: (value: typeof points) => void;
    const search = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
    const saved = { ...points[0], provider: "address-book" as const };
    const wrapper = mount(NearbyAddressSearch, {
      attachTo: document.body,
      props: { search, autocompletePlaces: true, savedSuggestions: [saved] },
    });
    attachedWrappers.push(wrapper);
    wrapper.get("input").element.focus();
    await wrapper.get("input").setValue("chatelet");
    await vi.advanceTimersByTimeAsync(220);
    const signal = search.mock.calls[0]![1] as AbortSignal;
    await wrapper.get(".nearby-address-search__suggestions button").trigger("click");
    expect(signal.aborted).toBe(true);
    resolve(points); // A provider may still resolve after cancellation.
    await flushPromises();
    expect(wrapper.find(".nearby-address-search__suggestions").exists()).toBe(false);
    expect(wrapper.emitted("update:modelValue")).toEqual([[saved]]);
  });

  it("cancels pending suggestions after external blur and ignores a late response", async () => {
    vi.useFakeTimers();
    let resolve!: (value: typeof points) => void;
    const search = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
    const wrapper = mount(NearbyAddressSearch, { attachTo: document.body, props: { search, autocompletePlaces: true } });
    attachedWrappers.push(wrapper);
    wrapper.get("input").element.focus();
    await wrapper.get("input").setValue("chatelet");
    await vi.advanceTimersByTimeAsync(220);
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      outside.focus();
      await vi.advanceTimersByTimeAsync(150);
      expect((search.mock.calls[0]![1] as AbortSignal).aborted).toBe(true);
      resolve(points);
      await flushPromises();
      expect(wrapper.find(".nearby-address-search__suggestions").exists()).toBe(false);
      expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    } finally {
      outside.remove();
    }
  });

  it("keeps input focus through pointer down and selects exactly once at click", async () => {
    const { wrapper, input } = await focusedSuggestions();
    const button = wrapper.findAll<HTMLButtonElement>(".nearby-address-search__suggestions button")[1]!;
    const down = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch" });
    button.element.dispatchEvent(down);
    // Model the browser's default focus transfer unless the component cancels it.
    if (!down.defaultPrevented) button.element.focus();
    await vi.advanceTimersByTimeAsync(150);
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input.element);
    expect(wrapper.findAll(".nearby-address-search__suggestions button")).toHaveLength(2);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    await button.trigger("pointerup", { pointerType: "touch" });
    await button.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[points[1]]]);
    expect(input.element.value).toBe(points[1].label);
  });

  it("does not choose a suggestion for a scrolling or cancelled pointer gesture", async () => {
    const { wrapper, input } = await focusedSuggestions();
    const button = wrapper.findAll<HTMLButtonElement>(".nearby-address-search__suggestions button")[0]!;
    await button.trigger("pointerdown", { pointerType: "touch" });
    await button.trigger("pointermove", { pointerType: "touch", clientY: 80 });
    await button.trigger("pointercancel", { pointerType: "touch" });
    await vi.advanceTimersByTimeAsync(150);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(input.element.value).toBe("chatelet");
    expect(wrapper.findAll(".nearby-address-search__suggestions button")).toHaveLength(2);
  });

  it("keeps suggestions during keyboard focus movement and clears them after focus leaves", async () => {
    const { wrapper } = await focusedSuggestions();
    const buttons = wrapper.findAll<HTMLButtonElement>(".nearby-address-search__suggestions button");
    buttons[0]!.element.focus();
    await vi.advanceTimersByTimeAsync(150);
    expect(wrapper.findAll(".nearby-address-search__suggestions button")).toHaveLength(2);
    buttons[1]!.element.focus();
    await vi.advanceTimersByTimeAsync(150);
    expect(wrapper.findAll(".nearby-address-search__suggestions button")).toHaveLength(2);
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      outside.focus();
      await vi.advanceTimersByTimeAsync(150);
      expect(wrapper.find(".nearby-address-search__suggestions").exists()).toBe(false);
      expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    } finally {
      outside.remove();
    }
  });

  it("moves Tab from the input into loaded suggestions without selecting", async () => {
    const { wrapper, input } = await focusedSuggestions();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    input.element.dispatchEvent(tab);
    await vi.advanceTimersByTimeAsync(150);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(wrapper.get(".nearby-address-search__suggestions button").element);
    expect(wrapper.findAll(".nearby-address-search__suggestions button")).toHaveLength(2);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();

    const backwards = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    input.element.dispatchEvent(backwards);
    expect(backwards.defaultPrevented).toBe(false);
  });

  it("retains suggestions for a repeated composition-end input while keyboard focus leaves the field", async () => {
    const { wrapper, input } = await focusedSuggestions();
    const button = wrapper.findAll<HTMLButtonElement>(".nearby-address-search__suggestions button")[0]!;
    // Android WebView dispatches an unchanged input when composition ends on blur.
    await input.trigger("input");
    button.element.focus();
    await vi.advanceTimersByTimeAsync(150);
    expect(button.element.isConnected).toBe(true);
    expect(document.activeElement).toBe(button.element);
    expect(wrapper.findAll(".nearby-address-search__suggestions button")).toHaveLength(2);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    await button.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[points[0]]]);
  });

  it("preserves single Enter submission and keyboard button activation", async () => {
    const { wrapper } = await focusedSuggestions();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")).toEqual([[points[0]]]);

    const second = await focusedSuggestions();
    const button = second.wrapper.findAll<HTMLButtonElement>(".nearby-address-search__suggestions button")[1]!;
    button.element.focus();
    await vi.advanceTimersByTimeAsync(150);
    // Native Enter/Space activate a button through click, never through form submit.
    expect(button.element.isConnected).toBe(true);
    await button.trigger("click");
    expect(second.wrapper.emitted("update:modelValue")).toEqual([[points[1]]]);
  });

  it("humanizes a coordinate-only origin without changing its exact point", async () => {
    const point = {
      id: "device-origin",
      label: "48.75773, 2.36411",
      provider: "device",
      type: "address" as const,
      lon: 2.36411,
      lat: 48.75773,
    };
    const reverseGeocode = vi.fn().mockResolvedValue([{
      ...point,
      id: "ign-address",
      label: "277 avenue de la Division Leclerc, 92290 Châtenay-Malabry",
      provider: "ign-geoplateforme",
    }]);
    const wrapper = mount(NearbyAddressSearch, {
      props: { modelValue: point, humanizeCoordinates: true, reverseGeocode },
    });

    await flushPromises();

    expect(reverseGeocode).toHaveBeenCalledWith(
      { lon: point.lon, lat: point.lat },
      expect.any(AbortSignal),
    );
    expect(wrapper.get("input").element.value).toBe("277 avenue de la Division Leclerc, 92290 Châtenay-Malabry");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("can hide place suggestions when autocompletePlaces is false", async () => {
    vi.useFakeTimers();
    const search = vi.fn().mockResolvedValue(points);
    const wrapper = mount(NearbyAddressSearch, {
      props: { search, autocompletePlaces: false },
    });

    await wrapper.get("input").setValue("chatelet");
    await vi.advanceTimersByTimeAsync(220);
    await flushPromises();

    expect(search).toHaveBeenCalledWith("chatelet", expect.any(AbortSignal));
    expect(wrapper.findAll(".nearby-address-search__suggestions li")).toHaveLength(1);
    expect(wrapper.text()).toContain("9 rue Chateaubriand");
    expect(wrapper.text()).not.toContain("Châtelet-les-Halles");
  });

  it("keeps place suggestions when autocompletePlaces is enabled", async () => {
    vi.useFakeTimers();
    const search = vi.fn().mockResolvedValue(points);
    const wrapper = mount(NearbyAddressSearch, {
      props: { search, autocompletePlaces: true },
    });

    await wrapper.get("input").setValue("chatelet");
    await vi.advanceTimersByTimeAsync(220);
    await flushPromises();

    expect(wrapper.findAll(".nearby-address-search__suggestions li")).toHaveLength(2);
    expect(wrapper.text()).toContain("Châtelet-les-Halles");
  });
});

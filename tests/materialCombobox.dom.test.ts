import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import MaterialCombobox from "../src/components/MaterialCombobox.vue";

const options = [{ id: "off", label: "Disabled", disabled: true }, { id: "a", label: "Alpha" }, { id: "e", label: "École" }, { id: "z", label: "Zulu" }];
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); });
function setup(props = {}) {
  const wrapper = mount(MaterialCombobox, { attachTo: document.body, props: { options, ariaLabel: "Selection", ...props } });
  wrappers.push(wrapper);
  return wrapper;
}
describe("MaterialCombobox interaction contract", () => {
  it("links unique list and active option ids, skips disabled choices, and keeps trigger focus", async () => {
    const wrapper = setup({ id: "choice", teleport: true });
    const trigger = wrapper.get<HTMLButtonElement>("[role=combobox]");
    trigger.element.focus();
    await trigger.trigger("keydown", { key: "Enter" });
    const listId = trigger.attributes("aria-controls");
    expect(document.getElementById(listId!)).not.toBeNull();
    expect(document.getElementById(trigger.attributes("aria-activedescendant")!)?.textContent).toContain("Alpha");
    await trigger.trigger("keydown", { key: "ArrowDown" });
    await trigger.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("update:modelValue")).toEqual([["e"]]);
    expect(document.activeElement).toBe(trigger.element);
    expect(trigger.attributes("aria-expanded")).toBe("false");
    const pair = mount({ components: { MaterialCombobox }, setup: () => ({ options }), template: '<MaterialCombobox :options="options" /><MaterialCombobox :options="options" />' });
    wrappers.push(pair);
    for (const control of pair.findAll("[role=combobox]")) await control.trigger("click");
    const ids = pair.findAll("[role=listbox]").map(list => list.attributes("id"));
    expect(new Set(ids).size).toBe(2);
  });
  it("supports accent-insensitive typing, Home/End, Escape and Tab without selecting", async () => {
    const wrapper = setup();
    const trigger = wrapper.get("[role=combobox]");
    await trigger.trigger("keydown", { key: "e" });
    expect(wrapper.get('[data-combobox-active=true]').text()).toBe("École");
    await trigger.trigger("keydown", { key: "End" });
    expect(wrapper.get('[data-combobox-active=true]').text()).toBe("Zulu");
    await trigger.trigger("keydown", { key: "Home" });
    expect(wrapper.get('[data-combobox-active=true]').text()).toBe("Alpha");
    await trigger.trigger("keydown", { key: "Escape" });
    expect(trigger.attributes("aria-expanded")).toBe("false");
    await trigger.trigger("click");
    await trigger.trigger("keydown", { key: "Tab" });
    expect(wrapper.find("[role=listbox]").exists()).toBe(false);
    expect(wrapper.emitted("change")).toBeUndefined();
  });
  it("selects on touch-compatible click once and ignores disabled options", async () => {
    const wrapper = setup();
    await wrapper.get("[role=combobox]").trigger("click");
    await wrapper.findAll("[role=option]")[0].trigger("click");
    expect(wrapper.emitted("change")).toBeUndefined();
    const option = wrapper.findAll("[role=option]")[2];
    await option.trigger("pointerdown", { pointerType: "touch" });
    await option.trigger("click");
    expect(wrapper.emitted("change")).toEqual([["e"]]);
  });
  it("keeps empty/all-disabled controls closed and closes when disabled while open", async () => {
    for (const entries of [[], [options[0]]]) {
      const wrapper = setup({ options: entries });
      await wrapper.get("[role=combobox]").trigger("click");
      await wrapper.get("[role=combobox]").trigger("keydown", { key: "Enter" });
      expect(wrapper.find("[role=listbox]").exists()).toBe(false);
    }
    const wrapper = setup();
    await wrapper.get("[role=combobox]").trigger("click");
    await wrapper.setProps({ disabled: true });
    expect(wrapper.find("[role=listbox]").exists()).toBe(false);
  });
  it("positions teleported options above the hosting modal", async () => {
    const host = document.createElement("div");
    host.style.zIndex = "12050";
    document.body.append(host);
    const wrapper = mount(MaterialCombobox, { attachTo: host, props: { options, teleport: true } });
    wrappers.push(wrapper);
    await wrapper.get("[role=combobox]").trigger("click");
    await wrapper.vm.$nextTick();
    const menu = document.getElementById(wrapper.get("[role=combobox]").attributes("aria-controls")!)!;
    expect(menu.style.zIndex).toBe("12051");
    wrapper.unmount();
    wrappers.pop();
    host.remove();
  });
  it("keeps teleported options inside a native dialog top layer", async () => {
    const dialog = document.createElement("dialog");
    document.body.append(dialog);
    const wrapper = mount(MaterialCombobox, { attachTo: dialog, props: { options, teleport: true } });
    wrappers.push(wrapper);
    await wrapper.get("[role=combobox]").trigger("click");
    await wrapper.vm.$nextTick();
    const menu = dialog.querySelector("[role=listbox]");
    expect(menu?.closest("dialog")).toBe(dialog);
    expect(wrapper.element.contains(menu)).toBe(false);
    wrapper.unmount();
    wrappers.pop();
    dialog.remove();
  });
});

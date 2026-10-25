import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { defineAsyncComponent, defineComponent, nextTick, ref, type Component } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AppModal from "../src/components/AppModal.vue";
import MaterialCombobox from "../src/components/MaterialCombobox.vue";
import WeatherForecastModal from "../src/features/weather/WeatherForecastModal.vue";
import DeparturePatternModal from "../src/features/service-pattern/DeparturePatternModal.vue";

// Keep these component contracts independent of the Nuxt page/runtime exports.
vi.mock("../src/features/app-settings", async () => import("../src/features/app-settings/appSettings"));

const wrappers: VueWrapper[] = [];
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});

describe("native Back dispatch contract", () => {
  function runNativeBack(): boolean {
    // Exercise the exact payload shipped by Android, rather than a test copy.
    const java = readFileSync(resolve(process.cwd(), "android/app/src/main/java/fr/vibeidfm/transportclock/MainActivity.java"), "utf8");
    const payload = java.split(".evaluateJavascript(")[1]!.split("handled ->")[0]!;
    const script = [...payload.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(match => JSON.parse(match[0]) as string).join("");
    return new Function(`return ${script}`)() as boolean;
  }
  function visiblePanel(tag = "aside") {
    const panel = document.createElement(tag);
    panel.tabIndex = -1;
    panel.setAttribute("aria-label", "Test panel");
    document.body.append(panel);
    const rect = new DOMRect(0, 100, 390, 500);
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue(rect);
    vi.spyOn(panel, "getClientRects").mockReturnValue({ 0: rect, length: 1, item: () => rect, [Symbol.iterator]: function* () { yield rect; } } as DOMRectList);
    return panel;
  }
  function consumeEscape(element: HTMLElement) {
    const closed = vi.fn();
    element.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); closed(); }
    });
    return closed;
  }

  it("offers Back to the visible non-modal panel after a selected result loses focus on removal", () => {
    const panel = visiblePanel();
    const trigger = document.createElement("button");
    panel.append(trigger); trigger.focus(); trigger.remove();
    expect(document.activeElement).toBe(document.body);
    const closed = consumeEscape(panel);
    expect(runNativeBack()).toBe(true);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("lets the active control consume Escape before a non-modal panel", () => {
    const panel = visiblePanel();
    const closed = consumeEscape(panel);
    const input = document.createElement("input"); document.body.append(input); input.focus();
    const consumed = consumeEscape(input);
    expect(runNativeBack()).toBe(true);
    expect(consumed).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();
  });

  it("delegates to Capacitor when no web control or panel consumes Back", () => {
    visiblePanel();
    expect(runNativeBack()).toBe(false);
  });

  it("does not offer Back to an inert or hidden non-modal panel", () => {
    const panel = visiblePanel(); panel.setAttribute("inert", "");
    const closed = consumeEscape(panel);
    expect(runNativeBack()).toBe(false);
    expect(closed).not.toHaveBeenCalled();
  });

  it("keeps an upper modal ahead of a non-modal panel", () => {
    const panel = visiblePanel(); const panelClosed = consumeEscape(panel);
    const modal = visiblePanel("section"); modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
    const modalClosed = consumeEscape(modal);
    panel.focus();
    expect(runNativeBack()).toBe(true);
    expect(modalClosed).toHaveBeenCalledTimes(1);
    expect(panelClosed).not.toHaveBeenCalled();
  });

  it("exits HTML fullscreen without closing a non-modal panel outside it", () => {
    const panel = visiblePanel(); const closed = consumeEscape(panel);
    const fullscreen = document.createElement("div"); document.body.append(fullscreen);
    const previousElement = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    const previousExit = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
    const exit = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: fullscreen });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
    try {
      expect(runNativeBack()).toBe(true);
      expect(exit).toHaveBeenCalledTimes(1);
      expect(closed).not.toHaveBeenCalled();
    } finally {
      if (previousElement) Object.defineProperty(document, "fullscreenElement", previousElement);
      else Reflect.deleteProperty(document, "fullscreenElement");
      if (previousExit) Object.defineProperty(document, "exitFullscreen", previousExit);
      else Reflect.deleteProperty(document, "exitFullscreen");
    }
  });

  it("respects native HTML dialog cancellation before touching a non-modal panel", () => {
    const panel = visiblePanel(); const panelClosed = consumeEscape(panel);
    const dialog = visiblePanel("dialog") as HTMLDialogElement;
    dialog.open = true;
    const close = vi.spyOn(dialog, "close");
    dialog.addEventListener("cancel", event => event.preventDefault());
    expect(runNativeBack()).toBe(true);
    expect(close).not.toHaveBeenCalled();
    expect(panelClosed).not.toHaveBeenCalled();
  });
});
afterEach(() => {
  wrappers.splice(0).reverse().forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = "";
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const settle = async () => { await nextTick(); await nextTick(); };
function escape(target: Element) {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}
function mountDialog(Subject: Component, extra: Record<string, unknown> = {}) {
  const closes = vi.fn();
  const host = mount(defineComponent({
    components: { Subject },
    setup() {
      const open = ref(false);
      return { open, extra, close: () => { closes(); open.value = false; } };
    },
    template: `<div><button data-opener @click="open = true">Open</button><Subject v-bind="extra" :open="open" @close="close"><button>Last control</button></Subject></div>`,
  }), { attachTo: document.body, global: { stubs: { VueFlow: true, Handle: true, Controls: true } } });
  wrappers.push(host);
  return { host, closes };
}

describe("modal Back/Escape and focus boundary", () => {
  for (const [name, Subject, extra] of [
    ["shared modal", AppModal, { title: "Test dialog" }],
    ["weather", WeatherForecastModal, {}],
    ["departure service", DeparturePatternModal, { loading: true }],
  ] as const) {
    it(`${name} focuses when its first async mount starts open`, async () => {
      const opener = document.createElement("button");
      document.body.append(opener); opener.focus();
      const SubjectAsync = defineAsyncComponent(async () => Subject);
      const host = mount(defineComponent({
        components: { SubjectAsync },
        setup: () => ({ extra }),
        template: `<SubjectAsync v-bind="extra" :open="true" />`,
      }), { attachTo: document.body, global: { stubs: { VueFlow: true, Handle: true, Controls: true } } });
      wrappers.push(host);
      await flushPromises(); await settle();
      expect(document.activeElement).toBe(document.querySelector("[role=dialog]"));
    });

    it(`${name} focuses on open and consumes one Escape before native history fallback`, async () => {
      const { host, closes } = mountDialog(Subject, extra);
      const opener = host.get<HTMLButtonElement>("[data-opener]").element;
      opener.focus();
      await host.get("[data-opener]").trigger("click");
      await settle();
      const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
      expect(document.activeElement).toBe(dialog);
      const restoreFocus = vi.spyOn(opener, "focus");
      const fallback = vi.fn();
      const event = escape(dialog);
      if (!event.defaultPrevented) fallback();
      await settle();
      expect(closes).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();
      expect(document.querySelector("[role=dialog]")).toBeNull();
      expect(document.activeElement).toBe(opener);
      expect(restoreFocus).toHaveBeenCalledWith({ preventScroll: true });
      await host.get("[data-opener]").trigger("click");
      await settle();
      expect(document.activeElement).toBe(document.querySelector("[role=dialog]"));
    });
  }

  it("does not steal focus or close the page for an embedded line diagram", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const wrapper = mount(DeparturePatternModal, { attachTo: document.body, props: { open: true, embedded: true, loading: true }, global: { stubs: { VueFlow: true, Handle: true, Controls: true } } });
    wrappers.push(wrapper);
    await settle();
    expect(document.activeElement).toBe(opener);
    const event = escape(wrapper.get("[role=dialog]").element);
    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("closes only the upper nested dialog and restores its trigger without leaking the parent's scroll lock", async () => {
    document.body.style.overflow = "hidden";
    const host = mount(defineComponent({
      components: { AppModal },
      setup() { return { outer: ref(false), inner: ref(false), outerClose: vi.fn(), innerClose: vi.fn() }; },
      template: `<div><button data-opener @click="outer = true">Open</button><AppModal :open="outer" title="Outer" @close="outerClose(); outer = false"><button data-inner @click="inner = true">Inner</button><AppModal :open="inner" title="Upper" teleport-disabled @close="innerClose(); inner = false"><button>Upper action</button></AppModal></AppModal></div>`,
    }), { attachTo: document.body });
    wrappers.push(host);
    const opener = host.get<HTMLButtonElement>("[data-opener]").element;
    opener.focus(); opener.click(); await settle();
    const trigger = document.querySelector<HTMLButtonElement>("[data-inner]")!;
    trigger.focus(); trigger.click(); await settle();
    const upper = document.querySelector<HTMLElement>('[aria-label="Upper"]')!;
    expect(document.activeElement).toBe(upper);
    escape(upper); await settle();
    expect(host.vm.innerClose).toHaveBeenCalledTimes(1);
    expect(host.vm.outerClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("hidden");
    escape(trigger); await settle();
    expect(host.vm.outerClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("lets the combobox consume Escape before the dialog, while preserving selection and focus", async () => {
    const closed = vi.fn();
    const host = mount(defineComponent({
      components: { AppModal, MaterialCombobox },
      setup() { return { open: ref(true), selected: ref("a"), options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }], closed }; },
      template: `<AppModal :open="open" title="Choice" @close="closed(); open = false"><MaterialCombobox v-model="selected" :options="options" aria-label="Select" teleport /></AppModal>`,
    }), { attachTo: document.body });
    wrappers.push(host); await settle();
    const trigger = document.querySelector<HTMLButtonElement>("[role=combobox]")!;
    trigger.focus(); trigger.click(); await settle();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const first = escape(trigger); await settle();
    expect(first.defaultPrevented).toBe(true);
    expect(closed).not.toHaveBeenCalled();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(host.vm.selected).toBe("a");
    expect(document.activeElement).toBe(trigger);
    const second = escape(trigger); await settle();
    expect(second.defaultPrevented).toBe(true);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("keeps a late weather response from reopening a closed dialog or taking focus", async () => {
    let complete!: (response: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { complete = resolve; })));
    const { host, closes } = mountDialog(WeatherForecastModal);
    const opener = host.get<HTMLButtonElement>("[data-opener]").element;
    opener.focus(); opener.click(); await settle();
    escape(document.querySelector("[role=dialog]")!); await settle();
    complete({ ok: true, json: async () => ({}) }); await flushPromises();
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(closes).toHaveBeenCalledTimes(1);
  });

  it("keeps Shift+Tab inside the dialog from its initially focused container", async () => {
    const { host } = mountDialog(AppModal, { title: "Tab boundary" });
    host.get<HTMLButtonElement>("[data-opener]").element.click(); await settle();
    const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
    const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    dialog.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.textContent).toBe("Last control");
    dialog.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    dialog.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector("button"));
  });

  for (const embedded of [false, true]) {
    it(`exits the inner flow fullscreen before closing or navigating its ${embedded ? "embedded" : "modal"} host`, async () => {
      const wrapper = mount(DeparturePatternModal, {
        attachTo: document.body,
        props: {
          open: true, embedded, showMiniMap: false,
          board: { id: "focus-board", title: "Origin", city: "Test", line: { ref: "line:focus", shortName: "F", longName: "Focus", mode: "tram", color: "#123456", textColor: "#ffffff" }, monitoringPoints: [], directionGroups: [], maxDepartures: 4 },
          pattern: { departureId: "focus-departure", destination: "Terminus", serviceType: "omnibus", calls: [{ id: "a", label: "Origin", current: true, served: true }, { id: "b", label: "Terminus", current: false, served: true }] },
        },
        global: { stubs: { VueFlow: true, Handle: true, Controls: true } },
      });
      wrappers.push(wrapper); await settle();
      const shell = document.querySelector<HTMLElement>(".pattern-flow-shell")!;
      expect(shell).not.toBeNull();
      const originalElement = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
      const originalExit = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
      const exit = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: shell });
      Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
      try {
        document.dispatchEvent(new Event("fullscreenchange")); await settle();
        const event = escape(shell);
        expect(event.defaultPrevented).toBe(true);
        expect(exit).toHaveBeenCalledTimes(1);
        expect(wrapper.emitted("close")).toBeUndefined();
      } finally {
        if (originalElement) Object.defineProperty(document, "fullscreenElement", originalElement);
        else Reflect.deleteProperty(document, "fullscreenElement");
        if (originalExit) Object.defineProperty(document, "exitFullscreen", originalExit);
        else Reflect.deleteProperty(document, "exitFullscreen");
      }
    });
  }
});

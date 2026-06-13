import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import TransitNetworkGhostLayer from "../src/features/network-ghost/TransitNetworkGhostLayer.vue";
import type { NetworkGhostLineView } from "../src/features/network-ghost";

describe("TransitNetworkGhostLayer", () => {
  it("reveals stations on hover, pins on click and resets from the parent", async () => {
    const Host = defineComponent({
      components: { TransitNetworkGhostLayer },
      props: {
        resetKey: {
          type: Number,
          required: true,
        },
        zoom: {
          type: Number,
          required: true,
        },
      },
      setup() {
        return { lines: [createLine()] };
      },
      template: `
        <svg viewBox="0 0 1080 620">
          <TransitNetworkGhostLayer
            :lines="lines"
            :anchor-x="0.5"
            :anchor-y="0.5"
            :reset-key="resetKey"
            :zoom="zoom"
            tooltip-target="#ghost-tooltip-target"
          />
          <g id="ghost-tooltip-target"></g>
        </svg>
      `,
    });
    const wrapper = mount(Host, {
      props: { resetKey: 0, zoom: 1 },
      attachTo: document.body,
    });
    const hitTarget = wrapper.get(".network-ghost-line__hit-target");
    const visibleSegment = wrapper.get(".network-ghost-line__segment");
    const ghostLayer = wrapper.getComponent(TransitNetworkGhostLayer);

    expect(wrapper.find(".network-ghost-line__station").exists()).toBe(false);
    expect(visibleSegment.attributes("stroke-dasharray")).toBe("none");
    expect(
      wrapper.get(".network-ghost-line").attributes("style"),
    ).toContain("--network-ghost-width: 5px");

    await hitTarget.trigger("pointerenter", { clientX: 100, clientY: 100 });
    expect(wrapper.findAll(".network-ghost-line__station")).toHaveLength(2);
    expect(wrapper.get(".network-ghost-tooltip").text()).toContain("Ligne B");
    expect(wrapper.get(".network-ghost-line").classes()).toContain(
      "network-ghost-line--hovered",
    );
    expect(
      ghostLayer.emitted("activeLineChange")?.at(-1)?.[0],
    ).toMatchObject({ id: "rer:b" });
    expect(
      wrapper.get("#ghost-tooltip-target").element.lastElementChild,
    ).toBe(wrapper.get(".network-ghost-tooltip").element);
    expect(wrapper.get(".network-ghost-tooltip__icon").attributes("href")).toBe(
      "https://example.test/rer-b.svg",
    );
    expect(
      Number(wrapper.get(".network-ghost-line__station").attributes("r")),
    ).toBe(4);

    await wrapper.setProps({ zoom: 4 });
    expect(
      Number(wrapper.get(".network-ghost-line__station").attributes("r")),
    ).toBe(1);
    expect(wrapper.get(".network-ghost-tooltip").attributes("transform")).toContain(
      "scale(0.25)",
    );

    await hitTarget.trigger("click");
    await hitTarget.trigger("pointerleave");
    expect(wrapper.findAll(".network-ghost-line__station")).toHaveLength(2);

    await wrapper.setProps({ resetKey: 1 });
    expect(wrapper.find(".network-ghost-line__station").exists()).toBe(false);
    wrapper.unmount();
  });
});

function createLine(): NetworkGhostLineView {
  return {
    id: "rer:b",
    label: "Ligne B",
    mode: "RER",
    color: "#4b92db",
    textColor: "#ffffff",
    iconUrl: "https://example.test/rer-b.svg",
    isBus: false,
    anchorStationId: "a",
    anchorX: 0.4,
    anchorY: 0.5,
    loadOrder: 0,
    stations: [
      { id: "a", label: "Alpha", x: 0.4, y: 0.5 },
      { id: "b", label: "Beta", x: 0.6, y: 0.5 },
    ],
    segments: [
      {
        id: "a-b",
        fromStationId: "a",
        toStationId: "b",
        fromX: 0.4,
        fromY: 0.5,
        toX: 0.6,
        toY: 0.5,
        level: 0,
      },
    ],
  };
}

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

  it("gives click and parent selection priority over a hovered line", async () => {
    const Host = defineComponent({
      components: { TransitNetworkGhostLayer },
      props: {
        tapRequest: {
          type: Object,
          default: undefined,
        },
      },
      setup() {
        return {
          lines: [
            createLine(),
            createLine({
              id: "tram:t4",
              label: "T4",
              mode: "Tram",
              color: "#e3b300",
              anchorX: 0.45,
              anchorY: 0.62,
            }),
          ],
        };
      },
      template: `
        <svg viewBox="0 0 1080 620">
          <TransitNetworkGhostLayer
            :lines="lines"
            :anchor-x="0.5"
            :anchor-y="0.5"
            :tap-request="tapRequest"
          />
        </svg>
      `,
    });
    const wrapper = mount(Host, {
      attachTo: document.body,
    });

    await wrapper
      .get('[data-network-ghost-line="rer:b"]')
      .trigger("pointerenter", { clientX: 100, clientY: 100 });
    expect(wrapper.get(".network-ghost-line--active").attributes()).toMatchObject(
      {
        "data-network-ghost-line-id": "rer:b",
      },
    );

    await wrapper.setProps({
      tapRequest: { id: 1, lineId: "tram:t4", mode: "select" },
    });

    expect(wrapper.get(".network-ghost-line--active").attributes()).toMatchObject(
      {
        "data-network-ghost-line-id": "tram:t4",
      },
    );
    expect(
      wrapper
        .get('[data-network-ghost-line-id="rer:b"]')
        .classes(),
    ).not.toContain("network-ghost-line--hovered");

    await wrapper
      .get('[data-network-ghost-line="rer:b"]')
      .trigger("pointerenter", { clientX: 110, clientY: 100 });
    expect(wrapper.get(".network-ghost-line--active").attributes()).toMatchObject(
      {
        "data-network-ghost-line-id": "tram:t4",
      },
    );

    await wrapper.get('[data-network-ghost-line="rer:b"]').trigger("click");
    expect(wrapper.get(".network-ghost-line--active").attributes()).toMatchObject(
      {
        "data-network-ghost-line-id": "rer:b",
      },
    );

    await wrapper.get('[data-network-ghost-line="rer:b"]').trigger("click");
    expect(wrapper.find(".network-ghost-line--active").exists()).toBe(false);

    wrapper.unmount();
  });
});

function createLine(
  overrides: Partial<NetworkGhostLineView> = {},
): NetworkGhostLineView {
  const id = overrides.id ?? "rer:b";
  const anchorX = overrides.anchorX ?? 0.4;
  const anchorY = overrides.anchorY ?? 0.5;

  return {
    id,
    label: "Ligne B",
    mode: "RER",
    color: "#4b92db",
    textColor: "#ffffff",
    iconUrl: "https://example.test/rer-b.svg",
    isBus: false,
    anchorStationId: "a",
    anchorX,
    anchorY,
    loadOrder: 0,
    stations: [
      { id: `${id}:a`, label: "Alpha", x: anchorX, y: anchorY },
      { id: `${id}:b`, label: "Beta", x: anchorX + 0.2, y: anchorY },
    ],
    segments: [
      {
        id: "a-b",
        fromStationId: `${id}:a`,
        toStationId: `${id}:b`,
        fromX: anchorX,
        fromY: anchorY,
        toX: anchorX + 0.2,
        toY: anchorY,
        level: 0,
      },
    ],
    ...overrides,
  };
}

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GlobalTransportPlanLinePanel from "../src/features/line-map/GlobalTransportPlanLinePanel.vue";
import type { GlobalMapLine } from "../src/features/transport-map/contracts/manifest";

const transilienLines: GlobalMapLine[] = [
  ["C01737", "H", "#2563eb", "#ffffff"],
  ["C01739", "J", "#2563eb", "#ffffff"],
  ["C01738", "K", "#2563eb", "#ffffff"],
  ["C01740", "L", "#2563eb", "#ffffff"],
  ["C01736", "N", "#2563eb", "#ffffff"],
  ["C01730", "P", "#2563eb", "#ffffff"],
  ["C01731", "R", "#2563eb", "#ffffff"],
  ["C01741", "U", "#2563eb", "#ffffff"],
  ["C02711", "V", "#2563eb", "#ffffff"],
].map(([code, label, color, textColor], index) => ({
  id: `line:IDFM:${code}`,
  index,
  code,
  label,
  mode: "TRANSILIEN",
  color,
  textColor,
  aliases: [code, label],
  stationIds: [`station:${index}`],
  geometryIds: [`path:${index}`],
}));

describe("GlobalTransportPlanLinePanel", () => {
  it("uses the shared line presentation for every Transilien badge", () => {
    const wrapper = mount(GlobalTransportPlanLinePanel, {
      props: {
        mode: "TRANSILIEN",
        lines: transilienLines,
      },
    });

    const renderedBadges = wrapper.findAll(".global-map-line-panel__line").map((button) => {
      const fallback = button.find(".line-icon-badge__fallback");
      const image = button.find("img");
      return {
        label: button.find("strong").text(),
        representation: fallback.exists()
          ? fallback.attributes("style")
          : image.attributes("alt"),
      };
    });

    expect(renderedBadges).toHaveLength(9);
    expect(renderedBadges.every(({ representation }) => Boolean(representation))).toBe(true);
  });

  it("sorts embedded lines and reveals the filter only from the search icon", async () => {
    const wrapper = mount(GlobalTransportPlanLinePanel, {
      props: {
        mode: "TRANSILIEN",
        lines: [...transilienLines].reverse(),
        embedded: true,
      },
    });

    const lineLabels = () => wrapper
      .findAll(".global-map-line-panel__line")
      .map((button) => button.find("strong").text());

    expect(lineLabels()).toEqual(["H", "J", "K", "L", "N", "P", "R", "U", "V"]);
    expect(wrapper.find(".global-map-line-panel__search").exists()).toBe(false);
    expect(wrapper.find(".global-map-line-panel__header-action--back").exists()).toBe(true);

    await wrapper.get(".global-map-line-panel__header-action[aria-expanded]").trigger("click");
    expect(wrapper.find(".global-map-line-panel__search").exists()).toBe(true);

    await wrapper.get(".global-map-line-panel__search input").setValue("p");
    expect(lineLabels()).toEqual(["P"]);

    await wrapper.get(".global-map-line-panel__header-action[aria-expanded]").trigger("click");
    expect(wrapper.find(".global-map-line-panel__search").exists()).toBe(false);
    expect(lineLabels()).toHaveLength(9);

    wrapper.unmount();
  });

  it("keeps the controlled selected line highlighted without changing the panel view", async () => {
    const selectedLineId = transilienLines[1]!.id;
    const wrapper = mount(GlobalTransportPlanLinePanel, {
      props: {
        mode: "TRANSILIEN",
        lines: transilienLines,
        embedded: true,
        selectedLineId,
      },
    });

    const selectedLine = wrapper.findAll(".global-map-line-panel__line").find(
      (button) => button.find("strong").text() === "J",
    );
    expect(selectedLine).toBeDefined();
    expect(selectedLine!.classes()).toContain("global-map-line-panel__line--selected");
    expect(selectedLine!.attributes("aria-pressed")).toBe("true");
    expect(wrapper.findAll(".global-map-line-panel__line[aria-pressed='true']")).toHaveLength(1);

    await selectedLine!.trigger("click");
    expect(wrapper.emitted("select-line")?.at(-1)).toEqual([selectedLineId]);
    expect(wrapper.find("[data-global-map-line-panel]").exists()).toBe(true);

    wrapper.unmount();
  });

  it("does not expose the embedded search control in the floating panel", () => {
    const wrapper = mount(GlobalTransportPlanLinePanel, {
      props: { mode: "TRANSILIEN", lines: transilienLines },
    });

    expect(wrapper.find(".global-map-line-panel__header-action[aria-expanded]").exists()).toBe(false);
    expect(wrapper.find(".global-map-line-panel__search").exists()).toBe(false);

    wrapper.unmount();
  });
});

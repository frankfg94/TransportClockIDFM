import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LineTrafficIcon from "../src/features/traffic/LineTrafficIcon.vue";
import type { LineConfig } from "../src/types/transit";

const line: LineConfig = {
  ref: "line:IDFM:C01387",
  shortName: "7bis",
  longName: "Metro 7 bis",
  mode: "metro",
  color: "#83c491",
  textColor: "#000000",
};

describe("LineTrafficIcon", () => {
  it("animates reports arriving after the icon has mounted", async () => {
    const wrapper = mount(LineTrafficIcon, {
      props: {
        animationOrder: 2,
        line,
        ready: false,
        status: "planned",
        symbol: "!",
        tone: "orange",
      },
    });

    expect(wrapper.classes()).toContain("line-traffic-icon--entering");
    expect(wrapper.classes()).not.toContain(
      "line-traffic-icon--report-arriving",
    );
    expect(wrapper.get(".line-traffic-icon__status").text()).toBe("!");

    const frame = wrapper.get(".line-traffic-icon__frame rect");
    expect(frame.attributes("pathLength")).toBe("100");
    expect(frame.attributes("stroke-dasharray")).toBe("102 100");

    await wrapper.setProps({ ready: true });

    expect(wrapper.classes()).toContain("line-traffic-icon--ready");
    expect(wrapper.classes()).toContain(
      "line-traffic-icon--report-arriving",
    );
  });

  it("renders its final state without replaying when mounted already ready", () => {
    const wrapper = mount(LineTrafficIcon, {
      props: {
        line,
        ready: true,
        status: "normal",
      },
    });

    expect(wrapper.classes()).toContain("line-traffic-icon--ready");
    expect(wrapper.classes()).not.toContain("line-traffic-icon--entering");
    expect(wrapper.classes()).not.toContain(
      "line-traffic-icon--report-arriving",
    );
  });
});

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LineIconBadge from "../src/components/LineIconBadge.vue";

describe("LineIconBadge", () => {
  it("does not render a text fallback next to a valid icon URL", () => {
    const wrapper = mount(LineIconBadge, {
      props: {
        line: {
          iconUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
          label: "T6",
          mode: "tram",
        },
      },
    });

    expect(wrapper.find("img").exists()).toBe(true);
    expect(wrapper.find(".line-icon-badge__fallback").exists()).toBe(false);
    wrapper.unmount();
  });
});

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LoadingBar from "../src/components/LoadingBar.vue";

describe("LoadingBar", () => {
  it("renders a clamped determinate percentage", () => {
    const wrapper = mount(LoadingBar, {
      props: { progress: 125, ariaLabel: "Loading" },
    });

    expect(wrapper.attributes("role")).toBe("progressbar");
    expect(wrapper.attributes("aria-valuenow")).toBe("100");
    expect(wrapper.attributes("aria-label")).toBe("Loading");
    expect(wrapper.get(".loading-bar__value").attributes("style")).toContain("width: 100%;");
    expect(wrapper.classes()).not.toContain("loading-bar--indeterminate");
  });

  it("omits the value and animates when indeterminate", () => {
    const wrapper = mount(LoadingBar, { props: { indeterminate: true } });

    expect(wrapper.attributes("aria-valuenow")).toBeUndefined();
    expect(wrapper.classes()).toContain("loading-bar--indeterminate");
  });
});

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LineIconBadge from "../src/components/LineIconBadge.vue";

describe("LineIconBadge", () => {
  it("shows the official bus 14 pictogram rather than the legacy asset containing the TVM logo", () => {
    const wrapper = mount(LineIconBadge, {
      props: { line: { id: "line:IDFM:C00350", label: "14", family: "BUS", color: "#0055fa" } },
    });

    expect(wrapper.get("img").attributes("src")).toBe(
      "https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/bus/picto-ligne-LIGIDFMC00350.svg",
    );
    expect(wrapper.find(".line-icon-badge__fallback").exists()).toBe(false);
    wrapper.unmount();
  });

  it("shows the official Noctilien pictogram when its canonical IDFM identity is available", () => {
    const wrapper = mount(LineIconBadge, {
      props: { line: { id: "line:IDFM:C01402", label: "N61", family: "NOCTILIEN" } },
    });

    expect(wrapper.get("img").attributes("src")).toContain("LIGIDFMC01402");
    expect(wrapper.find(".line-icon-badge__fallback").exists()).toBe(false);
    wrapper.unmount();
  });

  it("preserves an explicitly supplied bus pictogram", () => {
    const iconUrl = "https://example.test/official/C00350.svg";
    const wrapper = mount(LineIconBadge, {
      props: { line: { id: "line:IDFM:C00350", label: "14", family: "BUS", iconUrl } },
    });

    expect(wrapper.get("img").attributes("src")).toBe(iconUrl);
    wrapper.unmount();
  });

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

  it("generates the official T10 pictogram from the public line identity", () => {
    const wrapper = mount(LineIconBadge, {
      props: {
        line: {
          id: "line:tram:T10",
          label: "T10",
          mode: "tram",
        },
      },
    });

    expect(wrapper.find("img").attributes("src")).toContain("LIGIDFMC02528");
    expect(wrapper.find(".line-icon-badge__fallback").exists()).toBe(false);
    wrapper.unmount();
  });

  it("keeps the working candidate when the parent recreates the line during hover", async () => {
    const firstCandidate = "https://invalid.example/line-icon.svg";
    const workingCandidate = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
    const wrapper = mount(LineIconBadge, {
      props: {
        line: {
          iconUrls: [firstCandidate, workingCandidate],
          label: "T6",
          mode: "tram",
        },
      },
    });

    await wrapper.get("img").trigger("error");
    expect(wrapper.get("img").attributes("src")).toBe(workingCandidate);

    await wrapper.setProps({
      line: {
        iconUrls: [firstCandidate, workingCandidate],
        label: "T6",
        mode: "tram",
      },
    });

    expect(wrapper.get("img").attributes("src")).toBe(workingCandidate);
    wrapper.unmount();
  });
});

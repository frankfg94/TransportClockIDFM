import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import IrisNeighborhoodOverlay from "../src/features/transport-map/overlays/IrisNeighborhoodOverlay.vue";
import { createCamera } from "../src/features/transport-map/geo/camera";
import type { IrisNeighborhood } from "../src/features/transport-map/iris/irisApi";

function iris(id: number, x: number, name: string): IrisNeighborhood {
  return { id: String(id), codeIris: String(id), communeCode: "92001", communeName: "Ville", departmentCode: "92", name, type: "H", centroid: [x + .005, 48.005], geometry: { type: "Polygon", coordinates: [[[x, 48], [x + .01, 48], [x + .01, 48.01], [x, 48.01], [x, 48]]] } };
}

describe("city neighborhood summary", () => {
  it("counts a line shared by grouped subdivisions once and states that no Verdict is calculated", async () => {
    const wrapper = mount(IrisNeighborhoodOverlay, { props: {
      neighborhoods: [iris(1, 2, "Centre 1"), iris(2, 2.01, "Centre 2"), iris(3, 2.02, "Autre")],
      camera: createCamera({ viewportWidthCssPx: 640, viewportHeightCssPx: 360 }), scope: "city", showVerdictSummary: true,
      transportStations: [2.005, 2.015].map(lon => ({ lon, lat: 48.005, lineIds: ["b"], lines: [{ id: "b", mode: "BUS" as const }] })),
    } });
    await wrapper.get("path[data-iris-code='1']").trigger("pointerenter");
    expect(wrapper.get("[role=region]").text()).toMatch(/1\s*Bus/i);
    expect(wrapper.get("[role=region]").text()).toMatch(/Verdict/);
    await wrapper.get("[role=region] button").trigger("click");
    expect(wrapper.emitted("compare")?.[0]).toEqual([undefined]);
    await wrapper.get("path[data-iris-code='3']").trigger("pointerenter");
    await wrapper.get("[role=region] button").trigger("click");
    expect(wrapper.emitted("compare")?.[1]).toEqual(["3"]);
    wrapper.unmount();
  });
});

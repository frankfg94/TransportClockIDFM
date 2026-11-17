import { mount, shallowMount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { GlobalMapLine } from "../src/features/transport-map/contracts/manifest";
import TransportMapTooltip from "../src/features/transport-map/overlays/TransportMapTooltip.vue";
import GlobalTransportPlanLinePanel from "../src/features/line-map/GlobalTransportPlanLinePanel.vue";
import GlobalMapSidebarBodyLine from "../src/features/line-map/GlobalMapSidebarBodyLine.vue";
import { decodeBootstrap } from "../src/features/transport-map/data/assetLoader";

const line: GlobalMapLine = {
  id: "line:IDFM:C02370", index: 0, code: "C02370", label: "TER", mode: "TRAIN",
  color: "#aaaaaa", textColor: "#000000", aliases: [], stationIds: [], geometryIds: [],
  commercialNetworkLabel: "TER Normandie",
  commercialRoutes: [
    { code: "K3", name: "Paris - Le Mans", color: "BF005F", textColor: "FFFFFF", sourceRouteId: "route:1", observedTrips: 2 },
    { code: "K3+", name: "Paris - Deauville", color: "6E1E78", textColor: "FFFFFF", sourceRouteId: "route:2", observedTrips: 1 },
  ],
};
const codes = (wrapper: ReturnType<typeof mount>) => wrapper.findAll(".global-map-commercial-badges__code").map((badge) => badge.text());

describe("commercial TER badges", () => {
  it("renders K4 from the current compiled pack in the tooltip and line list", () => {
    const root = resolve(process.cwd(), "public/data/global-map/v1");
    const read = (name: string) => JSON.parse(readFileSync(resolve(root, name), "utf8"));
    const manifest = read("manifest.json");
    const network = decodeBootstrap(read("bootstrap.json"), manifest, undefined, undefined, read(manifest.files.commercialLines.asset));
    const actual = network.linesById.get("line:IDFM:C02370")!;
    const tooltip = mount(TransportMapTooltip, { props: { lines: [actual] } });
    const panel = mount(GlobalTransportPlanLinePanel, { props: { mode: "TRAIN", lines: [actual] } });
    for (const wrapper of [tooltip, panel]) {
      expect(codes(wrapper)).toEqual(["K4"]);
      expect(wrapper.text()).toContain("TER Normandie");
    }
  });

  it("shows the same codes and full name in tooltip, catalogue and selected-line hero", () => {
    const tooltip = mount(TransportMapTooltip, { props: { lines: [line] } });
    const panel = mount(GlobalTransportPlanLinePanel, { props: { mode: "TRAIN", lines: [line] } });
    const sidebar = shallowMount(GlobalMapSidebarBodyLine, {
      props: {
        displayLine: line, lines: [line], allLines: [line], stations: [], cityPatternStations: [], paths: [], previewPaths: [],
        entrances: [], numberedEntrances: [], dashboardBusy: false, isLinePreview: true,
        frequencyLoading: false, frequencyUnavailable: false, ridershipLoading: false, ridershipUnavailable: false,
        ridershipStationLoading: false, ridershipStationUnavailable: false, ridershipStationScope: "network",
        ridershipStationScopeOptions: [], directionOptions: [], directionVariants: [], directionLoading: false,
        mergeDirections: false, showGhostLineIcons: false, showLineConnectionIcons: false, showBusCorrespondences: false,
        showServedCityZones: false, nearbyPlaces: [], nearbyPlacesLoading: false, nearbyPlacesError: false,
        nearbyPlacesRadiusMinutes: 0,
      },
      global: { stubs: { GlobalMapLineBadges: false } },
    });
    for (const wrapper of [tooltip, panel, sidebar]) {
      expect(codes(wrapper)).toEqual(["K3", "K3+"]);
      expect(wrapper.text()).toContain("TER Normandie");
      expect(wrapper.find(".global-map-commercial-badges__code").attributes("style")).toContain("#bf005f");
    }
    expect(sidebar.find(".global-map-picker-sidebar__line-code").exists()).toBe(false);
  });

  it("preserves selection and hover in the multiple-line tooltip", async () => {
    const other = { ...line, id: "other", commercialRoutes: undefined };
    const tooltip = mount(TransportMapTooltip, { props: { lines: [line, other] } });
    const first = tooltip.findAll(".global-transport-plan__tooltip-choice")[0]!;
    await first.trigger("mouseenter");
    await first.trigger("click");
    expect(tooltip.emitted("hover-line")?.[0]).toEqual([line.id]);
    expect(tooltip.emitted("select-line")?.[0]).toEqual([line.id]);
    expect(codes(tooltip)).toEqual(["K3", "K3+"]);
  });

  it("keeps the existing badge for missing or non-TER data", () => {
    for (const mode of ["TRAIN", "TRANSILIEN", "RER", "METRO", "TRAM", "BUS"] as const) {
      const candidate = { ...line, mode, commercialRoutes: mode === "TRAIN" ? undefined : line.commercialRoutes };
      const wrapper = mount(TransportMapTooltip, { props: { lines: [candidate] } });
      expect(wrapper.find(".global-map-commercial-badges").exists()).toBe(false);
      expect(wrapper.find(".line-icon-badge").exists()).toBe(true);
    }
  });
});

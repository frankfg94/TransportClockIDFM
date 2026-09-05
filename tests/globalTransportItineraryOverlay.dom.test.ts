import { mount } from "@vue/test-utils";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { lonLatToWorld, worldToScreen } from "../src/features/transport-map/geo/coordinateKernel";
import GlobalTransportItineraryOverlay from "../src/features/line-map/GlobalTransportItineraryOverlay.vue";
import type { GlobalTransportItineraryRoute } from "../src/features/line-map/globalTransportItineraryGeometry";
import { describe, expect, it, vi } from "vitest";

const origin = { lon: 2.2, lat: 48.8 };
const stop = { lon: 2.21, lat: 48.801 };
const destination = { lon: 2.24, lat: 48.82 };
const exit = {
  id: "exit-overlay-a",
  stationId: "station:destination",
  name: "Sortie principale",
  code: "A",
  lon: 2.241,
  lat: 48.821,
};

function createOverlayRoute(id = "journey:overlay"): GlobalTransportItineraryRoute {
  return {
    id,
    sections: [
      {
        type: "street_network",
        mode: "walking",
        durationSeconds: 240,
        fromPoint: origin,
        toPoint: stop,
        geometry: [origin, stop],
      },
      {
        type: "public_transport",
        mode: "tram",
        lineMode: "TRAM",
        lineCode: "T10",
        lineColor: "#f59e0b",
        durationSeconds: 600,
        fromPoint: stop,
        toPoint: destination,
        geometry: [stop, destination],
      },
    ],
  };
}

function createOverlayCamera(zoom = 8) {
  return createCamera({
    centerWorldX: 0.5,
    centerWorldY: 0.5,
    zoom,
    viewportWidthCssPx: 800,
    viewportHeightCssPx: 600,
  });
}

describe("GlobalTransportItineraryOverlay", () => {
  it("renders colored transit paths and dotted walking paths", () => {
    const wrapper = mount(GlobalTransportItineraryOverlay, {
      props: {
        origin,
        destination,
        camera: createOverlayCamera(),
        route: createOverlayRoute(),
        getSectionExits: () => [exit],
      },
    });

    expect(wrapper.find("svg[data-testid='global-transport-itinerary-overlay']").exists()).toBe(true);
    expect(wrapper.findAll(".global-transport-itinerary-overlay__path")).toHaveLength(2);
    expect(wrapper.find(".global-transport-itinerary-overlay__path--walking").exists()).toBe(true);
    expect(wrapper.find(".global-transport-itinerary-overlay__segment--transit .global-transport-itinerary-overlay__path").attributes("style")).toMatch(/stroke:\s*(#f59e0b|rgb\(245,\s*158,\s*11\))/i);
    expect(wrapper.findAll('[data-testid="global-transport-itinerary-line-icon"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="global-transport-itinerary-line-icon"]').attributes("data-line-code")).toBe("T10");
    expect(wrapper.find('[data-testid="global-transport-itinerary-line-icon"] img').attributes("alt")).toBe("Ligne T10");
    expect(wrapper.findAll('[data-testid="global-transport-itinerary-exit"]')).toHaveLength(1);
    expect(wrapper.find(".global-transport-itinerary-overlay__exit-label").text()).toBe("A · Sortie principale");
    expect(wrapper.find(".global-transport-itinerary-overlay__exit-connector").exists()).toBe(true);
  });

  it("keeps world geometry and exit resolution stable during camera changes", async () => {
    const getSectionExits = vi.fn(() => [exit]);
    const wrapper = mount(GlobalTransportItineraryOverlay, {
      props: {
        origin,
        destination,
        camera: createOverlayCamera(),
        route: createOverlayRoute(),
        getSectionExits,
      },
    });

    const initialPathData = wrapper.find(".global-transport-itinerary-overlay__path").attributes("d");
    const initialTransitPathData = wrapper.findAll(".global-transport-itinerary-overlay__path")[1]!.attributes("d");
    const initialTransform = wrapper.find("svg > g").attributes("transform");
    expect(getSectionExits).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ camera: createOverlayCamera(9) });

    expect(wrapper.find(".global-transport-itinerary-overlay__path").attributes("d")).toBe(initialPathData);
    expect(wrapper.find("svg > g").attributes("transform")).not.toBe(initialTransform);
    expect(getSectionExits).toHaveBeenCalledTimes(1);

    const nextRoute = createOverlayRoute("journey:overlay:next");
    nextRoute.sections[1]!.geometry = [stop, { lon: 2.22, lat: 48.81 }, destination];
    await wrapper.setProps({ route: nextRoute });
    expect(getSectionExits).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll(".global-transport-itinerary-overlay__path")[1]!.attributes("d")).not.toBe(initialTransitPathData);
  });

  it("anchors exit connectors to the rendered transit endpoint", () => {
    const renderedTransitEnd = { lon: 2.235, lat: 48.815 };
    const camera = createOverlayCamera();
    const wrapper = mount(GlobalTransportItineraryOverlay, {
      props: {
        origin,
        destination,
        camera,
        route: createOverlayRoute(),
        segments: [
          {
            id: "journey:overlay:walking:0",
            kind: "walking",
            coordinates: [origin, stop],
          },
          {
            id: "journey:overlay:transit:1",
            kind: "transit",
            coordinates: [stop, renderedTransitEnd],
            lineCode: "T10",
            lineMode: "TRAM",
          },
        ],
        getSectionExits: () => [exit],
      },
    });

    const expected = worldToScreen(lonLatToWorld(renderedTransitEnd), camera);
    const connector = wrapper.find(".global-transport-itinerary-overlay__exit-connector");
    expect(Number(connector.attributes("x1"))).toBeCloseTo(expected.x, 6);
    expect(Number(connector.attributes("y1"))).toBeCloseTo(expected.y, 6);
  });

  it("does not rebuild a long path when the camera pans", async () => {
    const longGeometry = Array.from({ length: 1_200 }, (_, index) => ({
      lon: 2.21 + index * 0.000001,
      lat: 48.801 + Math.sin(index / 20) * 0.000001,
    }));
    const route = createOverlayRoute("journey:long");
    route.sections[1]!.geometry = [stop, ...longGeometry, destination];

    const wrapper = mount(GlobalTransportItineraryOverlay, {
      props: {
        origin,
        destination,
        camera: createOverlayCamera(),
        route,
      },
    });
    const initialPathData = wrapper.findAll(".global-transport-itinerary-overlay__path")[1]!.attributes("d");

    await wrapper.setProps({
      camera: createCamera({
        centerWorldX: 0.51,
        centerWorldY: 0.49,
        zoom: 8.4,
        viewportWidthCssPx: 800,
        viewportHeightCssPx: 600,
      }),
    });

    expect(wrapper.findAll(".global-transport-itinerary-overlay__path")[1]!.attributes("d")).toBe(initialPathData);
  });
});

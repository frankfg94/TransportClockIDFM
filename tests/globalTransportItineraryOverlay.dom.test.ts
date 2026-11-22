import { mount } from "@vue/test-utils";
import { createCamera } from "../src/features/transport-map/geo/camera";
import * as coordinateKernel from "../src/features/transport-map/geo/coordinateKernel";
import { lonLatToWorld, worldToScreen } from "../src/features/transport-map/geo/coordinateKernel";
import GlobalTransportItineraryOverlay from "../src/features/line-map/GlobalTransportItineraryOverlay.vue";
import type { GlobalTransportItineraryRoute } from "../src/features/line-map/globalTransportItineraryGeometry";
import { createGlobalTransportItinerarySegments } from "../src/features/line-map/globalTransportItineraryGeometry";
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
  it("labels access walking, transit and final walking with their supplied durations", async () => {
    const route = createOverlayRoute();
    const end = { lon: 2.241, lat: 48.821 };
    const sections = [...route.sections, {
      type: "street_network", mode: "walking", durationSeconds: 120,
      fromPoint: destination, toPoint: end, geometry: [destination, end],
    }];
    const segments = createGlobalTransportItinerarySegments({ ...route, sections }, origin, end, { preserveSections: true });
    const wrapper = mount(GlobalTransportItineraryOverlay, {
      props: { camera: createOverlayCamera(), segments },
    });
    expect(wrapper.find("[data-duration-kind]").exists()).toBe(false);
    const displayedDurations = () => wrapper.findAll("[data-duration-kind]").map((node) => node.text());
    for (const target of wrapper.findAll("[data-duration-target]")) {
      await target.trigger("pointerenter", { pointerType: "mouse" });
      expect(displayedDurations()).toEqual(["4 min", "10 min", "2 min"]);
      await target.trigger("pointerleave", { pointerType: "mouse" });
      expect(wrapper.find("[data-duration-kind]").exists()).toBe(false);
    }
    vi.useFakeTimers();
    try {
      const transit = wrapper.get("[data-duration-target=transit]");
      transit.element.dispatchEvent(new PointerEvent("click", { pointerType: "touch", bubbles: true }));
      await wrapper.vm.$nextTick();
      expect(displayedDurations()).toEqual(["4 min", "10 min", "2 min"]);
      await vi.advanceTimersByTimeAsync(9999);
      expect(displayedDurations()).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(wrapper.find("[data-duration-kind]").exists()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
    await wrapper.setProps({ pathsOnly: true });
    expect(wrapper.find("[data-duration-kind]").exists()).toBe(false);
    expect(wrapper.findAll(".global-transport-itinerary-overlay__path")).toHaveLength(3);
  });

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

  it("projects walking, transit and markers together across camera and route changes", async () => {
    const getSectionExits = vi.fn(() => [exit]);
    const center = lonLatToWorld(stop);
    const camera = createCamera({
      centerWorldX: center.x, centerWorldY: center.y, zoom: 14,
      viewportWidthCssPx: 800, viewportHeightCssPx: 600,
    });
    const route = createOverlayRoute();
    const sourceGeometry = JSON.stringify(route);
    const projectWorld = vi.spyOn(coordinateKernel, "lonLatToWorld");
    const wrapper = mount(GlobalTransportItineraryOverlay, {
      props: { origin, destination, camera, route, getSectionExits },
    });

    function assertAligned(currentCamera: typeof camera) {
      const paths = wrapper.findAll(".global-transport-itinerary-overlay__path");
      const expectedPath = (points: typeof origin[]) => points.map((point) => {
        const screen = worldToScreen(lonLatToWorld(point), currentCamera);
        return [screen.x, screen.y];
      });
      const parse = (d: string) => Array.from(d.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g),
        (match) => [Number(match[1]), Number(match[2])]);
      for (const [actual, expected] of [
        [parse(paths[0]!.attributes("d") ?? ""), expectedPath([origin, stop])],
        [parse(paths[1]!.attributes("d") ?? ""), expectedPath([stop, destination])],
      ]) {
        expect(actual).toHaveLength(expected.length);
        expected.forEach((point, index) => {
          expect(actual[index]![0]).toBeCloseTo(point[0]!, 3);
          expect(actual[index]![1]).toBeCloseTo(point[1]!, 3);
        });
      }
      const originScreen = worldToScreen(lonLatToWorld(origin), currentCamera);
      const marker = wrapper.find(".global-transport-itinerary-overlay__node--origin");
      expect(Number(marker.attributes("cx"))).toBeCloseTo(originScreen.x, 6);
      expect(Number(marker.attributes("cy"))).toBeCloseTo(originScreen.y, 6);
      const destinationScreen = worldToScreen(lonLatToWorld(destination), currentCamera);
      const connector = wrapper.find(".global-transport-itinerary-overlay__exit-connector");
      expect(Number(connector.attributes("x1"))).toBeCloseTo(destinationScreen.x, 6);
      expect(Number(connector.attributes("y1"))).toBeCloseTo(destinationScreen.y, 6);
      expect(wrapper.find("svg > g").attributes("transform")).toBeUndefined();
    }

    assertAligned(camera);
    expect(getSectionExits).toHaveBeenCalledTimes(1);
    projectWorld.mockClear();
    const movedCamera = createCamera({
      centerWorldX: center.x + 0.0001, centerWorldY: center.y - 0.0001, zoom: 15,
      viewportWidthCssPx: 1000, viewportHeightCssPx: 700,
    });
    await wrapper.setProps({ camera: movedCamera });
    expect(projectWorld).not.toHaveBeenCalled();
    expect(JSON.stringify(route)).toBe(sourceGeometry);
    expect(getSectionExits).toHaveBeenCalledTimes(1);
    assertAligned(movedCamera);

    const previousTransitPath = wrapper.findAll(".global-transport-itinerary-overlay__path")[1]!.attributes("d");
    const nextRoute = createOverlayRoute("journey:overlay:next");
    nextRoute.sections[1]!.geometry = [stop, { lon: 2.22, lat: 48.81 }, destination];
    await wrapper.setProps({ route: nextRoute });
    expect(getSectionExits).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll(".global-transport-itinerary-overlay__path")[1]!.attributes("d")).not.toBe(previousTransitPath);
    projectWorld.mockRestore();
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

  it("reprojects a dense path when the camera pans", async () => {
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

    expect(wrapper.findAll(".global-transport-itinerary-overlay__path")[1]!.attributes("d")).not.toBe(initialPathData);
    expect(route.sections[1]!.geometry).toHaveLength(1_202);
  });
});

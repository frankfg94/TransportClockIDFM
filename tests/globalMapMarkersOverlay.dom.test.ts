import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GlobalMapMarkersOverlay from "../src/features/line-map/GlobalMapMarkersOverlay.vue";
import { createCamera } from "../src/features/transport-map/geo/camera";
import type { GeocoderPoint } from "../src/features/transport-map/contracts/geocoder";
import type { GlobalMapMarker } from "../src/features/line-map/globalMapMarkers";

const marker: GlobalMapMarker = {
  id: "home-marker",
  name: "Chez moi",
  address: "1 rue de la Carte, Paris",
  lon: 2.3522,
  lat: 48.8566,
  icon: "home",
  color: "#5146ff",
};

const selectedPlace: GeocoderPoint = {
  lon: 2.3622,
  lat: 48.8566,
  label: "Lieu recherché",
  provider: "ign",
  type: "address",
};

function cameraAtZoom(zoom: number) {
  return createCamera({
    centerWorldX: 0.5,
    centerWorldY: 0.5,
    zoom,
    viewportWidthCssPx: 800,
    viewportHeightCssPx: 600,
  });
}

describe("GlobalMapMarkersOverlay", () => {
  it("uses compact icon-only markers below zoom 11 and expands them at zoom 11", async () => {
    const wrapper = mount(GlobalMapMarkersOverlay, {
      props: {
        markers: [marker],
        selectedPlace,
        camera: cameraAtZoom(10.99),
      },
    });

    expect(wrapper.find(".global-map-markers-overlay").classes()).toContain(
      "global-map-markers-overlay--compact",
    );
    const compactMarkers = wrapper.findAll(".global-map-marker");
    expect(compactMarkers).toHaveLength(2);
    expect(compactMarkers.every((entry) => entry.classes().includes("global-map-marker--compact"))).toBe(true);
    expect(compactMarkers[0]?.get(".global-map-marker__label").text()).toBe("Chez moi");
    expect(compactMarkers[1]?.get(".global-map-marker__label").text()).toBe("Lieu recherché");

    expect(compactMarkers[0]?.attributes("aria-label")).toBe("Chez moi");
    expect(compactMarkers[0]?.attributes("title")).toContain("1 rue de la Carte");
    expect(compactMarkers[1]?.attributes("aria-label")).toBe("Lieu recherché");

    await wrapper.setProps({ camera: cameraAtZoom(11) });

    expect(wrapper.find(".global-map-markers-overlay").classes()).not.toContain(
      "global-map-markers-overlay--compact",
    );
    expect(wrapper.findAll(".global-map-marker").every((entry) => !entry.classes().includes("global-map-marker--compact"))).toBe(true);
  });

  it("exposes the reduced-motion state to the marker overlay", () => {
    const wrapper = mount(GlobalMapMarkersOverlay, {
      props: {
        markers: [marker],
        camera: cameraAtZoom(11),
        reduceMotion: true,
      },
    });

    expect(wrapper.find(".global-map-markers-overlay").classes()).toContain(
      "global-map-markers-overlay--reduce-motion",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  applyMapLibreLabelLocale,
  createMapLibreLocalizedTextField,
  localizeMapLibreTextField,
} from "../src/features/transport-map/next/nextMapConfig";

describe("MapLibre basemap label localization", () => {
  it("uses localized name properties with a default-name fallback", () => {
    expect(createMapLibreLocalizedTextField("fr")).toEqual([
      "coalesce",
      ["get", "name:fr"],
      ["get", "name_fr"],
      ["get", "name"],
    ]);
    expect(localizeMapLibreTextField("{name:latin}", "fr")).toEqual(
      createMapLibreLocalizedTextField("fr"),
    );
    expect(localizeMapLibreTextField(["get", "name:en"], "fr")).toEqual(
      createMapLibreLocalizedTextField("fr"),
    );
  });

  it("leaves non-name labels unchanged", () => {
    expect(localizeMapLibreTextField(["get", "ref"], "fr")).toEqual(["get", "ref"]);
    expect(localizeMapLibreTextField("{ref}", "fr")).toBe("{ref}");
  });

  it("updates symbol layers idempotently and follows a later locale change", () => {
    const layouts = new Map<string, unknown>([
      ["place-city", "{name}"],
      ["road-ref", ["get", "ref"]],
      ["place-town", ["get", "name:en"]],
    ]);
    const map = {
      getStyle: () => ({
        layers: [
          { id: "place-city", type: "symbol" },
          { id: "road-ref", type: "symbol" },
          { id: "place-town", type: "symbol" },
          { id: "land", type: "fill" },
        ],
      }),
      getLayoutProperty: (layerId: string) => layouts.get(layerId),
      setLayoutProperty: (layerId: string, _name: "text-field", value: unknown) => {
        layouts.set(layerId, value);
      },
    };

    expect(applyMapLibreLabelLocale(map, "fr")).toBe(2);
    expect(layouts.get("place-city")).toEqual(createMapLibreLocalizedTextField("fr"));
    expect(layouts.get("place-town")).toEqual(createMapLibreLocalizedTextField("fr"));
    expect(applyMapLibreLabelLocale(map, "fr")).toBe(0);

    expect(applyMapLibreLabelLocale(map, "en")).toBe(2);
    expect(layouts.get("place-city")).toEqual(createMapLibreLocalizedTextField("en"));
  });
});

import { describe, expect, it, vi } from "vitest";
import { featureFilter, type FilterSpecification } from "@maplibre/maplibre-gl-style-spec";
import {
  applyMapLibreLabelLocale,
  createMapLibreLocalizedTextField,
  localizeMapLibreTextField,
  normalizeMapLibreReferenceFilters,
} from "../src/features/transport-map/next/nextMapConfig";

describe("MapLibre basemap label localization", () => {
  it("rejects missing reference lengths without MapLibre type warnings and preserves valid shields", () => {
    const original = { layers: [{ id: "road-ref", filter: ["all", ["<=", ["get", "ref_length"], 6]] }] };
    const normalized = normalizeMapLibreReferenceFilters(original);
    const compiled = featureFilter(normalized.layers[0]!.filter as FilterSpecification, "filter");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      for (const value of [undefined, null, "invalid", 7]) {
        expect(compiled.filter({ zoom: 12 }, { type: 2, properties: { ref_length: value } })).toBe(false);
      }
      expect(compiled.filter({ zoom: 12 }, { type: 2, properties: { ref_length: 4 } })).toBe(true);
      expect(warn).not.toHaveBeenCalled();
      expect(original.layers[0]!.filter).toEqual(["all", ["<=", ["get", "ref_length"], 6]]);
      expect(normalizeMapLibreReferenceFilters(normalized).layers[0]).toBe(normalized.layers[0]);
    } finally { warn.mockRestore(); }
  });
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

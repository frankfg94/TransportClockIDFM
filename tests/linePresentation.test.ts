import { describe, expect, it } from "vitest";
import { createLinePresentation } from "../src/services/linePresentation";

describe("line presentation", () => {
  it("uses the official orange presentation for Transilien P", () => {
    expect(
      createLinePresentation({
        id: "line:IDFM:C01730",
        mode: "train",
        shortName: "P",
        color: "0064ff",
        textColor: "ffffff",
      }),
    ).toMatchObject({
      color: "#ef8c2f",
      textColor: "#ffffff",
    });
  });

  it("keeps source metadata for lines without an official override", () => {
    expect(
      createLinePresentation({
        id: "line:IDFM:C09999",
        mode: "rer",
        shortName: "X",
        color: "b94e9a",
        textColor: "ffffff",
      }),
    ).toMatchObject({
      color: "#b94e9a",
      textColor: "#ffffff",
    });
  });

  it("uses the pictogram color for RER E", () => {
    expect(
      createLinePresentation({
        id: "line:IDFM:C01729",
        mode: "rer",
        shortName: "E",
        color: "7c3aed",
        textColor: "ffffff",
      }),
    ).toMatchObject({
      color: "#a0006e",
      textColor: "#ffffff",
    });
  });

  it("keeps an official source color for bus lines", () => {
    expect(
      createLinePresentation({
        family: "BUS",
        id: "line:IDFM:C00004",
        mode: "bus",
        shortName: "483",
        color: "FF5A00",
        textColor: "000000",
      }),
    ).toMatchObject({
      color: "#ff5a00",
      textColor: "#000000",
    });
  });

  it.each([
    ["C01731", "R", "#f49fb3", "#111827"],
    ["C01736", "N", "#00b297", "#ffffff"],
    ["C01737", "H", "#84653d", "#ffffff"],
    ["C01738", "K", "#9b9842", "#ffffff"],
    ["C01740", "L", "#c4a4cc", "#111827"],
    ["C01741", "U", "#b6134c", "#ffffff"],
    ["C02711", "V", "#9f9825", "#ffffff"],
  ] as const)("resolves the official Transilien presentation for %s", (id, label, color, textColor) => {
    expect(
      createLinePresentation({
        id: `line:IDFM:${id}`,
        mode: "train",
        shortName: label,
        color: "2563eb",
        textColor: "ffffff",
      }),
    ).toMatchObject({ color, textColor });
  });
});

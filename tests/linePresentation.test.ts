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
        id: "line:IDFM:C01729",
        mode: "rer",
        shortName: "E",
        color: "b94e9a",
        textColor: "ffffff",
      }),
    ).toMatchObject({
      color: "#b94e9a",
      textColor: "#ffffff",
    });
  });
});

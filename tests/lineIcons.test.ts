import { describe, expect, it } from "vitest";
import { createRatpLineIconUrls } from "../src/services/lineIcons";

describe("official line icon URLs", () => {
  it("prefers the current versioned metro asset", () => {
    expect(
      createRatpLineIconUrls({
        family: "METRO",
        id: "line:IDFM:C01383",
        code: "13",
      })[0],
    ).toBe(
      "https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/metro/picto-ligne-LIGIDFMC01383.1787972729.svg",
    );
  });

  it("prefers the current versioned RER asset", () => {
    expect(
      createRatpLineIconUrls({
        family: "RER",
        id: "line:IDFM:C01743",
        code: "B",
      })[0],
    ).toBe(
      "https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/rer/picto-ligne-LIGIDFMC01743.1787972732.svg",
    );
  });

  it("resolves a provider response that only contains the RER A code", () => {
    expect(
      createRatpLineIconUrls({
        family: "RER",
        code: "A",
      })[0],
    ).toBe(
      "https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/rer/picto-ligne-LIGIDFMC01742.1787972732.svg",
    );
  });

  it("resolves a provider response that only contains the RER C code", () => {
    expect(
      createRatpLineIconUrls({
        family: "RER",
        code: "C",
      })[0],
    ).toBe(
      "https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/rer/picto-ligne-LIGIDFMC01727.1788059132.svg",
    );
  });

  it("uses the canonical IDFM bus pictogram instead of the ambiguous display-number asset", () => {
    expect(
      createRatpLineIconUrls({
        family: "BUS",
        id: "line:IDFM:C00350",
        code: "14",
      })[0],
    ).toBe(
      "https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/bus/picto-ligne-LIGIDFMC00350.svg",
    );
  });

  it("uses the canonical IDFM pictogram for a Noctilien line", () => {
    expect(
      createRatpLineIconUrls({
        family: "NOCTILIEN",
        id: "line:IDFM:C01402",
        code: "N61",
      }),
    ).toContain(
      "https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/bus/picto-ligne-LIGIDFMC01402.svg",
    );
  });

  it("uses the official train asset path for Transilien lines", () => {
    expect(
      createRatpLineIconUrls({
        family: "TRANSILIEN",
        id: "line:IDFM:C01739",
        code: "H",
      }),
    ).toContain(
      "https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/train/picto-ligne-LIGIDFMC01739.svg",
    );
  });

  it("uses the official tramway asset path for tram lines", () => {
    expect(
      createRatpLineIconUrls({
        family: "TRAM",
        id: "line:IDFM:C01389",
        code: "T1",
      }),
    ).toContain(
      "https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/tramway/picto-ligne-LIGIDFMC01389.svg",
    );
  });

  it("resolves the public T10 code to its official IDFM pictogram", () => {
    expect(
      createRatpLineIconUrls({
        family: "TRAM",
        id: "line:tram:T10",
        code: "T10",
      })[0],
    ).toBe(
      "https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/tramway/picto-ligne-LIGIDFMC02528.1787972732.svg",
    );
  });

  it("uses the dedicated official Noctilien asset path", () => {
    expect(
      createRatpLineIconUrls({
        family: "NOCTILIEN",
        id: "line:IDFM:C01807",
        code: "N66",
      }),
    ).toContain(
      "https://www.ratp.fr/sites/default/files/lines-assets/picto/noctilien/picto_noctilien_ligne-n66.1568191656.svg",
    );
  });
});

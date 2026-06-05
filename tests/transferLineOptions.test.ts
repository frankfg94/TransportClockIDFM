import { describe, expect, it } from "vitest";
import {
  createTransferLineOption,
  dedupeTransferLineOptions,
  mergeTransferLineOptionPresentation,
} from "../src/services/transferLineOptions";

describe("transfer line presentation options", () => {
  it("creates colored transfer badges from a single shared mapper", () => {
    const transfer = createTransferLineOption({
      code: "74",
      color: "82c8e6",
      family: "BUS",
      id: "line:IDFM:C01234",
      mode: "Bus",
      textColor: "111827",
    });

    expect(transfer).toMatchObject({
      id: "line:IDFM:C01234",
      label: "74",
      family: "BUS",
      mode: "Bus",
      color: "#82c8e6",
      textColor: "#111827",
    });
  });

  it("removes unresolved duplicate TER badges", () => {
    const transfers = dedupeTransferLineOptions([
      createTransferLineOption({
        code: "TER",
        family: "TRANSILIEN",
        id: "opendata:first-ter",
      }),
      createTransferLineOption({
        code: "TER",
        family: "TRANSILIEN",
        id: "opendata:second-ter",
      }),
    ]);

    expect(transfers.map((transfer) => transfer.label)).toEqual(["TER"]);
  });

  it("keeps different Transilien codes after Navitia enrichment", () => {
    const ter = createTransferLineOption({
      code: "TER",
      family: "TRANSILIEN",
      id: "line:IDFM:C01740",
    });

    const enriched = mergeTransferLineOptionPresentation(ter, {
      code: "L",
      color: "a65a95",
      family: "TRANSILIEN",
      id: "line:IDFM:C01740",
      mode: "LocalTrain",
      textColor: "ffffff",
    });

    expect(enriched).toMatchObject({
      id: "line:IDFM:C01740",
      label: "L",
      family: "TRANSILIEN",
      color: "#a65a95",
      textColor: "#ffffff",
    });
  });
});

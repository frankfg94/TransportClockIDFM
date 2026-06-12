import { describe, expect, it } from "vitest";
import {
  createTransferGroups,
  getTransferFamilyKey,
} from "../src/services/transferGroups";
import type { TransferLineOption } from "../src/types/transit";

describe("transfer groups", () => {
  it("orders transfer families consistently and groups Noctilien with buses", () => {
    const transfers: TransferLineOption[] = [
      { id: "other", label: "Fun", mode: "funicular" },
      { id: "bus", label: "91", family: "BUS" },
      { id: "tram", label: "T3a", family: "TRAM" },
      { id: "train", label: "J", family: "TRANSILIEN" },
      { id: "rer", label: "B", family: "RER" },
      { id: "metro", label: "4", family: "METRO" },
      { id: "night", label: "N01", family: "NOCTILIEN" },
    ];

    const groups = createTransferGroups(transfers);

    expect(groups.map((group) => group.key)).toEqual([
      "METRO",
      "RER",
      "TRANSILIEN",
      "TRAM",
      "BUS",
      "OTHER",
    ]);
    expect(groups.find((group) => group.key === "BUS")?.countLabel).toBe(
      "2 lignes",
    );
    expect(getTransferFamilyKey(transfers[6])).toBe("BUS");
  });
});

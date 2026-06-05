import { describe, expect, it } from "vitest";
import { resolveEffectiveTransferResolverMode } from "../src/features/service-pattern/transferResolverMode";

describe("transfer resolver mode", () => {
  it("keeps nearby for buses and nearby for other lines in auto mode", () => {
    expect(resolveEffectiveTransferResolverMode("auto", "bus")).toBe("nearby");
    expect(resolveEffectiveTransferResolverMode("auto", "metro")).toBe(
      "nearby",
    );
    expect(resolveEffectiveTransferResolverMode("auto", "rer")).toBe(
      "nearby",
    );
    expect(resolveEffectiveTransferResolverMode("auto", "tram")).toBe(
      "nearby",
    );
    expect(resolveEffectiveTransferResolverMode("auto", "train")).toBe(
      "nearby",
    );
  });

  it("honors explicit resolver modes", () => {
    expect(resolveEffectiveTransferResolverMode("nearby", "rer")).toBe("nearby");
    expect(resolveEffectiveTransferResolverMode("nearby", "bus")).toBe(
      "nearby",
    );
  });
});


import { describe, expect, it, vi } from "vitest";
import { ChaosZoomDiagnostics } from "../src/features/line-map/chaosZoomDiagnostics";

describe("Chaos measurement visibility", () => {
  it("flags hidden intervals even when the hidden tab delivers no frames", () => {
    let visibility: DocumentVisibilityState = "visible";
    const getter = vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    let now = 0;
    const diagnostics = new ChaosZoomDiagnostics(0, () => now);
    try {
      now = 10;
      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      now = 1_010;
      visibility = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
      now = 1_100;
      diagnostics.finish();
      now = 5_000;
      const report = diagnostics.stop({}, {});
      expect(report.measurement.hiddenDurationMs).toBe(1_000);
      expect(report.measurement.visibilityChanges).toBe(2);
      expect(report.measurement.foregroundComparable).toBe(false);
    } finally { diagnostics.finish(); getter.mockRestore(); }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportPdf } from "../src/services/pdfExport";
import { buildNeighborhoodScorePdf, downloadNeighborhoodScorePdf, type NeighborhoodScorePdfInput } from "../src/features/nearby-stations/neighborhoodScorePdf";

const native = vi.hoisted(() => ({ platform: vi.fn(), save: vi.fn() }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: native.platform },
  registerPlugin: () => ({ save: native.save }),
}));

const input: NeighborhoodScorePdfInput = {
  title: "Résultats finaux", location: "Adresse de test", scoreLabel: "Score", scoreValue: "7 / 10",
  bandLabel: "Bon", coverageLine: "7 indicateurs", updatedLine: "24/10/2026",
  sections: [{ title: "Transports", items: ["Métro 13 · 01:05 (lendemain)", "Lien https://example.test/private supprimé"] }],
  pageLabel: (current, total) => `${current}/${total}`,
};

beforeEach(() => { native.platform.mockReturnValue("android"); native.save.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("PDF export platform boundary", () => {
  it("passes the actual final document bytes and filename to Android", async () => {
    native.save.mockResolvedValue({ status: "saved", uri: "content://qa/document/1", fileName: "resultats.pdf" });
    await expect(downloadNeighborhoodScorePdf(input, "resultats.pdf")).resolves.toMatchObject({ status: "saved" });
    const request = native.save.mock.calls[0]![0];
    expect(request.fileName).toBe("resultats.pdf");
    const bytes = Uint8Array.from(Buffer.from(request.base64, "base64"));
    expect(bytes).toEqual(buildNeighborhoodScorePdf(input));
    const pdf = new TextDecoder().decode(bytes);
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.endsWith("%%EOF")).toBe(true);
    const rendered = [...pdf.matchAll(/<([0-9a-f]+)> Tj/gi)].map(match => Buffer.from(match[1]!, "hex").toString("latin1")).join(" ");
    expect(rendered).toContain("Transports");
    expect(rendered).not.toContain("https://");
    expect(rendered).not.toContain("example.test");
  });

  it("preserves byte values across multiple base64 chunks", async () => {
    const bytes = new Uint8Array(90_000);
    bytes.set(new TextEncoder().encode("%PDF-"));
    for (let i = 5; i < bytes.length; i++) bytes[i] = i % 256;
    native.save.mockResolvedValue({ status: "saved" });
    await exportPdf(bytes, "large.pdf");
    expect(Uint8Array.from(Buffer.from(native.save.mock.calls[0]![0].base64, "base64"))).toEqual(bytes);
  });

  it("returns cancellation without starting a browser fallback", async () => {
    native.save.mockResolvedValue({ status: "cancelled" });
    const create = vi.spyOn(URL, "createObjectURL");
    await expect(exportPdf(buildNeighborhoodScorePdf(input), "test.pdf")).resolves.toEqual({ status: "cancelled" });
    expect(create).not.toHaveBeenCalled();
  });

  it("propagates native failure for the caller to display and retry", async () => {
    const error = new Error("PDF_WRITE_FAILED");
    native.save.mockRejectedValue(error);
    await expect(exportPdf(buildNeighborhoodScorePdf(input), "test.pdf")).rejects.toBe(error);
  });

  it("rejects a missing native completion status", async () => {
    native.save.mockResolvedValue({});
    await expect(exportPdf(buildNeighborhoodScorePdf(input), "test.pdf")).rejects.toThrow("response");
  });

  it("rejects invalid bytes before launching the Android picker", async () => {
    await expect(exportPdf(new Uint8Array([1, 2, 3]), "test.pdf")).rejects.toThrow("Invalid PDF");
    expect(native.save).not.toHaveBeenCalled();
  });

  it("keeps the web Blob download and releases the URL afterwards", async () => {
    vi.useFakeTimers();
    native.platform.mockReturnValue("web");
    const link = { href: "", download: "", rel: "", click: vi.fn(), remove: vi.fn() };
    const append = vi.fn();
    vi.stubGlobal("document", { createElement: () => link, body: { append } });
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:qa");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    await expect(exportPdf(buildNeighborhoodScorePdf(input), "web.pdf")).resolves.toEqual({ status: "downloaded" });
    expect(create.mock.calls[0]![0]).toMatchObject({ type: "application/pdf" });
    expect(link.download).toBe("web.pdf");
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    expect(native.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(revoke).toHaveBeenCalledWith("blob:qa");
  });
});

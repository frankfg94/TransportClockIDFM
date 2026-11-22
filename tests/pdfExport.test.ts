import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportPdf } from "../src/services/pdfExport";
import { downloadNeighborhoodScorePdf } from "../src/features/nearby-stations/neighborhoodScorePdf";

const native = vi.hoisted(() => ({ platform: vi.fn(), save: vi.fn() }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: native.platform },
  registerPlugin: () => ({ save: native.save }),
}));

const capture = vi.hoisted(() => vi.fn());
vi.mock("html2canvas", () => ({ default: capture }));
const pdfBytes = new TextEncoder().encode("%PDF-1.4\n%%EOF");

beforeEach(() => { native.platform.mockReturnValue("android"); native.save.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("PDF export platform boundary", () => {
  it("passes the captured A4 document in sheet order to Android", async () => {
    native.save.mockResolvedValue({ status: "saved", uri: "content://qa/document/1", fileName: "resultats.pdf" });
    const canvas = { width: 1, height: 1, toDataURL: () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC" };
    capture.mockResolvedValue(canvas);
    const sheets = [{ id: "contents" }, { id: "category" }, { id: "closing" }];
    const root = { querySelectorAll: () => sheets } as unknown as HTMLElement;
    await expect(downloadNeighborhoodScorePdf(root, "resultats.pdf", "Résultats finaux", new AbortController().signal)).resolves.toMatchObject({ status: "saved" });
    expect(capture.mock.calls.map(([sheet]) => sheet)).toEqual(sheets);
    expect(capture.mock.calls[0]?.[1]).toMatchObject({ scale: 2 });
    expect(canvas).toMatchObject({ width: 0, height: 0 });
    const request = native.save.mock.calls[0]![0];
    expect(request.fileName).toBe("resultats.pdf");
    const bytes = Uint8Array.from(Buffer.from(request.base64, "base64"));
    const pdf = new TextDecoder().decode(bytes);
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf.endsWith("%%EOF")).toBe(true);
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(3);
    const size = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf);
    expect(Number(size?.[1])).toBeCloseTo(595.28, 2);
    expect(Number(size?.[2])).toBeCloseTo(841.89, 2);
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
    await expect(exportPdf(pdfBytes, "test.pdf")).resolves.toEqual({ status: "cancelled" });
    expect(create).not.toHaveBeenCalled();
  });

  it("propagates native failure for the caller to display and retry", async () => {
    const error = new Error("PDF_WRITE_FAILED");
    native.save.mockRejectedValue(error);
    await expect(exportPdf(pdfBytes, "test.pdf")).rejects.toBe(error);
  });

  it("rejects a missing native completion status", async () => {
    native.save.mockResolvedValue({});
    await expect(exportPdf(pdfBytes, "test.pdf")).rejects.toThrow("response");
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
    await expect(exportPdf(pdfBytes, "web.pdf")).resolves.toEqual({ status: "downloaded" });
    expect(create.mock.calls[0]![0]).toMatchObject({ type: "application/pdf" });
    expect(link.download).toBe("web.pdf");
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    expect(native.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(revoke).toHaveBeenCalledWith("blob:qa");
  });
});

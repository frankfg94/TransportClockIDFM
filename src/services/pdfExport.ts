import { Capacitor, registerPlugin } from "@capacitor/core";

export type PdfExportResult =
  | { status: "saved"; uri?: string; fileName?: string }
  | { status: "cancelled" }
  | { status: "downloaded" };

interface NativePdfExportPlugin {
  save(options: { base64: string; fileName: string }): Promise<Exclude<PdfExportResult, { status: "downloaded" }>>;
}

const NativePdfExport = registerPlugin<NativePdfExportPlugin>("PdfExport");

/** One platform boundary for already-generated PDF bytes; no document logic. */
export async function exportPdf(bytes: Uint8Array, fileName: string): Promise<PdfExportResult> {
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") throw new Error("Invalid PDF bytes");
  if (Capacitor.getPlatform() === "android") {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    }
    const result = await NativePdfExport.save({ base64: btoa(binary), fileName });
    if (result?.status !== "saved" && result?.status !== "cancelled") throw new Error("Invalid PDF export response");
    return result;
  }
  if (typeof document === "undefined" || typeof URL === "undefined") throw new Error("PDF download is unavailable");
  const objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" }));
  const link = document.createElement("a");
  try {
    link.href = objectUrl;
    link.download = fileName;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Let the browser consume the Blob before releasing it.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }
  return { status: "downloaded" };
}

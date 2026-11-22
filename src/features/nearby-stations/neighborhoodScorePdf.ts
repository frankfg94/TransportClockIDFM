import { exportPdf, type PdfExportResult } from "../../services/pdfExport";

export interface NeighborhoodScorePdfSection {
  title: string;
  subtitle?: string;
  items: readonly string[];
}

export interface NearbyRealEstatePdfState {
  loading: boolean;
  section?: NeighborhoodScorePdfSection;
  market?: { status: "ready" | "loading" | "missing" | "stale" | "error"; rentStatus: "ready" | "loading" | "missing" | "error"; historyStatus?: "ready" | "missing"; typeStatus?: "missing"; durationMs?: number; coverage?: "neighborhood" | "city" | "undivided-city" };
}

export type NearbyTrafficPdfState = NearbyRealEstatePdfState;

export async function downloadNeighborhoodScorePdf(
  root: HTMLElement,
  fileName: string,
  title: string,
  signal: AbortSignal,
): Promise<PdfExportResult> {
  const sheets = Array.from(root.querySelectorAll<HTMLElement>("[data-verdict-pdf-sheet]"));
  if (!sheets.length) throw new Error("Verdict PDF has no pages");
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true, putOnlyUsedFonts: true });
  pdf.setProperties({ title, creator: "TransportClock" });
  for (const [index, sheet] of sheets.entries()) {
    signal.throwIfAborted();
    const canvas = await html2canvas(sheet, {
      backgroundColor: "#ffffff",
      logging: false,
      scale: 2,
      windowWidth: 1000,
      windowHeight: 1200,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: element => (
        element.parentElement === document.body && element !== root
        && element.tagName !== "STYLE" && element.tagName !== "LINK"
      ) || (element.parentElement === root && element !== sheet.parentElement),
      onclone: (_, clonedSheet) => {
        // Lay the current page at the origin in the capture iframe.
        Object.assign(clonedSheet.closest<HTMLElement>(".verdict-pdf")!.style, {
          position: "absolute", inset: "0 auto auto 0",
        });
      },
    });
    try {
      if (index > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0,
        pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
    } finally {
      canvas.width = canvas.height = 0;
    }
  }
  signal.throwIfAborted();
  return exportPdf(new Uint8Array(pdf.output("arraybuffer")), fileName);
}

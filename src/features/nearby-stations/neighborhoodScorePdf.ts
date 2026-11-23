import { toServerApiUrl } from "../../services/serverApi";
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
  // Embed RATP pictograms through our same-origin proxy because RATP does not
  // expose CORS headers. Pictograms are optional: exports must still work when
  // the third-party asset or proxy is unavailable.
  const embeddedIcons = new Map<string, Promise<string>>();
  const iconData = new Map<string, string>();
  const externalIconSources = new Set<string>();
  await Promise.all(Array.from(root.querySelectorAll<HTMLImageElement>(".line-icon-badge img")).map(async image => {
    const source = image.currentSrc || image.src;
    const url = new URL(source, location.href);
    if (url.origin === location.origin) return;
    const attributeSource = image.getAttribute("src") ?? source;
    externalIconSources.add(source);
    externalIconSources.add(attributeSource);
    if (url.hostname !== "www.ratp.fr") return;
    let embedded = embeddedIcons.get(source);
    if (!embedded) {
      embedded = (async () => {
        const response = await fetch(toServerApiUrl(`/api/verdict-line-icon?url=${encodeURIComponent(source)}`), { signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]) });
        if (!response.ok) throw new Error("Official line pictogram unavailable");
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await response.text())}`;
        const logo = new Image();
        logo.src = dataUrl;
        await logo.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 184; canvas.height = 104;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Line pictogram rasterization unavailable");
        const scale = Math.min(canvas.width / logo.naturalWidth, canvas.height / logo.naturalHeight);
        const width = logo.naturalWidth * scale; const height = logo.naturalHeight * scale;
        context.drawImage(logo, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        return canvas.toDataURL("image/png");
      })();
      embeddedIcons.set(source, embedded);
    }
    try {
      const data = await embedded;
      iconData.set(source, data);
      iconData.set(attributeSource, data);
    } catch {
      signal.throwIfAborted();
      // The clone receives a text badge below when this optional icon failed.
    }
  }));
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
        for (const image of clonedSheet.querySelectorAll<HTMLImageElement>(".line-icon-badge img")) {
          const attributeSource = image.getAttribute("src") ?? "";
          const source = image.currentSrc || image.src || attributeSource;
          const embedded = iconData.get(attributeSource) ?? iconData.get(source);
          if (embedded) {
            image.setAttribute("src", embedded);
          } else if (externalIconSources.has(attributeSource) || externalIconSources.has(source)) {
            const fallback = image.ownerDocument.createElement("span");
            fallback.className = "line-icon-badge__fallback";
            fallback.setAttribute("role", "img");
            const label = image.alt.replace(/^\s*(?:ligne|line)\s+/iu, "").trim() || "?";
            fallback.setAttribute("aria-label", image.alt || label);
            fallback.textContent = label;
            Object.assign(fallback.style, {
              alignItems: "center", background: "#eef0f7", border: "1px solid #d5dae6",
              borderRadius: "5px", boxSizing: "border-box", color: "#202240", display: "inline-flex",
              fontFamily: "Arial, sans-serif", fontSize: "10px", fontWeight: "700", height: "22px",
              justifyContent: "center", lineHeight: "1", maxWidth: "58px", minWidth: label.length > 2 ? "34px" : "28px",
              overflow: "hidden", padding: "0 4px", whiteSpace: "nowrap",
            });
            image.replaceWith(fallback);
          }
        }
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

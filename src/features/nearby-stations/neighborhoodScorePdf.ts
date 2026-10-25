import { exportPdf, type PdfExportResult } from "../../services/pdfExport";

export interface NeighborhoodScorePdfSection {
  title: string;
  value?: string;
  subtitle?: string;
  items: readonly string[];
}

export interface NearbyRealEstatePdfState {
  loading: boolean;
  section?: NeighborhoodScorePdfSection;
}

export type NearbyTrafficPdfState = NearbyRealEstatePdfState;

export interface NeighborhoodScorePdfInput {
  title: string;
  location?: string;
  scoreLabel: string;
  scoreValue: string;
  bandLabel: string;
  coverageLine: string;
  updatedLine: string;
  sections: readonly NeighborhoodScorePdfSection[];
  pageLabel: (current: number, total: number) => string;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 46;
const BOTTOM_LIMIT = 58;

type PdfPage = { commands: string[]; y: number };

const winAnsiSpecialCharacters: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86,
  "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
  "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95,
  "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f, " ": 0xa0, "·": 0xb7,
};

function cleanText(value: string): string {
  return value
    .replace(/(?:https?|file|capacitor):\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function toWinAnsiBytes(value: string): number[] {
  const bytes: number[] = [];
  for (const character of cleanText(value)) {
    const special = winAnsiSpecialCharacters[character];
    if (special !== undefined) {
      bytes.push(special);
      continue;
    }

    const codePoint = character.codePointAt(0) ?? 0x20;
    if (codePoint >= 0x20 && codePoint <= 0x7e || codePoint >= 0xa1 && codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }

    const replacement = character.normalize("NFKD").replace(/\p{M}/gu, "");
    if (replacement !== character) {
      for (const fallback of replacement) {
        const fallbackCodePoint = fallback.codePointAt(0) ?? 0x20;
        bytes.push(fallbackCodePoint >= 0x20 && fallbackCodePoint <= 0x7e ? fallbackCodePoint : 0x20);
      }
    } else if (/\s/u.test(character)) {
      bytes.push(0x20);
    } else {
      bytes.push(0x20);
    }
  }
  return bytes;
}

function pdfHexText(value: string): string {
  return `<${toWinAnsiBytes(value).map(byte => byte.toString(16).padStart(2, "0")).join("")}>`;
}

function wrapText(value: string, maxCharacters: number): string[] {
  const text = cleanText(value);
  if (!text) return [];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > maxCharacters) {
      if (line) lines.push(line);
      line = "";
      for (let offset = 0; offset < word.length; offset += maxCharacters) {
        const chunk = word.slice(offset, offset + maxCharacters);
        if (chunk.length === maxCharacters) lines.push(chunk);
        else line = chunk;
      }
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxCharacters && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textCommand(
  value: string,
  x: number,
  y: number,
  size: number,
  bold: boolean,
  color = "0.16 0.20 0.29",
): string {
  return `BT ${color} rg /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ${pdfHexText(value)} Tj ET`;
}

function wrapLimit(size: number, indent: number): number {
  return Math.max(24, Math.floor((PAGE_WIDTH - PAGE_MARGIN * 2 - indent) / (size * 0.52)));
}

export function buildNeighborhoodScorePdf(input: NeighborhoodScorePdfInput): Uint8Array {
  const pages: PdfPage[] = [];
  let page: PdfPage = { commands: [], y: 0 };

  const startPage = (continuation: boolean): void => {
    page = { commands: [], y: PAGE_HEIGHT - PAGE_MARGIN };
    pages.push(page);
    if (continuation) {
      page.commands.push(textCommand(input.title, PAGE_MARGIN, page.y, 12, true, "0.32 0.27 0.86"));
      page.y -= 19;
      if (input.location) {
        page.commands.push(textCommand(input.location, PAGE_MARGIN, page.y, 9, false, "0.38 0.43 0.52"));
        page.y -= 15;
      }
      page.commands.push(`${PAGE_MARGIN} ${page.y.toFixed(2)} m ${(PAGE_WIDTH - PAGE_MARGIN).toFixed(2)} ${page.y.toFixed(2)} l 0.82 0.85 0.90 RG S`);
      page.y -= 18;
    }
  };

  const ensureRoom = (height: number): void => {
    if (page.y - height < BOTTOM_LIMIT) startPage(true);
  };

  const addParagraph = (value: string, options: {
    size: number;
    bold?: boolean;
    indent?: number;
    color?: string;
    gapAfter?: number;
    lineHeight?: number;
  }): void => {
    const indent = options.indent ?? 0;
    const lineHeight = options.lineHeight ?? options.size * 1.42;
    const lines = wrapText(value, wrapLimit(options.size, indent));
    for (const line of lines) {
      ensureRoom(lineHeight);
      page.y -= lineHeight;
      page.commands.push(textCommand(line, PAGE_MARGIN + indent, page.y, options.size, Boolean(options.bold), options.color));
    }
    page.y -= options.gapAfter ?? 0;
  };

  startPage(false);
  addParagraph(input.title, { size: 23, bold: true, color: "0.12 0.16 0.25", lineHeight: 29, gapAfter: 4 });
  if (input.location) addParagraph(input.location, { size: 11, bold: true, color: "0.31 0.35 0.43", gapAfter: 12 });
  page.commands.push(`${PAGE_MARGIN} ${page.y.toFixed(2)} m ${(PAGE_WIDTH - PAGE_MARGIN).toFixed(2)} ${page.y.toFixed(2)} l 0.80 0.82 0.92 RG S`);
  page.y -= 20;
  addParagraph(input.scoreLabel.toUpperCase(), { size: 8, bold: true, color: "0.32 0.27 0.86", gapAfter: 2 });
  addParagraph(input.scoreValue, { size: 25, bold: true, color: "0.12 0.16 0.25", lineHeight: 31, gapAfter: 1 });
  addParagraph(input.bandLabel, { size: 12, bold: true, color: "0.32 0.27 0.86", gapAfter: 4 });
  addParagraph(input.coverageLine, { size: 9, color: "0.38 0.43 0.52", gapAfter: 2 });
  addParagraph(input.updatedLine, { size: 8, color: "0.45 0.49 0.57", gapAfter: 13 });

  for (const section of input.sections) {
    ensureRoom(58);
    page.commands.push(`${PAGE_MARGIN} ${(page.y - 2).toFixed(2)} m ${(PAGE_WIDTH - PAGE_MARGIN).toFixed(2)} ${(page.y - 2).toFixed(2)} l 0.88 0.90 0.94 RG S`);
    page.y -= 18;
    addParagraph(section.title, { size: 12, bold: true, color: "0.12 0.16 0.25", gapAfter: 2 });
    if (section.value) addParagraph(section.value, { size: 9, bold: true, color: "0.32 0.27 0.86", gapAfter: 2 });
    if (section.subtitle) addParagraph(section.subtitle, { size: 9, color: "0.38 0.43 0.52", gapAfter: 2 });
    if (section.items.length) {
      for (const item of section.items) {
        addParagraph(`• ${item}`, { size: 9, indent: 8, color: "0.25 0.29 0.37", lineHeight: 12.5, gapAfter: 1 });
      }
    }
    page.y -= 7;
  }

  const totalPages = pages.length;
  pages.forEach((pdfPage, index) => {
    const footer = input.pageLabel(index + 1, totalPages);
    pdfPage.commands.push(textCommand(footer, PAGE_MARGIN, 28, 8, false, "0.45 0.49 0.57"));
  });

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  const pageObjectIds: number[] = [];
  pages.forEach((pdfPage, index) => {
    const contentId = 5 + index * 2;
    const pageId = contentId + 1;
    const stream = pdfPage.commands.join("\n");
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageObjectIds.push(pageId);
  });
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  let documentText = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = documentText.length;
    documentText += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = documentText.length;
  documentText += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    documentText += `${offsets[id].toString().padStart(10, "0")} 00000 n \n`;
  }
  documentText += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(documentText);
}

export function downloadNeighborhoodScorePdf(input: NeighborhoodScorePdfInput, fileName: string): Promise<PdfExportResult> {
  return exportPdf(buildNeighborhoodScorePdf(input), fileName);
}

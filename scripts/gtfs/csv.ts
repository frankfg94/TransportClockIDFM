import { createReadStream } from "node:fs";

export type CsvRow = Record<string, string>;

export async function readCsv(path: string, onRow: (row: CsvRow) => void): Promise<void> {
  const input = createReadStream(path, { encoding: "utf8" });
  let headers: string[] | undefined;
  let buffered = "";
  for await (const chunk of input) {
    buffered += chunk;
    let newline = buffered.indexOf("\n");
    while (newline >= 0) {
      const line = buffered.slice(0, newline).replace(/\r$/u, "");
      buffered = buffered.slice(newline + 1);
      const fields = parseCsvLine(line);
      if (!headers) headers = fields.map((field) => field.replace(/^\uFEFF/u, "").trim());
      else if (fields.some(Boolean))
        onRow(Object.fromEntries(headers.map((header, index) => [header, fields[index] || ""])));
      newline = buffered.indexOf("\n");
    }
  }
  if (buffered.trim() && headers) {
    const fields = parseCsvLine(buffered.replace(/\r$/u, ""));
    onRow(Object.fromEntries(headers.map((header, index) => [header, fields[index] || ""])));
  }
}

export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      fields.push(field);
      field = "";
    } else field += char;
  }
  fields.push(field);
  return fields;
}

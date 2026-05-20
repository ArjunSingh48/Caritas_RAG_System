import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ColumnType = "number" | "date" | "string";

export interface ParsedColumn {
  name: string;
  type: ColumnType;
}

export interface ParsedFile {
  name: string;
  size: number;
  rows: number;
  columns: ParsedColumn[];
  data: Record<string, unknown>[];
}

const MAX_ROWS = 1000;

function inferType(values: unknown[]): ColumnType {
  let nNum = 0;
  let nDate = 0;
  let nNonEmpty = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    nNonEmpty++;
    const s = String(v).trim();
    if (s === "") continue;
    if (!isNaN(Number(s)) && /^-?\d+(\.\d+)?$/.test(s)) {
      nNum++;
      continue;
    }
    const d = Date.parse(s);
    if (!isNaN(d) && /\d{4}|-|\//.test(s)) {
      nDate++;
    }
  }
  if (nNonEmpty === 0) return "string";
  if (nNum / nNonEmpty > 0.8) return "number";
  if (nDate / nNonEmpty > 0.8) return "date";
  return "string";
}

function buildColumns(data: Record<string, unknown>[]): ParsedColumn[] {
  if (data.length === 0) return [];
  const names = Object.keys(data[0]);
  return names.map((name) => ({
    name,
    type: inferType(data.slice(0, 100).map((r) => r[name])),
  }));
}

async function parseCsv(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (res) => resolve(res.data),
      error: (err) => reject(err),
    });
  });
}

async function parseXlsx(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const lower = file.name.toLowerCase();
  let data: Record<string, unknown>[];
  if (lower.endsWith(".csv")) {
    data = await parseCsv(file);
  } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    data = await parseXlsx(file);
  } else {
    throw new Error("Unsupported file type");
  }
  const total = data.length;
  const truncated = data.slice(0, MAX_ROWS);
  return {
    name: file.name,
    size: file.size,
    rows: total,
    columns: buildColumns(truncated),
    data: truncated,
  };
}

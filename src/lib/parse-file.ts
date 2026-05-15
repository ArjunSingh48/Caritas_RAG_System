import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ColumnType = "number" | "date" | "string";

export interface ParsedColumn {
  name: string;
  type: ColumnType;
}

export interface ParsedSheet {
  name: string;
  rows: number;
  columns: ParsedColumn[];
  data: Record<string, unknown>[];
}

export interface ParsedFile {
  name: string;
  size: number;
  // Aggregate row count across all sheets (or single sheet for CSV).
  rows: number;
  // Convenience pointers to the first sheet (back-compat with existing UI).
  columns: ParsedColumn[];
  data: Record<string, unknown>[];
  // All parsed sheets — for xlsx this contains every sheet, for csv exactly one.
  sheets: ParsedSheet[];
  // Original File reference, used to upload raw bytes to backend.
  file?: File;
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

function buildSheet(name: string, data: Record<string, unknown>[]): ParsedSheet {
  const total = data.length;
  const truncated = data.slice(0, MAX_ROWS);
  return {
    name,
    rows: total,
    columns: buildColumns(truncated),
    data: truncated,
  };
}

async function parseCsv(file: File): Promise<ParsedSheet[]> {
  const data = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (res) => resolve(res.data),
      error: (err) => reject(err),
    });
  });
  return [buildSheet(file.name.replace(/\.csv$/i, ""), data)];
}

async function parseXlsx(file: File): Promise<ParsedSheet[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  return wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    return buildSheet(name, data);
  });
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const lower = file.name.toLowerCase();
  let sheets: ParsedSheet[];
  if (lower.endsWith(".csv")) {
    sheets = await parseCsv(file);
  } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    sheets = await parseXlsx(file);
  } else {
    throw new Error("Unsupported file type");
  }
  const first = sheets[0] ?? { name: "Sheet1", rows: 0, columns: [], data: [] };
  const totalRows = sheets.reduce((acc, s) => acc + s.rows, 0);
  return {
    name: file.name,
    size: file.size,
    rows: totalRows,
    columns: first.columns,
    data: first.data,
    sheets,
    file,
  };
}

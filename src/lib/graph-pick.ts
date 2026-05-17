import type { ParsedColumn } from "@/lib/parse-file";

export type GraphKind = "line" | "bar" | "pie" | "scatter" | "histogram";

export interface GraphSpec {
  kind: GraphKind;
  x: string;
  y: string;
  title: string;
}

const TIME = /\b(time|trend|trends|over time|monthly|yearly|annually|annual|quarterly|daily|weekly|growth|history|historical|evolv(e|ed|ing|ution)|change[sd]?|progress(ion)?|year[\s-]?over[\s-]?year|from \d{4}|to \d{4}|since \d{4}|by year|by month|by quarter|per year|per month)\b/i;
const COMPARE = /\b(compare|comparison|vs|versus|by region|by category|by group|by project|by country|by donor|ranking|rank(ed)?|top \d+|bottom \d+|which|highest|lowest)\b/i;
const SHARE = /\b(share|percentage|percent|breakdown|composition|split|proportion|distribution of|allocation)\b/i;
const RELATION = /\b(relationship|correlation|correlate|scatter|vs\.?)\b/i;
const DIST = /\b(distribution|spread|histogram|frequency|range)\b/i;

// Column-name heuristics for time / category axes (independent of pandas dtype).
const TIME_NAME = /\b(year|fiscal[_-]?year|fy|date|month|quarter|qtr|day|week|period|timestamp)\b/i;
const CATEGORY_NAME = /\b(name|category|type|region|country|donor|project|sector|department|status|group)\b/i;

function isTimeColumn(c: ParsedColumn): boolean {
  return c.type === "date" || TIME_NAME.test(c.name);
}

function isCategoryColumn(c: ParsedColumn): boolean {
  return c.type === "string" || CATEGORY_NAME.test(c.name);
}

export function pickGraph(query: string, columns: ParsedColumn[]): GraphSpec {
  if (!columns.length) {
    return { kind: "bar", x: "name", y: "value", title: query.slice(0, 60) || "Result" };
  }

  // Decide kind from intent first; default depends on whether we have a time column.
  const hasTimeCol = columns.some(isTimeColumn);
  let kind: GraphKind = hasTimeCol ? "line" : "bar";
  if (TIME.test(query)) kind = "line";
  else if (SHARE.test(query)) kind = "pie";
  else if (RELATION.test(query)) kind = "scatter";
  else if (DIST.test(query)) kind = "histogram";
  else if (COMPARE.test(query)) kind = "bar";

  // Pick X: prefer a time column for line charts, otherwise a category column,
  // otherwise the first column.
  const timeCol = columns.find(isTimeColumn);
  const catCol = columns.find(isCategoryColumn);
  let xName: string;
  if (kind === "line" && timeCol) xName = timeCol.name;
  else if (catCol) xName = catCol.name;
  else if (timeCol) xName = timeCol.name;
  else xName = columns[0].name;

  // Pick Y: prefer a numeric column that is NOT the X column. If the query
  // mentions any column name, prefer that one.
  const numericCandidates = columns.filter((c) => c.type === "number" && c.name !== xName);
  const queryLower = query.toLowerCase();
  const mentioned = numericCandidates.find((c) =>
    queryLower.includes(c.name.toLowerCase().replace(/_/g, " ")) ||
    queryLower.includes(c.name.toLowerCase())
  );
  const yCol =
    mentioned?.name ??
    numericCandidates[0]?.name ??
    columns.find((c) => c.name !== xName)?.name ??
    columns[0].name;

  // Scatter needs two numeric axes.
  let xFinal = xName;
  if (kind === "scatter") {
    const nums = columns.filter((c) => c.type === "number");
    if (nums.length >= 2) {
      xFinal = nums[0].name;
    }
  }

  return { kind, x: xFinal, y: yCol, title: query.slice(0, 60) || "Result" };
}

export function pickMultipleGraphs(query: string, columns: ParsedColumn[]): GraphSpec[] {
  const matches: GraphKind[] = [];
  if (TIME.test(query)) matches.push("line");
  if (COMPARE.test(query)) matches.push("bar");
  if (SHARE.test(query)) matches.push("pie");
  if (RELATION.test(query)) matches.push("scatter");
  if (DIST.test(query)) matches.push("histogram");
  if (matches.length < 2) return [pickGraph(query, columns)];
  const base = pickGraph(query, columns);
  return matches.map((kind) => ({ ...base, kind }));
}

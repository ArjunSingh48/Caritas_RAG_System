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
// ID-like columns are rarely meaningful as axes — skip when better options exist.
const ID_NAME = /\b(id|uuid|guid|index|idx|key|code)$/i;

function isIdColumn(c: ParsedColumn): boolean {
  return ID_NAME.test(c.name);
}

function isTimeColumn(c: ParsedColumn): boolean {
  return c.type === "date" || TIME_NAME.test(c.name);
}

function isCategoryColumn(c: ParsedColumn): boolean {
  return (c.type === "string" || CATEGORY_NAME.test(c.name)) && !isIdColumn(c);
}

function scoreNumericColumn(queryLower: string, name: string): number {
  const normalized = name.toLowerCase().replace(/_/g, " ");
  let score = 0;
  if (queryLower.includes(normalized) || queryLower.includes(name.toLowerCase())) score += 12;
  if (/funding gap/.test(queryLower) && /funding[_\s-]?gap/.test(normalized)) score += 10;
  if (/(share|percentage|percent|breakdown|split|proportion)/.test(queryLower) && /(share|percent|pct)/.test(normalized)) score += 10;
  if (/(rate|success rate)/.test(queryLower) && /(rate|pct|percent)/.test(normalized)) score += 10;
  if (/ratio/.test(queryLower) && /(ratio|pct|percent)/.test(normalized)) score += 10;
  if (/cumulative/.test(queryLower) && /cumulative/.test(normalized)) score += 10;
  if (/average|avg/.test(queryLower) && /avg|average/.test(normalized)) score += 8;
  if (/income/.test(queryLower) && /income/.test(normalized)) score += 6;
  if (/cost/.test(queryLower) && /cost/.test(normalized)) score += 6;
  if (/approved/.test(queryLower) && /approved/.test(normalized)) score += 6;
  return score;
}

export function pickGraph(query: string, columns: ParsedColumn[]): GraphSpec {
  if (!columns.length) {
    return { kind: "bar", x: "name", y: "value", title: query.slice(0, 60) || "Result" };
  }

  // Decide kind from intent first; default depends on whether we have a time column.
  const hasTimeCol = columns.some(isTimeColumn);
  const hasCatCol = columns.some(isCategoryColumn);
  const numericColCount = columns.filter((c) => c.type === "number" && !isIdColumn(c)).length;
  let kind: GraphKind = hasTimeCol ? "line" : "bar";
  if (TIME.test(query)) kind = "line";
  else if (SHARE.test(query) && hasCatCol) kind = "pie"; // pie only makes sense with a category split
  else if (COMPARE.test(query)) kind = hasTimeCol && !hasCatCol ? "line" : "bar";
  else if (DIST.test(query)) kind = "histogram";
  // Scatter only when there is no category axis AND we have 2+ numeric columns.
  // Otherwise a bare "vs" in the query (e.g. "Staff Costs vs Partner Costs by region")
  // should stay a grouped bar chart, not a scatter plot.
  else if (RELATION.test(query) && !hasCatCol && numericColCount >= 2) kind = "scatter";

  // Pick X: prefer a time column for line charts, otherwise a category column,
  // otherwise the first non-ID column.
  const timeCol = columns.find(isTimeColumn);
  const catCol = columns.find(isCategoryColumn);
  const firstUseful = columns.find((c) => !isIdColumn(c)) ?? columns[0];
  let xName: string;
  if (kind === "line" && timeCol) xName = timeCol.name;
  else if (kind === "pie" && catCol) xName = catCol.name;
  else if (kind === "bar" && catCol) xName = catCol.name;
  else if (catCol) xName = catCol.name;
  else if (timeCol) xName = timeCol.name;
  else xName = firstUseful.name;

  // Pick Y: prefer a numeric, non-ID column not used as X. If the query
  // mentions any column name, prefer that one.
  const numericCandidates = columns.filter(
    (c) => c.type === "number" && c.name !== xName && !isIdColumn(c),
  );
  const queryLower = query.toLowerCase();
  const rankedNumeric = [...numericCandidates].sort(
    (a, b) => scoreNumericColumn(queryLower, b.name) - scoreNumericColumn(queryLower, a.name),
  );
  const mentioned = rankedNumeric.find((c) => scoreNumericColumn(queryLower, c.name) > 0);
  const yCol =
    mentioned?.name ??
    rankedNumeric[0]?.name ??
    columns.find((c) => c.name !== xName && !isIdColumn(c))?.name ??
    columns[0].name;

  // Scatter needs two numeric axes (skip IDs).
  let xFinal = xName;
  if (kind === "scatter") {
    const nums = columns.filter((c) => c.type === "number" && !isIdColumn(c));
    if (nums.length >= 2) {
      xFinal = nums.find((c) => c.name !== yCol)?.name ?? nums[0].name;
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

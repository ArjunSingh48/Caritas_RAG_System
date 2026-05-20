import type { ParsedColumn } from "@/lib/parse-file";

export type GraphKind = "line" | "bar" | "pie" | "scatter" | "histogram";

export interface GraphSpec {
  kind: GraphKind;
  x: string;
  y: string;
  title: string;
}

const TIME = /\b(time|trend|over time|monthly|yearly|daily|weekly|growth|history)\b/i;
const COMPARE = /\b(compare|vs|versus|by region|by category|by group|ranking|top|bottom)\b/i;
const SHARE = /\b(share|percentage|percent|breakdown|composition|split|proportion)\b/i;
const RELATION = /\b(relationship|correlation|correlate|scatter|vs\.?)\b/i;
const DIST = /\b(distribution|spread|histogram|frequency|range)\b/i;

export function pickGraph(query: string, columns: ParsedColumn[]): GraphSpec {
  const numeric = columns.filter((c) => c.type === "number");
  const dateCol = columns.find((c) => c.type === "date");
  const stringCol = columns.find((c) => c.type === "string");

  const yCol = numeric[0]?.name ?? columns[1]?.name ?? "value";
  const xString = stringCol?.name ?? columns[0]?.name ?? "name";
  const xDate = dateCol?.name ?? xString;

  let kind: GraphKind = "bar";
  if (TIME.test(query)) kind = "line";
  else if (SHARE.test(query)) kind = "pie";
  else if (RELATION.test(query)) kind = "scatter";
  else if (DIST.test(query)) kind = "histogram";
  else if (COMPARE.test(query)) kind = "bar";

  const x = kind === "line" ? xDate : xString;
  return { kind, x, y: yCol, title: query.slice(0, 60) || "Result" };
}

export function pickMultipleGraphs(query: string, columns: ParsedColumn[]): GraphSpec[] {
  const matches: GraphKind[] = [];
  if (TIME.test(query)) matches.push("line");
  if (COMPARE.test(query)) matches.push("bar");
  if (SHARE.test(query)) matches.push("pie");
  if (RELATION.test(query)) matches.push("scatter");
  if (DIST.test(query)) matches.push("histogram");
  if (matches.length < 2) return [pickGraph(query, columns)];
  return matches.map((kind) => ({ ...pickGraph(query, columns), kind }));
}

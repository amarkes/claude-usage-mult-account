import * as fs from "fs/promises";
import type { StatsCacheTotals } from "./types";

export async function readStatsCache(
  statsCachePath: string
): Promise<StatsCacheTotals | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(statsCachePath, "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      totalCostUsd: numberField(parsed, [
        "totalCostUSD",
        "total_cost_usd",
        "totalCostUsd",
      ]),
      totalInputTokens: numberField(parsed, [
        "totalInputTokens",
        "total_input_tokens",
      ]),
      totalOutputTokens: numberField(parsed, [
        "totalOutputTokens",
        "total_output_tokens",
      ]),
      raw: parsed,
    };
  } catch {
    return undefined;
  }
}

function numberField(
  obj: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number") {
      return v;
    }
  }
  return undefined;
}

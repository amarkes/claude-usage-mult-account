import * as fs from "fs/promises";
import type { ClaudeUsageSnapshot, ClaudeUsageData } from "./types";
import { normalizeUtilization } from "./utilization";

interface StatusCacheFile {
  version?: number;
  updatedAt?: string;
  usageData?: ClaudeUsageData & {
    utilization5h?: number;
    utilization7d?: number;
  };
}

export async function readStatusCache(
  cachePath: string
): Promise<ClaudeUsageSnapshot | null> {
  let raw: string;
  try {
    raw = await fs.readFile(cachePath, "utf8");
  } catch {
    return null;
  }

  let parsed: StatusCacheFile;
  try {
    parsed = JSON.parse(raw) as StatusCacheFile;
  } catch {
    return null;
  }

  const u = parsed.usageData;
  if (
    !u ||
    typeof u.utilization5h !== "number" ||
    typeof u.utilization7d !== "number"
  ) {
    return null;
  }

  const data: ClaudeUsageData = {
    utilization5h: normalizeUtilization(u.utilization5h),
    utilization7d: normalizeUtilization(u.utilization7d),
    reset5hAt: u.reset5hAt,
    reset7dAt: u.reset7dAt,
    limitStatus: u.limitStatus,
    quotaFromExtraOnly: u.quotaFromExtraOnly,
    sevenDaySonnet: u.sevenDaySonnet
      ? {
          utilization: normalizeUtilization(u.sevenDaySonnet.utilization),
          resetsAt: u.sevenDaySonnet.resetsAt,
        }
      : undefined,
    extraUsage: u.extraUsage
      ? {
          ...u.extraUsage,
          utilization:
            u.extraUsage.utilization !== undefined
              ? normalizeUtilization(u.extraUsage.utilization)
              : undefined,
        }
      : undefined,
  };

  return {
    source: "cache",
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    cachePath,
    data,
  };
}

export function cacheAgeMinutes(updatedAt: string): number {
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) {
    return 0;
  }
  return Math.round((Date.now() - t) / 60_000);
}

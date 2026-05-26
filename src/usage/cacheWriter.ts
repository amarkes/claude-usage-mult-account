import * as fs from "fs/promises";
import type { ClaudeUsageData } from "./types";

interface StatusCacheFile {
  version: number;
  updatedAt: string;
  usageData: ClaudeUsageData & {
    utilization5h: number;
    utilization7d: number;
  };
}

export async function writeStatusCache(
  cachePath: string,
  data: ClaudeUsageData
): Promise<void> {
  const payload: StatusCacheFile = {
    version: 2,
    updatedAt: new Date().toISOString(),
    usageData: {
      ...data,
      utilization5h: data.utilization5h,
      utilization7d: data.utilization7d,
    },
  };
  const dir = cachePath.replace(/\/[^/]+$/, "");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(payload, null, 2), "utf8");
}

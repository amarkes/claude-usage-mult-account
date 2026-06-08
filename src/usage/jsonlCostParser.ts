import * as fs from "fs/promises";
import * as path from "path";
import type {
  CostSummary,
  DailyCostRow,
  ModelUsageRow,
  TokenTotals,
} from "./types";
import { formatModelDisplayName, modelGroupKey } from "./modelNames";
import { costFromUsage } from "./pricing";
import { projectPathMatchesWorkspace } from "./paths";

interface UsageBlock {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface JsonlEvent {
  type?: string;
  timestamp?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: UsageBlock;
    costUSD?: number;
  };
  costUSD?: number;
}

function emptyTokens(): TokenTotals {
  return { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
}

function addTokens(target: TokenTotals, usage: UsageBlock): void {
  target.input += usage.input_tokens ?? 0;
  target.output += usage.output_tokens ?? 0;
  target.cacheCreation += usage.cache_creation_input_tokens ?? 0;
  target.cacheRead += usage.cache_read_input_tokens ?? 0;
}

function dateKey(iso?: string): string {
  if (!iso) {
    return new Date().toISOString().slice(0, 10);
  }
  return iso.slice(0, 10);
}

async function collectJsonlFiles(
  roots: string[],
  workspacePath?: string,
  workspaceOnly?: boolean,
  days = 7
): Promise<string[]> {
  const files: string[] = [];
  const cutoff = Date.now() - (days + 1) * 24 * 60 * 60 * 1000;

  async function walk(dir: string, projectName: string): Promise<void> {
    if (workspaceOnly && workspacePath && !projectPathMatchesWorkspace(projectName, workspacePath)) {
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "subagents") {
          continue;
        }
        await walk(full, projectName);
      } else if (e.isFile() && e.name.endsWith(".jsonl")) {
        try {
          const stat = await fs.stat(full);
          if (stat.mtimeMs >= cutoff) {
            files.push(full);
          }
        } catch {
          // skip
        }
      }
    }
  }

  for (const root of roots) {
    let projects;
    try {
      projects = await fs.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const p of projects) {
      if (!p.isDirectory()) {
        continue;
      }
      await walk(path.join(root, p.name), p.name);
    }
  }
  return files;
}

function extractCost(event: JsonlEvent): {
  cost: number;
  usage?: UsageBlock;
  model?: string;
  day: string;
} | null {
  const day = dateKey(event.timestamp);
  if (typeof event.costUSD === "number") {
    return { cost: event.costUSD, day };
  }
  const msg = event.message;
  if (!msg) {
    return null;
  }
  if (typeof msg.costUSD === "number") {
    return { cost: msg.costUSD, day, model: msg.model };
  }
  if (msg.usage) {
    return {
      cost: costFromUsage(msg.usage, msg.model),
      usage: msg.usage,
      model: msg.model,
      day,
    };
  }
  return null;
}

export async function parseCostsFromJsonl(options: {
  projectsRoots: string[];
  workspacePath?: string;
  workspaceOnly?: boolean;
  days?: number;
}): Promise<CostSummary> {
  const days = options.days ?? 30;
  const files = await collectJsonlFiles(
    options.projectsRoots,
    options.workspacePath,
    options.workspaceOnly,
    days
  );

  const byDay = new Map<string, DailyCostRow>();
  const byModel = new Map<
    string,
    { modelId: string; displayName: string; costUsd: number; tokens: TokenTotals; messageCount: number }
  >();
  const seenMessageIds = new Set<string>();
  let filesScanned = 0;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffKey = cutoffDate.toISOString().slice(0, 10);

  for (const file of files) {
    filesScanned += 1;
    let content: string;
    try {
      content = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      if (!line.trim()) {
        continue;
      }
      let event: JsonlEvent;
      try {
        event = JSON.parse(line) as JsonlEvent;
      } catch {
        continue;
      }
      const msgId = event.message?.id;
      if (msgId) {
        if (seenMessageIds.has(msgId)) {
          continue;
        }
        seenMessageIds.add(msgId);
      }
      const extracted = extractCost(event);
      if (!extracted || extracted.day < cutoffKey) {
        continue;
      }
      let row = byDay.get(extracted.day);
      if (!row) {
        row = {
          date: extracted.day,
          costUsd: 0,
          tokens: emptyTokens(),
          messageCount: 0,
        };
        byDay.set(extracted.day, row);
      }
      row.costUsd += extracted.cost;
      row.messageCount += 1;
      if (extracted.usage) {
        addTokens(row.tokens, extracted.usage);
      }

      const modelId = modelGroupKey(extracted.model);
      let modelRow = byModel.get(modelId);
      if (!modelRow) {
        modelRow = {
          modelId,
          displayName: formatModelDisplayName(extracted.model),
          costUsd: 0,
          tokens: emptyTokens(),
          messageCount: 0,
        };
        byModel.set(modelId, modelRow);
      }
      modelRow.costUsd += extracted.cost;
      modelRow.messageCount += 1;
      if (extracted.usage) {
        addTokens(modelRow.tokens, extracted.usage);
      }
    }
  }

  const daily = [...byDay.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayUsd = byDay.get(todayKey)?.costUsd ?? 0;
  const weekUsd = daily.reduce((s, d) => s + d.costUsd, 0);

  const modelRows: ModelUsageRow[] = [...byModel.values()]
    .map((m) => ({
      ...m,
      shareOfCost: weekUsd > 0 ? m.costUsd / weekUsd : 0,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  let workspaceTodayUsd: number | undefined;
  if (options.workspacePath && !options.workspaceOnly) {
    const wsOnly = await parseCostsFromJsonl({
      projectsRoots: options.projectsRoots,
      workspacePath: options.workspacePath,
      workspaceOnly: true,
      days: 1,
    });
    workspaceTodayUsd = wsOnly.todayUsd;
  }

  return {
    todayUsd,
    weekUsd,
    workspaceTodayUsd,
    daily,
    byModel: modelRows,
    lastParsedAt: new Date().toISOString(),
    filesScanned,
    estimated: true,
  };
}

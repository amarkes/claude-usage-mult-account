export type LimitStatus = "allowed" | "warning" | "blocked" | string;

export interface UsageWindow {
  utilization: number;
  resetsAt?: number;
}

export interface ClaudeUsageData {
  utilization5h: number;
  utilization7d: number;
  reset5hAt?: number;
  reset7dAt?: number;
  limitStatus?: LimitStatus;
  sevenDaySonnet?: UsageWindow;
  extraUsage?: {
    isEnabled: boolean;
    monthlyLimit?: number;
    usedCredits?: number;
    utilization?: number;
  };
}

export interface ClaudeUsageSnapshot {
  source: "cache" | "api";
  updatedAt: string;
  cachePath?: string;
  data: ClaudeUsageData;
  unavailableReason?: string;
  /** Dados do cache local (API falhou ou em cooldown). */
  isStale?: boolean;
  staleMinutes?: number;
}

export interface TokenTotals {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

export interface DailyCostRow {
  date: string;
  costUsd: number;
  tokens: TokenTotals;
  messageCount: number;
}

export interface ModelUsageRow {
  modelId: string;
  displayName: string;
  costUsd: number;
  tokens: TokenTotals;
  messageCount: number;
  /** Fração do custo total no período (0–1). */
  shareOfCost: number;
}

export interface CostSummary {
  todayUsd: number;
  weekUsd: number;
  workspaceTodayUsd?: number;
  daily: DailyCostRow[];
  /** Custo e tokens agregados por modelo no período. */
  byModel: ModelUsageRow[];
  lastParsedAt: string;
  filesScanned: number;
  estimated: boolean;
}

export interface CacheComparison {
  path: string;
  label: string;
  exists: boolean;
  updatedAt?: string;
  utilization5h?: number;
  utilization7d?: number;
}

export interface StatsCacheTotals {
  totalCostUsd?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  raw?: Record<string, unknown>;
}

export interface ActiveConfigInfo {
  dir: string;
  label: string;
  accountId: string;
  accountLabel: string;
}

export interface FullUsageState {
  quota: ClaudeUsageSnapshot;
  costs: CostSummary;
  statsCache?: StatsCacheTotals;
  activeConfig: ActiveConfigInfo;
}

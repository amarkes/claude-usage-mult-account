import * as fs from "fs";
import * as fsSync from "fs";
import * as vscode from "vscode";
import type { AccountSelectionService } from "./accountSelection";
import { cacheAgeMinutes } from "./cacheReader";
import { writeStatusCache } from "./cacheWriter";
import { fetchUsageFromApi, UsageApiError } from "./apiClient";
import { UsageAlerts } from "./alerts";
import { UsageLogger } from "./logger";
import { parseCostsFromJsonl } from "./jsonlCostParser";
import { readStatsCache } from "./statsCacheReader";
import { resolveClaudePaths, type ResolvedClaudePaths } from "./paths";
import type { ClaudeUsageSnapshot, CostSummary, FullUsageState } from "./types";

function buildUnavailableReason(
  paths: ResolvedClaudePaths,
  apiError?: string
): string {
  const lines = [
    `Sem quota em ${paths.label}.`,
    apiError ?? "Não foi possível ler a API nem o cache local.",
    "Conta Team: faça login no Claude Code com esta pasta (CLAUDE_CONFIG_DIR=~/.claude-work).",
    "Credenciais no macOS ficam no Keychain. Tente: claudeUsage.preferApi = true",
  ];
  return lines.join(" ");
}

function emptyCosts(): CostSummary {
  return {
    todayUsd: 0,
    weekUsd: 0,
    daily: [],
    byModel: [],
    lastParsedAt: new Date().toISOString(),
    filesScanned: 0,
    estimated: true,
  };
}

export class UsageService implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<FullUsageState>();
  readonly onDidChange = this._onDidChange.event;

  private state: FullUsageState | undefined;
  private refreshTimer: ReturnType<typeof setInterval> | undefined;
  private cacheWatchers: fs.FSWatcher[] = [];
  private projectWatchers: fs.FSWatcher[] = [];
  private configWatcher: vscode.Disposable | undefined;
  private focusWatcher: vscode.Disposable | undefined;
  private profileWatcher: vscode.Disposable | undefined;
  private readonly alerts = new UsageAlerts();
  private readonly logger: UsageLogger;
  private costParseGeneration = 0;
  private lastApiFetchByDir = new Map<string, number>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly accountSelection: AccountSelectionService,
    logger?: UsageLogger
  ) {
    this.logger = logger ?? new UsageLogger();
    this.configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("claudeUsage")) {
        void this.restart();
      }
    });
    this.profileWatcher = accountSelection.onDidChange(() => void this.restart());
    this.focusWatcher = vscode.window.onDidChangeWindowState((e) => {
      if (!e.focused) {
        return;
      }
      const cfg = vscode.workspace.getConfiguration("claudeUsage");
      if (cfg.get<boolean>("apiOnFocus", true)) {
        // Sem forceApi — evita HTTP 429 por chamadas em excesso
        void this.refresh();
      }
    });
    void this.restart();
  }

  getState(): FullUsageState | undefined {
    return this.state;
  }

  getSnapshot(): ClaudeUsageSnapshot | undefined {
    return this.state?.quota;
  }

  async refresh(options?: { forceApi?: boolean }): Promise<FullUsageState> {
    const paths = this.getResolvedPaths();
    const cfg = vscode.workspace.getConfiguration("claudeUsage");
    const preferApi =
      options?.forceApi ||
      cfg.get<boolean>("preferApi", false) ||
      this.accountSelection.getSelectedProfile() === "claude-work";

    this.logger.log(`Perfil ativo: ${paths.label} (${paths.configDir})`);

    let quota: ClaudeUsageSnapshot | null = null;
    const credentialPaths = [paths.credentialsPath];
    const cacheExists = fsSync.existsSync(paths.statusCachePath);
    const tryApiFirst = preferApi || !cacheExists;
    let apiErrorMsg: string | undefined;

    const apiCooldownMs =
      Math.max(
        30,
        cfg.get<number>("apiCooldownSeconds", 90)
      ) * 1000;

    const canCallApi = (): boolean => {
      if (options?.forceApi) {
        return true;
      }
      const last = this.lastApiFetchByDir.get(paths.configDir) ?? 0;
      return Date.now() - last >= apiCooldownMs;
    };

    const fetchApiLive = async (): Promise<ClaudeUsageSnapshot | null> => {
      if (!canCallApi()) {
        this.logger.log("API em cooldown — usando cache");
        return null;
      }
      try {
        const snapshot = await fetchUsageFromApi(
          credentialPaths,
          paths.configDir
        );
        this.lastApiFetchByDir.set(paths.configDir, Date.now());
        await writeStatusCache(paths.statusCachePath, snapshot.data);
        await this.context.globalState.update(
          `quotaSnapshot:${paths.configDir}`,
          snapshot
        );
        this.logger.log("Quota via API (cache atualizado)");
        return snapshot;
      } catch (e) {
        if (e instanceof UsageApiError) {
          apiErrorMsg = e.message;
          this.logger.log(`API: ${e.code} ${e.message}`);
        } else {
          apiErrorMsg = String(e);
          this.logger.log(`API erro: ${e}`);
        }
        return null;
      }
    };

    const loadStaleCache = (): ClaudeUsageSnapshot | null => {
      const fromFile = this.readCacheSync(paths);
      if (fromFile) {
        return fromFile;
      }
      const fromState = this.context.globalState.get<ClaudeUsageSnapshot>(
        `quotaSnapshot:${paths.configDir}`
      );
      if (fromState?.data) {
        const age = cacheAgeMinutes(fromState.updatedAt);
        return {
          ...fromState,
          source: "cache",
          isStale: true,
          staleMinutes: age,
        };
      }
      return null;
    };

    if (tryApiFirst) {
      quota = await fetchApiLive();
      if (!quota) {
        quota = loadStaleCache();
      }
    } else {
      quota = loadStaleCache();
      if (!quota) {
        quota = await fetchApiLive();
      }
    }

    if (!quota) {
      quota = {
        source: "cache",
        updatedAt: new Date().toISOString(),
        data: { utilization5h: 0, utilization7d: 0 },
        unavailableReason: buildUnavailableReason(paths, apiErrorMsg),
      };
    }

    const option = this.accountSelection.getSelectedOption();
    const [costs, statsCache] = await Promise.all([
      this.loadCosts(paths),
      readStatsCache(paths.statsCachePath),
    ]);

    this.state = {
      quota,
      costs,
      statsCache,
      activeConfig: {
        dir: paths.configDir,
        label: paths.label,
        profile: option.id,
      },
    };
    this.alerts.check(quota);
    this._onDidChange.fire(this.state);
    this.logger.log(
      `Refresh OK [${paths.label}] — 5h=${Math.round(quota.data.utilization5h * 100)}% custo hoje=$${costs.todayUsd.toFixed(2)}`
    );
    return this.state;
  }

  dispose(): void {
    this.stopWatchers();
    this.configWatcher?.dispose();
    this.focusWatcher?.dispose();
    this.profileWatcher?.dispose();
    this.alerts.dispose();
    this._onDidChange.dispose();
  }

  private getResolvedPaths(): ResolvedClaudePaths {
    const cfg = vscode.workspace.getConfiguration("claudeUsage");
    const profile = this.accountSelection.toConfigProfile(
      this.accountSelection.getSelectedProfile()
    );
    return resolveClaudePaths({
      profile,
      customDir: cfg.get<string>("configDir", ""),
    });
  }

  private async loadCosts(paths: ResolvedClaudePaths): Promise<CostSummary> {
    const cfg = vscode.workspace.getConfiguration("claudeUsage");
    if (!cfg.get<boolean>("enableCostTracking", true)) {
      return emptyCosts();
    }
    const gen = ++this.costParseGeneration;
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const workspaceOnly = cfg.get<boolean>("workspaceCostOnly", false);
    const days = cfg.get<number>("costHistoryDays", 7);

    try {
      const costs = await parseCostsFromJsonl({
        projectsRoots: [paths.projectsPath],
        workspacePath,
        workspaceOnly,
        days,
      });
      if (gen !== this.costParseGeneration) {
        return this.state?.costs ?? emptyCosts();
      }
      return costs;
    } catch (e) {
      this.logger.log(`Parse JSONL erro: ${e}`);
      return emptyCosts();
    }
  }

  private async restart(): Promise<void> {
    this.stopWatchers();
    await this.refresh();

    const intervalSec = vscode.workspace
      .getConfiguration("claudeUsage")
      .get<number>("refreshIntervalSeconds", 60);

    this.refreshTimer = setInterval(
      () => void this.refresh(),
      Math.max(15, intervalSec) * 1000
    );

    const paths = this.getResolvedPaths();
    try {
      const w = fs.watch(paths.statusCachePath, () => void this.refresh());
      this.cacheWatchers.push(w);
    } catch {
      // missing file
    }

    if (
      vscode.workspace
        .getConfiguration("claudeUsage")
        .get<boolean>("enableCostTracking", true)
    ) {
      try {
        const w = fs.watch(paths.projectsPath, { recursive: true }, () => {
          void this.scheduleCostRefresh();
        });
        this.projectWatchers.push(w);
      } catch {
        // cannot watch
      }
    }
  }

  private costRefreshDebounce: ReturnType<typeof setTimeout> | undefined;

  private scheduleCostRefresh(): void {
    if (this.costRefreshDebounce) {
      clearTimeout(this.costRefreshDebounce);
    }
    this.costRefreshDebounce = setTimeout(() => void this.refresh(), 3000);
  }

  private readCacheSync(paths: ResolvedClaudePaths): ClaudeUsageSnapshot | null {
    try {
      const raw = fsSync.readFileSync(paths.statusCachePath, "utf8");
      const parsed = JSON.parse(raw) as {
        updatedAt?: string;
        usageData?: {
          utilization5h?: number;
          utilization7d?: number;
          reset5hAt?: number;
          reset7dAt?: number;
          limitStatus?: string;
          extraUsage?: ClaudeUsageSnapshot["data"]["extraUsage"];
        };
      };
      const u = parsed.usageData;
      if (
        !u ||
        typeof u.utilization5h !== "number" ||
        typeof u.utilization7d !== "number"
      ) {
        return null;
      }
      const updatedAt = parsed.updatedAt ?? new Date().toISOString();
      const age = cacheAgeMinutes(updatedAt);
      this.logger.log(`Cache local (${age} min): ${paths.statusCachePath}`);
      return {
        source: "cache",
        updatedAt,
        cachePath: paths.statusCachePath,
        isStale: true,
        staleMinutes: age,
        data: {
          utilization5h: u.utilization5h,
          utilization7d: u.utilization7d,
          reset5hAt: u.reset5hAt,
          reset7dAt: u.reset7dAt,
          limitStatus: u.limitStatus,
          extraUsage: u.extraUsage,
        },
      };
    } catch {
      return null;
    }
  }

  private stopWatchers(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    for (const w of this.cacheWatchers) {
      w.close();
    }
    this.cacheWatchers = [];
    for (const w of this.projectWatchers) {
      w.close();
    }
    this.projectWatchers = [];
    if (this.costRefreshDebounce) {
      clearTimeout(this.costRefreshDebounce);
      this.costRefreshDebounce = undefined;
    }
  }
}

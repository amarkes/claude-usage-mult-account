import * as vscode from "vscode";
import type { AccountSelectionService } from "../usage/accountSelection";
import type { UsageService } from "../usage/usageService";
import type { FullUsageState } from "../usage/types";
import {
  ACCOUNT_SELECT_SCRIPT,
  ACCOUNT_SELECT_STYLES,
  renderAccountSelect,
} from "./accountSelectHtml";
import {
  MODEL_TABLE_STYLES,
  renderModelBreakdown,
} from "./modelBreakdownHtml";
import { formatPercent, formatResetTime, formatUsd } from "./format";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderChart(daily: FullUsageState["costs"]["daily"]): string {
  if (daily.length === 0) {
    return '<p class="muted">Sem dados de custo nos JSONL desta conta.</p>';
  }
  const max = Math.max(...daily.map((d) => d.costUsd), 0.01);
  const bars = daily
    .map((d) => {
      const h = Math.round((d.costUsd / max) * 120);
      return `<div class="chart-col" title="${esc(d.date)}: ${formatUsd(d.costUsd)}">
        <div class="chart-bar" style="height:${h}px"></div>
        <div class="chart-label">${esc(d.date.slice(5))}</div>
        <div class="chart-val">${formatUsd(d.costUsd)}</div>
      </div>`;
    })
    .join("");
  return `<div class="chart">${bars}</div>`;
}

function renderHtml(
  state: FullUsageState,
  selectedProfile: "claude" | "claude-work"
): string {
  const { quota: snapshot, costs, statsCache } = state;

  const accountBlock = `<div class="account-row">${renderAccountSelect(selectedProfile)}</div>`;

  if (snapshot.unavailableReason) {
    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<style>
  body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:16px}
  .warn{color:var(--vscode-editorWarning-foreground)}
  ${ACCOUNT_SELECT_STYLES}
</style>
</head><body>
  <h2>Claude Usage</h2>
  ${accountBlock}
  <p class="warn">${esc(snapshot.unavailableReason)}</p>
  <script>${ACCOUNT_SELECT_SCRIPT}</script>
</body></html>`;
  }

  const { data } = snapshot;
  const bar = (label: string, util: number, reset?: number) => {
    const pct = Math.min(100, Math.round(util * 100));
    const color =
      util >= 0.9
        ? "var(--vscode-errorForeground)"
        : util >= 0.7
          ? "var(--vscode-editorWarning-foreground)"
          : "var(--vscode-progressBar-foreground)";
    return `<div class="row"><div class="label">${esc(label)}</div>
      <div class="bar"><div class="fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="meta">${formatPercent(util)} · reset ${formatResetTime(reset)}</div></div>`;
  };

  let extra = "";
  if (data.extraUsage?.isEnabled) {
    const ex = data.extraUsage;
    extra = `<p>Extra usage (Team): ${ex.utilization !== undefined ? formatPercent(ex.utilization) : "ativo"}
      ${ex.usedCredits !== undefined && ex.monthlyLimit !== undefined ? ` · ${ex.usedCredits.toFixed(0)} / ${ex.monthlyLimit.toFixed(0)} créditos` : ""}</p>`;
  }

  const statsLine = statsCache?.totalCostUsd
    ? `<p class="muted">stats-cache.json: ${formatUsd(statsCache.totalCostUsd)}</p>`
    : "";

  const quota5hLabel = data.extraUsage?.isEnabled ? "Uso (extra / Team)" : "Janela 5 horas";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 20px; max-width: 640px; }
    h2 { margin-top: 0; }
    h3 { margin-top: 28px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8; }
    ${ACCOUNT_SELECT_STYLES}
    .row { margin-bottom: 18px; }
    .label { font-weight: 600; margin-bottom: 6px; }
    .bar { height: 10px; background: var(--vscode-progressBar-background); border-radius: 5px; overflow: hidden; }
    .fill { height: 100%; }
    .meta { font-size: 12px; opacity: 0.85; margin-top: 4px; }
    .cost-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
    .cost-card { padding: 12px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
    .cost-card strong { font-size: 20px; display: block; }
    .chart { display: flex; align-items: flex-end; gap: 8px; height: 160px; margin: 16px 0; padding-top: 8px; }
    .chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; min-width: 0; }
    .chart-bar { width: 100%; max-width: 48px; background: var(--vscode-charts-blue, var(--vscode-button-background)); border-radius: 4px 4px 0 0; min-height: 2px; }
    .chart-label { font-size: 10px; margin-top: 4px; opacity: 0.75; }
    .chart-val { font-size: 10px; opacity: 0.9; }
    .muted { opacity: 0.65; font-size: 12px; }
    .source { margin-top: 24px; font-size: 11px; opacity: 0.6; }
    ${MODEL_TABLE_STYLES}
  </style>
</head>
<body>
  <h2>Claude Usage</h2>
  ${accountBlock}

  <h3>Quota — ${esc(state.activeConfig.label)}</h3>
  ${bar(quota5hLabel, data.utilization5h, data.reset5hAt)}
  ${!data.extraUsage?.isEnabled ? bar("Janela 7 dias", data.utilization7d, data.reset7dAt) : ""}
  ${data.sevenDaySonnet ? bar("Sonnet 7 dias", data.sevenDaySonnet.utilization, data.sevenDaySonnet.resetsAt) : ""}
  ${data.limitStatus ? `<p>Status: <strong>${esc(data.limitStatus)}</strong></p>` : ""}
  ${extra}

  <h3>Custo desta conta (JSONL)</h3>
  <div class="cost-grid">
    <div class="cost-card"><span class="muted">Hoje</span><strong>${formatUsd(costs.todayUsd)}</strong></div>
    <div class="cost-card"><span class="muted">${costs.daily.length} dias</span><strong>${formatUsd(costs.weekUsd)}</strong></div>
  </div>
  ${costs.workspaceTodayUsd !== undefined ? `<p>Workspace hoje: <strong>${formatUsd(costs.workspaceTodayUsd)}</strong></p>` : ""}
  ${renderChart(costs.daily)}

  ${renderModelBreakdown(costs.byModel, `${costs.daily.length} dias`)}

  ${statsLine}
  <p class="source">${esc(state.activeConfig.dir)} · ${snapshot.source} · ${esc(snapshot.updatedAt)}</p>
  <script>${ACCOUNT_SELECT_SCRIPT}</script>
</body>
</html>`;
}

export class UsagePanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly usageService: UsageService,
    private readonly accountSelection: AccountSelectionService
  ) {}

  show(): void {
    this.openPanel();
  }

  private openPanel(): void {
    const state = this.usageService.getState();
    const profile = this.accountSelection.getSelectedProfile();

    if (this.panel) {
      this.panel.reveal();
      if (state) {
        this.panel.webview.html = renderHtml(state, profile);
      }
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "claudeUsage",
      "Claude Usage",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.webview.onDidReceiveMessage(async (msg: { type: string; profile?: string }) => {
      if (msg.type === "setProfile" && (msg.profile === "claude" || msg.profile === "claude-work")) {
        await this.accountSelection.setSelectedProfile(msg.profile);
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    if (state) {
      this.panel.webview.html = renderHtml(state, profile);
    }

    const refreshPanel = () => {
      const s = this.usageService.getState();
      if (this.panel && s) {
        this.panel.webview.html = renderHtml(
          s,
          this.accountSelection.getSelectedProfile()
        );
      }
    };

    this.usageService.onDidChange(refreshPanel, null, []);
    this.accountSelection.onDidChange(refreshPanel, null, []);
  }

  dispose(): void {
    this.panel?.dispose();
  }
}

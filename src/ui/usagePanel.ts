import * as vscode from "vscode";
import type {
  AccountSelectionService,
  ClaudeAccount,
} from "../usage/accountSelection";
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

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fillDailyGaps(
  daily: FullUsageState["costs"]["daily"]
): FullUsageState["costs"]["daily"] {
  if (daily.length === 0) return daily;
  const result: FullUsageState["costs"]["daily"] = [];
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const first = new Date(daily[0].date + "T12:00:00Z");
  const last = new Date(daily[daily.length - 1].date + "T12:00:00Z");
  for (const cur = new Date(first); cur <= last; cur.setUTCDate(cur.getUTCDate() + 1)) {
    const key = cur.toISOString().slice(0, 10);
    result.push(byDate.get(key) ?? { date: key, costUsd: 0, tokens: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }, messageCount: 0 });
  }
  return result;
}

function renderChart(daily: FullUsageState["costs"]["daily"]): string {
  if (daily.length === 0) {
    return '<p class="muted">Sem dados de custo nos JSONL desta conta.</p>';
  }
  const filled = fillDailyGaps(daily);
  const max = Math.max(...filled.map((d) => d.costUsd), 0.01);
  const bars = filled
    .map((d) => {
      const h = Math.max(Math.round((d.costUsd / max) * 120), d.costUsd > 0 ? 2 : 0);
      const valLabel = d.costUsd > 0 ? formatUsd(d.costUsd) : "";
      const cacheIn = (d.tokens.cacheCreation + d.tokens.cacheRead).toLocaleString();
      const tipLines = [
        `<b>${esc(d.date)}</b>`,
        `Custo: ${formatUsd(d.costUsd)}`,
        `Msgs: ${d.messageCount}`,
        `Tokens in/out: ${(d.tokens.input + d.tokens.output).toLocaleString()}`,
        `Cache criação/leitura: ${cacheIn}`,
      ].join("<br>");
      return `<div class="chart-col">
        <div class="chart-tip">${tipLines}</div>
        <div class="chart-val">${esc(valLabel)}</div>
        <div class="chart-bar" style="height:${h}px"></div>
        <div class="chart-label">${esc(d.date.slice(5))}</div>
      </div>`;
    })
    .join("");
  return `<div class="chart-wrap" id="chartWrap"><div class="chart">${bars}</div></div>
<script>document.getElementById('chartWrap').scrollLeft=9999;</script>`;
}

function renderTokenChart(daily: FullUsageState["costs"]["daily"]): string {
  if (daily.length === 0) return "";
  const filled = fillDailyGaps(daily);
  const hasTokens = filled.some(d => d.tokens.input + d.tokens.output + d.tokens.cacheCreation + d.tokens.cacheRead > 0);
  if (!hasTokens) return "";

  const maxIn    = Math.max(...filled.map(d => d.tokens.input), 1);
  const maxOut   = Math.max(...filled.map(d => d.tokens.output), 1);
  const maxCache = Math.max(...filled.map(d => d.tokens.cacheCreation + d.tokens.cacheRead), 1);

  const bars = filled.map((d) => {
    const cache = d.tokens.cacheCreation + d.tokens.cacheRead;
    const total = d.tokens.input + d.tokens.output + cache;
    const inH    = Math.max(Math.round((d.tokens.input / maxIn)    * 120), d.tokens.input > 0 ? 2 : 0);
    const outH   = Math.max(Math.round((d.tokens.output / maxOut)  * 120), d.tokens.output > 0 ? 2 : 0);
    const cacheH = Math.max(Math.round((cache / maxCache)          * 120), cache > 0 ? 2 : 0);
    const tipLines = [
      `<b>${esc(d.date)}</b>`,
      `Input: ${fmtK(d.tokens.input)}`,
      `Output: ${fmtK(d.tokens.output)}`,
      `Cache: ${fmtK(cache)}`,
      `Total: ${fmtK(total)}`,
    ].join("<br>");
    const bar = (h: number, color: string) =>
      `<div style="width:8px;height:${h}px;background:${color};border-radius:2px 2px 0 0;flex-shrink:0"></div>`;
    return `<div class="chart-col tok-col">
      <div class="chart-tip">${tipLines}</div>
      <div class="chart-val">${total > 0 ? esc(fmtK(total)) : ""}</div>
      <div style="display:flex;align-items:flex-end;gap:2px;height:120px">
        ${bar(inH, "#4e9de0")}${bar(outH, "#4ec9b0")}${bar(cacheH, "#c586c0")}
      </div>
      <div class="chart-label">${esc(d.date.slice(5))}</div>
    </div>`;
  }).join("");

  const legend = `<div class="token-legend">
    <span class="legend-item"><span class="legend-dot" style="background:#4e9de0"></span>Input</span>
    <span class="legend-item"><span class="legend-dot" style="background:#4ec9b0"></span>Output</span>
    <span class="legend-item"><span class="legend-dot" style="background:#c586c0"></span>Cache</span>
  </div>`;

  return `<h3>Tokens por dia</h3>
  ${legend}
  <div class="chart-wrap" id="tokenChartWrap"><div class="chart">${bars}</div></div>
  <script>document.getElementById('tokenChartWrap').scrollLeft=9999;</script>`;
}

function renderHtml(
  state: FullUsageState,
  selectedAccountId: string,
  accounts: ClaudeAccount[]
): string {
  const { quota: snapshot, costs, statsCache } = state;

  const accountBlock = `<div class="account-row">${renderAccountSelect(selectedAccountId, accounts, { showManage: true })}</div>`;

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
  if (data.extraUsage?.isEnabled && data.quotaFromExtraOnly) {
    // Team account: quota comes entirely from monthly credits — show full credit grid
    const ex = data.extraUsage;
    const isCurrency = ex.currency === "USD" || ex.currency === "usd";
    const fmt = (v: number) => isCurrency ? formatUsd(v) : `${v.toFixed(0)} créditos`;
    const limitLine = ex.monthlyLimit !== undefined
      ? `<div class="team-stat"><span class="team-label">Limite mensal</span><strong>${fmt(ex.monthlyLimit)}</strong></div>`
      : "";
    const usedLine = ex.usedCredits !== undefined
      ? `<div class="team-stat"><span class="team-label">Gasto no mês</span><strong>${fmt(ex.usedCredits)}</strong></div>`
      : "";
    const remainingLine = ex.monthlyLimit !== undefined && ex.usedCredits !== undefined
      ? `<div class="team-stat"><span class="team-label">Saldo restante</span><strong>${fmt(Math.max(0, ex.monthlyLimit - ex.usedCredits))}</strong></div>`
      : "";
    const avgDaily = costs.daily.length > 0
      ? costs.daily.reduce((s, d) => s + d.costUsd, 0) / costs.daily.length
      : undefined;
    const avgLine = avgDaily !== undefined
      ? `<div class="team-stat"><span class="team-label">Média diária (${costs.daily.length}d)</span><strong>${formatUsd(avgDaily)}</strong></div>`
      : "";
    extra = `<div class="team-grid">${limitLine}${usedLine}${remainingLine}${avgLine}</div>`;
  }

  const staleBanner = snapshot.isStale && snapshot.staleMinutes !== undefined
    ? `<div class="stale-banner">⚠ Dados desatualizados há ${snapshot.staleMinutes} min${snapshot.apiErrorMsg ? ` — ${esc(snapshot.apiErrorMsg)}` : " — API indisponível ou em cooldown"}</div>`
    : "";

  const statsLine = statsCache
    ? (() => {
        const parts: string[] = [];
        if (statsCache.totalCostUsd) parts.push(`Custo histórico: ${formatUsd(statsCache.totalCostUsd)}`);
        if (statsCache.totalInputTokens) parts.push(`Tokens entrada: ${statsCache.totalInputTokens.toLocaleString()}`);
        if (statsCache.totalOutputTokens) parts.push(`Tokens saída: ${statsCache.totalOutputTokens.toLocaleString()}`);
        return parts.length ? `<p class="muted">stats-cache.json — ${parts.join(" · ")}</p>` : "";
      })()
    : "";

  const extraOnly = data.quotaFromExtraOnly === true;
  const quota5hLabel = extraOnly ? "Uso (extra / Team)" : "Janela 5 horas";

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
    .chart-wrap { overflow-x: auto; margin: 16px 0; padding-bottom: 4px; }
    .chart { display: flex; align-items: flex-end; gap: 6px; min-width: max-content; padding: 0 2px; padding-top: 80px; }
    .chart-col { display: flex; flex-direction: column; align-items: center; width: 36px; flex-shrink: 0; position: relative; cursor: default; }
    .chart-col:hover .chart-bar { opacity: 0.7; }
    .chart-col:hover .chart-tip { display: block; }
    .chart-tip { display: none; position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); background: var(--vscode-editorHoverWidget-background, #1e1e1e); border: 1px solid var(--vscode-editorHoverWidget-border, #454545); border-radius: 4px; padding: 6px 10px; font-size: 11px; white-space: nowrap; z-index: 100; text-align: left; line-height: 1.6; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
    .chart-bar { width: 28px; background: var(--vscode-charts-blue, var(--vscode-button-background)); border-radius: 3px 3px 0 0; transition: opacity 0.1s; }
    .chart-val { font-size: 9px; opacity: 0.8; margin-bottom: 3px; white-space: nowrap; min-height: 12px; }
    .chart-label { font-size: 9px; margin-top: 4px; opacity: 0.6; white-space: nowrap; }
    .stale-banner { background: var(--vscode-editorWarning-background, rgba(255,200,0,0.1)); border: 1px solid var(--vscode-editorWarning-foreground); border-radius: 4px; padding: 6px 10px; font-size: 12px; margin-bottom: 12px; color: var(--vscode-editorWarning-foreground); }
    .estimated-badge { font-size: 10px; opacity: 0.65; font-weight: normal; margin-left: 6px; }
    .token-legend { display: flex; gap: 14px; font-size: 11px; margin-bottom: 6px; opacity: 0.85; }
    .legend-item { display: flex; align-items: center; gap: 5px; }
    .legend-dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
    .tok-col { width: 42px !important; }
    .tok-col .chart-tip { white-space: nowrap; }
    .muted { opacity: 0.65; font-size: 12px; }
    .source { margin-top: 24px; font-size: 11px; opacity: 0.6; }
    .team-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0 18px; }
    .team-stat { padding: 10px 12px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
    .team-label { display: block; font-size: 11px; opacity: 0.75; margin-bottom: 4px; }
    .team-stat strong { font-size: 18px; }
    .refresh-row { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
    .refresh-btn { padding: 4px 12px; font-size: 12px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; }
    .refresh-btn:hover { background: var(--vscode-button-hoverBackground); }
    .refresh-btn:disabled { opacity: 0.5; cursor: default; }
    .refresh-status { font-size: 11px; opacity: 0.7; }
    ${MODEL_TABLE_STYLES}
  </style>
</head>
<body>
  <div class="refresh-row">
    <h2 style="margin:0;flex:1">Claude Usage</h2>
    <button class="refresh-btn" id="refreshBtn" onclick="doRefresh()">↻ Atualizar</button>
    <span class="refresh-status" id="refreshStatus"></span>
  </div>
  ${staleBanner}
  ${accountBlock}

  <h3>Quota — ${esc(state.activeConfig.label)}</h3>
  ${bar(quota5hLabel, data.utilization5h, data.reset5hAt)}
  ${!extraOnly ? bar("Janela 7 dias", data.utilization7d, data.reset7dAt) : ""}
  ${data.sevenDaySonnet ? bar("Sonnet 7 dias", data.sevenDaySonnet.utilization, data.sevenDaySonnet.resetsAt) : ""}
  ${data.limitStatus ? `<p>Status: <strong>${esc(data.limitStatus)}</strong></p>` : ""}
  ${extra}

  <h3>Custo desta conta (JSONL)${costs.estimated ? '<span class="estimated-badge">estimado</span>' : ''}</h3>
  <div class="cost-grid">
    <div class="cost-card"><span class="muted">Hoje</span><strong>${formatUsd(costs.todayUsd)}</strong></div>
    <div class="cost-card"><span class="muted">Últimos ${costs.daily.length} dias</span><strong>${formatUsd(costs.weekUsd)}</strong></div>
  </div>
  ${costs.workspaceTodayUsd !== undefined ? `<p>Workspace hoje: <strong>${formatUsd(costs.workspaceTodayUsd)}</strong></p>` : ""}
  ${renderChart(costs.daily)}

  ${renderTokenChart(costs.daily)}

  ${renderModelBreakdown(costs.byModel, `${costs.daily.length} dias`)}

  ${statsLine}
  <p class="source">${esc(state.activeConfig.dir)} · ${snapshot.source} · ${esc(snapshot.updatedAt)} · ${costs.filesScanned} arquivo(s) JSONL</p>
  <script>
    const vscode = (window.__cvscode = acquireVsCodeApi());
    function doRefresh() {
      const btn = document.getElementById('refreshBtn');
      const status = document.getElementById('refreshStatus');
      if (btn) btn.disabled = true;
      if (status) status.textContent = 'Atualizando…';
      vscode.postMessage({ type: 'refresh' });
    }
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'refreshing') {
        const btn = document.getElementById('refreshBtn');
        const status = document.getElementById('refreshStatus');
        if (btn) btn.disabled = true;
        if (status) status.textContent = 'Atualizando…';
      }
    });
    ${ACCOUNT_SELECT_SCRIPT}
  </script>
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
    const accountId = this.accountSelection.getSelectedAccountId();
    const accounts = this.accountSelection.getAccounts();

    if (this.panel) {
      this.panel.reveal();
      if (state) {
        this.panel.webview.html = renderHtml(state, accountId, accounts);
      }
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "claudeUsage",
      "Claude Usage",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.webview.onDidReceiveMessage(async (msg: { type: string; accountId?: string }) => {
      try {
        if (msg.type === "refresh") {
          this.panel?.webview.postMessage({ type: "refreshing" });
          await this.usageService.refresh({ forceApi: true });
        } else if (msg.type === "setAccount" && msg.accountId) {
          await this.accountSelection.setSelectedAccountId(msg.accountId);
        } else if (msg.type === "addAccount") {
          await this.accountSelection.promptAddAccount();
        } else if (msg.type === "removeAccount" && msg.accountId) {
          const account = this.accountSelection
            .getCustomAccounts()
            .find((a) => a.id === msg.accountId);
          if (!account) {
            return;
          }
          const confirm = await vscode.window.showWarningMessage(
            `Remover a conta "${account.label}"?`,
            "Remover",
            "Cancelar"
          );
          if (confirm === "Remover") {
            await this.accountSelection.removeCustomAccount(msg.accountId);
          }
        }
      } catch (e) {
        void vscode.window.showErrorMessage(String(e));
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    if (state) {
      this.panel.webview.html = renderHtml(state, accountId, accounts);
    }

    const refreshPanel = () => {
      const s = this.usageService.getState();
      if (this.panel && s) {
        this.panel.webview.html = renderHtml(
          s,
          this.accountSelection.getSelectedAccountId(),
          this.accountSelection.getAccounts()
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

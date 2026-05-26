import * as vscode from "vscode";
import type { AccountSelectionService } from "../usage/accountSelection";
import type { UsageService } from "../usage/usageService";
import {
  ACCOUNT_SELECT_SCRIPT,
  ACCOUNT_SELECT_STYLES,
  renderAccountSelect,
} from "./accountSelectHtml";
import { formatPercent, formatUsd } from "./format";

export class AccountSidebarViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly accountSelection: AccountSelectionService,
    private readonly usageService: UsageService
  ) {
    accountSelection.onDidChange(() => this.postUpdate());
    usageService.onDidChange(() => this.postUpdate());
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [],
    };

    webviewView.webview.onDidReceiveMessage(async (msg: {
      type: string;
      accountId?: string;
    }) => {
      try {
        if (msg.type === "setAccount" && msg.accountId) {
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

    webviewView.webview.html = this.render();
  }

  private postUpdate(): void {
    if (this.view) {
      this.view.webview.html = this.render();
    }
  }

  private render(): string {
    const selectedId = this.accountSelection.getSelectedAccountId();
    const accounts = this.accountSelection.getAccounts();
    const state = this.usageService.getState();

    let summary = '<p class="muted">Carregando dados…</p>';
    if (state) {
      const q = state.quota;
      if (q.unavailableReason) {
        summary = `<p class="warn">${escapeHtml(q.unavailableReason)}</p>`;
      } else {
        const extra = q.data.extraUsage;
        const quotaLine = extra?.isEnabled
          ? `Extra: ${formatPercent(q.data.utilization5h)} · ${extra.usedCredits?.toFixed(0) ?? "?"} / ${extra.monthlyLimit?.toFixed(0) ?? "?"} créditos`
          : `5h: ${formatPercent(q.data.utilization5h)} · 7d: ${formatPercent(q.data.utilization7d)}`;
        const topModel = state.costs.byModel[0];
        const modelLine = topModel
          ? `<br/>Modelo + usado: ${topModel.displayName} (${formatUsd(topModel.costUsd)})`
          : "";
        summary = `<p class="summary">${quotaLine}</p>
          <p class="muted">Custo hoje (est.): ${formatUsd(state.costs.todayUsd)} · ${state.quota.source === "api" ? "API" : "cache"}${modelLine}</p>`;
      }
    }

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; margin: 0; }
    ${ACCOUNT_SELECT_STYLES}
    .summary { font-size: 13px; margin: 12px 0 4px; }
    .muted { font-size: 12px; opacity: 0.8; }
    .warn { font-size: 12px; color: var(--vscode-editorWarning-foreground); }
    .hint { font-size: 11px; opacity: 0.65; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="account-row">
    ${renderAccountSelect(selectedId, accounts, { showManage: true })}
  </div>
  ${summary}
  <p class="hint">A conta <strong>Padrão</strong> usa ~/.claude. Adicione outras pastas conforme sua configuração (ex. CLAUDE_CONFIG_DIR).</p>
  <script>${ACCOUNT_SELECT_SCRIPT}</script>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

import * as vscode from "vscode";
import type { AccountSelectionService } from "../usage/accountSelection";
import type { UsageService } from "../usage/usageService";
import type { FullUsageState } from "../usage/types";
import { formatPercent, formatResetTime, formatUsd } from "./format";

export class UsageTreeProvider
  implements vscode.TreeDataProvider<UsageTreeItem>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    UsageTreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly usageService: UsageService,
    private readonly accountSelection: AccountSelectionService
  ) {
    usageService.onDidChange(() => this._onDidChangeTreeData.fire(undefined));
    accountSelection.onDidChange(() =>
      this._onDidChangeTreeData.fire(undefined)
    );
  }

  getTreeItem(element: UsageTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: UsageTreeItem): UsageTreeItem[] {
    const state = this.usageService.getState();
    if (!state) {
      return [
        new UsageTreeItem(
          "Carregando…",
          vscode.TreeItemCollapsibleState.None
        ),
      ];
    }
    if (!element) {
      return this.rootItems(state);
    }
    if (element.id === "quota") {
      return this.quotaChildren(state);
    }
    if (element.id === "cost") {
      return this.costChildren(state);
    }
    if (element.id === "models") {
      return this.modelChildren(state);
    }
    return [];
  }

  private rootItems(state: FullUsageState): UsageTreeItem[] {
    const q = state.quota;
    const acct = this.accountSelection.getSelectedOption();
    const items: UsageTreeItem[] = [
      new UsageTreeItem(
        `Conta: ${acct.label} (${acct.description})`,
        vscode.TreeItemCollapsibleState.None,
        "$(account)",
        undefined,
        {
          command: "claudeUsage.pickAccount",
          title: "Trocar conta",
        }
      ),
    ];

    if (q.unavailableReason) {
      items.push(
        new UsageTreeItem(
          q.unavailableReason.slice(0, 80) + "…",
          vscode.TreeItemCollapsibleState.None,
          "$(warning)"
        )
      );
      return items;
    }

    items.push(
      new UsageTreeItem(
        `Quota: ${formatPercent(q.data.utilization5h)}`,
        vscode.TreeItemCollapsibleState.Collapsed,
        "$(dashboard)",
        "quota"
      ),
      new UsageTreeItem(
        `Custo hoje: ${formatUsd(state.costs.todayUsd)}`,
        vscode.TreeItemCollapsibleState.Collapsed,
        "$(credit-card)",
        "cost"
      )
    );
    if (state.costs.byModel.length > 0) {
      items.push(
        new UsageTreeItem(
          "Por modelo",
          vscode.TreeItemCollapsibleState.Collapsed,
          "$(symbol-class)",
          "models"
        )
      );
    }
    items.push(
      new UsageTreeItem(
        `Fonte: ${q.source}`,
        vscode.TreeItemCollapsibleState.None,
        "$(info)"
      )
    );
    return items;
  }

  private quotaChildren(state: FullUsageState): UsageTreeItem[] {
    const d = state.quota.data;
    const rows = [
      `5h/Extra: ${formatPercent(d.utilization5h)} — reset ${formatResetTime(d.reset5hAt)}`,
      `7d: ${formatPercent(d.utilization7d)}`,
    ];
    if (d.extraUsage?.isEnabled && d.extraUsage.usedCredits !== undefined) {
      rows.push(
        `Créditos: ${d.extraUsage.usedCredits.toFixed(0)} / ${d.extraUsage.monthlyLimit?.toFixed(0) ?? "?"}`
      );
    }
    return rows.map(
      (label) =>
        new UsageTreeItem(label, vscode.TreeItemCollapsibleState.None)
    );
  }

  private modelChildren(state: FullUsageState): UsageTreeItem[] {
    return state.costs.byModel.map(
      (m) =>
        new UsageTreeItem(
          `${m.displayName}: ${formatUsd(m.costUsd)} (${Math.round(m.shareOfCost * 100)}%)`,
          vscode.TreeItemCollapsibleState.None,
          "$(symbol-method)"
        )
    );
  }

  private costChildren(state: FullUsageState): UsageTreeItem[] {
    const items = [
      new UsageTreeItem(
        `Semana: ${formatUsd(state.costs.weekUsd)}`,
        vscode.TreeItemCollapsibleState.None
      ),
      new UsageTreeItem(
        `JSONL: ${state.costs.filesScanned} arquivos`,
        vscode.TreeItemCollapsibleState.None
      ),
    ];
    for (const day of state.costs.daily.slice(-7)) {
      items.push(
        new UsageTreeItem(
          `${day.date}: ${formatUsd(day.costUsd)}`,
          vscode.TreeItemCollapsibleState.None
        )
      );
    }
    return items;
  }
}

class UsageTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    icon?: string,
    readonly id?: string,
    command?: vscode.Command
  ) {
    super(label, collapsibleState);
    if (icon) {
      const iconId = icon.replace(/^\$\((.+)\)$/, "$1");
      this.iconPath = new vscode.ThemeIcon(iconId);
    }
    if (command) {
      this.command = command;
    }
  }
}

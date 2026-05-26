import * as vscode from "vscode";
import type { AccountSelectionService } from "../usage/accountSelection";
import type { UsageService } from "../usage/usageService";
import type { FullUsageState } from "../usage/types";
import {
  accountShortLabel,
  statusBarText,
  statusBarTooltip,
  utilizationColor,
} from "./format";

export class UsageStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor(
    private readonly usageService: UsageService,
    private readonly accountSelection: AccountSelectionService
  ) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      90
    );
    this.item.command = "claudeUsage.showPanel";
    this.item.show();

    const update = (state?: FullUsageState) => {
      const s = state ?? usageService.getState();
      const accountLabel = accountShortLabel(
        accountSelection.getSelectedOption()
      );
      if (!s) {
        this.item.text = `$(loading~spin) [${accountLabel}] Claude`;
        this.item.tooltip = "Carregando…";
        this.item.backgroundColor = undefined;
        return;
      }
      this.item.text = statusBarText(s, accountLabel);
      this.item.tooltip = statusBarTooltip(s);
      if (!s.quota.unavailableReason) {
        const maxUtil = Math.max(
          s.quota.data.utilization5h,
          s.quota.data.utilization7d
        );
        const colorId = utilizationColor(maxUtil);
        this.item.backgroundColor = colorId
          ? new vscode.ThemeColor(colorId)
          : undefined;
      } else {
        this.item.backgroundColor = undefined;
      }
    };

    update();
    usageService.onDidChange(update, null, []);
    accountSelection.onDidChange(() => update(), null, []);
  }

  dispose(): void {
    this.item.dispose();
  }
}

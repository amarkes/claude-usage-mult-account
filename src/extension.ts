import * as vscode from "vscode";
import { AccountSelectionService } from "./usage/accountSelection";
import { UsageLogger } from "./usage/logger";
import { UsageService } from "./usage/usageService";
import { AccountSidebarViewProvider } from "./ui/accountSidebarView";
import { exportUsageCsv } from "./ui/exportCsv";
import { UsageStatusBar } from "./ui/statusBar";
import { UsageTreeProvider } from "./ui/usageTreeProvider";
import { UsagePanel } from "./ui/usagePanel";

export function activate(context: vscode.ExtensionContext): void {
  const logger = new UsageLogger();
  const accountSelection = new AccountSelectionService(context);
  const usageService = new UsageService(context, accountSelection, logger);
  const usagePanel = new UsagePanel(usageService, accountSelection);
  const statusBar = new UsageStatusBar(usageService, accountSelection);
  const treeProvider = new UsageTreeProvider(usageService, accountSelection);
  const accountSidebar = new AccountSidebarViewProvider(
    accountSelection,
    usageService
  );

  context.subscriptions.push(
    logger,
    accountSelection,
    usageService,
    usagePanel,
    statusBar,
    vscode.window.registerTreeDataProvider("claudeUsage.sidebar", treeProvider),
    vscode.window.registerWebviewViewProvider(
      "claudeUsage.accountPicker",
      accountSidebar,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.commands.registerCommand("claudeUsage.refresh", () =>
      usageService.refresh()
    ),
    vscode.commands.registerCommand("claudeUsage.refreshCosts", () =>
      usageService.refresh()
    ),
    vscode.commands.registerCommand("claudeUsage.showPanel", () =>
      usagePanel.show()
    ),
    vscode.commands.registerCommand("claudeUsage.pickAccount", () =>
      accountSelection.pickAccount()
    ),
    vscode.commands.registerCommand("claudeUsage.showLog", () => logger.show()),
    vscode.commands.registerCommand("claudeUsage.useDefaultAccount", () =>
      accountSelection.setSelectedAccountId("default")
    ),
    vscode.commands.registerCommand("claudeUsage.addAccount", () =>
      accountSelection.promptAddAccount()
    ),
    vscode.commands.registerCommand("claudeUsage.removeAccount", () =>
      accountSelection.promptRemoveAccount()
    ),
    vscode.commands.registerCommand("claudeUsage.exportCsv", async () => {
      const state = usageService.getState();
      if (!state) {
        await usageService.refresh();
      }
      const latest = usageService.getState();
      if (!latest) {
        void vscode.window.showWarningMessage("Sem dados para exportar.");
        return;
      }
      await exportUsageCsv(latest);
    })
  );
}

export function deactivate(): void {}

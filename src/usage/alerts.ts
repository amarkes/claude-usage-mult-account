import * as vscode from "vscode";
import type { ClaudeUsageSnapshot } from "./types";

export class UsageAlerts implements vscode.Disposable {
  private lastAlertLevel: "none" | "warn" | "critical" = "none";

  check(snapshot: ClaudeUsageSnapshot): void {
    if (snapshot.unavailableReason) {
      return;
    }
    const cfg = vscode.workspace.getConfiguration("claudeUsage");
    if (!cfg.get<boolean>("enableAlerts", true)) {
      return;
    }
    const warnAt = cfg.get<number>("alertThresholdWarning", 0.7);
    const criticalAt = cfg.get<number>("alertThresholdCritical", 0.9);
    const maxUtil = Math.max(
      snapshot.data.utilization5h,
      snapshot.data.utilization7d
    );

    let level: "none" | "warn" | "critical" = "none";
    if (maxUtil >= criticalAt) {
      level = "critical";
    } else if (maxUtil >= warnAt) {
      level = "warn";
    }

    if (level === "none") {
      this.lastAlertLevel = "none";
      return;
    }
    if (level === this.lastAlertLevel) {
      return;
    }
    this.lastAlertLevel = level;

    const pct = Math.round(maxUtil * 100);
    const msg =
      level === "critical"
        ? `Claude: quota em ${pct}% — limite crítico`
        : `Claude: quota em ${pct}% — atenção`;

    void vscode.window
      .showWarningMessage(msg, "Abrir painel")
      .then((choice) => {
        if (choice === "Abrir painel") {
          void vscode.commands.executeCommand("claudeUsage.showPanel");
        }
      });
  }

  dispose(): void {
    this.lastAlertLevel = "none";
  }
}

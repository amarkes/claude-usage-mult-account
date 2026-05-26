import * as vscode from "vscode";
import type { FullUsageState } from "../usage/types";
import { formatPercent, formatUsd } from "./format";

export async function exportUsageCsv(state: FullUsageState): Promise<void> {
  const lines: string[] = [
    "section,field,value",
    "config,profile," + state.activeConfig.profile,
    "config,dir," + state.activeConfig.dir,
    "quota,source," + state.quota.source,
    "quota,updatedAt," + state.quota.updatedAt,
    "quota,utilization5h," + state.quota.data.utilization5h,
    "quota,utilization7d," + state.quota.data.utilization7d,
    "quota,reset5hAt," + (state.quota.data.reset5hAt ?? ""),
    "quota,reset7dAt," + (state.quota.data.reset7dAt ?? ""),
    "quota,limitStatus," + (state.quota.data.limitStatus ?? ""),
    "cost,todayUsd," + state.costs.todayUsd,
    "cost,weekUsd," + state.costs.weekUsd,
    "cost,workspaceTodayUsd," + (state.costs.workspaceTodayUsd ?? ""),
    "cost,filesScanned," + state.costs.filesScanned,
    "",
    "date,costUsd,inputTokens,outputTokens,cacheCreation,cacheRead,messages",
    "",
    "model,displayName,costUsd,shareOfCost,inputTokens,outputTokens,cacheCreation,cacheRead,messages",
  ];

  for (const row of state.costs.daily) {
    lines.push(
      [
        row.date,
        row.costUsd.toFixed(4),
        row.tokens.input,
        row.tokens.output,
        row.tokens.cacheCreation,
        row.tokens.cacheRead,
        row.messageCount,
      ].join(",")
    );
  }

  for (const m of state.costs.byModel) {
    lines.push(
      [
        m.modelId,
        m.displayName,
        m.costUsd.toFixed(4),
        m.shareOfCost.toFixed(4),
        m.tokens.input,
        m.tokens.output,
        m.tokens.cacheCreation,
        m.tokens.cacheRead,
        m.messageCount,
      ].join(",")
    );
  }

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(
      `claude-usage-${new Date().toISOString().slice(0, 10)}.csv`
    ),
    filters: { CSV: ["csv"] },
  });
  if (!uri) {
    return;
  }
  await vscode.workspace.fs.writeFile(
    uri,
    Buffer.from(lines.join("\n"), "utf8")
  );
  void vscode.window.showInformationMessage(
    `Exportado: ${uri.fsPath}`
  );
}

import type { ClaudeAccount } from "../usage/accountSelection";
import type { ClaudeUsageSnapshot, FullUsageState } from "../usage/types";

export function accountShortLabel(account: ClaudeAccount): string {
  return account.label;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatUsd(value: number): string {
  if (value < 0.01 && value > 0) {
    return "<$0.01";
  }
  return `$${value.toFixed(2)}`;
}

export function formatResetTime(unixSeconds?: number): string {
  if (!unixSeconds) {
    return "—";
  }
  const diffMs = unixSeconds * 1000 - Date.now();
  if (diffMs <= 0) {
    return "em breve";
  }
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function utilizationColor(
  utilization: number
): string | undefined {
  if (utilization >= 0.9) {
    return "statusBarItem.errorBackground";
  }
  if (utilization >= 0.7) {
    return "statusBarItem.warningBackground";
  }
  return undefined;
}

export function statusBarIcon(snapshot: ClaudeUsageSnapshot): string {
  if (snapshot.unavailableReason) {
    return "$(warning)";
  }
  const max = Math.max(snapshot.data.utilization5h, snapshot.data.utilization7d);
  if (max >= 0.9) {
    return "$(error)";
  }
  if (max >= 0.7) {
    return "$(bell)";
  }
  if (snapshot.data.limitStatus === "blocked") {
    return "$(circle-slash)";
  }
  return "$(sparkle)";
}

export function statusBarText(
  state: FullUsageState,
  accountLabel: string
): string {
  const { quota: snapshot, costs } = state;
  const prefix = `[${accountLabel}]`;
  if (snapshot.unavailableReason) {
    return `${prefix} $(warning) sem quota`;
  }
  const isTeamExtra =
    snapshot.source === "api" && Boolean(snapshot.data.extraUsage?.isEnabled);
  const label = isTeamExtra ? "Extra" : "5h";
  const five = formatPercent(snapshot.data.utilization5h);
  const reset = formatResetTime(snapshot.data.reset5hAt);
  const staleMark = snapshot.isStale ? "$(history) " : "";
  const parts = [`${prefix} ${staleMark}${statusBarIcon(snapshot)} ${five} (${label})`];
  if (snapshot.data.reset5hAt) {
    parts.push(`↻ ${reset}`);
  }
  if (costs.todayUsd > 0 || state.costs.filesScanned > 0) {
    parts.push(`· ${formatUsd(costs.todayUsd)} hoje`);
  }
  return parts.join(" ");
}

export function statusBarTooltip(state: FullUsageState): string {
  const { quota: snapshot, costs, statsCache } = state;
  const lines: string[] = [
    `Conta: ${state.activeConfig.label}`,
    `Pasta: ${state.activeConfig.dir}`,
    `Fonte quota: ${snapshot.source === "api" ? "API Anthropic" : "cache local"}`,
    `Atualizado: ${snapshot.updatedAt}`,
  ];
  if (snapshot.isStale && snapshot.staleMinutes !== undefined) {
    lines.push(`(cache — ${snapshot.staleMinutes} min atrás)`);
  }
  if (snapshot.cachePath) {
    lines.push(`Cache: ${snapshot.cachePath}`);
  }

  if (snapshot.unavailableReason) {
    lines.push("", snapshot.unavailableReason);
    return lines.join("\n");
  }

  const { data } = snapshot;
  lines.push(
    "",
    `5h: ${formatPercent(data.utilization5h)} — reset em ${formatResetTime(data.reset5hAt)}`,
    `7d: ${formatPercent(data.utilization7d)} — reset em ${formatResetTime(data.reset7dAt)}`
  );
  if (data.limitStatus) {
    lines.push(`Status: ${data.limitStatus}`);
  }
  if (data.sevenDaySonnet) {
    lines.push(
      `Sonnet 7d: ${formatPercent(data.sevenDaySonnet.utilization)}`
    );
  }
  if (data.extraUsage?.isEnabled) {
    const extra = data.extraUsage;
    lines.push(
      `Extra usage (Team): ${
        extra.utilization !== undefined
          ? formatPercent(extra.utilization)
          : "ativo"
      }`
    );
    if (extra.usedCredits !== undefined && extra.monthlyLimit !== undefined) {
      lines.push(
        `Créditos: ${extra.usedCredits.toFixed(0)} / ${extra.monthlyLimit.toFixed(0)}`
      );
    }
  }

  lines.push(
    "",
    `Custo hoje (est.): ${formatUsd(costs.todayUsd)}`,
    `Custo ${costs.daily.length}d (est.): ${formatUsd(costs.weekUsd)}`,
    `Arquivos JSONL: ${costs.filesScanned}`
  );
  if (costs.byModel.length > 0) {
    lines.push("", "Por modelo (período):");
    for (const m of costs.byModel.slice(0, 5)) {
      lines.push(
        `  ${m.displayName}: ${formatUsd(m.costUsd)} (${formatPercent(m.shareOfCost)})`
      );
    }
  }
  if (costs.workspaceTodayUsd !== undefined) {
    lines.push(`Custo workspace hoje: ${formatUsd(costs.workspaceTodayUsd)}`);
  }
  if (statsCache?.totalCostUsd !== undefined) {
    lines.push(`Stats cache total: ${formatUsd(statsCache.totalCostUsd)}`);
  }

  lines.push("", "Clique: painel · botão direito: trocar conta");
  return lines.join("\n");
}

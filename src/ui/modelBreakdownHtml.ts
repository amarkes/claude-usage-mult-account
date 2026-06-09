import type { ModelUsageRow } from "../usage/types";
import { formatPercent } from "./format";
import { formatUsd } from "./format";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderModelBreakdown(
  byModel: ModelUsageRow[],
  periodLabel: string
): string {
  if (byModel.length === 0) {
    return `<h3>Por modelo</h3><p class="muted">Sem uso com modelo identificado no período.</p>`;
  }

  const maxCost = Math.max(...byModel.map((m) => m.costUsd), 0.01);
  const rows = byModel
    .map((m) => {
      const pct = Math.min(100, Math.round((m.costUsd / maxCost) * 100));
      const share = formatPercent(m.shareOfCost);
      const tokens = m.tokens;
      const inOut = (tokens.input + tokens.output).toLocaleString();
      const cache = (tokens.cacheCreation + tokens.cacheRead).toLocaleString();
      return `<tr>
        <td>${esc(m.displayName)}</td>
        <td class="bar-cell"><div class="model-bar"><div class="model-fill" style="width:${pct}%"></div></div></td>
        <td>${formatUsd(m.costUsd)}</td>
        <td>${share}</td>
        <td class="muted">${m.messageCount} msgs · ${inOut} tok · cache ${cache}</td>
      </tr>`;
    })
    .join("");

  return `<h3>Por modelo <span class="muted">(${esc(periodLabel)})</span></h3>
  <table class="model-table">
    <thead><tr>
      <th>Modelo</th><th></th><th>Custo</th><th>%</th><th>Detalhe</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export const MODEL_TABLE_STYLES = `
.model-table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0 16px; }
.model-table th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); opacity: 0.85; font-weight: 600; }
.model-table td { padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: middle; }
.model-table .bar-cell { width: 28%; min-width: 80px; }
.model-bar { height: 8px; background: var(--vscode-progressBar-background); border-radius: 4px; overflow: hidden; }
.model-fill { height: 100%; background: var(--vscode-charts-purple, var(--vscode-charts-blue)); }
.model-table .muted { opacity: 0.75; font-size: 11px; }
`;

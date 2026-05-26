import type { AccountOption, SelectableProfile } from "../usage/accountSelection";
import { ACCOUNT_OPTIONS } from "../usage/accountSelection";

export function renderAccountSelect(
  selected: SelectableProfile,
  options: AccountOption[] = ACCOUNT_OPTIONS
): string {
  const opts = options
    .map(
      (o) =>
        `<option value="${o.id}"${o.id === selected ? " selected" : ""}>${o.label} — ${o.description}</option>`
    )
    .join("");
  return `<label class="account-label" for="account-select">Conta</label>
  <select id="account-select" class="account-select" aria-label="Selecionar conta Claude">${opts}</select>`;
}

export const ACCOUNT_SELECT_SCRIPT = `
(function() {
  const vscode = acquireVsCodeApi();
  const sel = document.getElementById('account-select');
  if (!sel) return;
  sel.addEventListener('change', () => {
    vscode.postMessage({ type: 'setProfile', profile: sel.value });
  });
})();
`;

export const ACCOUNT_SELECT_STYLES = `
.account-row { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.account-label { font-weight: 600; font-size: 13px; }
.account-select {
  flex: 1; min-width: 200px; max-width: 100%;
  padding: 6px 10px;
  font-family: var(--vscode-font-family);
  font-size: 13px;
  color: var(--vscode-foreground);
  background: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 4px;
}
`;

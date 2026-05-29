import type { ClaudeAccount } from "../usage/accountSelection";

export function renderAccountSelect(
  selectedId: string,
  accounts: ClaudeAccount[],
  options?: { showManage?: boolean }
): string {
  const opts = accounts
    .map(
      (a) =>
        `<option value="${escAttr(a.id)}"${a.id === selectedId ? " selected" : ""}>${escHtml(a.label)} — ${escHtml(a.description)}</option>`
    )
    .join("");

  const customList =
    options?.showManage && accounts.some((a) => !a.isDefault)
      ? `<ul class="account-custom-list">${accounts
          .filter((a) => !a.isDefault)
          .map(
            (a) =>
              `<li>
          <span class="custom-name">${escHtml(a.label)}</span>
          <span class="custom-path">${escHtml(a.description)}</span>
          <button type="button" class="btn-remove" data-remove="${escAttr(a.id)}" title="Remover conta">Remover</button>
        </li>`
          )
          .join("")}</ul>`
      : "";

  const manageRow = options?.showManage
    ? `<button type="button" id="btn-add-account" class="btn-add" title="Cadastrar pasta do Claude Code">
        + Adicionar pasta
      </button>
      ${customList}`
    : "";

  return `<div class="account-picker">
  <label class="account-label" for="account-select">Conta</label>
  <select id="account-select" class="account-select" aria-label="Selecionar conta Claude">${opts}</select>
  ${manageRow}
</div>`;
}

export const ACCOUNT_SELECT_SCRIPT = `
(function() {
  const vscode = window.__cvscode !== undefined ? window.__cvscode : (window.__cvscode = acquireVsCodeApi());
  const sel = document.getElementById('account-select');
  if (sel) {
    sel.addEventListener('change', () => {
      vscode.postMessage({ type: 'setAccount', accountId: sel.value });
    });
  }
  const addBtn = document.getElementById('btn-add-account');
  if (addBtn) {
    addBtn.addEventListener('click', () => vscode.postMessage({ type: 'addAccount' }));
  }
  document.querySelectorAll('.btn-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-remove');
      if (id) vscode.postMessage({ type: 'removeAccount', accountId: id });
    });
  });
})();
`;

export const ACCOUNT_SELECT_STYLES = `
.account-row { margin-bottom: 16px; }
.account-picker { display: flex; flex-direction: column; gap: 8px; }
.account-label { font-weight: 600; font-size: 13px; }
.account-select {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  font-family: var(--vscode-font-family);
  font-size: 13px;
  color: var(--vscode-foreground);
  background: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 4px;
}
.btn-add, .btn-remove {
  font-family: var(--vscode-font-family);
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
  border: 1px solid var(--vscode-button-border, transparent);
}
.btn-add {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  margin-top: 4px;
  font-weight: 600;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}
.btn-add:hover { background: var(--vscode-button-hoverBackground); }
.account-custom-list {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  font-size: 12px;
}
.account-custom-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid var(--vscode-panel-border);
  flex-wrap: wrap;
}
.custom-name { font-weight: 600; }
.custom-path { opacity: 0.75; flex: 1; min-width: 120px; }
.btn-remove {
  padding: 2px 8px;
  background: transparent;
  color: var(--vscode-errorForeground);
}
.btn-remove:hover { background: var(--vscode-inputValidation-errorBackground); }
`;

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(s: string): string {
  return escHtml(s).replace(/"/g, "&quot;");
}

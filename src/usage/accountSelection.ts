import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { getDefaultClaudeDir, getClaudeWorkDir } from "./paths";

export const DEFAULT_ACCOUNT_ID = "default";

export interface ClaudeAccount {
  id: string;
  label: string;
  dir: string;
  description: string;
  isDefault: boolean;
}

interface StoredCustomAccount {
  id: string;
  label: string;
  dir: string;
}

const STORAGE_SELECTED = "selectedAccountId";
const STORAGE_CUSTOM = "customAccounts";
const STORAGE_MIGRATED = "accountsV2";
const LEGACY_SELECTED = "selectedProfile";

export class AccountSelectionService implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private customAccounts: StoredCustomAccount[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.customAccounts =
      this.context.globalState.get<StoredCustomAccount[]>(STORAGE_CUSTOM) ?? [];

    if (!this.context.globalState.get<boolean>(STORAGE_MIGRATED)) {
      this.runMigration();
    }

    this.ensureValidSelection();
  }

  private runMigration(): void {
    const legacy = this.context.globalState.get<string>(LEGACY_SELECTED);
    const workDir = path.resolve(getClaudeWorkDir());

    if (legacy === "claude-work" && !this.hasCustomDir(workDir)) {
      const id = newCustomId();
      this.customAccounts.push({
        id,
        label: "Trabalho",
        dir: workDir,
      });
      void this.context.globalState.update(STORAGE_SELECTED, id);
    } else if (!this.context.globalState.get<string>(STORAGE_SELECTED)) {
      void this.context.globalState.update(STORAGE_SELECTED, DEFAULT_ACCOUNT_ID);
    }

    void this.context.globalState.update(STORAGE_CUSTOM, this.customAccounts);
    void this.context.globalState.update(STORAGE_MIGRATED, true);
  }

  private hasCustomDir(dir: string): boolean {
    const target = path.resolve(dir);
    return this.customAccounts.some((a) => path.resolve(a.dir) === target);
  }

  private ensureValidSelection(): void {
    const id = this.context.globalState.get<string>(STORAGE_SELECTED);
    if (!id || !this.getAccounts().some((a) => a.id === id)) {
      void this.context.globalState.update(STORAGE_SELECTED, DEFAULT_ACCOUNT_ID);
    }
  }

  getAccounts(): ClaudeAccount[] {
    return [this.getDefaultAccount(), ...this.customAccounts.map(toClaudeAccount)];
  }

  getCustomAccounts(): ClaudeAccount[] {
    return this.customAccounts.map(toClaudeAccount);
  }

  getDefaultAccount(): ClaudeAccount {
    const dir = getDefaultClaudeDir();
    return {
      id: DEFAULT_ACCOUNT_ID,
      label: "Padrão",
      dir,
      description: formatDirForDisplay(dir),
      isDefault: true,
    };
  }

  getSelectedAccountId(): string {
    const id = this.context.globalState.get<string>(STORAGE_SELECTED);
    if (id && this.getAccounts().some((a) => a.id === id)) {
      return id;
    }
    return DEFAULT_ACCOUNT_ID;
  }

  getSelectedAccount(): ClaudeAccount {
    const id = this.getSelectedAccountId();
    return this.getAccounts().find((a) => a.id === id) ?? this.getDefaultAccount();
  }

  /** Compatível com UI antiga. */
  getSelectedOption(): ClaudeAccount {
    return this.getSelectedAccount();
  }

  async setSelectedAccountId(accountId: string): Promise<void> {
    if (!this.getAccounts().some((a) => a.id === accountId)) {
      return;
    }
    if (accountId === this.getSelectedAccountId()) {
      return;
    }
    await this.context.globalState.update(STORAGE_SELECTED, accountId);
    this._onDidChange.fire();
  }

  async promptAddAccount(): Promise<ClaudeAccount | undefined> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: "Selecionar pasta",
      title: "Pasta de configuração do Claude Code",
      defaultUri: vscode.Uri.file(os.homedir()),
    });
    if (!picked?.[0]) {
      return undefined;
    }

    const dir = path.resolve(picked[0].fsPath);
    const defaultLabel = path.basename(dir) || "Conta";

    const label = await vscode.window.showInputBox({
      title: "Nome da conta",
      prompt: "Ex.: Trabalho, Cliente X",
      value: defaultLabel,
      validateInput: (v) => (v.trim() ? null : "Informe um nome"),
    });
    if (!label?.trim()) {
      return undefined;
    }

    return this.addCustomAccount(label.trim(), dir);
  }

  async addCustomAccount(label: string, dirInput: string): Promise<ClaudeAccount> {
    const dir = expandHome(dirInput.trim());

    if (!path.isAbsolute(dir)) {
      throw new Error("Use um caminho absoluto ou começando com ~");
    }

    if (this.hasCustomDir(dir) || path.resolve(dir) === path.resolve(getDefaultClaudeDir())) {
      throw new Error("Esta pasta já está cadastrada");
    }

    if (!fs.existsSync(dir)) {
      const create = await vscode.window.showWarningMessage(
        `A pasta não existe:\n${dir}\nCadastrar mesmo assim?`,
        "Cadastrar",
        "Cancelar"
      );
      if (create !== "Cadastrar") {
        throw new Error("Cadastro cancelado");
      }
    }

    const account: StoredCustomAccount = {
      id: newCustomId(),
      label,
      dir,
    };
    this.customAccounts.push(account);
    await this.persistCustom();
    await this.setSelectedAccountId(account.id);
    void vscode.window.showInformationMessage(
      `Conta "${label}" adicionada (${formatDirForDisplay(dir)})`
    );
    return toClaudeAccount(account);
  }

  async removeCustomAccount(accountId: string): Promise<void> {
    if (accountId === DEFAULT_ACCOUNT_ID) {
      return;
    }
    const idx = this.customAccounts.findIndex((a) => a.id === accountId);
    if (idx < 0) {
      return;
    }
    const removed = this.customAccounts[idx];
    this.customAccounts.splice(idx, 1);
    await this.persistCustom();

    if (this.getSelectedAccountId() === accountId) {
      await this.context.globalState.update(STORAGE_SELECTED, DEFAULT_ACCOUNT_ID);
    }
    this._onDidChange.fire();
    void vscode.window.showInformationMessage(
      `Conta "${removed.label}" removida`
    );
  }

  async pickAccount(): Promise<string | undefined> {
    const current = this.getSelectedAccountId();
    const accounts = this.getAccounts();

    type PickItem = vscode.QuickPickItem & { accountId: string };

    const items: PickItem[] = accounts.map((a) => ({
      label: a.id === current ? `$(check) ${a.label}` : a.label,
      description: a.description,
      detail: a.isDefault ? "Conta padrão (~/.claude)" : a.dir,
      accountId: a.id,
    }));

    items.push({
      label: "$(add) Adicionar pasta…",
      description: "Cadastrar outro diretório Claude",
      accountId: "__add__",
      alwaysShow: true,
    });

    const picked = await vscode.window.showQuickPick(items, {
      title: "Conta Claude",
      placeHolder: "Qual pasta de configuração usar?",
    });
    if (!picked) {
      return undefined;
    }

    if (picked.accountId === "__add__") {
      const added = await this.promptAddAccount();
      return added?.id;
    }

    await this.setSelectedAccountId(picked.accountId);
    return picked.accountId;
  }

  async promptRemoveAccount(): Promise<void> {
    const custom = this.getCustomAccounts();
    if (custom.length === 0) {
      void vscode.window.showInformationMessage(
        "Não há contas customizadas. A conta Padrão não pode ser removida."
      );
      return;
    }

    type PickItem = vscode.QuickPickItem & { accountId: string };
    const picked = await vscode.window.showQuickPick<PickItem>(
      custom.map((a) => ({
        label: a.label,
        description: a.description,
        accountId: a.id,
      })),
      { title: "Remover conta", placeHolder: "Qual conta remover?" }
    );
    if (!picked) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Remover a conta "${picked.label}"?`,
      { modal: true },
      "Remover"
    );
    if (confirm === "Remover") {
      await this.removeCustomAccount(picked.accountId);
    }
  }

  private async persistCustom(): Promise<void> {
    await this.context.globalState.update(STORAGE_CUSTOM, this.customAccounts);
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

function newCustomId(): string {
  return `acc-${Date.now().toString(36)}`;
}

function expandHome(p: string): string {
  return path.resolve(p.replace(/^~(?=\/|$)/, os.homedir()));
}

export function formatDirForDisplay(dir: string): string {
  const home = os.homedir();
  const resolved = path.resolve(dir);
  if (resolved.startsWith(home)) {
    return "~" + resolved.slice(home.length);
  }
  return resolved;
}

function toClaudeAccount(stored: StoredCustomAccount): ClaudeAccount {
  return {
    id: stored.id,
    label: stored.label,
    dir: stored.dir,
    description: formatDirForDisplay(stored.dir),
    isDefault: false,
  };
}

import * as vscode from "vscode";
import type { ConfigProfile } from "./paths";

/** Perfis selecionáveis na UI (duas contas). */
export type SelectableProfile = "claude" | "claude-work";

export interface AccountOption {
  id: SelectableProfile;
  label: string;
  description: string;
}

export const ACCOUNT_OPTIONS: AccountOption[] = [
  {
    id: "claude",
    label: "Pessoal",
    description: "~/.claude",
  },
  {
    id: "claude-work",
    label: "Trabalho (Team)",
    description: "~/.claude-work",
  },
];

const STORAGE_KEY = "selectedProfile";

export class AccountSelectionService implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<SelectableProfile>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  getSelectedProfile(): SelectableProfile {
    const stored = this.context.globalState.get<SelectableProfile>(STORAGE_KEY);
    if (stored === "claude" || stored === "claude-work") {
      return stored;
    }
    const cfg = vscode.workspace
      .getConfiguration("claudeUsage")
      .get<string>("configProfile", "default");
    return cfg === "claude-work" ? "claude-work" : "claude";
  }

  getSelectedOption(): AccountOption {
    const id = this.getSelectedProfile();
    return ACCOUNT_OPTIONS.find((o) => o.id === id) ?? ACCOUNT_OPTIONS[0];
  }

  toConfigProfile(profile: SelectableProfile): ConfigProfile {
    return profile === "claude-work" ? "claude-work" : "default";
  }

  async setSelectedProfile(profile: SelectableProfile): Promise<void> {
    if (profile === this.getSelectedProfile()) {
      return;
    }
    await this.context.globalState.update(STORAGE_KEY, profile);
    const cfg = vscode.workspace.getConfiguration("claudeUsage");
    await cfg.update(
      "configProfile",
      this.toConfigProfile(profile),
      vscode.ConfigurationTarget.Global
    );
    await cfg.update("configDir", "", vscode.ConfigurationTarget.Global);
    this._onDidChange.fire(profile);
  }

  async pickAccount(): Promise<SelectableProfile | undefined> {
    const current = this.getSelectedProfile();
    const picked = await vscode.window.showQuickPick(
      ACCOUNT_OPTIONS.map((o) => ({
        label: o.id === current ? `$(check) ${o.label}` : o.label,
        description: o.description,
        detail:
          o.id === "claude-work"
            ? "Conta Team — quota via API / extra usage"
            : "Conta pessoal — cache local ou API",
        id: o.id,
      })),
      {
        title: "Conta Claude",
        placeHolder: "Qual conta exibir?",
      }
    );
    if (!picked) {
      return undefined;
    }
    await this.setSelectedProfile(picked.id);
    return picked.id;
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

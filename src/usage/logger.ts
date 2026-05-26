import * as vscode from "vscode";

const CHANNEL_NAME = "Claude Usage";

export class UsageLogger {
  private channel: vscode.OutputChannel | undefined;

  private getChannel(): vscode.OutputChannel {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel(CHANNEL_NAME);
    }
    return this.channel;
  }

  isEnabled(): boolean {
    return vscode.workspace
      .getConfiguration("claudeUsage")
      .get<boolean>("debug", false);
  }

  log(message: string): void {
    if (!this.isEnabled()) {
      return;
    }
    const line = `[${new Date().toISOString()}] ${message}`;
    this.getChannel().appendLine(line);
  }

  show(): void {
    this.getChannel().show(true);
  }

  dispose(): void {
    this.channel?.dispose();
  }
}

import { execFile } from "child_process";
import * as crypto from "crypto";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import type { OAuthTokens } from "./credentials";

const execFileAsync = promisify(execFile);

interface CredentialsFile {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    scopes?: string[];
  };
  oauthAccount?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

/** Mesma lógica do Claude Code: hash do path quando não é a pasta padrão. */
export function keychainServicesForConfigDir(configDir: string): string[] {
  const resolved = path.resolve(configDir).normalize("NFC");
  const hash = crypto
    .createHash("sha256")
    .update(resolved)
    .digest("hex")
    .slice(0, 8);
  const services = [`Claude Code-credentials-${hash}`];
  if (resolved === path.resolve(os.homedir(), ".claude")) {
    services.push("Claude Code-credentials");
  }
  return services;
}

function parseCredentialsJson(raw: string): OAuthTokens | null {
  let creds: CredentialsFile;
  try {
    creds = JSON.parse(raw) as CredentialsFile;
  } catch {
    return null;
  }
  const oauth = creds.claudeAiOauth ?? creds.oauthAccount;
  if (!oauth?.accessToken) {
    return null;
  }
  return {
    accessToken: oauth.accessToken,
    refreshToken: oauth.refreshToken,
    expiresAt: oauth.expiresAt,
    scopes: creds.claudeAiOauth?.scopes,
  };
}

export async function loadOAuthFromKeychain(
  configDir: string
): Promise<{ tokens: OAuthTokens; source: string } | null> {
  if (process.platform !== "darwin") {
    return null;
  }

  const account =
    process.env.USER?.trim() || os.userInfo().username || "claude-code-user";

  for (const service of keychainServicesForConfigDir(configDir)) {
    try {
      const { stdout } = await execFileAsync(
        "security",
        ["find-generic-password", "-a", account, "-w", "-s", service],
        { timeout: 5000 }
      );
      const tokens = parseCredentialsJson(stdout.trim());
      if (tokens) {
        return { tokens, source: `keychain:${service}` };
      }
    } catch {
      // try next service name
    }
  }
  return null;
}

export async function saveOAuthToKeychain(
  configDir: string,
  credentials: CredentialsFile
): Promise<boolean> {
  if (process.platform !== "darwin") {
    return false;
  }
  const account =
    process.env.USER?.trim() || os.userInfo().username || "claude-code-user";
  const json = JSON.stringify(credentials);
  for (const service of keychainServicesForConfigDir(configDir)) {
    try {
      await execFileAsync(
        "security",
        [
          "add-generic-password",
          "-a",
          account,
          "-s",
          service,
          "-w",
          json,
          "-U",
        ],
        { timeout: 8000 }
      );
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

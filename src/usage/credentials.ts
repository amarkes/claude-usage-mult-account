import * as fs from "fs/promises";
import {
  loadOAuthFromKeychain,
  saveOAuthToKeychain,
} from "./keychainCredentials";

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
  subscriptionType?: string;
}

interface CredentialsFile {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    scopes?: string[];
    subscriptionType?: string;
  };
  oauthAccount?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

const CLAUDE_CODE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const EXPIRY_BUFFER_MS = 60_000;

export async function loadOAuthFromPaths(
  paths: string[]
): Promise<{ tokens: OAuthTokens; path: string } | null> {
  for (const filePath of paths) {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }
    let creds: CredentialsFile;
    try {
      creds = JSON.parse(raw) as CredentialsFile;
    } catch {
      continue;
    }
    const oauth = creds.claudeAiOauth ?? creds.oauthAccount;
    if (oauth?.accessToken) {
      return {
        path: filePath,
        tokens: {
          accessToken: oauth.accessToken,
          refreshToken: oauth.refreshToken,
          expiresAt: oauth.expiresAt,
          scopes: creds.claudeAiOauth?.scopes,
          subscriptionType: creds.claudeAiOauth?.subscriptionType,
        },
      };
    }
  }
  return null;
}

export function isTokenExpiringSoon(expiresAt?: number): boolean {
  if (!expiresAt) {
    return false;
  }
  return Date.now() >= expiresAt - EXPIRY_BUFFER_MS;
}

export async function refreshOAuthToken(
  tokens: OAuthTokens,
  credentialsPath: string
): Promise<OAuthTokens | null> {
  if (!tokens.refreshToken) {
    return null;
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: CLAUDE_CODE_CLIENT_ID,
  });
  if (tokens.scopes?.length) {
    body.set("scope", tokens.scopes.join(" "));
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  const updated: OAuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes: data.scope ? data.scope.split(" ") : tokens.scopes,
  };

  await persistRefreshedTokens(credentialsPath, updated);
  return updated;
}

async function persistRefreshedTokens(
  credentialsPath: string,
  tokens: OAuthTokens
): Promise<void> {
  let creds: CredentialsFile;
  try {
    const raw = await fs.readFile(credentialsPath, "utf8");
    creds = JSON.parse(raw) as CredentialsFile;
  } catch {
    return;
  }
  if (creds.claudeAiOauth) {
    creds.claudeAiOauth.accessToken = tokens.accessToken;
    if (tokens.refreshToken) {
      creds.claudeAiOauth.refreshToken = tokens.refreshToken;
    }
    if (tokens.expiresAt) {
      creds.claudeAiOauth.expiresAt = tokens.expiresAt;
    }
  } else if (creds.oauthAccount) {
    creds.oauthAccount.accessToken = tokens.accessToken;
    if (tokens.refreshToken) {
      creds.oauthAccount.refreshToken = tokens.refreshToken;
    }
    if (tokens.expiresAt) {
      creds.oauthAccount.expiresAt = tokens.expiresAt;
    }
  } else {
    creds.claudeAiOauth = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
    };
  }
  await fs.writeFile(credentialsPath, JSON.stringify(creds, null, 2), {
    mode: 0o600,
  });
}

/** Lê só o tipo de assinatura (pro/team/enterprise) sem tocar na rede. */
export async function resolveSubscriptionPlan(
  credentialPaths: string[],
  configDir?: string
): Promise<string | undefined> {
  const loaded = await loadOAuthFromPaths(credentialPaths);
  if (loaded?.tokens.subscriptionType) {
    return loaded.tokens.subscriptionType;
  }
  if (configDir) {
    const fromKeychain = await loadOAuthFromKeychain(configDir);
    return fromKeychain?.tokens.subscriptionType;
  }
  return undefined;
}

export async function resolveAccessToken(
  credentialPaths: string[],
  configDir?: string
): Promise<{ token: string; path: string } | null> {
  let loaded = await loadOAuthFromPaths(credentialPaths);
  let credPath = loaded?.path ?? credentialPaths[0] ?? "";

  if (!loaded && configDir) {
    const fromKeychain = await loadOAuthFromKeychain(configDir);
    if (fromKeychain) {
      loaded = {
        tokens: fromKeychain.tokens,
        path: fromKeychain.source,
      };
      credPath = fromKeychain.source;
    }
  }

  if (!loaded) {
    return null;
  }

  let { tokens } = loaded;
  if (isTokenExpiringSoon(tokens.expiresAt) && tokens.refreshToken) {
    const refreshed = await refreshOAuthToken(tokens, credPath);
    if (refreshed) {
      tokens = refreshed;
      if (credPath.startsWith("keychain:") && configDir) {
        await saveOAuthToKeychain(configDir, {
          claudeAiOauth: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt,
            scopes: tokens.scopes,
          },
        });
      }
    }
  }
  return { token: tokens.accessToken, path: credPath };
}

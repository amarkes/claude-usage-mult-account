import * as os from "os";
import * as path from "path";

/** Perfis conhecidos. `default` = ~/.claude (ignora $CLAUDE_CONFIG_DIR). */
export type ConfigProfile = "default" | "claude" | "claude-work";

export interface ResolvedClaudePaths {
  configDir: string;
  profile: ConfigProfile | "custom";
  label: string;
  statusCachePath: string;
  credentialsPath: string;
  projectsPath: string;
  statsCachePath: string;
}

export function getDefaultClaudeDir(): string {
  return path.join(os.homedir(), ".claude");
}

export function getClaudeWorkDir(): string {
  return path.join(os.homedir(), ".claude-work");
}

function expandHome(p: string): string {
  return path.resolve(p.replace(/^~(?=\/|$)/, os.homedir()));
}

function buildResolved(
  configDir: string,
  profile: ResolvedClaudePaths["profile"]
): ResolvedClaudePaths {
  const label =
    profile === "custom"
      ? configDir
      : profile === "claude-work"
        ? "~/.claude-work"
        : "~/.claude";

  return {
    configDir,
    profile,
    label,
    statusCachePath: path.join(configDir, "vscode-claude-status-cache.json"),
    credentialsPath: path.join(configDir, ".credentials.json"),
    projectsPath: path.join(configDir, "projects"),
    statsCachePath: path.join(configDir, "stats-cache.json"),
  };
}

/**
 * Resolve a pasta ativa do Claude.
 * Prioridade: `customDir` (settings) > `profile` > default ~/.claude
 */
export function resolveClaudePaths(options: {
  profile?: string;
  customDir?: string;
}): ResolvedClaudePaths {
  const custom = options.customDir?.trim();
  if (custom) {
    return buildResolved(expandHome(custom), "custom");
  }

  const profile = normalizeProfile(options.profile);
  switch (profile) {
    case "claude-work":
      return buildResolved(getClaudeWorkDir(), "claude-work");
    case "claude":
      return buildResolved(getDefaultClaudeDir(), "claude");
    case "default":
    default:
      return buildResolved(getDefaultClaudeDir(), "default");
  }
}

function normalizeProfile(value?: string): ConfigProfile {
  if (value === "claude-work" || value === "claude") {
    return value;
  }
  return "default";
}

/** Todas as pastas conhecidas — só para tabela de comparação na UI. */
export function getKnownProfileDirs(): { label: string; dir: string }[] {
  return [
    { label: ".claude", dir: getDefaultClaudeDir() },
    { label: "claude-work", dir: getClaudeWorkDir() },
  ];
}

export function getStatusCachePath(configDir: string): string {
  return path.join(configDir, "vscode-claude-status-cache.json");
}

export function workspaceToProjectSlug(workspacePath: string): string {
  const normalized = path.resolve(workspacePath);
  if (normalized === "/") {
    return "-";
  }
  return normalized.replace(/\//g, "-");
}

export function projectPathMatchesWorkspace(
  projectDirName: string,
  workspacePath?: string
): boolean {
  if (!workspacePath) {
    return true;
  }
  const slug = workspaceToProjectSlug(workspacePath);
  return projectDirName.includes(slug) || slug.includes(projectDirName);
}

import type { ClaudeUsageSnapshot, ClaudeUsageData } from "./types";
import { resolveAccessToken } from "./credentials";
import { normalizeUtilization, parseResetsAt } from "./utilization";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

export type UsageApiErrorCode =
  | "no_auth"
  | "rate_limit"
  | "http_error"
  | "parse_error";

export class UsageApiError extends Error {
  constructor(
    message: string,
    readonly code: UsageApiErrorCode,
    readonly status?: number
  ) {
    super(message);
    this.name = "UsageApiError";
  }
}

interface OAuthUsageResponse {
  five_hour?: { utilization: number | null; resets_at?: number | string | null };
  seven_day?: { utilization: number | null; resets_at?: number | string | null };
  seven_day_sonnet?: {
    utilization: number | null;
    resets_at?: number | string | null;
  };
  extra_usage?: {
    is_enabled?: boolean;
    monthly_limit?: number;
    used_credits?: number;
    utilization?: number | null;
    currency?: string;
    disabled_reason?: string | null;
  };
  omelette_promotional?: {
    utilization: number | null;
    resets_at?: number | string | null;
  };
}

function pickWindow(
  w?: {
    utilization: number | null;
    resets_at?: number | string | null;
  } | null
): { utilization: number; resetsAt?: number } | undefined {
  if (!w || w.utilization === null || w.utilization === undefined) {
    return undefined;
  }
  return {
    utilization: normalizeUtilization(w.utilization),
    resetsAt: parseResetsAt(w.resets_at),
  };
}

function extraCreditsRatio(
  extra: NonNullable<OAuthUsageResponse["extra_usage"]>
): number | undefined {
  const limit = extra.monthly_limit;
  const used = extra.used_credits;
  if (
    limit === undefined ||
    limit <= 0 ||
    used === undefined ||
    !Number.isFinite(used)
  ) {
    return undefined;
  }
  return Math.min(1, used / limit);
}

function mapExtraUsage(
  extra: NonNullable<OAuthUsageResponse["extra_usage"]>
): ClaudeUsageData["extraUsage"] {
  const fromCredits = extraCreditsRatio(extra);
  const fromApi =
    extra.utilization !== null && extra.utilization !== undefined
      ? normalizeUtilization(extra.utilization)
      : undefined;

  return {
    isEnabled: extra.is_enabled !== false,
    monthlyLimit: extra.monthly_limit,
    usedCredits: extra.used_credits,
    utilization: fromApi ?? fromCredits,
    currency: extra.currency ?? undefined,
  };
}

function mapExtraOnlyQuota(
  extra: NonNullable<OAuthUsageResponse["extra_usage"]>
): ClaudeUsageData {
  const mapped = mapExtraUsage(extra);
  const util =
    mapped?.utilization ??
    extraCreditsRatio(extra) ??
    0;

  return {
    utilization5h: util,
    utilization7d: util,
    limitStatus: "allowed",
    extraUsage: mapped,
    quotaFromExtraOnly: true,
  };
}

export function mapApiResponse(body: OAuthUsageResponse): ClaudeUsageData | null {
  const five = pickWindow(body.five_hour);
  const seven = pickWindow(body.seven_day);
  const sonnet = pickWindow(body.seven_day_sonnet);

  if (five || seven) {
    const data: ClaudeUsageData = {
      utilization5h: five?.utilization ?? 0,
      utilization7d: seven?.utilization ?? 0,
      reset5hAt: five?.resetsAt,
      reset7dAt: seven?.resetsAt,
      quotaFromExtraOnly: false,
    };
    if (sonnet) {
      data.sevenDaySonnet = sonnet;
    }
    if (body.extra_usage) {
      data.extraUsage = mapExtraUsage(body.extra_usage);
    }
    return data;
  }

  const extra = body.extra_usage;
  if (extra?.is_enabled) {
    return mapExtraOnlyQuota(extra);
  }

  const promo = pickWindow(body.omelette_promotional);
  if (promo) {
    return {
      utilization5h: promo.utilization,
      utilization7d: promo.utilization,
      reset5hAt: promo.resetsAt,
      limitStatus: "allowed",
      quotaFromExtraOnly: false,
    };
  }

  return null;
}

export async function fetchUsageFromApi(
  credentialPaths: string[],
  configDir?: string
): Promise<ClaudeUsageSnapshot> {
  const auth = await resolveAccessToken(credentialPaths, configDir);
  if (!auth) {
    throw new UsageApiError(
      "Credenciais OAuth não encontradas (Keychain ou .credentials.json). Faça login no Claude Code nesta conta.",
      "no_auth"
    );
  }

  const res = await fetch(USAGE_URL, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (res.status === 429) {
    throw new UsageApiError(
      "API de uso temporariamente limitada (HTTP 429). Usando cache local se disponível.",
      "rate_limit",
      429
    );
  }

  if (!res.ok) {
    throw new UsageApiError(
      `API de uso retornou HTTP ${res.status}`,
      "http_error",
      res.status
    );
  }

  const body = (await res.json()) as OAuthUsageResponse;
  const data = mapApiResponse(body);
  if (!data) {
    throw new UsageApiError(
      "Resposta da API sem dados de quota reconhecidos (conta Team pode usar só extra_usage).",
      "parse_error"
    );
  }

  return {
    source: "api",
    updatedAt: new Date().toISOString(),
    data,
  };
}

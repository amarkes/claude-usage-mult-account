/** Converte utilização da API (0–100) ou cache legado para razão 0–1. */
export function normalizeUtilization(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  // API returns integer percentages (0–100). value=1 means 1%, not 100%.
  return value >= 1 ? value / 100 : value;
}

/** Aceita unix (s) ou ISO 8601 retornado pela API OAuth. */
export function parseResetsAt(
  value: number | string | null | undefined
): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "number") {
    if (value > 1e12) {
      return Math.floor(value / 1000);
    }
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    return undefined;
  }
  return Math.floor(ms / 1000);
}

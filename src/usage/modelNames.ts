/** Nome curto para exibição na UI. */
export function formatModelDisplayName(model?: string): string {
  if (!model?.trim()) {
    return "Desconhecido";
  }
  const m = model.toLowerCase();
  if (m.includes("opus")) {
    if (m.includes("4")) {
      return "Opus 4";
    }
    return "Opus";
  }
  if (m.includes("sonnet")) {
    if (m.includes("4-6") || m.includes("4.6")) {
      return "Sonnet 4.6";
    }
    if (m.includes("4-5") || m.includes("4.5")) {
      return "Sonnet 4.5";
    }
    if (m.includes("4")) {
      return "Sonnet 4";
    }
    return "Sonnet";
  }
  if (m.includes("haiku")) {
    if (m.includes("4-5") || m.includes("4.5")) {
      return "Haiku 4.5";
    }
    return "Haiku";
  }
  return model;
}

/** Chave estável para agregação (agrupa variantes do mesmo modelo). */
export function modelGroupKey(model?: string): string {
  if (!model?.trim()) {
    return "unknown";
  }
  return model.trim().toLowerCase();
}

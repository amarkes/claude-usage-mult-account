export interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
  cacheWritePerM: number;
  cacheReadPerM: number;
}

const SONNET: ModelPricing = {
  inputPerM: 3,
  outputPerM: 15,
  cacheWritePerM: 3.75,
  cacheReadPerM: 0.3,
};

const HAIKU: ModelPricing = {
  inputPerM: 0.25,
  outputPerM: 1.25,
  cacheWritePerM: 0.3,
  cacheReadPerM: 0.03,
};

const OPUS: ModelPricing = {
  inputPerM: 15,
  outputPerM: 75,
  cacheWritePerM: 18.75,
  cacheReadPerM: 1.5,
};

export function pricingForModel(model?: string): ModelPricing {
  const m = (model ?? "").toLowerCase();
  if (m.includes("haiku")) {
    return HAIKU;
  }
  if (m.includes("opus")) {
    return OPUS;
  }
  return SONNET;
}

export function costFromUsage(
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  },
  model?: string
): number {
  const p = pricingForModel(model);
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return (
    (input * p.inputPerM +
      output * p.outputPerM +
      cacheWrite * p.cacheWritePerM +
      cacheRead * p.cacheReadPerM) /
    1_000_000
  );
}

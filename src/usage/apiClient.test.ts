import assert from "node:assert/strict";
import { mapApiResponse } from "./apiClient";

// Pro: sessão 0%, semanal 13% (como /usage no Claude)
const pro = mapApiResponse({
  five_hour: { utilization: 0, resets_at: "2026-05-28T14:00:00Z" },
  seven_day: { utilization: 13, resets_at: "2026-05-29T00:00:00Z" },
  extra_usage: { is_enabled: false },
});
assert.ok(pro);
assert.equal(pro.utilization5h, 0);
assert.equal(pro.utilization7d, 0.13);
assert.equal(pro.quotaFromExtraOnly, false);
assert.equal(pro.reset7dAt, Date.parse("2026-05-29T00:00:00Z") / 1000);

// Só seven_day presente (five_hour null na API)
const partial = mapApiResponse({
  seven_day: { utilization: 13, resets_at: 1775808000 },
});
assert.ok(partial);
assert.equal(partial.utilization5h, 0);
assert.equal(partial.utilization7d, 0.13);

// Team: só extra_usage — não misturar com janelas reais
const team = mapApiResponse({
  extra_usage: {
    is_enabled: true,
    monthly_limit: 60000,
    used_credits: 3578,
  },
});
assert.ok(team);
assert.equal(team.quotaFromExtraOnly, true);
assert.ok(Math.abs(team.utilization7d - 3578 / 60000) < 0.001);

// extra habilitado mas janelas normais existem
const hybrid = mapApiResponse({
  five_hour: { utilization: 0, resets_at: 1775808000 },
  seven_day: { utilization: 13, resets_at: 1775808000 },
  extra_usage: { is_enabled: true, monthly_limit: 60000, used_credits: 3578 },
});
assert.ok(hybrid);
assert.equal(hybrid.utilization7d, 0.13);
assert.equal(hybrid.quotaFromExtraOnly, false);

console.log("apiClient.test.ts: ok");

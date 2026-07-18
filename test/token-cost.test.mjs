import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

const {
  createTokenCostReport,
  estimateTokenCount,
  summarizeTokenCosts,
} = await vite.ssrLoadModule("/src/features/ai-director/tokenCost.ts");

assert.equal(estimateTokenCount(""), 0);
assert.ok(estimateTokenCount("Une phrase française assez courte.") > 0);

const measuredTrace = {
  id: "trace-measured",
  agentId: "worldManager",
  timestamp: 1,
  durationMs: 120,
  status: 200,
  prompt: [
    "Rôle: gérer le monde.",
    "Action joueur: Je regarde autour de moi.",
    "Contexte: {\"lieu\":\"Le port\"}",
  ].join("\n"),
  response: JSON.stringify({
    content: JSON.stringify({ narration: "Le port bruisse.", commands: [], draftPatch: { facts: [] } }),
    usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
  }),
  model: "modele-test",
  tokenUsage: {
    inputTokens: 120,
    outputTokens: 30,
    totalTokens: 150,
    cachedInputTokens: 20,
    source: "provider",
  },
};

const report = createTokenCostReport(measuredTrace);
assert.equal(report.source, "provider");
assert.equal(report.totalTokens, 150);
assert.equal(report.cachedInputTokens, 20);
assert.equal(report.inputSections.reduce((total, section) => total + section.tokens, 0), 120);
assert.equal(report.outputSections.reduce((total, section) => total + section.tokens, 0), 30);
assert.ok(report.inputSections.some((section) => section.label === "Contexte métier"));
assert.ok(report.outputSections.some((section) => section.label === "Narration"));

const estimatedTrace = {
  ...measuredTrace,
  id: "trace-estimated",
  agentId: "narrationManager",
  tokenUsage: undefined,
};
const summary = summarizeTokenCosts([measuredTrace, estimatedTrace]);
assert.equal(summary.exchanges, 2);
assert.equal(summary.providerMeasured, 1);
assert.equal(summary.estimated, 1);
assert.equal(summary.byAgent.length, 2);

await vite.close();
console.log("Tests estimation des coûts en tokens OK");

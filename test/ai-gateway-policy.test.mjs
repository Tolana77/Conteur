import assert from "node:assert/strict";
import {
  fitAgentPromptToBudget,
  getAgentPromptLimit,
} from "../shared/aiGatewayPolicy.js";
import {
  getPayloadError,
  handleAiGatewayRequest,
} from "../server/ai/gateway.mjs";
import { handleAiGatewayHealthRequest } from "../server/ai/health.mjs";
import {
  corsHeaders,
  getAllowedOrigins,
  isAllowedOrigin,
} from "../server/ai/http.mjs";

const longContext = `Contexte:${"x".repeat(12_000)}`;
const prompt = [
  "Instruction essentielle: réponds en JSON.",
  longContext,
  "Format JSON strict.",
].join("\n");
const fitted = fitAgentPromptToBudget("worldManager", prompt);

assert.equal(fitted.length <= getAgentPromptLimit("worldManager"), true);
assert.equal(fitted.includes("Instruction essentielle: réponds en JSON."), true);
assert.equal(fitted.includes("Format JSON strict."), true);
const compactedContext = fitted.split("\n").find((line) => line.startsWith("Contexte:"));
assert.equal(JSON.parse(compactedContext.slice("Contexte:".length).trim()).truncated, true);
assert.equal(getPayloadError({ agentId: "worldManager", prompt: fitted }), null);
assert.match(getPayloadError({ agentId: "agent-inconnu", prompt: "test" }), /Agent inconnu/u);
assert.match(
  getPayloadError({ agentId: "narrationManager", prompt: "x".repeat(20_000) }),
  /dépasse son budget/u,
);

const environment = {
  AI_GATEWAY_ENABLED: "true",
  AI_PROVIDER_URL: "https://provider.example/v1/chat/completions",
  AI_PROVIDER_API_KEY: "secret-test",
  AI_PROVIDER_MODEL: "model-test",
  AI_PROVIDER_MAX_TOKENS: "700",
  AI_ALLOWED_ORIGIN: "https://conteur.example",
  AI_MAX_REQUESTS_PER_MINUTE: "12",
};
let providerRequest;
const gatewayResponse = await handleAiGatewayRequest(new Request("https://conteur.example/api/mj", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: "https://conteur.example",
    "x-forwarded-for": "192.0.2.1",
  },
  body: JSON.stringify({ agentId: "narrationManager", prompt: "Raconte la scène." }),
}), {
  environment,
  fetchProvider: async (url, options) => {
    providerRequest = { url, options };
    return Response.json({
      choices: [{ message: { content: "La scène commence." } }],
      model: "model-test",
      usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
    });
  },
});

assert.equal(gatewayResponse.status, 200);
assert.deepEqual(await gatewayResponse.json(), {
  content: "La scène commence.",
  model: "model-test",
  usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
});
assert.equal(providerRequest.url, environment.AI_PROVIDER_URL);
assert.equal(JSON.parse(providerRequest.options.body).max_tokens, 400);

const forbiddenResponse = await handleAiGatewayRequest(new Request("https://conteur.example/api/mj", {
  method: "POST",
  headers: { origin: "https://intrus.example" },
  body: JSON.stringify({ agentId: "narrationManager", prompt: "Test" }),
}), { environment });
assert.equal(forbiddenResponse.status, 403);

const deploymentEnvironment = {
  AI_ALLOWED_ORIGIN: "https://conteur.example, https://jeu.example/",
  VERCEL_URL: "conteur-git-42-tolana77.vercel.app",
  VERCEL_BRANCH_URL: "conteur-git-main-tolana77.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "conteur.vercel.app",
};
const allowedOrigins = getAllowedOrigins(deploymentEnvironment);
assert.equal(allowedOrigins.has("https://jeu.example"), true);
assert.equal(allowedOrigins.has("https://conteur-git-42-tolana77.vercel.app"), true);
assert.equal(allowedOrigins.has("https://conteur-git-main-tolana77.vercel.app"), true);
assert.equal(allowedOrigins.has("https://conteur.vercel.app"), true);

for (const origin of allowedOrigins) {
  const request = new Request("https://conteur.vercel.app/api/mj", {
    headers: { origin },
  });
  assert.equal(isAllowedOrigin(request, deploymentEnvironment), true);
  assert.equal(
    corsHeaders(request, deploymentEnvironment, ["POST"])["access-control-allow-origin"],
    origin,
  );
}

const unrelatedPreviewRequest = new Request("https://conteur.vercel.app/api/mj", {
  headers: { origin: "https://autre-projet-123.vercel.app" },
});
assert.equal(isAllowedOrigin(unrelatedPreviewRequest, deploymentEnvironment), false);
assert.equal(
  corsHeaders(unrelatedPreviewRequest, deploymentEnvironment, ["POST"])["access-control-allow-origin"],
  "null",
);

const preflightResponse = await handleAiGatewayRequest(new Request("https://conteur.vercel.app/api/mj", {
  method: "OPTIONS",
  headers: { origin: "https://conteur-git-42-tolana77.vercel.app" },
}), { environment: deploymentEnvironment });
assert.equal(preflightResponse.status, 204);
assert.equal(
  preflightResponse.headers.get("access-control-allow-origin"),
  "https://conteur-git-42-tolana77.vercel.app",
);

const healthResponse = await handleAiGatewayHealthRequest(new Request("https://conteur.example/api/mj-health", {
  headers: { origin: "https://conteur.example" },
}), {
  environment,
  fetchProvider: async (url) => {
    assert.equal(url.toString(), "https://provider.example/v1/models");
    return new Response("{}", { status: 200 });
  },
});
assert.equal(healthResponse.status, 200);
assert.equal((await healthResponse.json()).ok, true);

console.log("Tests politique passerelle IA OK");

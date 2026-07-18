import {
  getAgentPromptLimit,
  isKnownAiAgentId,
} from "../../shared/aiGatewayPolicy.js";
import { corsHeaders, isAllowedOrigin, jsonResponse } from "./http.mjs";

const HTTP_METHODS = ["POST", "OPTIONS"];
const requestWindows = new Map();

export async function handleAiGatewayRequest(request, options = {}) {
  const environment = options.environment ?? process.env;
  const fetchProvider = options.fetchProvider ?? fetch;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request, environment, HTTP_METHODS),
    });
  }

  if (request.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED", message: "Utilise POST." }, 405);
  }

  if (environment.AI_GATEWAY_ENABLED !== "true") {
    return json({
      error: "AI_GATEWAY_DISABLED",
      message: "La passerelle IA n'est pas activée. Configure AI_GATEWAY_ENABLED=true sur la plateforme d'hébergement.",
    }, 503);
  }

  if (!isAllowedOrigin(request, environment)) {
    return json({ error: "ORIGIN_NOT_ALLOWED", message: "Origine non autorisée." }, 403);
  }

  if (!canAcceptRequest(request, environment)) {
    return json({ error: "RATE_LIMITED", message: "Trop de demandes. Réessaie dans une minute." }, 429);
  }

  const configurationError = getConfigurationError(environment);
  if (configurationError) {
    return json({ error: "AI_PROVIDER_NOT_CONFIGURED", message: configurationError }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "INVALID_JSON", message: "Le corps de la requête doit être un JSON valide." }, 400);
  }

  const payloadError = getPayloadError(payload);
  if (payloadError) {
    return json({ error: "INVALID_REQUEST", message: payloadError }, 400);
  }

  try {
    const response = await callCompatibleProvider(
      payload.agentId,
      payload.prompt,
      environment,
      fetchProvider,
    );
    return json(response, 200);
  } catch (error) {
    console.error("MJ provider request failed", error);
    const status = error instanceof ProviderError ? error.status : 502;
    return json({
      error: status === 429 ? "AI_PROVIDER_RATE_LIMITED" : "AI_PROVIDER_ERROR",
      message: status === 429
        ? "La limite temporaire du fournisseur IA est atteinte. Réessaie dans quelques instants."
        : "Le fournisseur IA n'a pas pu répondre. Vérifie son URL, son modèle et sa clé sur la plateforme d'hébergement.",
    }, status);
  }

  function json(value, status) {
    return jsonResponse(value, status, request, environment, HTTP_METHODS);
  }
}

export function getPayloadError(value) {
  if (!value || typeof value !== "object") return "Le corps de la requête doit être un objet.";
  if (typeof value.agentId !== "string" || !value.agentId.trim()) return "agentId est obligatoire.";
  if (!isKnownAiAgentId(value.agentId)) return `Agent inconnu : ${value.agentId}.`;
  if (typeof value.prompt !== "string" || !value.prompt.trim()) return "prompt est obligatoire.";

  const limit = getAgentPromptLimit(value.agentId);
  if (value.prompt.length > limit) {
    return `Le prompt de ${value.agentId} dépasse son budget (${value.prompt.length}/${limit} caractères).`;
  }
  return null;
}

function getConfigurationError(environment) {
  if (!environment.AI_PROVIDER_URL) return "AI_PROVIDER_URL est manquant.";
  if (!environment.AI_PROVIDER_MODEL) return "AI_PROVIDER_MODEL est manquant.";
  if (!environment.AI_PROVIDER_API_KEY) return "AI_PROVIDER_API_KEY est manquant.";
  return null;
}

async function callCompatibleProvider(agentId, prompt, environment, fetchProvider) {
  const response = await fetchProvider(environment.AI_PROVIDER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${environment.AI_PROVIDER_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: environment.AI_PROVIDER_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: getMaxTokens(agentId, environment),
    }),
  });

  if (!response.ok) throw new ProviderError(response.status);

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Provider response does not contain choices[0].message.content");
  }

  return {
    content: content.trim(),
    model: typeof data?.model === "string" ? data.model : environment.AI_PROVIDER_MODEL,
    ...(data?.usage && typeof data.usage === "object" ? { usage: data.usage } : {}),
  };
}

function getMaxTokens(agentId, environment) {
  const configuredMaximum = parsePositiveInteger(environment.AI_PROVIDER_MAX_TOKENS, 700);
  const agentMaximums = {
    narrationManager: 400,
    requestAnalyzer: 260,
    rulesValidator: 260,
    characterManager: 450,
    actionManager: 420,
    combatManager: 550,
    combatSetupManager: 520,
    tacticalTemplateManager: 700,
    assetTemplateManager: 700,
    worldManager: 500,
  };
  return Math.min(configuredMaximum, agentMaximums[agentId] ?? 600);
}

function canAcceptRequest(request, environment) {
  const limit = parsePositiveInteger(environment.AI_MAX_REQUESTS_PER_MINUTE, 12);
  const now = Date.now();
  const windowStart = now - 60_000;
  const key = getClientIp(request);
  const previous = (requestWindows.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

  if (previous.length >= limit) {
    requestWindows.set(key, previous);
    return false;
  }

  previous.push(now);
  requestWindows.set(key, previous);
  return true;
}

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("x-nf-client-connection-ip")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("cf-connecting-ip")
    ?? forwarded
    ?? "unknown";
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

class ProviderError extends Error {
  constructor(status) {
    super(`Provider returned ${status}`);
    this.status = status;
  }
}

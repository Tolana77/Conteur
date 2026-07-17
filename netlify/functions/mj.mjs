import {
  getAgentPromptLimit,
  isKnownAiAgentId,
} from "../../shared/aiGatewayPolicy.js";

const requestWindows = new Map();

export const config = {
  path: "/api/mj",
  method: ["POST", "OPTIONS"],
};

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED", message: "Utilise POST." }, 405, request);
  }

  if (process.env.AI_GATEWAY_ENABLED !== "true") {
    return json({
      error: "AI_GATEWAY_DISABLED",
      message: "La passerelle IA n'est pas activée. Configure AI_GATEWAY_ENABLED=true sur Netlify.",
    }, 503, request);
  }

  if (!isAllowedOrigin(request)) {
    return json({ error: "ORIGIN_NOT_ALLOWED", message: "Origine non autorisée." }, 403, request);
  }

  if (!canAcceptRequest(request)) {
    return json({ error: "RATE_LIMITED", message: "Trop de demandes. Réessaie dans une minute." }, 429, request);
  }

  const configurationError = getConfigurationError();
  if (configurationError) {
    return json({ error: "AI_PROVIDER_NOT_CONFIGURED", message: configurationError }, 503, request);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "INVALID_JSON", message: "Le corps de la requête doit être un JSON valide." }, 400, request);
  }

  const payloadError = getPayloadError(payload);
  if (payloadError) {
    return json({
      error: "INVALID_REQUEST",
      message: payloadError,
    }, 400, request);
  }

  try {
    const response = await callCompatibleProvider(payload.agentId, payload.prompt);
    return json({ content: response }, 200, request);
  } catch (error) {
    console.error("MJ provider request failed", error);
    const status = error instanceof ProviderError ? error.status : 502;
    return json({
      error: status === 429 ? "AI_PROVIDER_RATE_LIMITED" : "AI_PROVIDER_ERROR",
      message: status === 429
        ? "La limite temporaire du fournisseur IA est atteinte. Réessaie dans quelques instants."
        : "Le fournisseur IA n'a pas pu répondre. Vérifie son URL, son modèle et sa clé sur Netlify.",
    }, status, request);
  }
};

function getConfigurationError() {
  if (!process.env.AI_PROVIDER_URL) return "AI_PROVIDER_URL est manquant.";
  if (!process.env.AI_PROVIDER_MODEL) return "AI_PROVIDER_MODEL est manquant.";
  if (!process.env.AI_PROVIDER_API_KEY) return "AI_PROVIDER_API_KEY est manquant.";
  return null;
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

async function callCompatibleProvider(agentId, prompt) {
  const response = await fetch(process.env.AI_PROVIDER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AI_PROVIDER_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.AI_PROVIDER_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: getMaxTokens(agentId),
    }),
  });

  if (!response.ok) throw new ProviderError(response.status);

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Provider response does not contain choices[0].message.content");
  }

  return content.trim();
}

function getMaxTokens(agentId) {
  const configuredMaximum = Number.parseInt(process.env.AI_PROVIDER_MAX_TOKENS ?? "700", 10);
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
  const maximum = agentMaximums[agentId] ?? 600;
  return Math.min(Number.isFinite(configuredMaximum) ? configuredMaximum : 700, maximum);
}

class ProviderError extends Error {
  constructor(status) {
    super(`Provider returned ${status}`);
    this.status = status;
  }
}

function canAcceptRequest(request) {
  const limit = Number.parseInt(process.env.AI_MAX_REQUESTS_PER_MINUTE ?? "12", 10);
  const now = Date.now();
  const windowStart = now - 60_000;
  const key = request.headers.get("x-nf-client-connection-ip") ?? "unknown";
  const previous = (requestWindows.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

  if (previous.length >= limit) {
    requestWindows.set(key, previous);
    return false;
  }

  previous.push(now);
  requestWindows.set(key, previous);
  return true;
}

function isAllowedOrigin(request) {
  const expectedOrigin = process.env.AI_ALLOWED_ORIGIN;
  if (!expectedOrigin) return true;
  const origin = request.headers.get("origin");
  return !origin || normalizeOrigin(origin) === normalizeOrigin(expectedOrigin);
}

function corsHeaders(request) {
  const origin = request.headers.get("origin");
  const allowedOrigin = process.env.AI_ALLOWED_ORIGIN;
  return {
    "access-control-allow-origin": allowedOrigin ? normalizeOrigin(allowedOrigin) : origin ?? "null",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function json(value, status, request) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(request),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

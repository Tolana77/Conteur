import { corsHeaders, isAllowedOrigin, jsonResponse } from "./http.mjs";

const HTTP_METHODS = ["GET", "OPTIONS"];

export async function handleAiGatewayHealthRequest(request, options = {}) {
  const environment = options.environment ?? process.env;
  const fetchProvider = options.fetchProvider ?? fetch;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request, environment, HTTP_METHODS),
    });
  }

  if (request.method !== "GET") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  if (!isAllowedOrigin(request, environment)) {
    return json({ ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403);
  }

  const configuration = {
    enabled: environment.AI_GATEWAY_ENABLED === "true",
    providerUrlHost: getHost(environment.AI_PROVIDER_URL),
    hasApiKey: Boolean(environment.AI_PROVIDER_API_KEY),
    model: environment.AI_PROVIDER_MODEL || null,
  };

  if (!configuration.enabled || !configuration.providerUrlHost || !configuration.hasApiKey || !configuration.model) {
    return json({ ok: false, configuration, error: "INCOMPLETE_CONFIGURATION" }, 503);
  }

  try {
    const response = await fetchProvider(getHealthUrl(environment.AI_PROVIDER_URL), {
      headers: { Authorization: `Bearer ${environment.AI_PROVIDER_API_KEY}` },
      signal: AbortSignal.timeout(8_000),
    });
    const body = await response.text();

    return json({
      ok: response.ok,
      configuration,
      providerStatus: response.status,
      providerMessage: getProviderMessage(body),
    }, response.ok ? 200 : 502);
  } catch (error) {
    return json({
      ok: false,
      configuration,
      error: "PROVIDER_CONNECTION_FAILED",
      providerMessage: error instanceof Error ? error.message : "Erreur réseau inconnue.",
    }, 502);
  }

  function json(value, status) {
    return jsonResponse(value, status, request, environment, HTTP_METHODS);
  }
}

function getHealthUrl(providerUrl) {
  const url = new URL(providerUrl);
  url.pathname = url.pathname.replace(/\/chat\/completions\/?$/, "/models");
  url.search = "";
  return url;
}

function getHost(providerUrl) {
  try {
    return new URL(providerUrl).host;
  } catch {
    return null;
  }
}

function getProviderMessage(body) {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message ?? parsed?.message;
    return typeof message === "string" ? message.slice(0, 240) : null;
  } catch {
    return body.slice(0, 240) || null;
  }
}

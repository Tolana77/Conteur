export const config = {
  path: "/api/mj-health",
  method: ["GET"],
};

export default async (request) => {
  if (!isAllowedOrigin(request)) {
    return json({ ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403, request);
  }

  const configuration = {
    enabled: process.env.AI_GATEWAY_ENABLED === "true",
    providerUrlHost: getHost(process.env.AI_PROVIDER_URL),
    hasApiKey: Boolean(process.env.AI_PROVIDER_API_KEY),
    model: process.env.AI_PROVIDER_MODEL || null,
  };

  if (!configuration.enabled || !configuration.providerUrlHost || !configuration.hasApiKey || !configuration.model) {
    return json({ ok: false, configuration, error: "INCOMPLETE_CONFIGURATION" }, 503, request);
  }

  try {
    const response = await fetch(getHealthUrl(process.env.AI_PROVIDER_URL), {
      headers: { Authorization: `Bearer ${process.env.AI_PROVIDER_API_KEY}` },
      signal: AbortSignal.timeout(8_000),
    });
    const body = await response.text();

    return json({
      ok: response.ok,
      configuration,
      providerStatus: response.status,
      providerMessage: getProviderMessage(body),
    }, response.ok ? 200 : 502, request);
  } catch (error) {
    return json({
      ok: false,
      configuration,
      error: "PROVIDER_CONNECTION_FAILED",
      providerMessage: error instanceof Error ? error.message : "Erreur réseau inconnue.",
    }, 502, request);
  }
};

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

function isAllowedOrigin(request) {
  const expected = process.env.AI_ALLOWED_ORIGIN;
  if (!expected) return true;
  const origin = request.headers.get("origin");
  return !origin || normalizeOrigin(origin) === normalizeOrigin(expected);
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
      "access-control-allow-origin": process.env.AI_ALLOWED_ORIGIN
        ? normalizeOrigin(process.env.AI_ALLOWED_ORIGIN)
        : request.headers.get("origin") ?? "null",
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

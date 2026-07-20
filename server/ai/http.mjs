export function isAllowedOrigin(request, environment) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const allowedOrigins = getAllowedOrigins(environment);
  return allowedOrigins.size === 0 || allowedOrigins.has(normalizeOrigin(origin));
}

export function corsHeaders(request, environment, methods) {
  const origin = request.headers.get("origin");
  const allowedOrigin = origin && isAllowedOrigin(request, environment)
    ? normalizeOrigin(origin)
    : "null";

  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": methods.join(", "),
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

export function jsonResponse(value, status, request, environment, methods) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(request, environment, methods),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function getAllowedOrigins(environment) {
  const configuredOrigins = String(environment.AI_ALLOWED_ORIGIN ?? "")
    .split(/[\n,]/u)
    .map((value) => normalizeOrigin(value.trim()))
    .filter(Boolean);

  // Vercel fournit ces domaines sans protocole. On accepte uniquement les
  // adresses exactes du déploiement, de la branche et de la production.
  const vercelOrigins = [
    environment.VERCEL_URL,
    environment.VERCEL_BRANCH_URL,
    environment.VERCEL_PROJECT_PRODUCTION_URL,
  ]
    .map(normalizeVercelOrigin)
    .filter(Boolean);

  return new Set([...configuredOrigins, ...vercelOrigins]);
}

function normalizeVercelOrigin(value) {
  if (!value) return "";
  const origin = /^https?:\/\//iu.test(value) ? value : `https://${value}`;
  return normalizeOrigin(origin);
}

function normalizeOrigin(value) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

export function isAllowedOrigin(request, environment) {
  const expectedOrigin = environment.AI_ALLOWED_ORIGIN;
  if (!expectedOrigin) return true;

  const origin = request.headers.get("origin");
  return !origin || normalizeOrigin(origin) === normalizeOrigin(expectedOrigin);
}

export function corsHeaders(request, environment, methods) {
  const origin = request.headers.get("origin");
  const allowedOrigin = environment.AI_ALLOWED_ORIGIN;

  return {
    "access-control-allow-origin": allowedOrigin
      ? normalizeOrigin(allowedOrigin)
      : origin ?? "null",
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

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

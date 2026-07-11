import type { AiAgentId } from "./types";

export class AiGatewayError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "AiGatewayError";
  }
}

interface AiGatewayResponse {
  content?: unknown;
  error?: unknown;
  message?: unknown;
}

export async function runAgentOverHttp(agentId: AiAgentId, prompt: string): Promise<string> {
  const response = await fetch("/api/mj", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId, prompt }),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new AiGatewayError(
      typeof payload.message === "string" ? payload.message : "La passerelle IA est indisponible.",
      typeof payload.error === "string" ? payload.error : "AI_GATEWAY_ERROR",
      response.status,
    );
  }

  if (typeof payload.content !== "string") {
    throw new AiGatewayError("La passerelle IA a renvoyé une réponse illisible.", "INVALID_RESPONSE", response.status);
  }

  return payload.content;
}

async function readJson(response: Response): Promise<AiGatewayResponse> {
  try {
    const payload: unknown = await response.json();
    return payload && typeof payload === "object" ? payload as AiGatewayResponse : {};
  } catch {
    return {};
  }
}

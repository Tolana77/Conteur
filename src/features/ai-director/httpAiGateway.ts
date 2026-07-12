import type { AiAgentId } from "./types";
import { useGameStore } from "../../store/useGameStore";

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
  const startedAt = Date.now();

  try {
    const response = await fetch("/api/mj", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId, prompt }),
    });
    const rawResponse = await response.text();
    const payload = parseJson(rawResponse);
    const errorMessage = !response.ok
      ? typeof payload.message === "string" ? payload.message : "La passerelle IA est indisponible."
      : undefined;

    addTrace({
      agentId,
      startedAt,
      prompt,
      response: rawResponse,
      status: response.status,
      error: errorMessage,
    });

    if (!response.ok) {
      throw new AiGatewayError(
        errorMessage ?? "La passerelle IA est indisponible.",
        typeof payload.error === "string" ? payload.error : "AI_GATEWAY_ERROR",
        response.status,
      );
    }

    if (typeof payload.content !== "string") {
      throw new AiGatewayError("La passerelle IA a renvoyé une réponse illisible.", "INVALID_RESPONSE", response.status);
    }

    return payload.content;
  } catch (error) {
    if (!(error instanceof AiGatewayError)) {
      addTrace({
        agentId,
        startedAt,
        prompt,
        response: "",
        status: 0,
        error: error instanceof Error ? error.message : "Erreur réseau inconnue.",
      });
    }
    throw error;
  }
}

function parseJson(response: string): AiGatewayResponse {
  try {
    const payload: unknown = JSON.parse(response);
    return payload && typeof payload === "object" ? payload as AiGatewayResponse : {};
  } catch {
    return {};
  }
}

function addTrace({
  agentId,
  startedAt,
  prompt,
  response,
  status,
  error,
}: {
  agentId: AiAgentId;
  startedAt: number;
  prompt: string;
  response: string;
  status: number;
  error?: string;
}) {
  useGameStore.getState().addAiApiTrace({
    id: crypto.randomUUID(),
    agentId,
    timestamp: startedAt,
    durationMs: Date.now() - startedAt,
    status,
    prompt,
    response,
    error,
  });
}

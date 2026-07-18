import type { AiAgentId, AiApiTrace } from "./types";
import { useGameStore } from "../../store/useGameStore";
import { fitAgentPromptToBudget } from "../../../shared/aiGatewayPolicy.js";

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
  model?: unknown;
  usage?: unknown;
}

export interface AiGatewayHealth {
  ok: boolean;
  configuration?: {
    enabled: boolean;
    providerUrlHost: string | null;
    hasApiKey: boolean;
    model: string | null;
  };
  providerStatus?: number;
  providerMessage?: string | null;
  error?: string;
}

export async function checkAiGatewayHealth(): Promise<AiGatewayHealth> {
  const response = await fetch("/api/mj-health", { headers: { accept: "application/json" } });
  const rawResponse = await response.text();
  const payload = parseJson(rawResponse) as AiGatewayHealth;

  return {
    ...payload,
    ok: response.ok && payload.ok === true,
    error: payload.error ?? (!response.ok ? "HEALTH_CHECK_FAILED" : undefined),
  };
}

export async function runAgentOverHttp(agentId: AiAgentId, prompt: string): Promise<string> {
  const startedAt = Date.now();
  let preparedPrompt = prompt;

  try {
    preparedPrompt = fitAgentPromptToBudget(agentId, prompt);
    const response = await fetch("/api/mj", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId, prompt: preparedPrompt }),
    });
    const rawResponse = await response.text();
    const payload = parseJson(rawResponse);
    const errorMessage = !response.ok
      ? typeof payload.message === "string" ? payload.message : "La passerelle IA est indisponible."
      : undefined;

    addTrace({
      agentId,
      startedAt,
      prompt: preparedPrompt,
      response: rawResponse,
      status: response.status,
      error: errorMessage,
      model: typeof payload.model === "string" ? payload.model : undefined,
      tokenUsage: parseProviderTokenUsage(payload.usage),
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
        prompt: preparedPrompt,
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
  model,
  tokenUsage,
}: {
  agentId: AiAgentId;
  startedAt: number;
  prompt: string;
  response: string;
  status: number;
  error?: string;
  model?: string;
  tokenUsage?: AiApiTrace["tokenUsage"];
}) {
  useGameStore.getState().addAiApiTrace({
    id: crypto.randomUUID(),
    agentId,
    timestamp: startedAt,
    durationMs: Date.now() - startedAt,
    status,
    prompt,
    response,
    model,
    tokenUsage,
    error,
  });
}

function parseProviderTokenUsage(value: unknown): AiApiTrace["tokenUsage"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const usage = value as Record<string, unknown>;
  const inputTokens = readTokenCount(usage.inputTokens ?? usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = readTokenCount(usage.outputTokens ?? usage.completion_tokens ?? usage.output_tokens);
  if (inputTokens === undefined || outputTokens === undefined) return undefined;
  const totalTokens = readTokenCount(usage.totalTokens ?? usage.total_tokens) ?? inputTokens + outputTokens;
  const promptDetails = usage.prompt_tokens_details && typeof usage.prompt_tokens_details === "object"
    ? usage.prompt_tokens_details as Record<string, unknown>
    : {};
  const completionDetails = usage.completion_tokens_details && typeof usage.completion_tokens_details === "object"
    ? usage.completion_tokens_details as Record<string, unknown>
    : {};
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    source: "provider",
    ...(readTokenCount(usage.cachedInputTokens ?? promptDetails.cached_tokens) !== undefined
      ? { cachedInputTokens: readTokenCount(usage.cachedInputTokens ?? promptDetails.cached_tokens) }
      : {}),
    ...(readTokenCount(usage.reasoningTokens ?? completionDetails.reasoning_tokens) !== undefined
      ? { reasoningTokens: readTokenCount(usage.reasoningTokens ?? completionDetails.reasoning_tokens) }
      : {}),
  };
}

function readTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

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
  ok?: unknown;
  configuration?: unknown;
  providerStatus?: unknown;
  providerMessage?: unknown;
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
  try {
    const response = await fetch("/api/mj-health", { headers: { accept: "application/json" } });
    return parseAiGatewayHealth(await response.text(), response.status, response.ok);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error
        ? `Connexion à la passerelle impossible : ${error.message}`
        : "Connexion à la passerelle impossible.",
    };
  }
}

/** Vercel peut renvoyer son propre JSON d'erreur, dont `error` est parfois un
 * objet. On normalise toute réponse externe avant de la rendre dans React. */
export function parseAiGatewayHealth(rawResponse: string, status: number, responseOk: boolean): AiGatewayHealth {
  const payload = parseJson(rawResponse);
  const configurationSource = asRecord(payload.configuration);
  const configuration = configurationSource ? {
    enabled: configurationSource.enabled === true,
    providerUrlHost: readNullableString(configurationSource.providerUrlHost),
    hasApiKey: configurationSource.hasApiKey === true,
    model: readNullableString(configurationSource.model),
  } : undefined;
  const reportedError = formatExternalMessage(payload.error);
  const providerMessage = formatExternalMessage(payload.providerMessage);
  const providerStatus = readHttpStatus(payload.providerStatus);
  const validGatewayResponse = typeof payload.ok === "boolean";

  return {
    ok: responseOk && payload.ok === true,
    ...(configuration ? { configuration } : {}),
    ...(providerStatus !== undefined ? { providerStatus } : {}),
    ...(providerMessage ? { providerMessage } : {}),
    ...(!responseOk || reportedError || !validGatewayResponse ? {
      error: reportedError
        ?? (!validGatewayResponse
          ? `La route /api/mj-health n'a pas renvoyé le contrat attendu (HTTP ${status}).`
          : `Diagnostic indisponible (HTTP ${status}).`),
    } : {}),
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readHttpStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

function formatExternalMessage(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 500);
  const record = asRecord(value);
  if (!record) return undefined;
  const message = readNullableString(record.message);
  const code = readNullableString(record.code);
  if (message && code) return `${code} : ${message}`.slice(0, 500);
  if (message) return message.slice(0, 500);
  if (code) return code.slice(0, 500);
  try {
    return JSON.stringify(record).slice(0, 500);
  } catch {
    return "Erreur structurée illisible renvoyée par la plateforme.";
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

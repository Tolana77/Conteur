import type { AiApiTrace } from "./types";

export interface TokenCostSection {
  label: string;
  characters: number;
  tokens: number;
}

export interface TokenCostReport {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  source: "provider" | "estimate";
  inputCharacters: number;
  outputCharacters: number;
  inputSections: TokenCostSection[];
  outputSections: TokenCostSection[];
}

export interface TokenCostSummary {
  exchanges: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  providerMeasured: number;
  estimated: number;
  byAgent: Array<{
    agentId: string;
    exchanges: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
}

const PROMPT_MARKERS: Array<[string, string]> = [
  ["Rôle:", "Rôle et instructions"],
  ["Joueur:", "Personnage"],
  ["Style:", "Style"],
  ["Cadre:", "Cadre du monde"],
  ["Scène stable:", "Scène"],
  ["Objets manipulables établis:", "Objets manipulables"],
  ["Action joueur:", "Action du joueur"],
  ["Action:", "Action du joueur"],
  ["Intentions structurées:", "Actions structurées"],
  ["Dossier entrant ciblé:", "Résultats des agents"],
  ["Contexte:", "Contexte métier"],
  ["Paquet:", "Résultats moteur"],
  ["Échanges récents:", "Historique récent"],
];

/** Estimation locale sans dépendance. Les compteurs du fournisseur, lorsqu'ils
 * existent, restent prioritaires et sont signalés comme mesurés. */
export function estimateTokenCount(value: string): number {
  if (!value) return 0;
  let weightedCharacters = 0;
  for (const character of value) weightedCharacters += character.charCodeAt(0) <= 0x7f ? 1 : 1.35;
  return Math.max(1, Math.ceil(weightedCharacters / 4));
}

export function createTokenCostReport(trace: AiApiTrace): TokenCostReport {
  const responseContent = extractProviderContent(trace.response);
  const estimatedInput = estimateTokenCount(trace.prompt);
  const estimatedOutput = estimateTokenCount(responseContent);
  const usage = trace.tokenUsage;
  const inputTokens = usage?.inputTokens ?? estimatedInput;
  const outputTokens = usage?.outputTokens ?? estimatedOutput;
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage?.totalTokens ?? inputTokens + outputTokens,
    cachedInputTokens: usage?.cachedInputTokens ?? 0,
    reasoningTokens: usage?.reasoningTokens ?? 0,
    source: usage?.source ?? "estimate",
    inputCharacters: trace.prompt.length,
    outputCharacters: responseContent.length,
    inputSections: scaleSections(splitPromptSections(trace.prompt), inputTokens),
    outputSections: scaleSections(splitResponseSections(responseContent), outputTokens),
  };
}

export function summarizeTokenCosts(traces: AiApiTrace[]): TokenCostSummary {
  const byAgent = new Map<string, TokenCostSummary["byAgent"][number]>();
  const summary: TokenCostSummary = {
    exchanges: traces.length,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedInputTokens: 0,
    providerMeasured: 0,
    estimated: 0,
    byAgent: [],
  };

  traces.forEach((trace) => {
    const report = createTokenCostReport(trace);
    summary.inputTokens += report.inputTokens;
    summary.outputTokens += report.outputTokens;
    summary.totalTokens += report.totalTokens;
    summary.cachedInputTokens += report.cachedInputTokens;
    if (report.source === "provider") summary.providerMeasured += 1;
    else summary.estimated += 1;
    const agent = byAgent.get(trace.agentId) ?? {
      agentId: trace.agentId,
      exchanges: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    agent.exchanges += 1;
    agent.inputTokens += report.inputTokens;
    agent.outputTokens += report.outputTokens;
    agent.totalTokens += report.totalTokens;
    byAgent.set(trace.agentId, agent);
  });

  summary.byAgent = [...byAgent.values()].sort((left, right) => right.totalTokens - left.totalTokens);
  return summary;
}

function splitPromptSections(prompt: string): TokenCostSection[] {
  const buckets = new Map<string, string[]>();
  let currentLabel = "Instructions générales";
  prompt.split("\n").forEach((line) => {
    const marker = PROMPT_MARKERS.find(([prefix]) => line.startsWith(prefix));
    if (marker) currentLabel = marker[1];
    const bucket = buckets.get(currentLabel) ?? [];
    bucket.push(line);
    buckets.set(currentLabel, bucket);
  });
  return [...buckets.entries()].map(([label, lines]) => createSection(label, lines.join("\n")));
}

function splitResponseSections(response: string): TokenCostSection[] {
  try {
    const parsed: unknown = JSON.parse(response);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed as Record<string, unknown>)
        .map(([key, value]) => createSection(getResponseSectionLabel(key), JSON.stringify(value)))
        .filter((section) => section.characters > 0);
    }
  } catch {
    // Une réponse narrative ou tronquée reste un bloc unique estimable.
  }
  return response ? [createSection("Réponse", response)] : [];
}

function extractProviderContent(response: string): string {
  try {
    const payload: unknown = JSON.parse(response);
    if (payload && typeof payload === "object" && typeof (payload as { content?: unknown }).content === "string") {
      return (payload as { content: string }).content;
    }
  } catch {
    // Les anciennes traces peuvent contenir directement le texte du modèle.
  }
  return response;
}

function createSection(label: string, value: string): TokenCostSection {
  return { label, characters: value.length, tokens: estimateTokenCount(value) };
}

function scaleSections(sections: TokenCostSection[], target: number): TokenCostSection[] {
  if (sections.length === 0 || target === 0) return sections.map((section) => ({ ...section, tokens: 0 }));
  const estimatedTotal = sections.reduce((total, section) => total + section.tokens, 0) || 1;
  let estimatedAllocated = 0;
  let allocated = 0;
  return sections.map((section) => {
    estimatedAllocated += section.tokens;
    const nextAllocated = Math.round(target * estimatedAllocated / estimatedTotal);
    const tokens = Math.max(0, nextAllocated - allocated);
    allocated = nextAllocated;
    return { ...section, tokens };
  });
}

function getResponseSectionLabel(key: string): string {
  const labels: Record<string, string> = {
    narration: "Narration",
    commands: "Commandes",
    agentRequests: "Demandes d'agents",
    draftPatch: "Contexte produit",
    notes: "Notes",
  };
  return labels[key] ?? key;
}

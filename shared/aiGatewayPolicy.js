export const AI_AGENT_IDS = Object.freeze([
  "requestAnalyzer",
  "characterManager",
  "actionManager",
  "combatManager",
  "combatSetupManager",
  "tacticalTemplateManager",
  "assetTemplateManager",
  "worldManager",
  "narrationManager",
  "rulesValidator",
]);

export const AI_AGENT_PROMPT_LIMITS = Object.freeze({
  requestAnalyzer: 6_000,
  characterManager: 10_000,
  actionManager: 9_000,
  combatManager: 12_000,
  combatSetupManager: 11_000,
  tacticalTemplateManager: 15_000,
  assetTemplateManager: 17_000,
  worldManager: 10_000,
  narrationManager: 9_000,
  rulesValidator: 10_000,
});

const COMPRESSIBLE_SECTIONS = Object.freeze([
  { prefix: "Échanges récents:", minimum: 180 },
  { prefix: "Intentions structurées:", minimum: 180 },
  { prefix: "Dossier entrant ciblé:", minimum: 260 },
  { prefix: "Contexte:", minimum: 500 },
  { prefix: "Cadre:", minimum: 420 },
  { prefix: "Scène stable:", minimum: 420 },
  { prefix: "Paquet:", minimum: 700 },
]);

export function isKnownAiAgentId(agentId) {
  return AI_AGENT_IDS.includes(agentId);
}

export function getAgentPromptLimit(agentId) {
  return AI_AGENT_PROMPT_LIMITS[agentId] ?? 8_000;
}

/**
 * Réduit seulement les blocs de contexte variables. Les instructions, schémas
 * de commandes et formats de réponse restent intacts pour éviter de rendre un
 * agent imprévisible quand une campagne accumule beaucoup de données.
 */
export function fitAgentPromptToBudget(agentId, prompt) {
  const limit = getAgentPromptLimit(agentId);
  if (prompt.length <= limit) return prompt;

  const lines = prompt.split("\n");
  const sections = COMPRESSIBLE_SECTIONS
    .map((section) => ({
      ...section,
      index: lines.findIndex((line) => line.startsWith(section.prefix)),
    }))
    .filter((section) => section.index >= 0);

  while (lines.join("\n").length > limit) {
    const candidate = sections
      .map((section) => ({
        ...section,
        currentLength: lines[section.index].length,
      }))
      .filter((section) => section.currentLength > section.minimum)
      .sort((left, right) => right.currentLength - left.currentLength)[0];

    if (!candidate) break;
    const currentLength = lines.join("\n").length;
    const removable = candidate.currentLength - candidate.minimum;
    const reduction = Math.min(removable, currentLength - limit);
    const nextLength = candidate.currentLength - reduction;
    lines[candidate.index] = compactJsonSection(
      lines[candidate.index],
      candidate.prefix,
      nextLength,
    );
  }

  const compacted = lines.join("\n");
  if (compacted.length > limit) {
    throw new Error(
      `Le prompt de ${agentId} contient ${compacted.length} caractères d'instructions incompressibles pour une limite de ${limit}.`,
    );
  }
  return compacted;
}

function compactJsonSection(line, prefix, maximumLength) {
  const original = line.slice(prefix.length).trim();
  let excerptLength = Math.max(0, maximumLength - prefix.length - 40);

  while (excerptLength >= 0) {
    const excerpt = original.length > excerptLength
      ? `${original.slice(0, Math.max(0, excerptLength - 1))}…`
      : original;
    const compacted = `${prefix} ${JSON.stringify({ truncated: true, excerpt })}`;
    if (compacted.length <= maximumLength || excerptLength === 0) return compacted;
    excerptLength = Math.max(0, excerptLength - (compacted.length - maximumLength));
  }

  return `${prefix} {"truncated":true}`;
}

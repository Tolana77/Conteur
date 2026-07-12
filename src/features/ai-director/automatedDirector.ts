import { useGameStore, type GameState } from "../../store/useGameStore";
import { executeAiCommand } from "./aiExecution";
import { buildAiDirectorPrompt, createEmptyResolutionDraft, type AiDirectorPromptOptions, type AiPromptSnapshot } from "./promptBuilder";
import { runAgentOverHttp } from "./httpAiGateway";
import { parseAiDirectorResponse } from "./responseParser";
import { validateAiCommands } from "./validation";
import type {
  AiAgentId,
  AiAgentRequest,
  AiDirectorCommand,
  AiDirectorResponse,
  AiResolutionDraft,
  AiResolutionDraftPatch,
} from "./types";

const AUTOMATIC_AGENT_ORDER: AiAgentId[] = [
  "tacticalTemplateManager",
  "assetTemplateManager",
  "combatSetupManager",
  "characterManager",
  "actionManager",
  "combatManager",
  "worldManager",
];

export interface AutomatedDirectorResult {
  narration: string;
  agentsRun: AiAgentId[];
  warnings: string[];
}

/** Exécute la boucle complète depuis Lecture, avec le Narrateur comme dernière étape obligatoire. */
export async function runAutomatedDirector(playerInput: string): Promise<AutomatedDirectorResult> {
  if (!requiresFullResolution(playerInput)) {
    const narration = await runCompactNarrator(playerInput);
    useGameStore.getState().addGmMessage(narration);
    return { narration, agentsRun: ["narrationManager"], warnings: [] };
  }

  let draft = createEmptyResolutionDraft();
  const agentsRun: AiAgentId[] = [];
  const gatheredCommands: AiDirectorCommand[] = [];
  const isSmallTalk = isSmallTalkMessage(playerInput);

  let analysis: AiDirectorResponse = { narration: "", commands: [], agentRequests: [] };
  if (isSmallTalk) {
    draft = mergeResolutionDraft(draft, {
      intentions: [{ type: "échange social", text: playerInput, requiresResolution: false }],
    });
  } else {
    try {
      analysis = await runAgent("requestAnalyzer", playerInput, draft);
      agentsRun.push("requestAnalyzer");
      draft = mergeResolutionDraft(draft, analysis.draftPatch);
    } catch (error) {
      draft = addAutomationWarning(draft, `Analyse indisponible : ${getErrorMessage(error)}`);
    }
  }

  const requestedAgents = selectRelevantAgents(
    analysis.agentRequests,
    playerInput,
    draft,
  );

  for (const agentId of requestedAgents) {
    const request = analysis.agentRequests.find((candidate) => candidate.agent === agentId);
    try {
      const response = await runAgent(agentId, playerInput, draft, request);
      agentsRun.push(agentId);
      draft = mergeResolutionDraft(draft, response.draftPatch);
      gatheredCommands.push(...response.commands.filter((command) => command.type !== "sendNarration"));
    } catch (error) {
      draft = addAutomationWarning(draft, `${agentId} indisponible : ${getErrorMessage(error)}`);
    }
  }

  if (gatheredCommands.length > 0 || draft.proposedCommands.length > 0) {
    try {
      const rules = await runAgent("rulesValidator", playerInput, draft, {
        agent: "rulesValidator",
        reason: "Validation automatique avant exécution locale.",
        input: { commands: gatheredCommands, proposedCommands: draft.proposedCommands },
      });
      agentsRun.push("rulesValidator");
      draft = mergeResolutionDraft(draft, rules.draftPatch);
    } catch (error) {
      draft = addAutomationWarning(draft, `Validation indisponible : ${getErrorMessage(error)}`);
    }
  }

  const executionResults = executeValidatedCommands(gatheredCommands);
  if (executionResults.length > 0) {
    draft = mergeResolutionDraft(draft, createExecutionDraft(executionResults));
  }

  // Le narrateur est volontairement appelé même sans agent métier ni mutation.
  const narrationText = await runNarrator(playerInput, draft);
  agentsRun.push("narrationManager");

  if (!narrationText) {
    throw new Error("Le Narrateur n'a renvoyé aucun texte à afficher.");
  }

  useGameStore.getState().addGmMessage(narrationText);
  return { narration: narrationText, agentsRun, warnings: draft.warnings };
}

/**
 * Les échanges ordinaires ne justifient pas une chaîne multi-agents. Cette
 * porte locale garde la narration fluide et réserve les jetons aux règles.
 */
function requiresFullResolution(playerInput: string): boolean {
  const normalized = playerInput.toLocaleLowerCase("fr-FR");
  const mechanics = /\b(attaque|attaquer|tirer|tire|lance|utilise|utiliser|consomme|bois|potion|fiole|parchemin|sort|capacit[ée]|jet|d20|d6|test|sauvegarde|dég[aâ]ts?|soigne|soin|d[eé]place|d[eé]placement|combat|ennemi|cible|port[eé]e|inventaire|[eé]quipe|d[eé]s[eé]quipe)\b/u;
  const exploration = /\b(regarde|observer?|observe|fouille|chercher?|cherche|inspecte|examine|[eé]coute|explore|entre|ouvre|ramasse|prends|parle|discute|demande|interroge|approche|suis|va vers|qui est|qu['’]est-ce|o[uù] est|pourquoi)\b/u;
  const sensitive = /\b(suicide|me tuer|mutil|torture|violer|ignore (?:les )?instructions|prompt)\b/u;
  return mechanics.test(normalized) || exploration.test(normalized) || sensitive.test(normalized);
}

async function runCompactNarrator(playerInput: string): Promise<string> {
  const state = useGameStore.getState();
  const character = state.characters.find((candidate) => candidate.id === state.selectedCharacterId);
  const prompt = [
    "Tu es le Narrateur d'un jeu de rôle fantasy. Réponds au joueur avec une prose brève, immersive et concrète.",
    "N'invente pas de résultat mécanique, de jet, de dégât ou de changement d'état. Pour une action qui exigerait une règle, pose une question ou décris seulement l'intention.",
    "Réponds uniquement par un JSON valide: {\"narration\":\"...\"}.",
    "",
    "# Joueur",
    JSON.stringify(character ? {
      name: character.name,
      classe: character.classe,
      niveau: character.niveau,
    } : null),
    "# Ton et monde",
    JSON.stringify({
      style: state.campaign.style,
      lore: truncate(state.campaign.world.lore, 550),
      facts: state.campaign.world.facts.slice(-3).map((fact) => truncate(fact, 180)),
    }),
    "# Derniers échanges",
    JSON.stringify(state.messages.slice(-4).map((message) => ({
      sender: message.sender,
      content: truncate(message.content, 260),
    }))),
    "# Réponse du joueur",
    truncate(playerInput, 1_000),
  ].join("\n");

  const rawResponse = await runAgentOverHttp("narrationManager", prompt);
  const parsed = parseAiDirectorResponse(rawResponse);

  if (parsed.response?.narration.trim()) {
    return parsed.response.narration.trim();
  }

  const plainText = rawResponse.replace(/^```(?:text|markdown)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  if (plainText && !plainText.startsWith("{")) return plainText;
  throw new Error(parsed.errors[0] ?? "Réponse du Narrateur illisible.");
}

async function runNarrator(playerInput: string, draft: AiResolutionDraft): Promise<string> {
  const request: AiAgentRequest = {
    agent: "narrationManager",
    reason: "Étape obligatoire : répondre au joueur à partir des faits disponibles.",
  };
  const prompt = buildAiDirectorPrompt(createSnapshot(useGameStore.getState()), "narrationManager", {
    playerInput,
    request,
    resolutionDraft: draft,
    executionMode: "automatic",
  });
  const rawResponse = await runAgentOverHttp("narrationManager", prompt);
  const parsed = parseAiDirectorResponse(rawResponse);

  if (parsed.response) {
    return getNarrationText(parsed.response);
  }

  const plainText = rawResponse.replace(/^```(?:text|markdown)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  if (plainText && !plainText.startsWith("{")) {
    return plainText;
  }

  throw new Error(parsed.errors[0] ?? "Réponse du Narrateur illisible.");
}

async function runAgent(
  agentId: AiAgentId,
  playerInput: string,
  draft: AiResolutionDraft,
  request?: AiAgentRequest,
): Promise<AiDirectorResponse> {
  const promptOptions: AiDirectorPromptOptions = {
    playerInput,
    request,
    resolutionDraft: draft,
    executionMode: "automatic",
  };
  const prompt = buildAiDirectorPrompt(createSnapshot(useGameStore.getState()), agentId, promptOptions);
  const rawResponse = await runAgentOverHttp(agentId, prompt);
  const parsed = parseAiDirectorResponse(rawResponse);

  if (!parsed.response) {
    throw new Error(parsed.errors[0] ?? `${agentId} a renvoyé une réponse inexploitable.`);
  }

  return parsed.response;
}

function selectRelevantAgents(
  requests: AiAgentRequest[],
  playerInput: string,
  draft: AiResolutionDraft,
): AiAgentId[] {
  if (isPureConversation(playerInput, draft)) {
    return [];
  }

  const requested = new Set(
    requests
      .map((request) => request.agent)
      .filter((agent): agent is AiAgentId => AUTOMATIC_AGENT_ORDER.includes(agent)),
  );
  inferFallbackAgents(playerInput).forEach((agent) => requested.add(agent));

  return AUTOMATIC_AGENT_ORDER.filter((agent) => requested.has(agent));
}

/** Filet local : l'analyseur peut être concis, mais pas faire disparaître un domaine nécessaire. */
function inferFallbackAgents(playerInput: string): AiAgentId[] {
  const normalized = playerInput.toLocaleLowerCase("fr-FR");
  const agents = new Set<AiAgentId>();

  if (/\b(attaque|attaquer|tirer|tire|combat|ennemi|cible|port[eé]e|d[eé]place|d[eé]placement|d[eé]sengage)\b/u.test(normalized)) {
    agents.add("combatManager");
  }

  if (/\b(utilise|utiliser|consomme|bois|potion|fiole|parchemin|inventaire|[eé]quipe|d[eé]s[eé]quipe|capacit[ée])\b/u.test(normalized)) {
    agents.add("characterManager");
  }

  if (/\b(jet|d20|d6|test|sauvegarde|difficult[eé]|forcer|escalader|convaincre)\b/u.test(normalized)) {
    agents.add("actionManager");
  }

  if (/\b(regarde|observer?|observe|fouille|chercher?|cherche|inspecte|examine|[eé]coute|explore|entre|ouvre|ramasse|prends|parle|discute|demande|interroge|approche|suis|va vers|qui est|qu['’]est-ce|o[uù] est|pourquoi)\b/u.test(normalized)) {
    agents.add("worldManager");
  }

  return [...agents];
}

function isPureConversation(playerInput: string, draft: AiResolutionDraft): boolean {
  const requiresResolution = draft.intentions.some((intention) => intention.requiresResolution);

  return isSmallTalkMessage(playerInput) && !requiresResolution;
}

function isSmallTalkMessage(playerInput: string): boolean {
  return /^(bonjour|bonsoir|salut|coucou|merci|au revoir|bonne nuit|ça va|ca va)[!.?\s]*$/iu
    .test(playerInput.trim().toLocaleLowerCase("fr-FR"));
}

function executeValidatedCommands(commands: AiDirectorCommand[]) {
  const executableCommands = commands.filter((command) => command.type !== "sendNarration");
  if (!executableCommands.length) return [];

  const snapshot = createSnapshot(useGameStore.getState());
  const validations = validateAiCommands(executableCommands, {
    characters: snapshot.characters,
    selectedCharacterId: snapshot.selectedCharacterId,
    combat: snapshot.combat,
    itemTemplates: snapshot.itemTemplates,
    itemInstances: snapshot.itemInstances,
  });

  if (validations.some((validation) => validation.status === "error")) {
    return validations
      .filter((validation) => validation.status === "error")
      .map((validation) => ({ status: "error" as const, message: validation.message, command: JSON.stringify(validation.command) }));
  }

  return executableCommands.map((command) => {
    const state = useGameStore.getState();
    return executeAiCommand(command, createSnapshot(state), state);
  });
}

function getNarrationText(response: AiDirectorResponse): string {
  const explicitNarration = response.narration.trim();
  if (explicitNarration) return explicitNarration;

  const narrationCommand = response.commands.find((command) => command.type === "sendNarration");
  return narrationCommand?.content.trim() ?? "";
}

function createSnapshot(state: GameState): AiPromptSnapshot {
  return {
    campaign: state.campaign,
    characters: state.characters,
    selectedCharacterId: state.selectedCharacterId,
    messages: state.messages,
    combat: state.combat,
    itemTemplates: state.itemTemplates,
    itemInstances: state.itemInstances,
    abilityTemplates: state.abilityTemplates,
    abilityInstances: state.abilityInstances,
    characterDerivedScores: state.characterDerivedScores,
  };
}

function createExecutionDraft(results: Array<{ status: "success" | "error" | "info"; message: string }>): AiResolutionDraftPatch {
  return {
    facts: results.map((result) => ({
      source: "moteur local",
      kind: result.status === "error" ? "échec d'exécution" : "résultat d'exécution",
      content: result.message,
      visibility: result.status === "error" ? "requiresCheck" as const : "playerVisible" as const,
    })),
    narrationInputs: results.map((result) => ({
      source: "moteur local",
      content: result.status === "error" ? `Action refusée : ${result.message}` : `Résultat confirmé : ${result.message}`,
      priority: "high" as const,
      visibility: result.status === "error" ? "requiresCheck" as const : "playerVisible" as const,
    })),
    warnings: results.filter((result) => result.status === "error").map((result) => result.message),
  };
}

function mergeResolutionDraft(draft: AiResolutionDraft, patch?: AiResolutionDraftPatch): AiResolutionDraft {
  if (!patch) return draft;

  return {
    intentions: mergeUnique(draft.intentions, patch.intentions),
    facts: mergeUnique(draft.facts, patch.facts),
    suggestedAgents: mergeUnique(draft.suggestedAgents, patch.suggestedAgents),
    proposedCommands: mergeUnique(draft.proposedCommands, patch.proposedCommands),
    narrationInputs: mergeUnique(draft.narrationInputs, patch.narrationInputs),
    safety: mergeUnique(draft.safety, patch.safety),
    warnings: mergeUniqueStrings(draft.warnings, patch.warnings),
    questions: mergeUniqueStrings(draft.questions, patch.questions),
  };
}

function addAutomationWarning(draft: AiResolutionDraft, warning: string): AiResolutionDraft {
  return mergeResolutionDraft(draft, { warnings: [warning] });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "erreur inconnue";
}

function truncate(value: string, maximumLength: number): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength - 1)}…` : value;
}

function mergeUnique<T>(current: T[], additions?: T[]): T[] {
  if (!additions?.length) return current;
  const seen = new Set(current.map((item) => JSON.stringify(item)));
  return [...current, ...additions.filter((item) => {
    const signature = JSON.stringify(item);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  })];
}

function mergeUniqueStrings(current: string[], additions?: string[]): string[] {
  if (!additions?.length) return current;
  const seen = new Set(current);
  return [...current, ...additions.filter((item) => {
    const value = item.trim();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  })];
}

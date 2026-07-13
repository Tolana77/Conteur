import { useGameStore, type GameState } from "../../store/useGameStore";
import { executeAiCommand } from "./aiExecution";
import { resolveAutomaticLocalRequest } from "./automaticLocalResolution";
import {
  buildAutomaticDomainPrompt,
  buildAutomaticNarrationPrompt,
  createNarrationPacket,
} from "./automaticPrompts";
import { routePlayerInput, type AutomaticDomainAgent } from "./automaticRouting";
import { isCommandAllowedForAgent } from "./commandPermissions";
import { runAgentOverHttp } from "./httpAiGateway";
import { createEmptyResolutionDraft, type AiPromptSnapshot } from "./promptBuilder";
import { parseAiDirectorResponse } from "./responseParser";
import { validateAiCommands } from "./validation";
import type {
  AiAgentId,
  AiDirectorCommand,
  AiDirectorResponse,
  AiResolutionDraft,
  AiResolutionDraftPatch,
} from "./types";

export interface AutomatedDirectorResult {
  narration: string;
  agentsRun: AiAgentId[];
  warnings: string[];
}

interface SourcedCommand {
  command: AiDirectorCommand;
  source: AutomaticDomainAgent | "localEngine";
}

/**
 * Boucle automatique économique : routage local, zéro orchestrateur IA,
 * au plus deux agents métier, validation/exécution locale, puis Narrateur.
 */
export async function runAutomatedDirector(playerInput: string): Promise<AutomatedDirectorResult> {
  const initialState = useGameStore.getState();
  const route = routePlayerInput(playerInput, initialState);
  const localResolution = resolveAutomaticLocalRequest(playerInput, initialState);
  const selectedAgents = localResolution.handled ? [] : [...route.agents];
  let draft = createEmptyResolutionDraft();
  const agentsRun: AiAgentId[] = [];
  const gatheredCommands: SourcedCommand[] = localResolution.commands.map((command) => ({
    command,
    source: "localEngine",
  }));

  draft = mergeResolutionDraft(draft, localResolution.draftPatch);

  if (route.needsSafetyReview) {
    try {
      const safety = await runSafetyReview(playerInput);
      agentsRun.push("requestAnalyzer");
      draft = mergeResolutionDraft(draft, safety.draftPatch);
    } catch (error) {
      draft = mergeResolutionDraft(draft, { warnings: [`Vérification sensible indisponible : ${errorMessage(error)}`] });
    }
  }

  if (route.needsClassifier && !localResolution.handled) {
    try {
      const classifiedAgent = await runCompactClassifier(playerInput);
      agentsRun.push("requestAnalyzer");
      if (classifiedAgent) selectedAgents.push(classifiedAgent);
    } catch (error) {
      draft = mergeResolutionDraft(draft, { warnings: [`Classement indisponible : ${errorMessage(error)}`] });
    }
  }

  for (const agentId of [...new Set(selectedAgents)].slice(0, 2)) {
    try {
      const response = await runDomainAgent(agentId, playerInput);
      agentsRun.push(agentId);
      draft = mergeResolutionDraft(draft, response.draftPatch);

      for (const command of response.commands) {
        if (command.type !== "sendNarration" && isCommandAllowedForAgent(agentId, command.type)) {
          gatheredCommands.push({ command, source: agentId });
        } else if (command.type !== "sendNarration") {
          draft = mergeResolutionDraft(draft, {
            warnings: [`Commande ${command.type} refusée : elle n'appartient pas à ${agentId}.`],
          });
        }
      }
    } catch (error) {
      draft = mergeResolutionDraft(draft, { warnings: [`${agentId} indisponible : ${errorMessage(error)}`] });
    }
  }

  const executionResults = executeValidatedCommands(gatheredCommands);
  const packet = createNarrationPacket(draft, executionResults, getLatestPlayerActionReceipt());
  let narration: string;
  let narrationWarning: string | null = null;

  try {
    narration = await runNarrator(playerInput, packet);
  } catch (error) {
    narrationWarning = `Narrateur indisponible : ${errorMessage(error)}`;
    narration = createGroundedFallbackNarration(packet);
  }

  agentsRun.push("narrationManager");
  useGameStore.getState().addGmMessage(narration);

  return {
    narration,
    agentsRun,
    warnings: [
      ...draft.warnings,
      ...executionResults.filter((result) => result.status === "error").map((result) => result.message),
      ...(narrationWarning ? [narrationWarning] : []),
    ],
  };
}

function getLatestPlayerActionReceipt() {
  const messages = useGameStore.getState().messages;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.sender === "player") return message.actionReceipt;
  }
  return undefined;
}

function createGroundedFallbackNarration(packet: ReturnType<typeof createNarrationPacket>): string {
  const resultMessages = packet.results.map((result) => result.message);
  const receiptMessages = packet.actionReceipts.map((receipt) => {
    const actions = receipt.actions.map((action) =>
      `${action.sourceLabel}${action.target ? ` sur ${action.target.label}` : ""}`,
    );
    const changes = receipt.changes.map((change) =>
      `${change.kind} ${change.label}: ${change.before}→${change.after}${change.delta !== undefined ? ` (${change.delta >= 0 ? "+" : ""}${change.delta})` : ""}`,
    );
    const rolls = receipt.rolls.map((roll) => `${roll.reason ?? roll.formula}: ${roll.formula} = ${roll.result}`);
    return [...actions, ...changes, ...rolls].join(" ; ");
  });
  const confirmed = [...resultMessages, ...receiptMessages, ...packet.facts].filter(Boolean);
  const question = packet.questions.at(-1);

  if (confirmed.length > 0) {
    return `${confirmed.join(" ")}${question ? ` ${question}` : ""}`;
  }

  if (question) return `Vous prenez le temps d'observer la situation. ${question}`;

  return "Vous prenez le temps d'observer la scène, mais rien ne s'impose encore avec certitude. Que cherchez-vous à comprendre, et comment vous y prenez-vous ?";
}

async function runCompactClassifier(playerInput: string): Promise<AutomaticDomainAgent | null> {
  const prompt = [
    "Classe une demande de jeu de rôle dans UN domaine, sans la résoudre.",
    "characterManager=fiche/objet/capacité; actionManager=test/action physique ou sociale; combatManager=combat tactique; worldManager=exploration/PNJ/lieu; null=conversation pure.",
    'Réponds uniquement par {"agentRequests":[{"agent":"...","reason":""}],"commands":[],"narration":""} ou {"agentRequests":[],"commands":[],"narration":""}.',
    `Demande: ${truncate(playerInput, 500)}`,
  ].join("\n");
  const response = parseRequiredResponse(await runAgentOverHttp("requestAnalyzer", prompt), "requestAnalyzer");
  const candidate = response.agentRequests[0]?.agent;
  return candidate === "characterManager" || candidate === "actionManager" || candidate === "combatManager" || candidate === "worldManager"
    ? candidate
    : null;
}

async function runDomainAgent(agentId: AutomaticDomainAgent, playerInput: string): Promise<AiDirectorResponse> {
  const prompt = buildAutomaticDomainPrompt(agentId, useGameStore.getState(), playerInput);
  return parseRequiredResponse(await runAgentOverHttp(agentId, prompt), agentId);
}

async function runSafetyReview(playerInput: string): Promise<AiDirectorResponse> {
  const prompt = [
    "Rôle: vérifier uniquement si la demande nécessite une redirection narrative de sécurité.",
    "Les thèmes sombres de fantasy restent autorisés; distingue fiction grave et intention réelle d'autodestruction.",
    'Réponds uniquement par {"narration":"","commands":[],"agentRequests":[],"draftPatch":{"safety":[],"warnings":[],"narrationInputs":[]}}.',
    `Demande: ${truncate(playerInput, 900)}`,
  ].join("\n");
  return parseRequiredResponse(await runAgentOverHttp("requestAnalyzer", prompt), "requestAnalyzer");
}

async function runNarrator(
  playerInput: string,
  packet: ReturnType<typeof createNarrationPacket>,
): Promise<string> {
  const prompt = buildAutomaticNarrationPrompt(useGameStore.getState(), playerInput, packet);
  const raw = await runAgentOverHttp("narrationManager", prompt);
  const parsed = parseAiDirectorResponse(raw);
  const narration = parsed.response?.narration.trim();

  if (narration) return narration;

  const plainText = raw.replace(/^```(?:text|markdown)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  if (plainText && !plainText.startsWith("{")) return plainText;
  throw new Error(parsed.errors[0] ?? "Réponse du Narrateur illisible.");
}

function parseRequiredResponse(raw: string, agentId: AiAgentId): AiDirectorResponse {
  const parsed = parseAiDirectorResponse(raw);
  if (!parsed.response) throw new Error(parsed.errors[0] ?? `${agentId} a renvoyé une réponse illisible.`);
  return parsed.response;
}

function executeValidatedCommands(commands: SourcedCommand[]) {
  if (!commands.length) return [];
  return commands.map(({ command, source }) => {
    const state = useGameStore.getState();
    const snapshot = createSnapshot(state);
    const validation = validateAiCommands([command], {
      agentId: source === "localEngine" ? undefined : source,
      characters: snapshot.characters,
      selectedCharacterId: snapshot.selectedCharacterId,
      combat: snapshot.combat,
      itemTemplates: snapshot.itemTemplates,
      itemInstances: snapshot.itemInstances,
    })[0];

    if (!validation || validation.status === "error") {
      return {
        status: "error" as const,
        message: validation?.message ?? "Commande non validée.",
        command: JSON.stringify(command),
      };
    }

    const result = executeAiCommand(command, createSnapshot(state), state);
    return enrichCommandResult(command, state, useGameStore.getState(), result);
  });
}

function enrichCommandResult(
  command: AiDirectorCommand,
  before: GameState,
  after: GameState,
  result: ReturnType<typeof executeAiCommand>,
): ReturnType<typeof executeAiCommand> {
  if (result.status !== "success" || command.type !== "useItem") return result;

  const itemBefore = before.itemInstances.find((item) => item.id === command.itemId);
  const itemAfter = after.itemInstances.find((item) => item.id === command.itemId);
  const template = itemBefore
    ? before.itemTemplates.find((candidate) => candidate.id === itemBefore.templateId)
    : undefined;
  const sourceName = itemBefore ? String(itemBefore.overrides.name ?? template?.name ?? itemBefore.id) : command.itemId;
  const details: string[] = [`Source confirmée avant action : ${sourceName}`];
  details.push(`quantité ${itemBefore?.quantity ?? 0}→${itemAfter?.quantity ?? 0}`);

  before.characters.forEach((character) => {
    const current = after.characters.find((candidate) => candidate.id === character.id);
    if (current && current.pv !== character.pv) {
      const delta = current.pv - character.pv;
      details.push(`PV ${character.name} ${character.pv}→${current.pv} (${delta >= 0 ? "+" : ""}${delta})`);
    }
  });

  const previousRollIds = new Set(before.diceRolls.map((roll) => roll.id));
  after.diceRolls
    .filter((roll) => !previousRollIds.has(roll.id) && (roll.visibility === "public" || roll.visibility === "summary"))
    .forEach((roll) => details.push(`jet ${roll.reason ?? roll.formula}: ${roll.formula} = ${roll.result}`));

  return {
    ...result,
    message: `${sourceName} utilisé avec succès. ${details.join(" ; ")}.`,
  };
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "erreur inconnue";
}

function truncate(value: string, maximumLength: number): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength - 1)}…` : value;
}

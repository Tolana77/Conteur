import { useGameStore, type GameState } from "../../store/useGameStore";
import type { NarrativeScenePatch } from "../../app/types";
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
import {
  collectKnownCatalogIdsForCommands,
  getAiCommandExecutionPriority,
  isContentCreationCommand,
  validateAiCommands,
} from "./validation";
import { advanceNarrativeMomentum } from "./narrativeMomentum";
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
 * jusqu'à cinq spécialistes ciblés si une création dépendante est réellement
 * nécessaire, validation/exécution locale, puis Narrateur.
 */
export async function runAutomatedDirector(playerInput: string): Promise<AutomatedDirectorResult> {
  const initialState = useGameStore.getState();
  const pendingDecision = initialState.pendingGameDecision;
  const effectiveInput = pendingDecision
    ? `${truncate(pendingDecision.originalInput, 600)}\nPrécision du joueur : ${truncate(playerInput, 400)}`
    : playerInput;
  initialState.setPendingGameDecision(null);
  if (!pendingDecision) {
    initialState.setNarrativeMomentum(advanceNarrativeMomentum(playerInput, initialState));
  }
  initialState.advanceNarrativeScene(effectiveInput);

  const routingState = useGameStore.getState();
  const route = routePlayerInput(effectiveInput, routingState);
  const localResolution = resolveAutomaticLocalRequest(effectiveInput, routingState);
  const selectedAgents = localResolution.handled && !localResolution.continueToAgents ? [] : [...route.agents];
  let draft = createEmptyResolutionDraft();
  const agentsRun: AiAgentId[] = [];
  const gatheredCommands: SourcedCommand[] = localResolution.commands.map((command) => ({
    command,
    source: "localEngine",
  }));

  draft = mergeResolutionDraft(draft, localResolution.draftPatch);
  applyScenePatches(localResolution.draftPatch?.scenePatches);

  if (route.needsSafetyReview) {
    try {
      const safety = await runSafetyReview(effectiveInput);
      agentsRun.push("requestAnalyzer");
      draft = mergeResolutionDraft(draft, safety.draftPatch);
    } catch (error) {
      draft = mergeResolutionDraft(draft, { warnings: [`Vérification sensible indisponible : ${errorMessage(error)}`] });
    }
  }

  const agentQueue = [...new Set(selectedAgents)];
  const scheduledAgents = new Set<AutomaticDomainAgent>(agentQueue);
  let domainAgentCount = 0;

  while (agentQueue.length > 0 && domainAgentCount < 5) {
    const agentId = agentQueue.shift()!;
    try {
      const response = await runDomainAgent(agentId, effectiveInput, draft);
      agentsRun.push(agentId);
      domainAgentCount += 1;
      const executableCommands = response.commands.filter((command) => command.type !== "sendNarration");
      draft = mergeResolutionDraft(draft, {
        ...response.draftPatch,
        proposedCommands: executableCommands,
      });
      if (agentId === "worldManager" || agentId === "combatManager") {
        applyScenePatches(response.draftPatch?.scenePatches);
      }

      for (const command of response.commands) {
        if (command.type !== "sendNarration" && isCommandAllowedForAgent(agentId, command.type)) {
          gatheredCommands.push({ command, source: agentId });
        } else if (command.type !== "sendNarration") {
          draft = mergeResolutionDraft(draft, {
            warnings: [`Commande ${command.type} refusée : elle n'appartient pas à ${agentId}.`],
          });
        }
      }

      const requestedAgents = [
        ...response.agentRequests,
        ...(response.draftPatch?.suggestedAgents ?? []),
      ];
      requestedAgents.forEach((request) => {
        if (
          !isAutomaticDomainAgent(request.agent) ||
          scheduledAgents.has(request.agent) ||
          !canScheduleDelegation(agentId, request.agent)
        ) {
          return;
        }
        scheduledAgents.add(request.agent);
        agentQueue.push(request.agent);
      });
      agentQueue.sort((left, right) => getAutomaticAgentPriority(left) - getAutomaticAgentPriority(right));
    } catch (error) {
      draft = mergeResolutionDraft(draft, { warnings: [`${agentId} indisponible : ${errorMessage(error)}`] });
    }
  }

  const clarification = draft.questions.at(-1);
  const executionResults = clarification ? [] : executeValidatedCommands(gatheredCommands);

  // Un événement arrivé à échéance est une contrainte moteur, pas une simple
  // suggestion de prompt : le Narrateur doit produire une étape nouvelle.
  draft = mergeResolutionDraft(draft, createDueEventNarrationPatch(useGameStore.getState()));

  if (clarification) {
    useGameStore.getState().setPendingGameDecision({
      id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      originalInput: truncate(effectiveInput, 900),
      question: clarification,
      createdAt: Date.now(),
    });
  }

  const packet = createNarrationPacket(draft, executionResults, getLatestPlayerActionReceipt());
  let narration: string;
  let narrationWarning: string | null = null;

  try {
    narration = await runNarrator(effectiveInput, packet);
  } catch (error) {
    narrationWarning = `Narrateur indisponible : ${errorMessage(error)}`;
    narration = createGroundedFallbackNarration(packet);
  }

  agentsRun.push("narrationManager");
  useGameStore.getState().addGmMessage(narration);
  useGameStore.getState().recordNarratedBeat(narration);

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

function createDueEventNarrationPatch(state: GameState): AiResolutionDraftPatch | undefined {
  const dueEvents = state.narrativeScene.activeEvents
    .filter((event) => event.turnsRemaining === 0)
    .slice(0, 2);
  if (!dueEvents.length) return undefined;

  return {
    facts: dueEvents.map((event) => ({
      source: "localEngine",
      kind: "sceneEventDue",
      content: `L'événement annoncé arrive maintenant : ${event.description}. Sa prochaine conséquence doit se produire dans cette réponse; répéter seulement son approche est interdit.`,
      visibility: "playerVisible" as const,
      relatedIds: event.relatedEntityIds,
    })),
    narrationInputs: dueEvents.map((event) => ({
      source: "localEngine",
      content: `Fais progresser concrètement « ${event.description} » depuis l'étape « ${event.stage} » et montre ce qui arrive maintenant.`,
      priority: "high" as const,
      visibility: "playerVisible" as const,
    })),
  };
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

async function runDomainAgent(
  agentId: AutomaticDomainAgent,
  playerInput: string,
  draft: AiResolutionDraft,
): Promise<AiDirectorResponse> {
  const prompt = buildAutomaticDomainPrompt(agentId, useGameStore.getState(), playerInput, draft);
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
  const orderedCommands = commands
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) =>
      getAiCommandExecutionPriority(left.entry.command) - getAiCommandExecutionPriority(right.entry.command) ||
      left.index - right.index)
    .map(({ entry }) => entry);

  const initialSnapshot = createSnapshot(useGameStore.getState());
  const validations = validateAiCommands(orderedCommands.map(({ command }) => command), {
    characters: initialSnapshot.characters,
    selectedCharacterId: initialSnapshot.selectedCharacterId,
    combat: initialSnapshot.combat,
    itemTemplates: initialSnapshot.itemTemplates,
    itemInstances: initialSnapshot.itemInstances,
    abilityTemplates: initialSnapshot.abilityTemplates,
    effectTemplates: initialSnapshot.effectTemplates,
    enemyTemplates: initialSnapshot.enemyTemplates,
  });
  const creationBundleHasError = validations.some(
    (validation) => validation.status === "error" && isContentCreationCommand(validation.command),
  );
  const knownCatalogIds = collectKnownCatalogIdsForCommands(
    orderedCommands.map(({ command }) => command),
    initialSnapshot,
  );

  return orderedCommands.map(({ command, source }, index) => {
    const validation = validations[index];

    if (source !== "localEngine" && !isCommandAllowedForAgent(source, command.type)) {
      return {
        status: "error" as const,
        message: `Commande ${command.type} refusée pour ${source}.`,
        command: JSON.stringify(command),
      };
    }

    if (creationBundleHasError && isContentCreationCommand(command)) {
      return {
        status: "error" as const,
        message: validation?.status === "error"
          ? validation.message
          : "Lot de création annulé : une dépendance est invalide.",
        command: JSON.stringify(command),
      };
    }

    if (!validation || validation.status === "error") {
      return {
        status: "error" as const,
        message: validation?.message ?? "Commande non validée.",
        command: JSON.stringify(command),
      };
    }

    const state = useGameStore.getState();
    const result = executeAiCommand(command, createSnapshot(state), state, { knownCatalogIds });
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
    narrativeMomentum: state.narrativeMomentum,
    combat: state.combat,
    itemTemplates: state.itemTemplates,
    itemInstances: state.itemInstances,
    abilityTemplates: state.abilityTemplates,
    abilityInstances: state.abilityInstances,
    effectTemplates: state.effectTemplates,
    enemyTemplates: state.enemyTemplates,
    disabledContentTemplateIds: state.disabledContentTemplateIds,
    characterDerivedScores: state.characterDerivedScores,
    narrativeScene: state.narrativeScene,
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
    scenePatches: mergeUnique(draft.scenePatches, patch.scenePatches),
    safety: mergeUnique(draft.safety, patch.safety),
    warnings: mergeUniqueStrings(draft.warnings, patch.warnings),
    questions: mergeUniqueStrings(draft.questions, patch.questions),
  };
}

function applyScenePatches(patches: NarrativeScenePatch[] = []) {
  patches.forEach((patch) => useGameStore.getState().applyNarrativeScenePatch(patch));
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

const automaticAgentPriority: AutomaticDomainAgent[] = [
  "assetTemplateManager",
  "tacticalTemplateManager",
  "combatSetupManager",
  "characterManager",
  "actionManager",
  "combatManager",
  "worldManager",
];

function isAutomaticDomainAgent(agentId: AiAgentId): agentId is AutomaticDomainAgent {
  return automaticAgentPriority.includes(agentId as AutomaticDomainAgent);
}

function getAutomaticAgentPriority(agentId: AutomaticDomainAgent): number {
  return automaticAgentPriority.indexOf(agentId);
}

function canScheduleDelegation(
  source: AutomaticDomainAgent,
  target: AutomaticDomainAgent,
): boolean {
  const allowed: Record<AutomaticDomainAgent, AutomaticDomainAgent[]> = {
    characterManager: ["assetTemplateManager", "actionManager"],
    actionManager: ["characterManager", "worldManager", "combatManager"],
    combatManager: ["actionManager", "combatSetupManager", "tacticalTemplateManager"],
    combatSetupManager: ["tacticalTemplateManager", "assetTemplateManager"],
    tacticalTemplateManager: ["assetTemplateManager", "combatSetupManager"],
    assetTemplateManager: ["characterManager", "combatSetupManager"],
    worldManager: [
      "actionManager",
      "characterManager",
      "assetTemplateManager",
      "tacticalTemplateManager",
      "combatSetupManager",
    ],
  };
  return allowed[source].includes(target);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "erreur inconnue";
}

function truncate(value: string, maximumLength: number): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength - 1)}…` : value;
}

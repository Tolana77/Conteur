import { useGameStore, type GameState } from "../../store/useGameStore";
import type {
  NarrativeScenePatch,
  PlayerCheckDegree,
  PlayerCheckNarrationContext,
} from "../../app/types";
import { executeAiCommand } from "./aiExecution";
import { resolveAutomaticLocalRequest } from "./automaticLocalResolution";
import {
  buildAutomaticDomainPrompt,
  buildAutomaticNarrationPrompt,
  createNarrationPacket,
} from "./automaticPrompts";
import { describeCommunicationForNarrator } from "../../core/game-engine/perception";
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
import {
  buildGroundingReport,
  createGroundingDraftPatch,
  validateGroundedNarration,
  type GroundingReport,
} from "./grounding";
import { createPlayerCheckNarrationContext } from "./improvisedActions";
import {
  createManipulableObjectContext,
  isObjectAcquisitionIntent,
} from "../world/manipulableObjects";

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
  const pendingCombatCuesAtTurnStart = initialState.combatNarrationQueue;
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
  const grounding = buildGroundingReport(effectiveInput, routingState);
  const route = routePlayerInput(effectiveInput, routingState, grounding);
  const localResolution = resolveAutomaticLocalRequest(effectiveInput, routingState);
  const hasLocalClarification = Boolean(localResolution.draftPatch?.questions?.length);
  const selectedAgents = localResolution.handled && !localResolution.continueToAgents
    ? []
    : route.agents.filter((agent) => !(hasLocalClarification && agent === "actionManager"));
  let draft = createEmptyResolutionDraft();
  const agentsRun: AiAgentId[] = [];
  const gatheredCommands: SourcedCommand[] = localResolution.commands.map((command) => ({
    command,
    source: "localEngine",
  }));

  draft = mergeResolutionDraft(draft, localResolution.draftPatch);
  draft = mergeResolutionDraft(draft, createGroundingDraftPatch(grounding));
  draft = mergeResolutionDraft(draft, createCommunicationNarrationPatch(routingState));
  draft = mergeResolutionDraft(draft, createPendingCombatNarrationPatch(pendingCombatCuesAtTurnStart));
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
      const safeDraftPatch = sanitizeAcquisitionAuthorization(response.draftPatch, draft);
      agentsRun.push(agentId);
      domainAgentCount += 1;
      const executableCommands = response.commands.filter((command) => command.type !== "sendNarration");
      draft = mergeResolutionDraft(draft, {
        ...safeDraftPatch,
        proposedCommands: executableCommands,
      });
      if (agentId === "worldManager" || agentId === "combatManager") {
        applyScenePatches(safeDraftPatch?.scenePatches);
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
        ...(safeDraftPatch?.suggestedAgents ?? []),
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
  const queuedCombatCueIdsBeforeExecution = new Set(
    useGameStore.getState().combatNarrationQueue.map((cue) => cue.id),
  );
  const pendingCheckIdsBeforeExecution = new Set(
    useGameStore.getState().playerCheckRequests
      .filter((request) => request.status === "pending")
      .map((request) => request.id),
  );
  const executionResults = clarification ? [] : executeValidatedCommands(gatheredCommands, grounding);
  const combatCueIdsCreatedByExecution = useGameStore.getState().combatNarrationQueue
    .filter((cue) => !queuedCombatCueIdsBeforeExecution.has(cue.id))
    .map((cue) => cue.id);
  const combatCueIdsCoveredByThisTurn = [
    ...pendingCombatCuesAtTurnStart.map((cue) => cue.id),
    ...combatCueIdsCreatedByExecution,
  ];
  const queuedPlayerCheck = useGameStore.getState().playerCheckRequests.find((request) =>
    request.status === "pending" && !pendingCheckIdsBeforeExecution.has(request.id));
  const playerCheckContext = queuedPlayerCheck
    ? createPlayerCheckNarrationContext(queuedPlayerCheck) ?? undefined
    : undefined;

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

  const packet = createNarrationPacket(
    draft,
    executionResults,
    getLatestPlayerActionReceipt(),
    grounding,
    playerCheckContext,
  );
  let narration: string;
  let narrationWarning: string | null = null;

  try {
    narration = await runNarrator(effectiveInput, packet);
    const violations = validateGroundedNarration(narration, effectiveInput, grounding, useGameStore.getState());
    if (violations.length > 0) {
      const correctedNarration = await runNarrator(effectiveInput, packet, violations);
      const remainingViolations = validateGroundedNarration(
        correctedNarration,
        effectiveInput,
        grounding,
        useGameStore.getState(),
      );
      if (remainingViolations.length > 0) {
        narrationWarning = `Narration rejetée pour incohérence : ${remainingViolations.join(" ")}`;
        narration = createGroundedFallbackNarration(packet);
      } else {
        narration = correctedNarration;
      }
    }
  } catch (error) {
    narrationWarning = `Narrateur indisponible : ${errorMessage(error)}`;
    narration = createGroundedFallbackNarration(packet);
  }

  agentsRun.push("narrationManager");
  useGameStore.getState().addGmMessage(narration, playerCheckContext?.stage === "pending"
    ? { kind: "checkSetup", relatedCheckId: playerCheckContext.requestId }
    : undefined);
  if (playerCheckContext?.stage !== "pending") {
    resolveNarratedDueEvents();
    useGameStore.getState().recordNarratedBeat(narration);
  }
  if (playerCheckContext?.stage !== "pending") {
    useGameStore.getState().consumeCombatNarrationCues(combatCueIdsCoveredByThisTurn);
  }

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

/** Reprend le récit une fois le d20 réellement lancé. Aucun spécialiste n'est
 * rappelé : le moteur a déjà fixé le degré de réussite et le Narrateur ne fait
 * que traduire ce résultat en conséquence diégétique. */
export async function continueAfterPlayerCheck(requestId: string): Promise<AutomatedDirectorResult> {
  const state = useGameStore.getState();
  const request = state.playerCheckRequests.find((candidate) => candidate.id === requestId);
  const playerCheck = request ? createPlayerCheckNarrationContext(request) : null;
  if (!request || !playerCheck || playerCheck.stage !== "resolved") {
    throw new Error("Le résultat de ce jet n'est pas disponible.");
  }

  const postCheck = await resolvePostCheckAcquisition(request.action, playerCheck);
  const packet = createNarrationPacket(
    postCheck.draft,
    postCheck.executionResults,
    undefined,
    undefined,
    playerCheck,
  );
  let narration: string;
  const warnings: string[] = [];

  try {
    narration = await runNarrator(request.action, packet);
  } catch (error) {
    warnings.push(`Narrateur indisponible après le jet : ${errorMessage(error)}`);
    narration = createPlayerCheckFallbackNarration(playerCheck);
  }

  const currentState = useGameStore.getState();
  currentState.addGmMessage(narration, { kind: "checkResult", relatedCheckId: request.id });
  resolveNarratedDueEvents();
  currentState.recordNarratedBeat(narration);

  return {
    narration,
    agentsRun: [...postCheck.agentsRun, "narrationManager"],
    warnings: [
      ...postCheck.draft.warnings,
      ...postCheck.executionResults.filter((result) => result.status === "error").map((result) => result.message),
      ...warnings,
    ],
  };
}

async function resolvePostCheckAcquisition(
  action: string,
  playerCheck: Extract<PlayerCheckNarrationContext, { stage: "resolved" }>,
): Promise<{
  draft: AiResolutionDraft;
  executionResults: ReturnType<typeof executeValidatedCommands>;
  agentsRun: AiAgentId[];
}> {
  let draft = createEmptyResolutionDraft();
  const agentsRun: AiAgentId[] = [];
  if (
    !isObjectAcquisitionIntent(action) ||
    playerCheck.degree === "failure"
  ) {
    return { draft, executionResults: [], agentsRun };
  }

  draft = mergeResolutionDraft(draft, {
    facts: [{
      source: "localEngine",
      kind: "resolvedAcquisitionAttempt",
      content: `Tentative d'acquisition résolue par le moteur : « ${action} »; degré ${playerCheck.degree}${playerCheck.outcome ? `; issue ${playerCheck.outcome}` : ""}. Aucun nouveau jet n'est autorisé. Un objet n'entre dans l'inventaire que par une commande réussie fondée sur manipulableObjects.`,
      visibility: "gmOnly",
    }],
  });

  const beforeState = useGameStore.getState();
  const deterministicItem = playerCheck.degree === "partial"
    ? undefined
    : selectDeterministicAcquisition(beforeState, action);
  const gatheredCommands: SourcedCommand[] = [];

  if (deterministicItem) {
    draft = mergeResolutionDraft(draft, {
      facts: [{
        source: "localEngine",
        kind: "acquisitionAuthorized",
        content: `${deterministicItem.name} existe réellement auprès de ${deterministicItem.holderName ?? "la scène"} et le résultat autorise son transfert dans l'inventaire.`,
        visibility: "playerVisible",
        relatedIds: [deterministicItem.id],
      }],
    });
    gatheredCommands.push({
      source: "localEngine",
      command: {
        type: "pickupItem",
        characterId: beforeState.selectedCharacterId,
        itemId: deterministicItem.id,
      },
    });
  } else {
    const queue: AutomaticDomainAgent[] = ["worldManager"];
    const scheduled = new Set<AutomaticDomainAgent>(queue);

    while (queue.length > 0 && agentsRun.length < 3) {
      const agentId = queue.shift()!;
      try {
        const response = await runDomainAgent(agentId, action, draft);
        const safeDraftPatch = sanitizeAcquisitionAuthorization(response.draftPatch, draft);
        agentsRun.push(agentId);
        const executableCommands = response.commands.filter((command) =>
          command.type !== "sendNarration" &&
          command.type !== "resolveGameAction" &&
          command.type !== "abilityCheck" &&
          command.type !== "skillCheck" &&
          command.type !== "roll");
        draft = mergeResolutionDraft(draft, {
          ...safeDraftPatch,
          proposedCommands: executableCommands,
        });
        if (agentId === "worldManager") applyScenePatches(safeDraftPatch?.scenePatches);

        executableCommands.forEach((command) => {
          if (isCommandAllowedForAgent(agentId, command.type)) {
            gatheredCommands.push({ command, source: agentId });
          }
        });

        const hasAuthorizedLoot = draft.facts.some((fact) =>
          fact.kind === "acquisitionAuthorized" || fact.kind === "latentLootAuthorized");
        const requestedAgents = [
          ...response.agentRequests,
          ...(safeDraftPatch?.suggestedAgents ?? []),
          ...(agentId === "worldManager" && hasAuthorizedLoot
            ? [{ agent: "characterManager" as const, reason: "Transférer le butin autorisé." }]
            : []),
        ];
        requestedAgents.forEach((request) => {
          if (
            (request.agent !== "characterManager" && request.agent !== "assetTemplateManager") ||
            scheduled.has(request.agent)
          ) return;
          scheduled.add(request.agent);
          queue.push(request.agent);
        });
        queue.sort((left, right) => getAutomaticAgentPriority(left) - getAutomaticAgentPriority(right));
      } catch (error) {
        draft = mergeResolutionDraft(draft, {
          warnings: [`Résolution du butin par ${agentId} indisponible : ${errorMessage(error)}`],
        });
      }
    }
  }

  const executionResults = executeValidatedCommands(gatheredCommands);
  const afterState = useGameStore.getState();
  const previouslyOwned = new Set(beforeState.itemInstances
    .filter((item) => item.location.parent === beforeState.selectedCharacterId)
    .map((item) => item.id));
  const acquiredItems = afterState.itemInstances.filter((item) =>
    item.location.parent === afterState.selectedCharacterId && !previouslyOwned.has(item.id));

  if (acquiredItems.length > 0) {
    const names = acquiredItems.map((item) => getItemDisplayName(item.id, afterState));
    draft = mergeResolutionDraft(draft, {
      facts: [{
        source: "localEngine",
        kind: "inventoryMutation",
        content: `Inventaire réellement modifié : ${names.join(", ")}. Ces objets sont désormais présents dans le sac.`,
        visibility: "playerVisible",
        relatedIds: acquiredItems.map((item) => item.id),
      }],
    });
    retireAcquiredWorldEntities(draft, afterState);
  } else if (gatheredCommands.length > 0) {
    draft = mergeResolutionDraft(draft, {
      warnings: ["Aucun objet n'a rejoint l'inventaire malgré la tentative d'acquisition."],
    });
  }

  return { draft, executionResults, agentsRun };
}

function selectDeterministicAcquisition(state: GameState, action: string) {
  const objects = createManipulableObjectContext(state, action, 12)
    .filter((object) => object.source === "itemInstance" && object.transferable && object.affordances.includes("takeFromHolder"));
  const normalizedAction = normalizeGroundingTerm(action);
  const explicit = objects.filter((object) =>
    object.visibility === "visible" && normalizedAction.includes(normalizeGroundingTerm(object.name)));
  if (explicit.length === 1) return explicit[0];

  const holderMatches = objects.filter((object) =>
    object.holderName && normalizedAction.includes(normalizeGroundingTerm(object.holderName)));
  if (holderMatches.length === 1) return holderMatches[0];

  if (/\b(detrousse|fouille les poches)\b/u.test(normalizedAction) && objects.length === 1) {
    return objects[0];
  }
  return undefined;
}

function getItemDisplayName(itemId: string, state: GameState): string {
  const item = state.itemInstances.find((candidate) => candidate.id === itemId);
  const template = item ? state.itemTemplates.find((candidate) => candidate.id === item.templateId) : undefined;
  return String(item?.overrides.name ?? template?.name ?? itemId);
}

function retireAcquiredWorldEntities(draft: AiResolutionDraft, state: GameState): void {
  const authorizedIds = new Set(draft.facts
    .filter((fact) => fact.kind === "acquisitionAuthorized")
    .flatMap((fact) => fact.relatedIds ?? []));
  state.campaign.world.entities.items
    .filter((entity) => authorizedIds.has(entity.id))
    .forEach((entity) => state.updateEntity({
      ...entity,
      details: {
        ...entity.details,
        ownerId: state.selectedCharacterId,
        tags: [...new Set([...(entity.details?.tags ?? []), "acquired"])],
      },
    }));
}

function resolveNarratedDueEvents(): void {
  const state = useGameStore.getState();
  const dueEvents = state.narrativeScene.activeEvents.filter((event) => event.turnsRemaining === 0);
  if (dueEvents.length === 0) return;
  state.applyNarrativeScenePatch({
    resolveEventIds: dueEvents.map((event) => event.id),
    consequences: dueEvents.map((event) => `Événement arrivé : ${event.description}`),
  });
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

function createPendingCombatNarrationPatch(
  cues: GameState["combatNarrationQueue"],
): AiResolutionDraftPatch | undefined {
  const events = cues
    .flatMap((cue) => cue.entries)
    .slice(-12)
    .map((entry) => entry.text.trim())
    .filter(Boolean);
  if (events.length === 0) return undefined;

  return {
    facts: [{
      source: "localEngine",
      kind: "resolvedCombatSequence",
      content: `Conséquences de combat déjà résolues à intégrer dans la narration présente : ${events.join(" | ")}`,
      visibility: "playerVisible",
    }],
  };
}

function createCommunicationNarrationPatch(
  state: GameState,
): AiResolutionDraftPatch | undefined {
  const latestPlayerMessage = [...state.messages].reverse().find((message) => message.sender === "player");
  const constraint = describeCommunicationForNarrator(latestPlayerMessage?.communication ?? null);
  if (!constraint) return undefined;
  return {
    facts: [{
      source: "localEngine",
      kind: "communicationConstraint",
      content: constraint,
      visibility: "gmOnly",
    }],
  };
}

function createGroundedFallbackNarration(packet: ReturnType<typeof createNarrationPacket>): string {
  if (packet.playerCheck?.stage === "pending") {
    return createPlayerCheckFallbackNarration(packet.playerCheck);
  }
  if (packet.playerCheck?.stage === "resolved") {
    return createPlayerCheckFallbackNarration(packet.playerCheck);
  }
  const latestReceipt = packet.actionReceipts.at(-1);
  if (latestReceipt) {
    return createNarratedActionReceiptFallback(latestReceipt, packet.questions.at(-1));
  }

  const resultMessages = packet.results.map((result) => result.message);
  const confirmed = [...resultMessages, ...packet.facts].filter(Boolean);
  const question = packet.questions.at(-1);

  if (confirmed.length > 0) {
    return `${confirmed.join(" ")}${question ? ` ${question}` : ""}`;
  }

  if (question) return `Vous prenez le temps d'observer la situation. ${question}`;

  return "Vous prenez le temps d'observer la scène, mais rien ne s'impose encore avec certitude. Que cherchez-vous à comprendre, et comment vous y prenez-vous ?";
}

function createPlayerCheckFallbackNarration(playerCheck: PlayerCheckNarrationContext): string {
  if (playerCheck.stage === "pending") {
    const action = lowerFirst(playerCheck.action.trim().replace(/[.!?]+$/u, ""));
    return `Vous tentez de ${action}. ${capitalize(playerCheck.challengeCue)}.`;
  }

  const resultText: Record<PlayerCheckDegree, string> = {
    critical: "Votre geste dépasse même ce que vous espériez",
    success: "Votre tentative porte ses fruits",
    partial: "Vous progressez, mais pas sans complication",
    failure: "Votre tentative échoue et la situation évolue contre vous",
  };
  return `${resultText[playerCheck.degree]}.${playerCheck.outcome ? ` ${playerCheck.outcome}` : ""}`;
}

function lowerFirst(value: string): string {
  return value ? `${value.charAt(0).toLocaleLowerCase("fr-FR")}${value.slice(1)}` : "mener cette tentative";
}

function capitalize(value: string): string {
  return value ? `${value.charAt(0).toLocaleUpperCase("fr-FR")}${value.slice(1)}` : value;
}

function createNarratedActionReceiptFallback(
  receipt: ReturnType<typeof createNarrationPacket>["actionReceipts"][number],
  question?: string,
): string {
  const actionSentences = receipt.actions.map((action) => {
    const target = action.target ? ` sur ${action.target.label}` : "";
    if (action.kind === "attack") return `Vous portez votre attaque avec ${action.sourceLabel}${target}.`;
    if (action.kind === "useAbility") return `Vous déclenchez ${action.sourceLabel}${target}.`;
    if (action.kind === "castSpell") return `Vous lancez ${action.sourceLabel}${target}.`;
    return `Vous utilisez ${action.sourceLabel}${target}.`;
  });
  const hpLosses = receipt.changes.filter((change) => change.kind === "hp" && Number(change.delta) < 0);
  const hpGains = receipt.changes.filter((change) => change.kind === "hp" && Number(change.delta) > 0);
  const conditions = receipt.changes.filter((change) => change.kind === "condition");
  const movements = receipt.changes.filter((change) => change.kind === "position");
  const consequences = [
    ...(hpLosses.length > 0
      ? [`${hpLosses.map((change) => change.label).join(" et ")} ${hpLosses.length > 1 ? "accusent" : "accuse"} le coup.`]
      : []),
    ...(hpGains.length > 0
      ? [`${hpGains.map((change) => change.label).join(" et ")} ${hpGains.length > 1 ? "reprennent" : "reprend"} des forces.`]
      : []),
    ...conditions.map((change) => `${change.label} en subit aussitôt l'effet.`),
    ...movements.map((change) => `${change.label} atteint la destination choisie.`),
  ];

  if (consequences.length === 0 && receipt.actions.some((action) => action.kind === "attack")) {
    consequences.push("L'assaut ne produit pourtant aucune blessure visible.");
  } else if (consequences.length === 0) {
    consequences.push("L'effet se dissipe sans changement visible de la situation.");
  }

  return [...actionSentences, ...consequences, ...(question ? [question] : [])].join(" ");
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
  corrections: string[] = [],
): Promise<string> {
  const prompt = buildAutomaticNarrationPrompt(useGameStore.getState(), playerInput, packet, corrections);
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

function executeValidatedCommands(commands: SourcedCommand[], grounding?: GroundingReport) {
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
    gameActionTemplates: initialSnapshot.gameActionTemplates,
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
    const blockedByGrounding = getGroundingCommandBlock(command, source, grounding);

    if (blockedByGrounding) {
      return {
        status: "error" as const,
        message: blockedByGrounding,
        command: JSON.stringify(command),
      };
    }

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

function getGroundingCommandBlock(
  command: AiDirectorCommand,
  source: SourcedCommand["source"],
  grounding?: GroundingReport,
): string | null {
  if (!grounding?.blockedSubjects.length || source === "localEngine") return null;
  const materializingCommands = new Set<AiDirectorCommand["type"]>([
    "createItem",
    "giveItem",
    "grantAbility",
    "updateCharacterHistory",
  ]);
  if (!materializingCommands.has(command.type)) return null;

  const state = useGameStore.getState();
  const commandText = createGroundingCommandText(command, state);
  const relatedClaims = grounding.claims.filter((claim) =>
    claim.status === "unverified" && commandText.includes(normalizeGroundingTerm(claim.subject)));
  const createsClaimedWorldResource = (command.type === "createItem" || command.type === "giveItem") &&
    grounding.claims.some((claim) => claim.status === "unverified" && claim.domain !== "inventory");

  if (!relatedClaims.length && !createsClaimedWorldResource) return null;
  const blockedSubjects = relatedClaims.length
    ? relatedClaims.map((claim) => claim.subject)
    : grounding.claims.filter((claim) => claim.status === "unverified" && claim.domain !== "inventory").map((claim) => claim.subject);
  return `Commande ${command.type} refusée : une affirmation du joueur ne peut pas créer rétroactivement ${[...new Set(blockedSubjects)].join(", ")}.`;
}

function createGroundingCommandText(command: AiDirectorCommand, state: GameState): string {
  const details: unknown[] = [command];
  if (command.type === "giveItem") {
    details.push(state.itemTemplates.find((template) => template.id === command.templateId));
  }
  if (command.type === "createItem" && command.templateId) {
    details.push(state.itemTemplates.find((template) => template.id === command.templateId));
  }
  if (command.type === "grantAbility") {
    const ability = state.abilityTemplates.find((template) => template.id === command.templateId);
    details.push(ability);
    if (ability) {
      details.push(state.gameActionTemplates.find((action) => action.id === ability.actionId));
    }
  }
  return normalizeGroundingTerm(JSON.stringify(details));
}

function normalizeGroundingTerm(value: string): string {
  return value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[’']/gu, " ");
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
    gameActionTemplates: state.gameActionTemplates,
    abilityInstances: state.abilityInstances,
    spellTemplates: state.spellTemplates,
    spellbooks: state.spellbooks,
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

function sanitizeAcquisitionAuthorization(
  patch: AiResolutionDraftPatch | undefined,
  incomingDraft: AiResolutionDraft,
): AiResolutionDraftPatch | undefined {
  if (!patch || incomingDraft.facts.some((fact) => fact.kind === "resolvedAcquisitionAttempt")) return patch;
  const acquisitionFactKinds = new Set(["acquisitionAuthorized", "latentLootAuthorized"]);
  const unauthorizedFacts = (patch.facts ?? []).filter((fact) => acquisitionFactKinds.has(fact.kind));
  if (unauthorizedFacts.length === 0) return patch;
  return {
    ...patch,
    facts: (patch.facts ?? []).filter((fact) => !acquisitionFactKinds.has(fact.kind)),
    warnings: [
      ...(patch.warnings ?? []),
      "Autorisation d'acquisition ignorée : aucun résultat moteur préalable ne l'établit.",
    ],
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

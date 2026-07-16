import type {
  Entity,
  NarrativeSceneEvent,
  NarrativeScenePatch,
} from "../../app/types";
import type { GameState } from "../../store/useGameStore";

export type ScenePacingOpportunityKind = "event" | "social";

export interface ScenePacingOpportunity {
  key: string;
  kind: ScenePacingOpportunityKind;
  sceneId: string;
  sceneTurn: number;
  delayMs: number;
  focusId: string;
  focusLabel: string;
  focusDescription: string;
  focusStage: string;
  relatedEntityIds: string[];
}

export const SCENE_PACING_DELAYS_MS = {
  immediateEvent: 90_000,
  risingEvent: 150_000,
  socialPressure: 180_000,
  questionExtra: 30_000,
} as const;

/**
 * Une relance n'est autorisée que si la scène contient déjà quelque chose qui
 * peut agir. L'absence d'occasion retourne null : aucun texte d'ambiance de
 * remplissage ne doit alors être demandé à l'IA.
 */
export function selectScenePacingOpportunity(state: GameState): ScenePacingOpportunity | null {
  const scene = state.narrativeScene;
  const latestMessage = state.messages.at(-1);
  const hasPendingCheck = state.playerCheckRequests.some((request) => request.status === "pending");

  if (
    scene.turn <= 0 ||
    !scene.lastPlayerAction.trim() ||
    scene.lastProactiveTurn === scene.turn ||
    state.combat.status === "active" ||
    state.pendingGameDecision !== null ||
    state.pendingActionIntents.length > 0 ||
    hasPendingCheck ||
    latestMessage?.sender !== "gm"
  ) {
    return null;
  }

  const questionDelay = latestMessage.content.trim().endsWith("?")
    ? SCENE_PACING_DELAYS_MS.questionExtra
    : 0;
  const event = chooseActionableEvent(scene.activeEvents);

  if (event) {
    const key = [scene.id, scene.turn, "event", event.id, event.stage, event.turnsRemaining].join(":");
    if (scene.lastProactiveKey === key) return null;

    return {
      key,
      kind: "event",
      sceneId: scene.id,
      sceneTurn: scene.turn,
      delayMs: (event.urgency === "immediate" || event.turnsRemaining === 0
        ? SCENE_PACING_DELAYS_MS.immediateEvent
        : SCENE_PACING_DELAYS_MS.risingEvent) + questionDelay,
      focusId: event.id,
      focusLabel: event.description,
      focusDescription: event.description,
      focusStage: event.stage,
      relatedEntityIds: event.relatedEntityIds,
    };
  }

  if (scene.socialTension < 3 && scene.alertLevel < 2) return null;

  const npc = choosePresentNpc(state);
  if (!npc) return null;
  const key = [scene.id, scene.turn, "social", npc.id, scene.socialTension, scene.alertLevel].join(":");
  if (scene.lastProactiveKey === key) return null;

  return {
    key,
    kind: "social",
    sceneId: scene.id,
    sceneTurn: scene.turn,
    delayMs: SCENE_PACING_DELAYS_MS.socialPressure + questionDelay,
    focusId: npc.id,
    focusLabel: npc.name,
    focusDescription: npc.description,
    focusStage: npc.details?.desire
      ? `Intention actuelle : ${npc.details.desire}`
      : npc.details?.role
        ? `Rôle dans la scène : ${npc.details.role}`
        : "Présent dans une scène sous tension",
    relatedEntityIds: [npc.id],
  };
}

export function buildScenePacingPrompt(
  state: GameState,
  opportunity: ScenePacingOpportunity,
): string {
  const entities = collectRelevantEntities(state, opportunity);
  const event = state.narrativeScene.activeEvents.find((candidate) => candidate.id === opportunity.focusId);

  return [
    "Tu es le Conteur. Le joueur n'a fourni AUCUNE nouvelle action : tu ne dois lui attribuer aucun geste, déplacement, pensée ni parole.",
    "Produis au maximum une brève relance uniquement si l'élément FOCUS peut agir maintenant. Sinon renvoie une narration vide.",
    "Interdictions absolues : commenter l'attente, dire que le temps passe, décrire seulement une ambiance, répéter la dernière narration, inventer un objet ou une personne, lancer un dé, modifier des PV ou démarrer un combat.",
    "Une relance valide fait progresser FOCUS d'une étape concrète : un événement arrive, un PNJ présent agit ou parle, une occasion se resserre. Elle peut finir par une question naturelle, mais jamais par une liste de choix d'interface.",
    "La narration fait 1 ou 2 courts paragraphes en français. Elle nomme clairement le PNJ focal s'il s'agit d'une pression sociale.",
    "La progression doit être persistée dans draftPatch.scenePatch. Pour un événement, mets à jour son stage avec une étape réellement nouvelle ou résous son id. Pour une pression sociale, ajoute une conséquence factuelle et ajuste au plus légèrement tension/alerte.",
    "Ne change jamais le lieu ni la position du joueur. N'ajoute aucune commande et ne demande aucun autre agent.",
    'Réponds uniquement par ce JSON compact : {"narration":"...","commands":[],"agentRequests":[],"draftPatch":{"scenePatch":{"upsertEvents":[],"resolveEventIds":[],"consequences":[]}}}.',
    `FOCUS: ${JSON.stringify({
      kind: opportunity.kind,
      id: opportunity.focusId,
      label: opportunity.focusLabel,
      description: opportunity.focusDescription,
      stage: opportunity.focusStage,
      event: event ?? null,
    })}`,
    `SCÈNE: ${JSON.stringify({
      location: state.narrativeScene.locationLabel,
      playerPosition: state.narrativeScene.playerPosition,
      socialTension: state.narrativeScene.socialTension,
      alertLevel: state.narrativeScene.alertLevel,
      recentConsequences: state.narrativeScene.recentConsequences.slice(-3),
      lastPlayerAction: truncate(state.narrativeScene.lastPlayerAction, 220),
      lastNarratedBeat: truncate(state.narrativeScene.lastNarratedBeat, 360),
      entities,
    })}`,
    `ÉCHANGES RÉCENTS: ${JSON.stringify(state.messages.slice(-3).map((message) => ({
      sender: message.sender,
      content: truncate(message.content, 220),
    })))}`,
  ].join("\n");
}

/** Restreint le patch du Narrateur à l'élément qui a justifié la relance. */
export function sanitizeScenePacingPatch(
  state: GameState,
  opportunity: ScenePacingOpportunity,
  patch: NarrativeScenePatch | undefined,
): NarrativeScenePatch | null {
  if (!patch) return null;
  const scene = state.narrativeScene;
  const sanitized: NarrativeScenePatch = {};
  const consequence = patch.consequences?.find((value) => value.trim());

  if (consequence) sanitized.consequences = [consequence.trim().slice(0, 220)];

  if (typeof patch.socialTensionDelta === "number" && patch.socialTensionDelta !== 0) {
    sanitized.socialTensionDelta = Math.max(-1, Math.min(1, patch.socialTensionDelta));
  }
  if (typeof patch.alertLevel === "number") {
    const minimum = Math.max(0, scene.alertLevel - 1);
    const maximum = Math.min(4, scene.alertLevel + 1);
    sanitized.alertLevel = Math.max(minimum, Math.min(maximum, patch.alertLevel)) as 0 | 1 | 2 | 3 | 4;
  }
  if (typeof patch.elapsedMinutes === "number" && patch.elapsedMinutes > 0) {
    sanitized.elapsedMinutes = Math.min(2, patch.elapsedMinutes);
  }

  if (opportunity.kind === "event") {
    const currentEvent = scene.activeEvents.find((event) => event.id === opportunity.focusId);
    if (!currentEvent) return null;
    const requestedEvent = patch.upsertEvents?.find((event) => event.id === currentEvent.id);
    const resolvesEvent = patch.resolveEventIds?.includes(currentEvent.id) ?? false;

    if (resolvesEvent) sanitized.resolveEventIds = [currentEvent.id];
    if (requestedEvent && requestedEvent.stage.trim() !== currentEvent.stage.trim()) {
      sanitized.upsertEvents = [{
        ...currentEvent,
        ...requestedEvent,
        id: currentEvent.id,
        description: requestedEvent.description.trim() || currentEvent.description,
        stage: requestedEvent.stage.trim().slice(0, 100),
        turnsRemaining: Math.max(0, Math.min(6, Math.round(requestedEvent.turnsRemaining))),
        relatedEntityIds: requestedEvent.relatedEntityIds.filter((id) =>
          opportunity.relatedEntityIds.includes(id)).slice(0, 8),
      }];
    }

    if (!sanitized.resolveEventIds?.length && !sanitized.upsertEvents?.length) return null;
    return sanitized;
  }

  if (!sanitized.consequences?.length) return null;
  return sanitized;
}

export function isGroundedScenePacingNarration(
  narration: string,
  opportunity: ScenePacingOpportunity,
): boolean {
  const value = narration.trim();
  if (value.length < 25) return false;
  const normalized = normalize(value);
  const forbidden = [
    "le temps passe",
    "apres un long moment",
    "le silence se prolonge",
    "le silence s installe",
    "vous attendez",
    "vous reflechissez",
    "vous hesitez",
    "pendant que vous attendez",
    "rien ne se passe",
    "scenepatch",
    "evenement actif",
  ];
  if (forbidden.some((phrase) => normalized.includes(phrase))) return false;

  if (opportunity.kind === "social") {
    const nameParts = normalize(opportunity.focusLabel).split(/\s+/u).filter((part) => part.length >= 3);
    const distinctiveName = nameParts.at(-1);
    return Boolean(distinctiveName && normalized.includes(distinctiveName));
  }

  return true;
}

export function isSameScenePacingOpportunity(
  expected: ScenePacingOpportunity,
  state: GameState,
): boolean {
  const current = selectScenePacingOpportunity(state);
  return current?.key === expected.key && current.sceneTurn === expected.sceneTurn;
}

function chooseActionableEvent(events: NarrativeSceneEvent[]): NarrativeSceneEvent | undefined {
  return [...events]
    .filter((event) => event.urgency !== "background")
    .sort((left, right) => {
      const urgency = urgencyRank(left.urgency) - urgencyRank(right.urgency);
      return urgency || left.turnsRemaining - right.turnsRemaining;
    })[0];
}

function choosePresentNpc(state: GameState): Entity | undefined {
  const presentIds = new Set(state.narrativeScene.presentEntityIds);
  const sceneText = normalize(`${state.narrativeScene.lastPlayerAction} ${state.narrativeScene.lastNarratedBeat}`);
  return state.campaign.world.entities.npcs
    .filter((npc) => presentIds.has(npc.id) && Boolean(
      npc.details?.desire?.trim() ||
      npc.details?.role?.trim() ||
      npc.description.trim().length >= 20,
    ))
    .map((npc, index) => ({
      npc,
      index,
      score:
        (sceneText.includes(normalize(npc.name)) ? 10 : 0) +
        (npc.details?.desire?.trim() ? 3 : 0) +
        (npc.details?.role?.trim() ? 2 : 0),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.npc;
}

function collectRelevantEntities(state: GameState, opportunity: ScenePacingOpportunity) {
  const relevantIds = new Set([
    ...state.narrativeScene.presentEntityIds,
    ...opportunity.relatedEntityIds,
  ]);
  return [
    ...state.campaign.world.entities.npcs,
    ...state.campaign.world.entities.items,
  ]
    .filter((entity) => relevantIds.has(entity.id))
    .slice(0, 6)
    .map((entity) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      description: truncate(entity.description, 140),
      role: truncate(entity.details?.role ?? "", 80),
      desire: truncate(entity.details?.desire ?? "", 80),
      fear: truncate(entity.details?.fear ?? "", 80),
    }));
}

function urgencyRank(value: NarrativeSceneEvent["urgency"]): number {
  if (value === "immediate") return 0;
  if (value === "rising") return 1;
  return 2;
}

function truncate(value: string, maximumLength: number): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength - 1)}…` : value;
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

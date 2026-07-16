import type {
  Campaign,
  Character,
  CharacterStats,
  Entity,
  Message,
  NarrativeSceneState,
} from "../../app/types";
import {
  advanceNarrativeScene,
  applyNarrativeScenePatch,
  recordNarratedBeat,
} from "./narrativeScene";
import type {
  GameActorRole,
  GameCommand,
  GameCommandType,
} from "./commands";
import type { GameEvent, GameEventBody } from "./events";

export interface GameRuntimeSnapshot {
  revision: number;
  campaign: Campaign;
  characters: Character[];
  messages: Message[];
  narrativeScene: NarrativeSceneState;
  processedCommandIds: string[];
}

export interface GameEngineDependencies {
  createId: (prefix: "command" | "event" | "message") => string;
}

export type GameCommandFailureCode =
  | "CAMPAIGN_MISMATCH"
  | "DUPLICATE_COMMAND"
  | "INVALID_COMMAND"
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "REVISION_CONFLICT";

export interface GameCommandSuccess {
  ok: true;
  command: GameCommand;
  state: GameRuntimeSnapshot;
  events: GameEvent[];
}

export interface GameCommandFailure {
  ok: false;
  command: GameCommand;
  code: GameCommandFailureCode;
  message: string;
  currentRevision: number;
}

export type GameCommandResult = GameCommandSuccess | GameCommandFailure;

interface EventBuildSuccess {
  ok: true;
  events: GameEvent[];
}

type EventBuildResult = EventBuildSuccess | GameCommandFailure;

const statNames = new Set<keyof CharacterStats>([
  "force",
  "dexterite",
  "constitution",
  "intelligence",
  "sagesse",
  "charisme",
]);

const allowedRoles: Record<GameCommandType, ReadonlySet<GameActorRole>> = {
  "character.adjustHp": new Set(["gm", "system"]),
  "character.setHp": new Set(["gm", "system"]),
  "character.changeStat": new Set(["gm", "system"]),
  "character.appendHistory": new Set(["gm", "system"]),
  "campaign.appendHistory": new Set(["gm", "system"]),
  "world.addFact": new Set(["gm", "system"]),
  "world.updateFact": new Set(["gm", "system"]),
  "world.removeFact": new Set(["gm", "system"]),
  "world.upsertEntity": new Set(["gm", "system"]),
  "narrative.advanceScene": new Set(["gm", "system"]),
  "narrative.patchScene": new Set(["gm", "system"]),
  "narrative.recordBeat": new Set(["gm", "system"]),
  "chat.addGmMessage": new Set(["gm", "system"]),
};

/**
 * Point d'autorité pur du moteur. Aucun accès réseau, stockage, horloge ou RNG
 * implicite : les seules dépendances non déterministes sont injectées.
 */
export function executeGameCommand(
  state: GameRuntimeSnapshot,
  command: GameCommand,
  dependencies: GameEngineDependencies,
): GameCommandResult {
  const envelopeFailure = validateEnvelope(state, command);
  if (envelopeFailure) return envelopeFailure;

  const built = buildEvents(state, command, dependencies);
  if (!built.ok) return built;

  const nextState = replayGameEvents(state, built.events);
  return { ok: true, command, state: nextState, events: built.events };
}

export function replayGameEvents(
  initialState: GameRuntimeSnapshot,
  events: GameEvent[],
): GameRuntimeSnapshot {
  return events.reduce(applyGameEvent, initialState);
}

export function applyGameEvent(
  state: GameRuntimeSnapshot,
  event: GameEvent,
): GameRuntimeSnapshot {
  if (event.campaignId !== state.campaign.id) {
    throw new Error(`Événement ${event.id} rattaché à une autre campagne.`);
  }

  const withRevision = (next: GameRuntimeSnapshot): GameRuntimeSnapshot => ({
    ...next,
    revision: Math.max(next.revision, event.revision),
    processedCommandIds: next.processedCommandIds.includes(event.commandId)
      ? next.processedCommandIds
      : [...next.processedCommandIds, event.commandId],
  });

  if (event.type === "character.hpChanged") {
    return withRevision(updateCharacterSnapshot(state, event.payload.characterId, (character) => ({
      ...character,
      pv: event.payload.after,
    })));
  }

  if (event.type === "character.statChanged") {
    return withRevision(updateCharacterSnapshot(state, event.payload.characterId, (character) => ({
      ...character,
      stats: { ...character.stats, [event.payload.stat]: event.payload.after },
    })));
  }

  if (event.type === "character.historyAppended") {
    return withRevision(updateCharacterSnapshot(state, event.payload.characterId, (character) => ({
      ...character,
      history: [...(character.history ?? []), event.payload.entry].slice(-100),
    })));
  }

  if (event.type === "campaign.historyAppended") {
    return withRevision({
      ...state,
      campaign: {
        ...state.campaign,
        history: [...state.campaign.history, event.payload.entry].slice(-100),
      },
    });
  }

  if (event.type === "world.factAdded") {
    return withRevision(updateWorldFacts(state, [
      ...state.campaign.world.facts,
      event.payload.value,
    ]));
  }

  if (event.type === "world.factUpdated") {
    const facts = [...state.campaign.world.facts];
    facts[event.payload.index] = event.payload.after;
    return withRevision(updateWorldFacts(state, facts));
  }

  if (event.type === "world.factRemoved") {
    return withRevision(updateWorldFacts(
      state,
      state.campaign.world.facts.filter((_, index) => index !== event.payload.index),
    ));
  }

  if (event.type === "world.entityUpserted") {
    return withRevision(upsertWorldEntity(state, event.payload.after));
  }

  if (event.type === "narrative.sceneChanged") {
    return withRevision({ ...state, narrativeScene: event.payload.after });
  }

  return withRevision({
    ...state,
    messages: [...state.messages, event.payload.message],
  });
}

function validateEnvelope(
  state: GameRuntimeSnapshot,
  command: GameCommand,
): GameCommandFailure | null {
  if (
    command.protocolVersion !== 1 ||
    !command.id.trim() ||
    !command.actorId.trim() ||
    !Number.isInteger(command.expectedRevision) ||
    command.expectedRevision < 0 ||
    !Number.isFinite(command.issuedAt)
  ) {
    return failure(state, command, "INVALID_COMMAND", "Enveloppe de commande invalide.");
  }

  if (command.campaignId !== state.campaign.id) {
    return failure(state, command, "CAMPAIGN_MISMATCH", "La commande cible une autre campagne.");
  }

  if (state.processedCommandIds.includes(command.id)) {
    return failure(state, command, "DUPLICATE_COMMAND", "Cette commande a déjà été appliquée.");
  }

  if (command.expectedRevision !== state.revision) {
    return failure(
      state,
      command,
      "REVISION_CONFLICT",
      `Révision attendue ${command.expectedRevision}, révision courante ${state.revision}.`,
    );
  }

  if (!allowedRoles[command.type]?.has(command.actorRole)) {
    return failure(state, command, "PERMISSION_DENIED", "Le rôle de cet acteur ne permet pas cette commande.");
  }

  return null;
}

function buildEvents(
  state: GameRuntimeSnapshot,
  command: GameCommand,
  dependencies: GameEngineDependencies,
): EventBuildResult {
  const characterId = "characterId" in command.payload
    ? command.payload.characterId
    : undefined;
  const character = characterId
    ? state.characters.find((candidate) => candidate.id === characterId)
    : undefined;

  if (command.type === "character.adjustHp") {
    if (!character) return failure(state, command, "NOT_FOUND", "Personnage introuvable.");
    if (!Number.isFinite(command.payload.amount)) {
      return failure(state, command, "INVALID_COMMAND", "Variation de PV invalide.");
    }
    const after = clamp(character.pv + command.payload.amount, 0, character.maxPv);
    return success(createEvent(command, state.revision + 1, dependencies, {
      type: "character.hpChanged",
      payload: {
        characterId: character.id,
        before: character.pv,
        after,
        reason: command.payload.reason,
      },
    }));
  }

  if (command.type === "character.setHp") {
    if (!character) return failure(state, command, "NOT_FOUND", "Personnage introuvable.");
    if (!Number.isFinite(command.payload.hp)) {
      return failure(state, command, "INVALID_COMMAND", "Valeur de PV invalide.");
    }
    return success(createEvent(command, state.revision + 1, dependencies, {
      type: "character.hpChanged",
      payload: {
        characterId: character.id,
        before: character.pv,
        after: clamp(command.payload.hp, 0, character.maxPv),
        reason: command.payload.reason?.trim() || "set",
      },
    }));
  }

  if (command.type === "character.changeStat") {
    if (!character) return failure(state, command, "NOT_FOUND", "Personnage introuvable.");
    if (
      !statNames.has(command.payload.stat) ||
      !Number.isFinite(command.payload.value) ||
      (command.payload.mode !== "add" && command.payload.mode !== "set")
    ) {
      return failure(state, command, "INVALID_COMMAND", "Modification de caractéristique invalide.");
    }
    const before = character.stats[command.payload.stat];
    const after = command.payload.mode === "add" ? before + command.payload.value : command.payload.value;
    return success(createEvent(command, state.revision + 1, dependencies, {
      type: "character.statChanged",
      payload: { characterId: character.id, stat: command.payload.stat, before, after },
    }));
  }

  if (command.type === "character.appendHistory") {
    if (!character) return failure(state, command, "NOT_FOUND", "Personnage introuvable.");
    const entry = command.payload.entry.trim();
    if (!entry) return failure(state, command, "INVALID_COMMAND", "Entrée d'historique vide.");
    return success(createEvent(command, state.revision + 1, dependencies, {
      type: "character.historyAppended",
      payload: { characterId: character.id, entry },
    }));
  }

  if (command.type === "campaign.appendHistory") {
    const entry = command.payload.entry.trim();
    if (!entry) return failure(state, command, "INVALID_COMMAND", "Entrée de campagne vide.");
    return success(createEvent(command, state.revision + 1, dependencies, {
      type: "campaign.historyAppended",
      payload: { entry },
    }));
  }

  if (command.type === "world.addFact") {
    const value = command.payload.value.trim();
    if (!value) return failure(state, command, "INVALID_COMMAND", "Fait du monde vide.");
    return success(createEvent(command, state.revision + 1, dependencies, {
      type: "world.factAdded",
      payload: { index: state.campaign.world.facts.length, value },
    }));
  }

  if (command.type === "world.updateFact") {
    const before = state.campaign.world.facts[command.payload.index];
    if (before === undefined || !Number.isInteger(command.payload.index)) {
      return failure(state, command, "NOT_FOUND", "Fait du monde introuvable.");
    }
    return success(createEvent(command, state.revision + 1, dependencies, {
      type: "world.factUpdated",
      payload: { index: command.payload.index, before, after: command.payload.value },
    }));
  }

  if (command.type === "world.removeFact") {
    const value = state.campaign.world.facts[command.payload.index];
    if (value === undefined || !Number.isInteger(command.payload.index)) {
      return failure(state, command, "NOT_FOUND", "Fait du monde introuvable.");
    }
    return success(createEvent(command, state.revision + 1, dependencies, {
      type: "world.factRemoved",
      payload: { index: command.payload.index, value },
    }));
  }

  if (command.type === "world.upsertEntity") {
    const entity = command.payload.entity;
    if (
      !entity ||
      typeof entity.id !== "string" ||
      !entity.id.trim() ||
      typeof entity.name !== "string" ||
      !entity.name.trim() ||
      typeof entity.description !== "string" ||
      (entity.type !== "npc" && entity.type !== "location" && entity.type !== "item")
    ) {
      return failure(state, command, "INVALID_COMMAND", "Entité du monde incomplète.");
    }
    return success(createEvent(command, state.revision + 1, dependencies, {
      type: "world.entityUpserted",
      payload: { before: findWorldEntity(state.campaign, entity.id) ?? null, after: entity },
    }));
  }

  if (command.type === "narrative.advanceScene") {
    return success(createSceneEvent(
      state,
      command,
      dependencies,
      advanceNarrativeScene(state.narrativeScene, command.payload.playerAction),
    ));
  }

  if (command.type === "narrative.patchScene") {
    if (!command.payload.patch || typeof command.payload.patch !== "object") {
      return failure(state, command, "INVALID_COMMAND", "Patch narratif invalide.");
    }
    return success(createSceneEvent(
      state,
      command,
      dependencies,
      applyNarrativeScenePatch(state.narrativeScene, command.payload.patch, state.campaign),
    ));
  }

  if (command.type === "narrative.recordBeat") {
    return success(createSceneEvent(
      state,
      command,
      dependencies,
      recordNarratedBeat(
        state.narrativeScene,
        command.payload.narration,
        command.payload.proactiveKey
          ? { key: command.payload.proactiveKey, occurredAt: command.issuedAt }
          : undefined,
      ),
    ));
  }

  const content = command.payload.content.trim();
  if (!content) return failure(state, command, "INVALID_COMMAND", "Message du MJ vide.");
  return success(createEvent(command, state.revision + 1, dependencies, {
    type: "chat.gmMessageAdded",
    payload: {
      message: {
        id: dependencies.createId("message"),
        sender: "gm",
        content,
        timestamp: command.issuedAt,
      },
    },
  }));
}

function createSceneEvent(
  state: GameRuntimeSnapshot,
  command: GameCommand,
  dependencies: GameEngineDependencies,
  after: NarrativeSceneState,
): GameEvent {
  return createEvent(command, state.revision + 1, dependencies, {
    type: "narrative.sceneChanged",
    payload: { before: state.narrativeScene, after },
  });
}

function createEvent(
  command: GameCommand,
  revision: number,
  dependencies: GameEngineDependencies,
  body: GameEventBody,
): GameEvent {
  return {
    protocolVersion: 1,
    id: dependencies.createId("event"),
    commandId: command.id,
    campaignId: command.campaignId,
    actorId: command.actorId,
    actorRole: command.actorRole,
    revision,
    occurredAt: command.issuedAt,
    ...body,
  } as GameEvent;
}

function success(event: GameEvent): EventBuildSuccess {
  return { ok: true, events: [event] };
}

function failure(
  state: GameRuntimeSnapshot,
  command: GameCommand,
  code: GameCommandFailureCode,
  message: string,
): GameCommandFailure {
  return { ok: false, command, code, message, currentRevision: state.revision };
}

function updateCharacterSnapshot(
  state: GameRuntimeSnapshot,
  characterId: string,
  update: (character: Character) => Character,
): GameRuntimeSnapshot {
  const characters = state.characters.map((character) =>
    character.id === characterId ? update(character) : character);
  return {
    ...state,
    characters,
    campaign: { ...state.campaign, characters },
  };
}

function updateWorldFacts(state: GameRuntimeSnapshot, facts: string[]): GameRuntimeSnapshot {
  return {
    ...state,
    campaign: {
      ...state.campaign,
      world: { ...state.campaign.world, facts },
    },
  };
}

function upsertWorldEntity(state: GameRuntimeSnapshot, entity: Entity): GameRuntimeSnapshot {
  const key = entity.type === "npc" ? "npcs" : entity.type === "location" ? "locations" : "items";
  const currentTarget = state.campaign.world.entities[key];
  const existsInTarget = currentTarget.some((candidate) => candidate.id === entity.id);
  const entities = {
    npcs: state.campaign.world.entities.npcs.filter((candidate) => candidate.id !== entity.id),
    locations: state.campaign.world.entities.locations.filter((candidate) => candidate.id !== entity.id),
    items: state.campaign.world.entities.items.filter((candidate) => candidate.id !== entity.id),
  };
  entities[key] = existsInTarget
    ? currentTarget.map((candidate) => candidate.id === entity.id ? entity : candidate)
    : [...entities[key], entity];
  return {
    ...state,
    campaign: {
      ...state.campaign,
      world: { ...state.campaign.world, entities },
    },
  };
}

function findWorldEntity(campaign: Campaign, entityId: string): Entity | undefined {
  return [
    ...campaign.world.entities.npcs,
    ...campaign.world.entities.locations,
    ...campaign.world.entities.items,
  ].find((entity) => entity.id === entityId);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

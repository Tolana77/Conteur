import type {
  CharacterStats,
  Entity,
  NarrativeScenePatch,
} from "../../app/types";

export type GameActorRole = "player" | "gm" | "system";

export interface GameCommandEnvelope {
  protocolVersion: 1;
  id: string;
  campaignId: string;
  actorId: string;
  actorRole: GameActorRole;
  expectedRevision: number;
  issuedAt: number;
}

export type GameCommand = GameCommandEnvelope & GameCommandBody;

export type GameCommandBody =
  | {
      type: "character.adjustHp";
      payload: {
        characterId: string;
        amount: number;
        reason: "heal" | "damage" | "rule";
      };
    }
  | {
      type: "character.setHp";
      payload: { characterId: string; hp: number; reason?: string };
    }
  | {
      type: "character.changeStat";
      payload: {
        characterId: string;
        stat: keyof CharacterStats;
        value: number;
        mode: "add" | "set";
      };
    }
  | {
      type: "character.appendHistory";
      payload: { characterId: string; entry: string };
    }
  | {
      type: "campaign.appendHistory";
      payload: { entry: string };
    }
  | {
      type: "world.addFact";
      payload: { value: string };
    }
  | {
      type: "world.updateFact";
      payload: { index: number; value: string };
    }
  | {
      type: "world.removeFact";
      payload: { index: number };
    }
  | {
      type: "world.upsertEntity";
      payload: { entity: Entity };
    }
  | {
      type: "narrative.advanceScene";
      payload: { playerAction: string };
    }
  | {
      type: "narrative.patchScene";
      payload: { patch: NarrativeScenePatch };
    }
  | {
      type: "narrative.recordBeat";
      payload: { narration: string; proactiveKey?: string };
    }
  | {
      type: "chat.addGmMessage";
      payload: { content: string };
    };

export type GameCommandType = GameCommandBody["type"];
export type GameCommandInput = GameCommandBody;

export interface GameCommandActor {
  id: string;
  role: GameActorRole;
}

export type GameCommandParseResult =
  | { success: true; value: GameCommand; errors: [] }
  | { success: false; value: null; errors: string[] };

/** Valide le JSON non fiable reçu par une future passerelle multijoueur. */
export function parseGameCommand(value: unknown): GameCommandParseResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { success: false, value: null, errors: ["La commande doit être un objet."] };

  if (value.protocolVersion !== 1) errors.push("protocolVersion doit valoir 1.");
  requireString(value, "id", errors);
  requireString(value, "campaignId", errors);
  requireString(value, "actorId", errors);
  if (value.actorRole !== "player" && value.actorRole !== "gm" && value.actorRole !== "system") {
    errors.push("actorRole est invalide.");
  }
  if (!Number.isInteger(value.expectedRevision) || Number(value.expectedRevision) < 0) {
    errors.push("expectedRevision doit être un entier positif ou nul.");
  }
  if (typeof value.issuedAt !== "number" || !Number.isFinite(value.issuedAt)) {
    errors.push("issuedAt doit être un timestamp valide.");
  }
  if (typeof value.type !== "string") errors.push("type est obligatoire.");
  if (!isRecord(value.payload)) errors.push("payload doit être un objet.");

  if (!errors.length && isRecord(value.payload)) {
    validatePayload(value.type as string, value.payload, errors);
  }

  return errors.length
    ? { success: false, value: null, errors }
    : { success: true, value: value as unknown as GameCommand, errors: [] };
}

function validatePayload(type: string, payload: Record<string, unknown>, errors: string[]): void {
  if (type === "character.adjustHp") {
    requireString(payload, "characterId", errors);
    requireFiniteNumber(payload, "amount", errors);
    if (payload.reason !== "heal" && payload.reason !== "damage" && payload.reason !== "rule") {
      errors.push("payload.reason est invalide.");
    }
    return;
  }
  if (type === "character.setHp") {
    requireString(payload, "characterId", errors);
    requireFiniteNumber(payload, "hp", errors);
    if (payload.reason !== undefined && typeof payload.reason !== "string") errors.push("payload.reason doit être un texte.");
    return;
  }
  if (type === "character.changeStat") {
    requireString(payload, "characterId", errors);
    requireFiniteNumber(payload, "value", errors);
    if (!statKeys.has(String(payload.stat))) errors.push("payload.stat est invalide.");
    if (payload.mode !== "add" && payload.mode !== "set") errors.push("payload.mode est invalide.");
    return;
  }
  if (type === "character.appendHistory") {
    requireString(payload, "characterId", errors);
    requireString(payload, "entry", errors);
    return;
  }
  if (type === "campaign.appendHistory") {
    requireString(payload, "entry", errors);
    return;
  }
  if (type === "world.addFact") {
    requireString(payload, "value", errors);
    return;
  }
  if (type === "world.updateFact") {
    requireNonNegativeInteger(payload, "index", errors);
    if (typeof payload.value !== "string") errors.push("payload.value doit être un texte.");
    return;
  }
  if (type === "world.removeFact") {
    requireNonNegativeInteger(payload, "index", errors);
    return;
  }
  if (type === "world.upsertEntity") {
    if (!isRecord(payload.entity)) errors.push("payload.entity doit être un objet.");
    return;
  }
  if (type === "narrative.advanceScene") {
    if (typeof payload.playerAction !== "string") errors.push("payload.playerAction doit être un texte.");
    return;
  }
  if (type === "narrative.patchScene") {
    if (!isRecord(payload.patch)) errors.push("payload.patch doit être un objet.");
    return;
  }
  if (type === "narrative.recordBeat") {
    if (typeof payload.narration !== "string") errors.push("payload.narration doit être un texte.");
    if (payload.proactiveKey !== undefined && typeof payload.proactiveKey !== "string") {
      errors.push("payload.proactiveKey doit être un texte.");
    }
    return;
  }
  if (type === "chat.addGmMessage") {
    requireString(payload, "content", errors);
    return;
  }
  errors.push(`Type de commande inconnu : ${type}.`);
}

const statKeys = new Set(["force", "dexterite", "constitution", "intelligence", "sagesse", "charisme"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: Record<string, unknown>, key: string, errors: string[]): void {
  if (typeof value[key] !== "string" || !String(value[key]).trim()) errors.push(`${key} doit être un texte non vide.`);
}

function requireFiniteNumber(value: Record<string, unknown>, key: string, errors: string[]): void {
  if (typeof value[key] !== "number" || !Number.isFinite(value[key])) errors.push(`${key} doit être un nombre valide.`);
}

function requireNonNegativeInteger(value: Record<string, unknown>, key: string, errors: string[]): void {
  if (!Number.isInteger(value[key]) || Number(value[key]) < 0) errors.push(`${key} doit être un entier positif ou nul.`);
}

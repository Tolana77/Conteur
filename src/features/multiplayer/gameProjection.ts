import type {
  Campaign,
  CombatScene,
  Entity,
  ItemInstance,
  ItemTemplate,
} from "../../app/types";
import { hasLineOfSight } from "../combat/targeting";
import type { GameState } from "../../store/useGameStore";
import type {
  MultiplayerMember,
  MultiplayerProjectionEnvelope,
  MultiplayerRole,
} from "./types";
import { projectMessagesForRecipient } from "./messageVisibility";
import {
  applyPerceptionConditions,
  normalizeCharacterPerception,
} from "../../core/game-engine/perception";
import type { CharacterPerception } from "../../core/models";

export type MultiplayerSharedGameState = Pick<
  GameState,
  | "storageVersion"
  | "gameRevision"
  | "campaign"
  | "characters"
  | "messages"
  | "narrativeMomentum"
  | "pendingGameDecision"
  | "diceRolls"
  | "playerCheckRequests"
  | "characterDerivedScores"
  | "itemTemplates"
  | "itemInstances"
  | "abilityTemplates"
  | "abilityInstances"
  | "gameActionTemplates"
  | "spellTemplates"
  | "spellbooks"
  | "effectTemplates"
  | "combat"
  | "narrativeScene"
>;

export function createMultiplayerProjection(
  state: GameState,
  roomId: string,
  member: MultiplayerMember,
  sequence: number,
): MultiplayerProjectionEnvelope {
  const canSeeGmState = member.role === "host" || member.role === "admin";
  const characterId = member.characterId;
  const viewerCharacter = state.characters.find((character) => character.id === characterId);
  const viewerCombatant = characterId
    ? state.combat.combatants.find((combatant) =>
        combatant.sourceType === "character" && combatant.sourceId === characterId)
    : undefined;
  const viewerPerception = applyPerceptionConditions(
    normalizeCharacterPerception(viewerCharacter?.perception),
    viewerCombatant?.conditions ?? [],
  );
  const projectedItems = canSeeGmState
    ? { instances: state.itemInstances, templates: state.itemTemplates }
    : projectItems(state.itemInstances, state.itemTemplates, characterId);
  const itemInstances = projectedItems.instances;
  const abilityInstances = canSeeGmState
    ? state.abilityInstances
    : state.abilityInstances.filter((instance) => instance.ownerId === characterId);
  const referencedAbilityTemplateIds = new Set(abilityInstances.map((instance) => instance.templateId));
  const abilityTemplates = canSeeGmState
    ? state.abilityTemplates
    : state.abilityTemplates.filter((template) => referencedAbilityTemplateIds.has(template.id));
  const spellbooks = canSeeGmState
    ? state.spellbooks
    : state.spellbooks.filter((spellbook) => spellbook.characterId === characterId);
  const knownSpellIds = new Set(spellbooks.flatMap((spellbook) => spellbook.knownSpellIds));
  const spellTemplates = canSeeGmState
    ? state.spellTemplates
    : state.spellTemplates.filter((spell) => knownSpellIds.has(spell.id));
  const actionIds = new Set([
    ...abilityTemplates.map((template) => template.actionId),
    ...spellTemplates.map((template) => template.actionId),
  ]);
  const gameActionTemplates = canSeeGmState
    ? state.gameActionTemplates
    : state.gameActionTemplates.filter((template) => actionIds.has(template.id));
  const effectIds = new Set([
    ...projectedItems.templates.flatMap((template) => template.effects.map((effect) => effect.effectId)),
    ...itemInstances.flatMap((instance) => instance.effects.map((effect) => effect.effectId)),
    ...abilityInstances.flatMap((instance) => instance.effects.map((effect) => effect.effectId)),
    ...gameActionTemplates.flatMap((template) => template.effects.map((effect) => effect.effectId)),
  ]);
  const projectedCharacters = state.characters.map((character) => ({
    ...character,
    inventaire: canSeeGmState || character.id === characterId ? character.inventaire : [],
    history: canSeeGmState || character.id === characterId ? character.history : undefined,
  }));
  const combat = canSeeGmState
    ? state.combat
    : projectCombat(state.combat, characterId, viewerPerception);
  const visibleEntityIds = new Set([
    ...(canSeeGmState || viewerPerception.vision !== "none"
      ? state.narrativeScene.presentEntityIds
      : []),
    ...(state.narrativeScene.locationId ? [state.narrativeScene.locationId] : []),
    ...combat.combatants.map((combatant) => combatant.sourceId),
  ]);
  const campaign = projectCampaign(
    state.campaign,
    projectedCharacters,
    canSeeGmState,
    visibleEntityIds,
  );
  const projectedState: MultiplayerSharedGameState = {
    storageVersion: state.storageVersion,
    gameRevision: state.gameRevision,
    campaign,
    characters: projectedCharacters,
    messages: projectMessagesForRecipient(
      state.messages,
      member.userId,
      canSeeGmState,
      state.characters,
      characterId,
      viewerPerception,
    ),
    narrativeMomentum: state.narrativeMomentum,
    pendingGameDecision: state.pendingGameDecision,
    diceRolls: canSeeGmState
      ? state.diceRolls
      : state.diceRolls.filter((roll) => roll.visibility === "public" || roll.visibility === "summary"),
    playerCheckRequests: canSeeGmState
      ? state.playerCheckRequests
      : state.playerCheckRequests.filter((request) => request.characterId === characterId),
    characterDerivedScores: canSeeGmState
      ? state.characterDerivedScores
      : characterId && state.characterDerivedScores[characterId]
        ? { [characterId]: state.characterDerivedScores[characterId] }
        : {},
    itemTemplates: projectedItems.templates,
    itemInstances,
    abilityTemplates,
    abilityInstances,
    gameActionTemplates,
    spellTemplates,
    spellbooks,
    effectTemplates: canSeeGmState
      ? state.effectTemplates
      : state.effectTemplates.filter((template) => effectIds.has(template.id)),
    combat,
    narrativeScene: canSeeGmState
      ? state.narrativeScene
      : {
          ...state.narrativeScene,
          presentEntityIds: viewerPerception.vision === "none"
            ? []
            : state.narrativeScene.presentEntityIds,
          recentConsequences: [],
          activeEvents: [],
        },
  };

  return cloneSerializable({
    protocolVersion: 1,
    roomId,
    campaignId: state.campaign.id,
    recipientUserId: member.userId,
    recipientCharacterId: characterId,
    sequence,
    publishedAt: Date.now(),
    state: projectedState,
  });
}

export function parseMultiplayerProjection(
  value: unknown,
  expectedRoomId: string,
  expectedUserId: string,
): MultiplayerProjectionEnvelope & { state: MultiplayerSharedGameState } {
  if (!isRecord(value)) throw new Error("Projection multijoueur absente.");
  if (value.protocolVersion !== 1) throw new Error("Version de projection incompatible.");
  if (value.roomId !== expectedRoomId) throw new Error("La projection appartient à une autre partie.");
  if (value.recipientUserId !== expectedUserId) throw new Error("La projection appartient à un autre joueur.");
  if (!Number.isSafeInteger(value.sequence) || Number(value.sequence) < 0) {
    throw new Error("Séquence de projection invalide.");
  }
  if (!isSharedGameState(value.state)) throw new Error("État multijoueur incomplet.");

  return value as unknown as MultiplayerProjectionEnvelope & { state: MultiplayerSharedGameState };
}

export function applyMultiplayerProjection(
  current: GameState,
  projection: MultiplayerProjectionEnvelope & { state: MultiplayerSharedGameState },
): Partial<GameState> {
  const assignedCharacterId = projection.recipientCharacterId;
  const selectedCharacterId = assignedCharacterId && projection.state.characters.some(
    (character) => character.id === assignedCharacterId,
  )
    ? assignedCharacterId
    : current.selectedCharacterId;

  return {
    ...projection.state,
    selectedCharacterId,
    pendingActionIntents: current.pendingActionIntents,
    characterPortraits: current.characterPortraits,
    uiSettings: current.uiSettings,
    aiApiTraces: current.aiApiTraces,
    contentAuditLog: current.contentAuditLog,
    disabledContentTemplateIds: current.disabledContentTemplateIds,
    campaignStartSnapshot: current.campaignStartSnapshot,
    gameEvents: [],
    combatNarrationQueue: [],
  };
}

function projectCampaign(
  campaign: Campaign,
  characters: Campaign["characters"],
  canSeeGmState: boolean,
  visibleEntityIds: Set<string>,
): Campaign {
  if (canSeeGmState) return { ...campaign, characters };

  return {
    ...campaign,
    characters,
    world: {
      ...campaign.world,
      secrets: [],
      factions: [],
      conflicts: [],
      hooks: [],
      timeline: [],
      entities: {
        npcs: campaign.world.entities.npcs.filter((entity) => visibleEntityIds.has(entity.id)).map(projectEntity),
        locations: campaign.world.entities.locations.filter((entity) => visibleEntityIds.has(entity.id)).map(projectEntity),
        items: campaign.world.entities.items.filter((entity) => visibleEntityIds.has(entity.id)).map(projectEntity),
      },
    },
  };
}

function projectEntity(entity: Entity): Entity {
  if (!entity.details) return entity;
  const { secret: _secret, data: _data, ...publicDetails } = entity.details;
  return { ...entity, details: publicDetails };
}

function projectItems(
  instances: ItemInstance[],
  templates: ItemTemplate[],
  characterId: string | null,
): { instances: ItemInstance[]; templates: ItemTemplate[] } {
  const visibleInstances = instances.filter((instance) =>
    instance.location.type === "world" ||
    (instance.location.type === "equipped" && instance.location.parent !== null) ||
    (characterId !== null && instance.location.parent === characterId));
  const projectedTemplates: ItemTemplate[] = [];
  const projectedInstances: ItemInstance[] = [];

  visibleInstances.forEach((instance) => {
    const template = templates.find((candidate) => candidate.id === instance.templateId);
    if (!template) return;
    const projectedTemplateId = `${template.id}--viewer-${instance.id}`;
    const nameState = getItemFieldState(instance, template, "name");
    const descriptionState = getItemFieldState(instance, template, "description");
    const effectsState = getItemFieldState(instance, template, "effects");
    const name = nameState === "known"
      ? String(instance.overrides.name ?? template.name)
      : nameState === "hidden"
        ? "Objet masqué"
        : String(instance.data.unknownName ?? template.modules.item?.unknownName ?? "Objet inconnu");
    const description = descriptionState === "known"
      ? String(instance.overrides.description ?? template.description)
      : descriptionState === "hidden"
        ? ""
        : String(instance.data.unknownDescription ?? template.modules.item?.unknownDescription ?? "Description inconnue.");
    const effects = effectsState === "known" ? [...template.effects, ...instance.effects] : [];
    const weightOverride = instance.overrides["base.weight"];
    const safeBase = effectsState === "known"
      ? {
          ...template.base,
          ...Object.fromEntries(
            Object.entries(instance.overrides)
              .filter(([key]) => key.startsWith("base."))
              .map(([key, value]) => [key.slice("base.".length), value]),
          ),
        }
      : {
          ...(typeof weightOverride === "number" || typeof template.base.weight === "number"
            ? { weight: typeof weightOverride === "number" ? weightOverride : template.base.weight }
            : {}),
        };
    const safeData = Object.fromEntries(
      Object.entries(instance.data).filter(([key]) =>
        key === "inventoryOrder" ||
        key === "nameState" ||
        key === "descriptionState" ||
        key === "effectsState" ||
        key === "unknownName" ||
        key === "unknownDescription"),
    );

    projectedTemplates.push({
      ...template,
      id: projectedTemplateId,
      name,
      description,
      base: safeBase,
      effects: [],
      tags: effectsState === "known"
        ? template.tags
        : template.tags.filter((tag) => tag !== "cursed" && tag !== "unknown"),
    });
    projectedInstances.push({
      ...instance,
      templateId: projectedTemplateId,
      overrides: {},
      data: safeData,
      effects,
    });
  });

  return { instances: projectedInstances, templates: projectedTemplates };
}

function getItemFieldState(
  instance: ItemInstance,
  template: ItemTemplate,
  field: "name" | "description" | "effects",
): "known" | "unknown" | "hidden" {
  const instanceState = instance.data[`${field}State`];
  const templateState = template.modules.item?.[`${field}State`];
  const state = typeof instanceState === "string" ? instanceState : templateState;
  return state === "hidden" || state === "unknown" ? state : "known";
}

function projectCombat(
  combat: CombatScene,
  characterId: string | null,
  perception: CharacterPerception,
): CombatScene {
  const viewer = characterId
    ? combat.combatants.find((combatant) =>
        combatant.sourceType === "character" && combatant.sourceId === characterId)
    : undefined;
  const visibleCombatantIds = new Set(perception.vision === "none"
    ? viewer ? [viewer.id] : []
    : combat.combatants
        .filter((combatant) =>
          combatant.side !== "enemies" ||
          Boolean(viewer && hasLineOfSight(combat, viewer.position, combatant.position)))
        .map((combatant) => combatant.id));

  return {
    ...combat,
    combatants: combat.combatants
      .filter((combatant) => visibleCombatantIds.has(combatant.id))
      .map((combatant) => {
        if (combatant.side !== "enemies") return combatant;
        const healthBand = combatant.maxHp > 0
          ? Math.max(0, Math.ceil((combatant.hp / combatant.maxHp) * 4))
          : 0;
        return {
          ...combatant,
          hp: healthBand,
          maxHp: 4,
          attackDamage: 0,
          attacks: undefined,
          abilityTemplateIds: undefined,
          behavior: undefined,
          resistances: undefined,
          vulnerabilities: undefined,
          immunities: undefined,
        };
      }),
    log: combat.log.filter((entry) =>
      !entry.targetIds || entry.targetIds.every((targetId) => visibleCombatantIds.has(targetId))),
    map: {
      ...combat.map,
      obstacles: perception.vision === "none" ? [] : combat.map.obstacles,
      details: perception.vision === "none"
        ? []
        : combat.map.details?.filter((detail) => detail.visible === true),
    },
  };
}

function isSharedGameState(value: unknown): value is MultiplayerSharedGameState {
  if (!isRecord(value)) return false;
  return isRecord(value.campaign) &&
    Array.isArray(value.characters) &&
    Array.isArray(value.messages) &&
    Array.isArray(value.diceRolls) &&
    Array.isArray(value.itemTemplates) &&
    Array.isArray(value.itemInstances) &&
    Array.isArray(value.abilityTemplates) &&
    Array.isArray(value.abilityInstances) &&
    Array.isArray(value.spellTemplates) &&
    Array.isArray(value.spellbooks) &&
    Array.isArray(value.effectTemplates) &&
    isRecord(value.combat) &&
    isRecord(value.narrativeScene);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function canRoleControlGame(role: MultiplayerRole | null): boolean {
  return role === null || role === "host";
}

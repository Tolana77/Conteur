import type {
  AbilityInstance,
  AbilityTemplate,
  Character,
  EffectTemplate,
  GameActionTemplate,
  ItemInstance,
  ItemTemplate,
} from "../../app/types";
import type { GameState } from "../../store/useGameStore";
import { createAbilityInstance, initialAbilityTemplates } from "../abilities";
import { initialGameActionTemplates } from "../actions";
import { initialEffectTemplates, initialEnemyTemplates } from "../content";
import {
  type CharacterCreationContext,
  type CharacterCreationPackage,
} from "../character/characterCreation";
import { initialItemTemplates, isItemEquipable } from "../items";
import { normalizeCharacterPerception } from "../../core/game-engine/perception";

export interface CharacterInstallBundle {
  character: Character;
  itemTemplates: ItemTemplate[];
  itemInstances: ItemInstance[];
  abilityTemplates: AbilityTemplate[];
  abilityInstances: AbilityInstance[];
  gameActionTemplates: GameActionTemplate[];
  effectTemplates: EffectTemplate[];
}

export function createMultiplayerCharacterContext(
  state: Pick<
    GameState,
    | "campaign"
    | "characters"
    | "itemTemplates"
    | "abilityTemplates"
    | "gameActionTemplates"
    | "effectTemplates"
    | "enemyTemplates"
  >,
): CharacterCreationContext {
  return {
    campaignName: state.campaign.name,
    campaignStyle: state.campaign.style,
    campaignLevel: state.campaign.level,
    worldName: state.campaign.world.name ?? state.campaign.name,
    worldPitch: state.campaign.world.pitch ?? state.campaign.world.lore,
    campaignDetails: createPublicCampaignDetails(state.campaign),
    playerRole: state.campaign.world.characterCreation?.playerRole
      ?? "Un membre du groupe d'aventuriers",
    partyConcept: state.campaign.world.characterCreation?.partyConcept
      ?? (state.characters?.map((character) => character.name).join(", ")
        || "Un groupe encore en formation"),
    startingEquipment: state.campaign.world.characterCreation?.startingEquipment
      ?? "Un équipement modeste adapté au concept du personnage",
    itemTemplates: mergeById(initialItemTemplates, state.itemTemplates),
    abilityTemplates: mergeById(initialAbilityTemplates, state.abilityTemplates),
    gameActionTemplates: mergeById(initialGameActionTemplates, state.gameActionTemplates),
    effectTemplates: mergeById(initialEffectTemplates, state.effectTemplates),
    enemyTemplates: mergeById(initialEnemyTemplates, state.enemyTemplates),
  };
}

function createPublicCampaignDetails(
  campaign: Pick<GameState["campaign"], "history" | "world">,
): string[] {
  const world = campaign.world;
  const details = [
    world.tone ? `Ton: ${world.tone}` : "",
    world.themes?.length ? `Thèmes: ${world.themes.slice(0, 6).join(", ")}` : "",
    world.rules?.length ? `Règles du monde: ${world.rules.slice(0, 6).join("; ")}` : "",
    world.facts.length ? `Faits publics: ${world.facts.slice(0, 10).join("; ")}` : "",
    world.factions?.length
      ? `Factions: ${world.factions.slice(0, 8).map((faction) => `${faction.name} — ${faction.goal}`).join("; ")}`
      : "",
    world.entities.locations.length
      ? `Lieux importants: ${world.entities.locations.slice(0, 8).map((location) => `${location.name} — ${location.description}`).join("; ")}`
      : "",
    world.entities.npcs.length
      ? `Figures connues: ${world.entities.npcs.slice(0, 8).map((npc) => `${npc.name} — ${npc.details?.role ?? npc.description}`).join("; ")}`
      : "",
    world.hooks?.length
      ? `Pistes ouvertes: ${world.hooks.slice(0, 6).map((hook) => `${hook.title} — ${hook.premise}`).join("; ")}`
      : "",
    world.openingScene ? `Situation initiale: ${world.openingScene}` : "",
    campaign.history.length ? `Enjeux fondateurs: ${campaign.history.slice(0, 4).join("; ")}` : "",
  ];
  return [...new Set([
    ...(world.characterCreation?.publicContext ?? []),
    ...details.filter(Boolean),
  ])].slice(0, 24).map((detail) => detail.slice(0, 1600));
}

export function rebaseCharacterCreationPackage(
  source: CharacterCreationPackage,
): CharacterCreationPackage {
  const sourceCharacter = source.characters[0];
  const characterId = `character-${crypto.randomUUID()}`;
  return cloneSerializable({
    ...source,
    characters: [{ ...sourceCharacter, id: characterId }],
    startingItems: source.startingItems.map((item) => ({
      ...item,
      id: `item-${crypto.randomUUID()}`,
      ownerId: characterId,
    })),
  });
}

export function createCharacterInstallBundle(
  state: Pick<
    GameState,
    | "campaign"
    | "itemTemplates"
    | "itemInstances"
    | "abilityTemplates"
    | "abilityInstances"
    | "gameActionTemplates"
    | "effectTemplates"
  >,
  setup: CharacterCreationPackage,
): CharacterInstallBundle {
  const generated = setup.characters[0];
  const effectTemplates = mergeById(state.effectTemplates, setup.effectTemplates);
  const gameActionTemplates = mergeById(state.gameActionTemplates, setup.gameActionTemplates);
  const abilityTemplates = mergeById(state.abilityTemplates, setup.abilityTemplates);
  const itemTemplates = [...state.itemTemplates];
  const itemById = new Map(itemTemplates.map((template) => [template.id, template]));
  const character: Character = {
    id: generated.id,
    campaignId: state.campaign.id,
    name: generated.name,
    ...(generated.title ? { title: generated.title } : {}),
    ...(generated.description ? { description: generated.description } : {}),
    ...(generated.origin ? { origin: generated.origin } : {}),
    espece: generated.espece,
    classe: generated.classe,
    niveau: generated.niveau,
    stats: { ...generated.stats },
    pv: Math.min(generated.pv, generated.maxPv),
    maxPv: generated.maxPv,
    inventaire: [],
    competences: [...generated.competences],
    perception: normalizeCharacterPerception(generated.perception),
    ...(generated.history?.length ? { history: [...generated.history] } : {}),
  };
  const inventoryOffset = state.itemInstances.filter((instance) =>
    instance.location.parent === character.id).length;
  const itemInstances = setup.startingItems.flatMap((item, index): ItemInstance[] => {
    const template = item.templateId ? itemById.get(item.templateId) : undefined;
    if (!template) return [];
    const types = [template.type, ...template.types];
    return [{
      id: item.id,
      templateId: template.id,
      quantity: item.quantity,
      overrides: {
        ...(item.name !== template.name ? { name: item.name } : {}),
        ...(item.description !== template.description ? { description: item.description } : {}),
        ...(item.weight !== Number(template.base.weight ?? 0) ? { "base.weight": item.weight } : {}),
      },
      current: {},
      data: { inventoryOrder: inventoryOffset + index },
      effects: [],
      location: {
        type: item.equipped && isItemEquipable(types) ? "equipped" : "inventory",
        parent: character.id,
      },
    }];
  });
  const abilityInstances = generated.abilityTemplateIds.flatMap((templateId, index) =>
    abilityTemplates.some((template) => template.id === templateId)
      ? [createAbilityInstance(
          `ability-${character.id}-${index + 1}`,
          templateId,
          character.id,
          abilityTemplates,
        )]
      : []);

  return {
    character,
    itemTemplates,
    itemInstances,
    abilityTemplates,
    abilityInstances,
    gameActionTemplates,
    effectTemplates,
  };
}

export function describeCharacterPackage(characterPackage: CharacterCreationPackage): string {
  const character = characterPackage.characters[0];
  return `${character.espece} · ${character.classe} · niveau ${character.niveau}`;
}

function mergeById<T extends { id: string }>(base: T[], additions: T[]): T[] {
  const merged = new Map(base.map((entry) => [entry.id, entry]));
  additions.forEach((entry) => merged.set(entry.id, entry));
  return [...merged.values()];
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

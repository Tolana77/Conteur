import type {
  AbilityInstance,
  AbilityTemplate,
  Campaign,
  CharacterSpellbook,
  Character,
  EffectTemplate,
  EnemyTemplate,
  GameActionTemplate,
  ItemInstance,
  ItemTemplate,
  NarrativeSceneState,
  SpellTemplate,
} from "../../app/types";
import { initialGameActionTemplates } from "../actions";
import { initialEffectTemplates, initialEnemyTemplates } from "../content";
import { createInitialSpellbooks, initialSpellTemplates } from "../spells";
import {
  createInitialNarrativeScene,
  normalizeNarrativeScene,
} from "../../core/game-engine/narrativeScene";
import { normalizeCharacterPerception } from "../../core/game-engine/perception";

export const CAMPAIGN_START_VERSION = 7 as const;

export interface CampaignStartSnapshot {
  version: typeof CAMPAIGN_START_VERSION;
  campaign: Campaign;
  characters: Character[];
  selectedCharacterId: string;
  openingScene: string;
  itemTemplates: ItemTemplate[];
  itemInstances: ItemInstance[];
  abilityTemplates: AbilityTemplate[];
  abilityInstances: AbilityInstance[];
  gameActionTemplates: GameActionTemplate[];
  spellTemplates: SpellTemplate[];
  spellbooks: CharacterSpellbook[];
  effectTemplates: EffectTemplate[];
  enemyTemplates: EnemyTemplate[];
  narrativeScene: NarrativeSceneState;
}

export function createCampaignStartSnapshot(
  snapshot: Omit<CampaignStartSnapshot, "version">,
): CampaignStartSnapshot {
  const characters = cloneSerializable(snapshot.characters).map((character) => ({
    ...character,
    campaignId: snapshot.campaign.id,
    perception: normalizeCharacterPerception(character.perception),
  }));
  return cloneSerializable({
    ...snapshot,
    version: CAMPAIGN_START_VERSION,
    campaign: {
      ...snapshot.campaign,
      characters,
    },
    characters,
  });
}

export function cloneCampaignStartSnapshot(snapshot: CampaignStartSnapshot): CampaignStartSnapshot {
  return cloneSerializable(snapshot);
}

export function isCampaignStartSnapshot(value: unknown): value is CampaignStartSnapshot {
  return hasCampaignStartFields(value)
    && value.version === CAMPAIGN_START_VERSION
    && Boolean(value.narrativeScene && typeof value.narrativeScene === "object");
}

/** Ajoute la mémoire de scène aux instantanés créés avant la version 2. */
export function normalizeCampaignStartSnapshot(value: unknown): CampaignStartSnapshot | null {
  if (!hasCampaignStartFields(value)) return null;
  const characters = value.characters.map((character) => ({
    ...character,
    campaignId: value.campaign.id,
    perception: normalizeCharacterPerception(character.perception),
  }));
  const narrativeScene = value.narrativeScene && typeof value.narrativeScene === "object"
    ? normalizeNarrativeScene(value.narrativeScene, value.campaign)
    : createInitialNarrativeScene(value.campaign, value.openingScene);

  return createCampaignStartSnapshot({
    campaign: value.campaign,
    characters,
    selectedCharacterId: value.selectedCharacterId,
    openingScene: value.openingScene,
    itemTemplates: value.itemTemplates,
    itemInstances: value.itemInstances,
    abilityTemplates: value.abilityTemplates,
    abilityInstances: value.abilityInstances,
    gameActionTemplates: value.gameActionTemplates ?? initialGameActionTemplates,
    spellTemplates: value.spellTemplates ?? initialSpellTemplates,
    spellbooks: value.spellbooks ?? createInitialSpellbooks(characters, initialSpellTemplates),
    effectTemplates: value.effectTemplates ?? initialEffectTemplates,
    enemyTemplates: value.enemyTemplates ?? initialEnemyTemplates,
    narrativeScene,
  });
}

type CampaignStartFields = Omit<
  CampaignStartSnapshot,
  "version" | "narrativeScene" | "gameActionTemplates" | "spellTemplates" | "spellbooks"
> & {
  version?: number;
  narrativeScene?: NarrativeSceneState;
  effectTemplates?: EffectTemplate[];
  enemyTemplates?: EnemyTemplate[];
  gameActionTemplates?: GameActionTemplate[];
  spellTemplates?: SpellTemplate[];
  spellbooks?: CharacterSpellbook[];
};

function hasCampaignStartFields(value: unknown): value is CampaignStartFields {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CampaignStartFields>;

  return Boolean(candidate.campaign && typeof candidate.campaign === "object")
    && Array.isArray(candidate.characters)
    && typeof candidate.selectedCharacterId === "string"
    && typeof candidate.openingScene === "string"
    && Array.isArray(candidate.itemTemplates)
    && Array.isArray(candidate.itemInstances)
    && Array.isArray(candidate.abilityTemplates)
    && Array.isArray(candidate.abilityInstances);
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

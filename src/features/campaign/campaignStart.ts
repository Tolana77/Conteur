import type {
  AbilityInstance,
  AbilityTemplate,
  Campaign,
  Character,
  EffectTemplate,
  EnemyTemplate,
  ItemInstance,
  ItemTemplate,
  NarrativeSceneState,
} from "../../app/types";
import { initialEffectTemplates, initialEnemyTemplates } from "../content";
import {
  createInitialNarrativeScene,
  normalizeNarrativeScene,
} from "../../core/game-engine/narrativeScene";

export const CAMPAIGN_START_VERSION = 3 as const;

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
  effectTemplates: EffectTemplate[];
  enemyTemplates: EnemyTemplate[];
  narrativeScene: NarrativeSceneState;
}

export function createCampaignStartSnapshot(
  snapshot: Omit<CampaignStartSnapshot, "version">,
): CampaignStartSnapshot {
  const characters = cloneSerializable(snapshot.characters);
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
  const narrativeScene = value.narrativeScene && typeof value.narrativeScene === "object"
    ? normalizeNarrativeScene(value.narrativeScene, value.campaign)
    : createInitialNarrativeScene(value.campaign, value.openingScene);

  return createCampaignStartSnapshot({
    campaign: value.campaign,
    characters: value.characters,
    selectedCharacterId: value.selectedCharacterId,
    openingScene: value.openingScene,
    itemTemplates: value.itemTemplates,
    itemInstances: value.itemInstances,
    abilityTemplates: value.abilityTemplates,
    abilityInstances: value.abilityInstances,
    effectTemplates: value.effectTemplates ?? initialEffectTemplates,
    enemyTemplates: value.enemyTemplates ?? initialEnemyTemplates,
    narrativeScene,
  });
}

type CampaignStartFields = Omit<CampaignStartSnapshot, "version" | "narrativeScene"> & {
  version?: number;
  narrativeScene?: NarrativeSceneState;
  effectTemplates?: EffectTemplate[];
  enemyTemplates?: EnemyTemplate[];
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

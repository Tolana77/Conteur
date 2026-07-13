import type { WorldBlueprint, WorldCreationBrief } from "../features/world/worldBlueprint";
import type { Campaign } from "../core/models";

const WORLD_LIBRARY_KEY = "le-conteur:world-blueprints:v1";
const WORLD_BRIEF_KEY = "le-conteur:world-creation-brief:v1";
const CAMPAIGN_BACKUP_KEY = "le-conteur:last-campaign-backup:v1";

export interface SavedWorldBlueprint {
  id: string;
  name: string;
  savedAt: number;
  blueprint: WorldBlueprint;
}

export interface CampaignBackup {
  savedAt: number;
  campaign: Campaign;
}

export function listWorldBlueprints(): SavedWorldBlueprint[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(WORLD_LIBRARY_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isSavedWorldBlueprint)
      .sort((left, right) => right.savedAt - left.savedAt)
      .slice(0, 20);
  } catch {
    return [];
  }
}

export function saveWorldBlueprint(blueprint: WorldBlueprint): SavedWorldBlueprint {
  const current = listWorldBlueprints();
  const existing = current.find((item) => item.name === blueprint.campaign.name);
  const saved: SavedWorldBlueprint = {
    id: existing?.id ?? `world-${crypto.randomUUID()}`,
    name: blueprint.campaign.name,
    savedAt: Date.now(),
    blueprint,
  };
  localStorage.setItem(
    WORLD_LIBRARY_KEY,
    JSON.stringify([saved, ...current.filter((item) => item.id !== saved.id)].slice(0, 20)),
  );
  return saved;
}

export function deleteWorldBlueprint(id: string): void {
  localStorage.setItem(
    WORLD_LIBRARY_KEY,
    JSON.stringify(listWorldBlueprints().filter((item) => item.id !== id)),
  );
}

export function loadWorldCreationBrief(fallback: WorldCreationBrief): WorldCreationBrief {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(WORLD_BRIEF_KEY) ?? "null");
    return isWorldCreationBrief(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function saveWorldCreationBrief(brief: WorldCreationBrief): void {
  localStorage.setItem(WORLD_BRIEF_KEY, JSON.stringify(brief));
}

export function saveCampaignBackup(campaign: Campaign): void {
  localStorage.setItem(CAMPAIGN_BACKUP_KEY, JSON.stringify({ savedAt: Date.now(), campaign }));
}

export function loadCampaignBackup(): CampaignBackup | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CAMPAIGN_BACKUP_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<CampaignBackup>;
    return typeof candidate.savedAt === "number" && candidate.campaign && typeof candidate.campaign === "object"
      ? candidate as CampaignBackup
      : null;
  } catch {
    return null;
  }
}

function isSavedWorldBlueprint(value: unknown): value is SavedWorldBlueprint {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavedWorldBlueprint>;
  return typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && typeof candidate.savedAt === "number"
    && Boolean(candidate.blueprint && typeof candidate.blueprint === "object");
}

function isWorldCreationBrief(value: unknown): value is WorldCreationBrief {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorldCreationBrief>;
  return typeof candidate.concept === "string"
    && typeof candidate.genre === "string"
    && typeof candidate.tone === "string"
    && typeof candidate.themes === "string"
    && typeof candidate.scope === "string"
    && typeof candidate.playerRole === "string"
    && typeof candidate.desiredElements === "string"
    && typeof candidate.forbiddenElements === "string"
    && (candidate.complexity === "compact" || candidate.complexity === "standard" || candidate.complexity === "dense");
}

import {
  parseWorldBlueprint,
  type WorldBlueprint,
  type WorldCreationBrief,
} from "../features/world/worldBlueprint";
import {
  cloneCampaignStartSnapshot,
  normalizeCampaignStartSnapshot,
  type CampaignStartSnapshot,
} from "../features/campaign/campaignStart";

const WORLD_LIBRARY_KEY = "le-conteur:world-blueprints:v1";
const WORLD_BRIEF_KEY = "le-conteur:world-creation-brief:v1";
const CAMPAIGN_BACKUP_KEY = "le-conteur:last-campaign-backup:v2";

export interface SavedWorldBlueprint {
  id: string;
  name: string;
  savedAt: number;
  blueprint: WorldBlueprint;
  brief?: WorldCreationBrief;
}

export interface CampaignBackup {
  savedAt: number;
  snapshot: CampaignStartSnapshot;
}

export function listWorldBlueprints(): SavedWorldBlueprint[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(WORLD_LIBRARY_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isSavedWorldBlueprint)
      .flatMap((saved) => {
        const migrated = parseWorldBlueprint(JSON.stringify(saved.blueprint));
        return migrated.blueprint ? [{ ...saved, blueprint: migrated.blueprint }] : [];
      })
      .sort((left, right) => right.savedAt - left.savedAt)
      .slice(0, 20);
  } catch {
    return [];
  }
}

export function saveWorldBlueprint(
  blueprint: WorldBlueprint,
  brief?: WorldCreationBrief,
): SavedWorldBlueprint {
  const current = listWorldBlueprints();
  const existing = current.find((item) => item.name === blueprint.campaign.name);
  const saved: SavedWorldBlueprint = {
    id: existing?.id ?? `world-${crypto.randomUUID()}`,
    name: blueprint.campaign.name,
    savedAt: Date.now(),
    blueprint,
    ...(brief ? { brief } : existing?.brief ? { brief: existing.brief } : {}),
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
    if (isWorldCreationBrief(parsed)) return parsed;
    if (!parsed || typeof parsed !== "object") return fallback;
    const candidate = parsed as Partial<WorldCreationBrief>;
    return {
      ...fallback,
      ...(typeof candidate.concept === "string" ? { concept: candidate.concept } : {}),
      ...(typeof candidate.genre === "string" ? { genre: candidate.genre } : {}),
      ...(typeof candidate.tone === "string" ? { tone: candidate.tone } : {}),
      ...(typeof candidate.themes === "string" ? { themes: candidate.themes } : {}),
      ...(typeof candidate.scope === "string" ? { scope: candidate.scope } : {}),
      ...(typeof candidate.playerRole === "string" ? { playerRole: candidate.playerRole } : {}),
      ...(typeof candidate.desiredElements === "string" ? { desiredElements: candidate.desiredElements } : {}),
      ...(typeof candidate.forbiddenElements === "string" ? { forbiddenElements: candidate.forbiddenElements } : {}),
      ...(candidate.complexity === "compact" || candidate.complexity === "standard" || candidate.complexity === "dense"
        ? { complexity: candidate.complexity }
        : {}),
    };
  } catch {
    return fallback;
  }
}

export function saveWorldCreationBrief(brief: WorldCreationBrief): void {
  localStorage.setItem(WORLD_BRIEF_KEY, JSON.stringify(brief));
}

export function saveCampaignBackup(snapshot: CampaignStartSnapshot): void {
  localStorage.setItem(
    CAMPAIGN_BACKUP_KEY,
    JSON.stringify({ savedAt: Date.now(), snapshot: cloneCampaignStartSnapshot(snapshot) }),
  );
}

export function loadCampaignBackup(): CampaignBackup | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CAMPAIGN_BACKUP_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<CampaignBackup>;
    const snapshot = normalizeCampaignStartSnapshot(candidate.snapshot);
    return typeof candidate.savedAt === "number" && snapshot
      ? { savedAt: candidate.savedAt, snapshot }
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
    && typeof candidate.startingParty === "string"
    && typeof candidate.startingEquipment === "string"
    && typeof candidate.desiredElements === "string"
    && typeof candidate.forbiddenElements === "string"
    && (candidate.complexity === "compact" || candidate.complexity === "standard" || candidate.complexity === "dense");
}

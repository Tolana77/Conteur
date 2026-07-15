import type {
  Campaign,
  NarrativeAlertLevel,
  NarrativeSceneEvent,
  NarrativeScenePatch,
  NarrativeSceneState,
} from "../../app/types";

export function createInitialNarrativeScene(
  campaign: Campaign,
  openingScene = campaign.world.openingScene ?? "",
): NarrativeSceneState {
  const location = findMentionedLocation(campaign, openingScene);
  const presentEntityIds = [
    ...campaign.world.entities.npcs,
    ...campaign.world.entities.items,
  ]
    .filter((entity) => isEntityMentioned(entity.name, openingScene))
    .map((entity) => entity.id);

  return {
    id: `scene-${campaign.id}`,
    revision: 0,
    turn: 0,
    elapsedMinutes: 0,
    locationId: location?.id ?? null,
    locationLabel: location?.name ?? campaign.world.name ?? campaign.name,
    playerPosition: "dans la scène d’ouverture",
    presentEntityIds,
    socialTension: 0,
    alertLevel: 0,
    activeEvents: [],
    recentConsequences: [],
    lastPlayerAction: "",
    lastNarratedBeat: openingScene,
  };
}

export function normalizeNarrativeScene(
  value: NarrativeSceneState | undefined,
  campaign: Campaign,
): NarrativeSceneState {
  const fallback = createInitialNarrativeScene(campaign);
  if (!value || typeof value !== "object") return fallback;

  return {
    ...fallback,
    ...value,
    revision: nonNegativeInteger(value.revision, fallback.revision),
    turn: nonNegativeInteger(value.turn, fallback.turn),
    elapsedMinutes: nonNegativeNumber(value.elapsedMinutes, fallback.elapsedMinutes),
    locationId: typeof value.locationId === "string" || value.locationId === null
      ? value.locationId
      : fallback.locationId,
    presentEntityIds: uniqueStrings(value.presentEntityIds).slice(0, 24),
    socialTension: clampNumber(value.socialTension, 0, 5, 0),
    alertLevel: clampAlertLevel(value.alertLevel),
    activeEvents: normalizeEvents(value.activeEvents).slice(0, 12),
    recentConsequences: uniqueStrings(value.recentConsequences).slice(-8),
    lastPlayerAction: typeof value.lastPlayerAction === "string" ? value.lastPlayerAction : "",
    lastNarratedBeat: typeof value.lastNarratedBeat === "string" ? value.lastNarratedBeat : "",
  };
}

export function advanceNarrativeScene(
  scene: NarrativeSceneState,
  playerAction: string,
): NarrativeSceneState {
  const waiting = /\b(attends?|patient|reste|ne fais rien|laisse venir|ecoute)\b/iu.test(playerAction);
  return {
    ...scene,
    revision: scene.revision + 1,
    turn: scene.turn + 1,
    elapsedMinutes: scene.elapsedMinutes + (waiting ? 5 : 1),
    lastPlayerAction: playerAction.trim().slice(0, 500),
    activeEvents: scene.activeEvents.map((event) => ({
      ...event,
      turnsRemaining: Math.max(0, event.turnsRemaining - 1),
      urgency: event.turnsRemaining <= 1 ? "immediate" : event.urgency,
    })),
  };
}

export function applyNarrativeScenePatch(
  scene: NarrativeSceneState,
  patch: NarrativeScenePatch,
  campaign: Campaign,
): NarrativeSceneState {
  const knownLocationIds = new Set(campaign.world.entities.locations.map((location) => location.id));
  const knownEntityIds = new Set([
    ...campaign.world.entities.npcs.map((entity) => entity.id),
    ...campaign.world.entities.items.map((entity) => entity.id),
    ...campaign.characters.map((character) => character.id),
  ]);
  const nextEvents = new Map(scene.activeEvents.map((event) => [event.id, event]));

  normalizeEvents(patch.upsertEvents).forEach((event) => nextEvents.set(event.id, event));
  uniqueStrings(patch.resolveEventIds).forEach((id) => nextEvents.delete(id));

  const requestedLocationId = patch.locationId;
  const locationId = requestedLocationId === null ||
    (typeof requestedLocationId === "string" && knownLocationIds.has(requestedLocationId))
    ? requestedLocationId
    : scene.locationId;

  return {
    ...scene,
    revision: scene.revision + 1,
    locationId,
    locationLabel: cleanText(patch.locationLabel, scene.locationLabel, 120),
    playerPosition: cleanText(patch.playerPosition, scene.playerPosition, 180),
    presentEntityIds: Array.isArray(patch.presentEntityIds)
      ? uniqueStrings(patch.presentEntityIds).filter((id) => knownEntityIds.has(id)).slice(0, 24)
      : scene.presentEntityIds,
    elapsedMinutes: scene.elapsedMinutes + clampNumber(patch.elapsedMinutes, 0, 1_440, 0),
    socialTension: clampNumber(scene.socialTension + Number(patch.socialTensionDelta ?? 0), 0, 5, scene.socialTension),
    alertLevel: patch.alertLevel === undefined ? scene.alertLevel : clampAlertLevel(patch.alertLevel),
    activeEvents: [...nextEvents.values()].slice(0, 12),
    recentConsequences: [
      ...scene.recentConsequences,
      ...uniqueStrings(patch.consequences).map((consequence) => consequence.slice(0, 240)),
    ].slice(-8),
  };
}

export function recordNarratedBeat(scene: NarrativeSceneState, narration: string): NarrativeSceneState {
  return {
    ...scene,
    revision: scene.revision + 1,
    lastNarratedBeat: narration.trim().slice(0, 700),
  };
}

function findMentionedLocation(campaign: Campaign, text: string) {
  const normalizedText = normalize(text);
  return campaign.world.entities.locations.find((location) => {
    const name = normalize(location.name);
    return name.length >= 4 && normalizedText.includes(name);
  });
}

function isEntityMentioned(name: string, text: string): boolean {
  const normalizedText = normalize(text);
  const normalizedName = normalize(name);
  if (normalizedName.length >= 4 && normalizedText.includes(normalizedName)) return true;
  return normalizedName.split(/\s+/u).some((part) => part.length >= 5 && normalizedText.includes(part));
}

function normalizeEvents(value: unknown): NarrativeSceneEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const event = candidate as Partial<NarrativeSceneEvent>;
    if (typeof event.id !== "string" || !event.id.trim() || typeof event.description !== "string") return [];
    return [{
      id: event.id.trim().slice(0, 80),
      description: event.description.trim().slice(0, 240),
      stage: cleanText(event.stage, "en cours", 100),
      turnsRemaining: nonNegativeInteger(event.turnsRemaining, 1),
      urgency: event.urgency === "background" || event.urgency === "immediate" ? event.urgency : "rising",
      relatedEntityIds: uniqueStrings(event.relatedEntityIds).slice(0, 8),
    }];
  });
}

function cleanText(value: unknown, fallback: string, maximumLength: number): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximumLength) : fallback;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()))];
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function clampAlertLevel(value: unknown): NarrativeAlertLevel {
  return Math.min(4, Math.max(0, Math.round(Number(value) || 0))) as NarrativeAlertLevel;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/gu, "");
}

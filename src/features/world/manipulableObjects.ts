import type { ItemInstance, ItemTemplate } from "../../app/types";
import type { GameState } from "../../store/useGameStore";

export type ObjectAffordance =
  | "inspect"
  | "pickUp"
  | "takeFromHolder"
  | "open"
  | "use"
  | "consume"
  | "attack";

export interface ManipulableObjectContext {
  id: string;
  source: "itemInstance" | "worldEntity";
  templateId?: string;
  name: string;
  description: string;
  quantity: number;
  visibility: "visible" | "hidden";
  holderId?: string;
  holderName?: string;
  locationId?: string;
  affordances: ObjectAffordance[];
  transferable: boolean;
}

const ACQUISITION_PATTERN = /\b(arrache|derobe|detrousse|fouille les poches|prend|prends|ramasse|recupere|s empare|subtilise|vole)\b/u;

/** Une acquisition potentielle ne signifie jamais que l'objet est obtenu. Elle
 * sert seulement à sélectionner le contexte et les spécialistes nécessaires. */
export function isObjectAcquisitionIntent(input: string): boolean {
  return ACQUISITION_PATTERN.test(normalize(input));
}

/** Construit la seule vue compacte des objets actuellement manipulables. Les
 * objets cachés restent signalés comme tels : un agent peut arbitrer leur
 * découverte, mais le Narrateur ne doit pas les révéler spontanément. */
export function createManipulableObjectContext(
  state: GameState,
  input: string,
  maximum = 8,
): ManipulableObjectContext[] {
  const normalizedInput = normalize(input);
  const presentIds = new Set(state.narrativeScene.presentEntityIds);
  const currentLocationId = state.narrativeScene.locationId;
  const entities = [
    ...state.campaign.world.entities.npcs,
    ...state.campaign.world.entities.locations,
    ...state.campaign.world.entities.items,
  ];
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const templateById = new Map(state.itemTemplates.map((template) => [template.id, template]));

  const instanceObjects = state.itemInstances
    .filter((instance) => isInstanceInScene(instance, presentIds, currentLocationId))
    .filter((instance) => instance.data.manipulable !== false)
    .map((instance) => createInstanceContext(instance, templateById.get(instance.templateId), entityById, currentLocationId));

  const representedNames = new Set(instanceObjects.map((object) => normalize(object.name)));
  const entityObjects = state.campaign.world.entities.items
    .filter((entity) => isEntityItemInScene(entity, presentIds, currentLocationId))
    .filter((entity) => !representedNames.has(normalize(entity.name)))
    .map((entity): ManipulableObjectContext => {
      const holder = entity.details?.ownerId ? entityById.get(entity.details.ownerId) : undefined;
      return {
        id: entity.id,
        source: "worldEntity",
        name: entity.name,
        description: entity.description,
        quantity: 1,
        visibility: entity.details?.tags?.includes("hidden") ? "hidden" : "visible",
        ...(holder ? { holderId: holder.id, holderName: holder.name } : {}),
        ...(currentLocationId ? { locationId: currentLocationId } : {}),
        affordances: holder ? ["inspect", "takeFromHolder"] : ["inspect", "pickUp"],
        transferable: false,
      };
    });

  return [...instanceObjects, ...entityObjects]
    .map((object) => ({ object, score: scoreObject(object, normalizedInput) }))
    .sort((left, right) => right.score - left.score || left.object.name.localeCompare(right.object.name, "fr"))
    .slice(0, maximum)
    .map(({ object }) => object);
}

function isInstanceInScene(
  instance: ItemInstance,
  presentIds: Set<string>,
  currentLocationId: string | null,
): boolean {
  if (instance.location.type !== "world" || instance.quantity <= 0) return false;
  const parent = instance.location.parent;
  return parent === null || parent === currentLocationId || (parent !== null && presentIds.has(parent));
}

function isEntityItemInScene(
  entity: GameState["campaign"]["world"]["entities"]["items"][number],
  presentIds: Set<string>,
  currentLocationId: string | null,
): boolean {
  if (entity.details?.tags?.includes("acquired")) return false;
  if (presentIds.has(entity.id)) return true;
  if (entity.details?.ownerId && presentIds.has(entity.details.ownerId)) return true;
  const connections = entity.details?.connections ?? [];
  return Boolean(currentLocationId && connections.includes(currentLocationId)) ||
    connections.some((id) => presentIds.has(id));
}

function createInstanceContext(
  instance: ItemInstance,
  template: ItemTemplate | undefined,
  entityById: Map<string, { id: string; name: string; type: string }>,
  currentLocationId: string | null,
): ManipulableObjectContext {
  const parentEntity = instance.location.parent ? entityById.get(instance.location.parent) : undefined;
  const holder = parentEntity?.type === "npc" ? parentEntity : undefined;
  const types = new Set([template?.type ?? "", ...(template?.types ?? [])].map(normalize));
  const affordances: ObjectAffordance[] = ["inspect", holder ? "takeFromHolder" : "pickUp"];
  if (types.has("container")) affordances.push("open");
  if (types.has("consumable")) affordances.push("consume");
  if (types.has("weapon")) affordances.push("attack");
  if (types.has("tool") || types.has("key") || types.has("magic")) affordances.push("use");

  return {
    id: instance.id,
    source: "itemInstance",
    templateId: instance.templateId,
    name: String(instance.overrides.name ?? template?.name ?? instance.id),
    description: String(instance.overrides.description ?? template?.description ?? "Objet sans description établie."),
    quantity: instance.quantity,
    visibility: instance.data.hidden === true && instance.data.revealed !== true ? "hidden" : "visible",
    ...(holder ? { holderId: holder.id, holderName: holder.name } : {}),
    ...(!holder && currentLocationId ? { locationId: currentLocationId } : {}),
    affordances: [...new Set(affordances)],
    transferable: true,
  };
}

function scoreObject(object: ManipulableObjectContext, input: string): number {
  const searchable = normalize(`${object.name} ${object.description} ${object.holderName ?? ""}`);
  const words = input.split(/\s+/u).filter((word) => word.length >= 4);
  let score = words.reduce((total, word) => total + (searchable.includes(word) ? 4 : 0), 0);
  if (input.includes(normalize(object.name))) score += 20;
  if (isObjectAcquisitionIntent(input) && object.holderId) score += 6;
  if (object.visibility === "visible") score += 1;
  return score;
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[’']/gu, " ")
    .replace(/[^a-z0-9\s-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

import type { GameState } from "../../store/useGameStore";
import type { ItemInstance, ItemTemplate } from "../../app/types";
import type { AiDirectorCommand, AiResolutionDraftPatch } from "./types";

export interface AutomaticLocalResolution {
  handled: boolean;
  handlerId?: string;
  commands: AiDirectorCommand[];
  draftPatch?: AiResolutionDraftPatch;
}

interface AuthoritativeRequestHandler {
  id: string;
  matches: (text: string, state: GameState) => boolean;
  resolve: (input: string, state: GameState) => AutomaticLocalResolution;
}

const authoritativeHandlers: AuthoritativeRequestHandler[] = [
  {
    id: "inventory.read",
    matches: (text) => isInventoryQuery(text),
    resolve: (input, state) => resolveInventoryQuery(state, normalize(input)),
  },
  {
    id: "inventory.pickup",
    matches: (text) => isPickupRequest(text),
    resolve: resolvePickupRequest,
  },
  {
    id: "inventory.rejectUncommittedCreation",
    matches: (text, state) => isUnsupportedConjuringRequest(text) && !hasStructuredAction(state),
    resolve: () => ({
      handled: true,
      commands: [],
      draftPatch: {
        facts: [{
          source: "localEngine",
          kind: "authoritativeState",
          content: "Aucun objet n'a été créé : aucune capacité ni commande moteur validée ne permet cette apparition.",
          visibility: "playerVisible",
        }],
        warnings: ["Une intention de création d'objet ne modifie jamais l'inventaire sans commande moteur validée."],
      },
    }),
  },
];

/**
 * Les lectures d'état et transferts évidents sont résolus sans modèle :
 * l'IA formule le résultat, mais n'est jamais la source de vérité.
 */
export function resolveAutomaticLocalRequest(
  playerInput: string,
  state: GameState,
): AutomaticLocalResolution {
  const text = normalize(playerInput);

  for (const handler of authoritativeHandlers) {
    if (!handler.matches(text, state)) continue;
    const resolution = handler.resolve(playerInput, state);
    if (resolution.handled) return { ...resolution, handlerId: handler.id };
  }

  return { handled: false, commands: [] };
}

function resolveInventoryQuery(state: GameState, text: string): AutomaticLocalResolution {
  const inventoryOnly = /\b(sac|besace)\b/u.test(text);
  const templates = new Map(state.itemTemplates.map((template) => [template.id, template]));
  const items = state.itemInstances
    .filter((item) => item.location.parent === state.selectedCharacterId)
    .filter((item) => item.location.type === "inventory" || (!inventoryOnly && item.location.type === "equipped"))
    .sort((left, right) => Number(left.data.inventoryOrder ?? 0) - Number(right.data.inventoryOrder ?? 0));
  const contents = items.map((item) => formatInventoryItem(item, templates.get(item.templateId)));
  const label = inventoryOnly ? "Contenu vérifié du sac" : "Inventaire vérifié";

  return {
    handled: true,
    commands: [],
    draftPatch: {
      facts: [{
        source: "localEngine",
        kind: "inventorySnapshot",
        content: `${label} : ${contents.length ? contents.join(", ") : "vide"}. Cette liste est exhaustive.`,
        visibility: "playerVisible",
        relatedIds: items.map((item) => item.id),
      }],
    },
  };
}

function resolvePickupRequest(playerInput: string, state: GameState): AutomaticLocalResolution {
  const availableItems = state.itemInstances.filter((item) => item.location.type === "world");
  const ranked = availableItems
    .map((item) => ({ item, score: getPickupScore(playerInput, item, state.itemTemplates) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
  const selected = ranked[0]?.item;

  if (!selected) {
    if (!/\b(ramasse|ramasser|recupere|recuperer|au sol|par terre)\b/u.test(normalize(playerInput))) {
      return { handled: false, commands: [] };
    }

    return {
      handled: true,
      commands: [],
      draftPatch: {
        facts: [{
          source: "localEngine",
          kind: "authoritativeState",
          content: "Aucun objet correspondant et déjà présent dans la scène ne peut être ramassé. Aucun objet n'a été créé ni ajouté au sac.",
          visibility: "playerVisible",
        }],
      },
    };
  }

  if (ranked[1] && ranked[1].score === ranked[0]?.score) {
    const names = ranked.slice(0, 3).map(({ item }) => {
      const template = state.itemTemplates.find((candidate) => candidate.id === item.templateId);
      return getItemName(item, template);
    });

    return {
      handled: true,
      commands: [],
      draftPatch: {
        questions: [`Plusieurs objets correspondent (${names.join(", ")}). Le joueur doit préciser lequel il ramasse.`],
      },
    };
  }

  const template = state.itemTemplates.find((candidate) => candidate.id === selected.templateId);
  const name = getItemName(selected, template);

  return {
    handled: true,
    commands: [{ type: "pickupItem", characterId: state.selectedCharacterId, itemId: selected.id }],
    draftPatch: {
      facts: [{
        source: "localEngine",
        kind: "pickupCandidate",
        content: `${name} existe dans la scène sous l'id ${selected.id} et peut être ramassé.`,
        visibility: "playerVisible",
        relatedIds: [selected.id],
      }],
    },
  };
}

function isInventoryQuery(text: string): boolean {
  return /\b(sac|besace|inventaire)\b/u.test(text)
    && /\b(quoi|contenu|contient|liste|possede|dedans|ai|voir|montre|regarde)\b/u.test(text);
}

function isPickupRequest(text: string): boolean {
  return /\b(ramasse|ramasser|prends|prendre|recupere|recuperer)\b/u.test(text);
}

function isUnsupportedConjuringRequest(text: string): boolean {
  return /\b(fais|fait|veux|voudrais|tente|essaie|peux)\b.{0,35}\b(apparaitre|invoquer|invoque|creer|cree|materialiser|materialise)\b/u.test(text)
    || /\b(j invoque|je cree|je materialise|je fais apparaitre)\b/u.test(text);
}

function hasStructuredAction(state: GameState): boolean {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (message?.sender === "player") return Boolean(message.actions?.length);
  }
  return false;
}

function getPickupScore(input: string, item: ItemInstance, templates: ItemTemplate[]): number {
  const template = templates.find((candidate) => candidate.id === item.templateId);
  const normalizedInput = normalize(input);
  const name = normalize(getItemName(item, template));
  let score = normalizedInput.includes(name) ? 20 : 0;

  for (const term of [template?.type, ...(template?.types ?? []), ...(template?.tags ?? []), ...(template?.aliases ?? [])]) {
    if (term && normalizedInput.includes(normalize(term))) score += 2;
  }
  return score;
}

function formatInventoryItem(item: ItemInstance, template?: ItemTemplate): string {
  const quantity = item.quantity > 1 ? ` x${item.quantity}` : "";
  return `${getItemName(item, template)}${quantity}`;
}

function getItemName(item: ItemInstance, template?: ItemTemplate): string {
  return String(item.overrides.name ?? template?.name ?? item.id);
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ");
}

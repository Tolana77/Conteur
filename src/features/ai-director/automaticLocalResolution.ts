import type { GameState } from "../../store/useGameStore";
import type { ItemInstance, ItemTemplate } from "../../app/types";
import type { AiDirectorCommand, AiResolutionDraftPatch } from "./types";

export interface AutomaticLocalResolution {
  handled: boolean;
  continueToAgents?: boolean;
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

  const supportingPatches = [
    resolveMissingInventoryClaim(playerInput, state),
    resolveSocialCoherenceConstraint(playerInput, state),
    resolveWaitingContinuityConstraint(playerInput, state),
  ].filter((patch): patch is AiResolutionDraftPatch => Boolean(patch));

  if (supportingPatches.length > 0) {
    return {
      handled: true,
      continueToAgents: true,
      handlerId: "scene.preconditions",
      commands: [],
      draftPatch: mergeDraftPatches(supportingPatches),
    };
  }

  return { handled: false, commands: [] };
}

const ITEM_RESOURCE_GROUPS = [
  { label: "couteau", terms: ["couteau", "dague", "lame"] },
  { label: "épée", terms: ["epee", "sabre", "rapiere", "glaive"] },
  { label: "arc", terms: ["arc", "arbalete"] },
  { label: "bouclier", terms: ["bouclier", "ecu"] },
  { label: "corde", terms: ["corde", "grappin"] },
  { label: "torche", terms: ["torche", "lanterne"] },
  { label: "clé", terms: ["cle", "passe-partout"] },
  { label: "potion", terms: ["potion", "fiole", "elixir"] },
] as const;

function resolveMissingInventoryClaim(playerInput: string, state: GameState): AiResolutionDraftPatch | undefined {
  const text = normalize(playerInput);
  const claimsPossession = /\b(avec|utilise|brandis|sors|degaine|tiens|manie|me sers|bois|mange|porte|enfile|allume)\b/u.test(text);
  const attemptsAcquisition = /\b(vole|derobe|subtilise|arrache|ramasse|recupere)\b/u.test(text);
  if (!claimsPossession || attemptsAcquisition) return undefined;

  const templates = new Map(state.itemTemplates.map((template) => [template.id, template]));
  const ownedItems = state.itemInstances
    .filter((item) => item.location.parent === state.selectedCharacterId && item.quantity > 0)
    .map((item) => {
      const template = templates.get(item.templateId);
      const name = String(item.overrides.name ?? template?.name ?? item.id);
      return { name, searchable: normalize([
        item.overrides.name,
        template?.name,
        ...(template?.aliases ?? []),
        ...(template?.types ?? []),
        ...(template?.tags ?? []),
      ].filter(Boolean).join(" ")) };
    });
  const missingGroup = ITEM_RESOURCE_GROUPS.find((group) =>
    group.terms.some((term) => text.includes(term)) &&
    !ownedItems.some((item) => group.terms.some((term) => item.searchable.includes(term))),
  );
  if (!missingGroup) {
    const names = ownedItems.slice(0, 30).map((item) => item.name);
    return {
      facts: [{
        source: "localEngine",
        kind: "inventoryAuthority",
        content: `Inventaire au début de l'action (liste exhaustive) : ${names.length ? names.join(", ") : "vide"}. Aucun objet absent de cette liste ne peut apparaître, être tenu ou être utilisé du seul fait que le joueur le mentionne.`,
        visibility: "gmOnly",
      }],
    };
  }

  return {
    facts: [{
      source: "localEngine",
      kind: "missingResource",
      content: `Inventaire vérifié : le personnage ne possède aucun objet correspondant à « ${missingGroup.label} ». Cet objet ne peut pas apparaître ni être utilisé dans la scène.`,
      visibility: "playerVisible",
    }],
    warnings: [`Ressource absente bloquée avant narration : ${missingGroup.label}.`],
  };
}

function resolveSocialCoherenceConstraint(playerInput: string, state: GameState): AiResolutionDraftPatch | undefined {
  const text = normalize(playerInput);
  const severe = /\b(vole|derobe|subtilise|agresse|frappe|attaque|poignarde|tue|empoisonne|incendie|menace de mort)\b/u.test(text);
  const disruptive = /\b(crie|hurle|insulte|provoque|fait un scandale|comme un ivrogne|ivre|menace)\b/u.test(text);
  if (!severe && !disruptive) return undefined;

  const authorityContext = /\b(roi|reine|cour|palais|garde|temple|prison|tribunal|noble|officier)\b/u.test(
    `${text} ${normalize(state.narrativeScene.locationLabel)}`,
  );
  const witnessed = authorityContext || state.narrativeScene.presentEntityIds.length > 0;
  const level = severe ? "grave" : "perturbatrice";

  return {
    facts: [{
      source: "localEngine",
      kind: "socialCoherenceConstraint",
      content: `Cohérence sociale obligatoire : l'action est ${level}. Le spécialiste Monde doit établir qui la perçoit et produire une réaction immédiate proportionnée. Si elle est observable, les témoins, propriétaires ou autorités ne peuvent pas rester passifs sans raison explicite.`,
      visibility: "gmOnly",
    }],
    scenePatches: witnessed ? [{
      socialTensionDelta: severe ? 2 : 1,
      alertLevel: severe
        ? Math.max(2, state.narrativeScene.alertLevel) as 2 | 3 | 4
        : Math.max(1, state.narrativeScene.alertLevel) as 1 | 2 | 3 | 4,
    }] : [],
  };
}

function resolveWaitingContinuityConstraint(playerInput: string, state: GameState): AiResolutionDraftPatch | undefined {
  const text = normalize(playerInput);
  if (!/\b(attends?|patiente|reste|ne fais rien|laisse venir|ecoute encore)\b/u.test(text)) return undefined;
  if (!state.narrativeScene.lastNarratedBeat.trim()) return undefined;

  return {
    facts: [{
      source: "localEngine",
      kind: "continuityConstraint",
      content: `Le joueur laisse réellement passer du temps. La nouvelle scène doit être la conséquence causale de la dernière étape, jamais sa répétition. Dernière étape : ${state.narrativeScene.lastNarratedBeat.slice(0, 300)}`,
      visibility: "gmOnly",
    }],
  };
}

function mergeDraftPatches(patches: AiResolutionDraftPatch[]): AiResolutionDraftPatch {
  return {
    facts: patches.flatMap((patch) => patch.facts ?? []),
    narrationInputs: patches.flatMap((patch) => patch.narrationInputs ?? []),
    scenePatches: patches.flatMap((patch) => patch.scenePatches ?? []),
    warnings: patches.flatMap((patch) => patch.warnings ?? []),
    questions: patches.flatMap((patch) => patch.questions ?? []),
  };
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

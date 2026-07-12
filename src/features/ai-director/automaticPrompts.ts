import type { GameState } from "../../store/useGameStore";
import { getAgentCommandSchemaText } from "./commandPermissions";
import type { AutomaticDomainAgent } from "./automaticRouting";
import type { AiResolutionDraft } from "./types";

export interface NarrationPacket {
  facts: string[];
  results: Array<{ status: "success" | "error" | "info"; message: string }>;
  warnings: string[];
  questions: string[];
}

const AGENT_INSTRUCTIONS: Record<AutomaticDomainAgent, string> = {
  characterManager: "Résous uniquement l'impact sur la fiche, l'inventaire, les objets, les capacités, les charges ou les PV.",
  actionManager: "Résous uniquement les jets, tests, difficultés et oppositions. Pour un jet final exécutable, utilise la commande roll.",
  combatManager: "Résous uniquement tours, actions, cibles, portée, déplacement et conséquences tactiques à partir des ids fournis.",
  worldManager: "Fournis uniquement les faits de scène, de lieu ou de PNJ utiles. Ne transforme pas une simple ambiance en changement durable.",
};

export function buildAutomaticDomainPrompt(
  agentId: AutomaticDomainAgent,
  state: GameState,
  playerInput: string,
): string {
  return [
    `Rôle: ${agentId}. ${AGENT_INSTRUCTIONS[agentId]}`,
    "Réponds sans narration et sans demander d'autre agent.",
    "N'invente aucun id. Une commande absente vaut mieux qu'une commande incertaine.",
    "Les intentions structurées du chat portent alreadyExecuted=true : ne génère jamais de commande pour les rejouer; transmets seulement leur résultat utile au Narrateur.",
    `Commandes autorisées:\n${getAgentCommandSchemaText(agentId)}`,
    "Format JSON strict et compact:",
    '{"narration":"","commands":[],"agentRequests":[],"draftPatch":{"facts":[],"narrationInputs":[],"warnings":[],"questions":[]}}',
    `Action joueur: ${truncate(playerInput, 900)}`,
    `Intentions structurées: ${JSON.stringify(getLatestStructuredActions(state))}`,
    `Contexte: ${JSON.stringify(createDomainContext(agentId, state, playerInput))}`,
  ].join("\n");
}

export function buildAutomaticNarrationPrompt(
  state: GameState,
  playerInput: string,
  packet: NarrationPacket,
): string {
  const character = state.characters.find((candidate) => candidate.id === state.selectedCharacterId);
  return [
    "Tu es le Narrateur d'un jeu de rôle fantasy. Réponds en français, brièvement, avec une prose concrète et immersive.",
    "Raconte uniquement les faits et résultats du paquet. Ne crée ni jet, ni dégât, ni changement d'état supplémentaire.",
    "Toute modification du monde ou d'un inventaire n'existe que si elle apparaît dans Paquet.results avec status=success.",
    "Une demande sans succès moteur reste une intention ou un échec : ne raconte jamais qu'elle a réussi.",
    "Si un fait dit qu'une liste est exhaustive, restitue uniquement ses éléments et n'en invente aucun.",
    'Réponds uniquement par {"narration":"..."}.',
    `Joueur: ${JSON.stringify(character ? { name: character.name, classe: character.classe, niveau: character.niveau } : null)}`,
    `Style: ${truncate(state.campaign.style, 160)}`,
    `Cadre: ${JSON.stringify({ lore: truncate(state.campaign.world.lore, 280), facts: state.campaign.world.facts.slice(-2).map((fact) => truncate(fact, 160)) })}`,
    `Action: ${truncate(playerInput, 900)}`,
    `Paquet: ${JSON.stringify(limitPacket(packet))}`,
    `Échanges récents: ${JSON.stringify(state.messages.slice(-3).map((message) => ({ sender: message.sender, content: truncate(message.content, 220) })))}`,
  ].join("\n");
}

export function createNarrationPacket(
  draft: AiResolutionDraft,
  executionResults: Array<{ status: "success" | "error" | "info"; message: string }>,
): NarrationPacket {
  return {
    facts: [
      ...draft.facts
        .filter((fact) => fact.visibility !== "hidden" && fact.visibility !== "gmOnly")
        .map((fact) => truncate(fact.content, fact.kind === "inventorySnapshot" ? 900 : 240)),
      ...draft.narrationInputs
        .filter((input) => input.visibility !== "hidden" && input.visibility !== "gmOnly")
        .map((input) => truncate(input.content, 240)),
    ].slice(-6),
    results: executionResults.slice(-5).map((result) => ({
      status: result.status,
      message: truncate(result.message, 240),
    })),
    warnings: draft.warnings.slice(-3).map((warning) => truncate(warning, 180)),
    questions: draft.questions.slice(-3).map((question) => truncate(question, 180)),
  };
}

function createDomainContext(agentId: AutomaticDomainAgent, state: GameState, input: string) {
  if (agentId === "characterManager") return createCharacterContext(state, input);
  if (agentId === "combatManager") return createCombatContext(state);
  if (agentId === "actionManager") return createActionContext(state);
  return createWorldContext(state, input);
}

function getLatestStructuredActions(state: GameState) {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (message?.sender !== "player") continue;
    return (message.actions ?? []).slice(0, 2).map((action) => ({
      alreadyExecuted: true,
      kind: action.kind,
      targetId: action.targetId,
      label: action.label,
      command: action.command,
      target: action.target,
    }));
  }
  return [];
}

function createCharacterContext(state: GameState, input: string) {
  const character = state.characters.find((candidate) => candidate.id === state.selectedCharacterId);
  const templates = new Map(state.itemTemplates.map((template) => [template.id, template]));
  const inventory = state.itemInstances
    .filter((item) => item.location.parent === state.selectedCharacterId)
    .map((item) => {
      const template = templates.get(item.templateId);
      return {
        id: item.id,
        name: String(item.overrides.name ?? template?.name ?? item.id),
        quantity: item.quantity,
        location: item.location.type,
        types: template?.types ?? [],
        effects: template?.effects.slice(0, 3) ?? [],
      };
    });
  const abilities = state.abilityInstances
    .filter((ability) => ability.ownerId === state.selectedCharacterId)
    .map((ability) => {
      const template = state.abilityTemplates.find((candidate) => candidate.id === ability.templateId);
      return { id: ability.id, name: template?.name ?? ability.id, charges: ability.current.charges ?? null };
    });

  return {
    character: character ? {
      id: character.id,
      name: character.name,
      niveau: character.niveau,
      pv: character.pv,
      maxPv: character.maxPv,
      stats: character.stats,
      derived: state.characterDerivedScores[character.id],
    } : null,
    inventory: rankByInput(inventory, input, (item) => `${item.name} ${item.types.join(" ")}`).slice(0, 10),
    abilities: rankByInput(abilities, input, (ability) => ability.name).slice(0, 6),
  };
}

function createActionContext(state: GameState) {
  const character = state.characters.find((candidate) => candidate.id === state.selectedCharacterId);
  return character ? {
    id: character.id,
    name: character.name,
    niveau: character.niveau,
    stats: character.stats,
    derived: state.characterDerivedScores[character.id],
  } : null;
}

function createCombatContext(state: GameState) {
  const active = state.combat.combatants[state.combat.turnIndex];
  return {
    status: state.combat.status,
    round: state.combat.round,
    activeCombatantId: active?.id ?? null,
    combatants: state.combat.combatants.slice(0, 12).map((combatant) => ({
      id: combatant.id,
      name: combatant.side === "players" ? combatant.name : "Ennemi aperçu",
      side: combatant.side,
      position: combatant.position,
      state: combatant.hp <= 0 ? "hors de combat" : combatant.hp <= combatant.maxHp / 2 ? "blessé" : "stable",
      resources: combatant.resources,
    })),
    map: {
      width: state.combat.map.width,
      height: state.combat.map.height,
      obstacles: state.combat.map.obstacles.slice(0, 16),
      elements: state.combat.map.elements.slice(0, 10).map((element) => ({
        id: element.id,
        name: element.name,
        kind: element.kind,
        x: element.x,
        y: element.y,
        cells: element.cells?.slice(0, 12),
      })),
    },
  };
}

function createWorldContext(state: GameState, input: string) {
  const entities = [
    ...state.campaign.world.entities.npcs,
    ...state.campaign.world.entities.locations,
    ...state.campaign.world.entities.items,
  ];
  return {
    lore: truncate(state.campaign.world.lore, 500),
    facts: rankByInput(state.campaign.world.facts, input, (fact) => fact).slice(0, 5).map((fact) => truncate(fact, 220)),
    entities: rankByInput(entities, input, (entity) => `${entity.name} ${entity.description}`)
      .slice(0, 5)
      .map((entity) => ({ id: entity.id, name: entity.name, type: entity.type, description: truncate(entity.description, 220) })),
    history: state.campaign.history.slice(-3).map((entry) => truncate(entry, 180)),
  };
}

function rankByInput<T>(items: T[], input: string, searchable: (item: T) => string): T[] {
  const words = tokenize(input);
  return [...items].sort((left, right) => score(searchable(right), words) - score(searchable(left), words));
}

function score(value: string, words: string[]): number {
  const normalized = normalize(value);
  return words.reduce((total, word) => total + (normalized.includes(word) ? 1 : 0), 0);
}

function tokenize(value: string): string[] {
  return normalize(value).split(/\W+/u).filter((word) => word.length >= 4).slice(0, 12);
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function limitPacket(packet: NarrationPacket): NarrationPacket {
  return {
    facts: packet.facts.slice(-6),
    results: packet.results.slice(-5),
    warnings: packet.warnings.slice(-3),
    questions: packet.questions.slice(-3),
  };
}

function truncate(value: string, maximumLength: number): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength - 1)}…` : value;
}

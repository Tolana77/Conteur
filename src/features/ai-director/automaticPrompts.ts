import type { GameState } from "../../store/useGameStore";
import type { GameActionReceipt } from "../../app/types";
import { getAgentCommandSchemaText } from "./commandPermissions";
import type { AutomaticDomainAgent } from "./automaticRouting";
import type { AiResolutionDraft } from "./types";

export interface NarrationPacket {
  facts: string[];
  results: Array<{ status: "success" | "error" | "info"; message: string }>;
  warnings: string[];
  questions: string[];
  actionReceipts: GameActionReceipt[];
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
    "Toute modification du monde ou d'un inventaire n'existe que si elle apparaît dans Paquet.results avec status=success ou dans Paquet.actionReceipts.",
    "Paquet.actionReceipts décrit les actions déjà exécutées : la source existait avant l'action, même si sa quantité vaut maintenant zéro.",
    "Pour les PV, quantités, charges et jets, recopie exclusivement les valeurs before/after/delta/result des reçus. Ne recalcule rien.",
    "Un jet de soin et les PV effectivement récupérés sont deux valeurs distinctes : le gain effectif est le delta de PV, notamment si la cible atteint son maximum.",
    "L'état de Joueur et Contexte est postérieur aux reçus et ne doit jamais servir à nier leur source.",
    "Une demande sans succès moteur reste une intention ou un échec : ne raconte jamais qu'elle a réussi.",
    "Si un fait dit qu'une liste est exhaustive, restitue uniquement ses éléments et n'en invente aucun.",
    'Réponds uniquement par {"narration":"..."}.',
    `Joueur: ${JSON.stringify(character ? { name: character.name, classe: character.classe, niveau: character.niveau } : null)}`,
    `Style: ${truncate(state.campaign.style, 160)}`,
    `Cadre: ${JSON.stringify({
      pitch: truncate(state.campaign.world.pitch ?? "", 180),
      tone: truncate(state.campaign.world.tone ?? state.campaign.style, 100),
      themes: state.campaign.world.themes?.slice(0, 3) ?? [],
      rules: state.campaign.world.rules?.slice(0, 3).map((rule) => truncate(rule, 120)) ?? [],
      lore: truncate(state.campaign.world.lore, 260),
      facts: state.campaign.world.facts.slice(-2).map((fact) => truncate(fact, 140)),
    })}`,
    `Action: ${truncate(playerInput, 900)}`,
    `Paquet: ${JSON.stringify(limitPacket(packet))}`,
    `Échanges récents: ${JSON.stringify(state.messages.slice(-3).map((message) => ({ sender: message.sender, content: truncate(message.content, 220) })))}`,
  ].join("\n");
}

export function createNarrationPacket(
  draft: AiResolutionDraft,
  executionResults: Array<{ status: "success" | "error" | "info"; message: string }>,
  actionReceipt?: GameActionReceipt,
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
    actionReceipts: actionReceipt ? [sanitizeActionReceipt(actionReceipt)] : [],
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
    name: state.campaign.world.name ?? state.campaign.name,
    pitch: truncate(state.campaign.world.pitch ?? "", 240),
    tone: truncate(state.campaign.world.tone ?? state.campaign.style, 120),
    themes: state.campaign.world.themes?.slice(0, 5) ?? [],
    rules: rankByInput(state.campaign.world.rules ?? [], input, (rule) => rule).slice(0, 4).map((rule) => truncate(rule, 160)),
    lore: truncate(state.campaign.world.lore, 420),
    facts: rankByInput(state.campaign.world.facts, input, (fact) => fact).slice(0, 5).map((fact) => truncate(fact, 220)),
    entities: rankByInput(entities, input, (entity) => `${entity.name} ${entity.description}`)
      .slice(0, 5)
      .map((entity) => ({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        description: truncate(entity.description, 180),
        role: truncate(entity.details?.role ?? "", 100),
        desire: truncate(entity.details?.desire ?? "", 100),
        connections: entity.details?.connections?.slice(0, 3) ?? [],
      })),
    factions: rankByInput(state.campaign.world.factions ?? [], input, (faction) => `${faction.name} ${faction.goal} ${faction.method}`)
      .slice(0, 3),
    conflicts: rankByInput(state.campaign.world.conflicts ?? [], input, (conflict) => `${conflict.title} ${conflict.description} ${conflict.stakes}`)
      .slice(0, 3),
    hooks: rankByInput(state.campaign.world.hooks ?? [], input, (hook) => `${hook.title} ${hook.premise} ${hook.urgency}`)
      .slice(0, 3),
    secrets: rankByInput(state.campaign.world.secrets ?? [], input, (secret) => `${secret.truth} ${secret.clues.join(" ")}`)
      .slice(0, 2),
    timeline: (state.campaign.world.timeline ?? []).slice(0, 3),
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
    actionReceipts: packet.actionReceipts.slice(-1),
  };
}

function sanitizeActionReceipt(receipt: GameActionReceipt): GameActionReceipt {
  return {
    ...receipt,
    actions: receipt.actions.slice(0, 2),
    changes: receipt.changes.slice(0, 12),
    rolls: receipt.rolls
      .filter((roll) => roll.visibility === "public" || roll.visibility === "summary")
      .slice(0, 6),
  };
}

function truncate(value: string, maximumLength: number): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength - 1)}…` : value;
}

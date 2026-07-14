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
  actionManager: "Arbitre une action improvisée. Si elle est triviale, transmets simplement son résultat narratif. Si son issue est incertaine et intéressante, produis UNE commande resolveGameAction complète; le moteur calculera le bonus et lancera le dé.",
  combatManager: "Résous uniquement tours, actions, cibles, portée, déplacement et conséquences tactiques à partir des ids fournis.",
  worldManager: "Arbitre l'exploration et les interactions avec le monde. Fournis détails sensoriels, réactions et pistes; si une découverte est incertaine, produis UNE commande resolveGameAction. Une vérité cachée reste cachée avant une résolution réussie.",
};

export function buildAutomaticDomainPrompt(
  agentId: AutomaticDomainAgent,
  state: GameState,
  playerInput: string,
): string {
  return [
    `Rôle: ${agentId}. ${AGENT_INSTRUCTIONS[agentId]}`,
    "Réponds sans narration et sans demander d'autre agent.",
    ...(agentId === "worldManager" ? [
      "Pour observer, chercher, examiner ou discuter, alimente draftPatch.facts et draftPatch.narrationInputs avec 1 à 3 éléments concrets : sensation, détail significatif, réaction, indice ou piste d'action.",
      "Ne réponds pas par une absence générique d'information. Si la résolution dépend réellement de la méthode, place une seule clarification utile dans draftPatch.questions après avoir fourni ce qui est perceptible sans test.",
      "Une récompense narrative peut être une piste, une confiance gagnée ou l'existence d'un objet à obtenir. Ne prétends jamais que l'objet est acquis sans commande moteur réussie.",
    ] : []),
    ...(agentId === "actionManager" || agentId === "worldManager" ? [
      "Liberté d'action: n'écarte jamais une tentative uniquement parce qu'elle n'est pas prévue. Une méthode extravagante mais préparée peut devenir legendary (DD 28, jusqu'à 35), avec coût et conséquences cohérents.",
      "Échelle: routine=pas de jet; plausible=DD10; difficult=DD15; extreme=DD22; legendary=DD28. Un DD explicite entre 5 et 35 peut affiner cette échelle.",
      "Utilise outcomes pour préannoncer des conséquences distinctes: critical, success, partial et failure. L'échec doit faire évoluer la situation, pas fermer la partie.",
      "Les outcomes peuvent révéler une piste, créer une opportunité ou décrire une réaction, mais ne doivent jamais ajouter directement un objet, des PV, une capacité ou une autre ressource au moteur.",
      "Si le joueur engage une composante consommable réellement présente dans context.inventory, déclare son id et sa quantité dans costs. N'invente jamais une composante absente du contexte.",
      "Ne demande une clarification que si méthode, cible ou ressource change réellement le test. Sinon, arbitre immédiatement.",
      "Une seule commande de test maximum par intention. N'utilise pas roll brut pour une action improvisée.",
    ] : []),
    "N'invente aucun id. Une commande absente vaut mieux qu'une commande incertaine.",
    "Toute commande à exécuter va dans commands à la racine. proposedCommands sert uniquement aux propositions non exécutables.",
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
  const activeNarrativeHook = state.campaign.world.hooks?.find((hook) => hook.id === state.narrativeMomentum.activeHookId)
    ?? rankByInput(state.campaign.world.hooks ?? [], playerInput, (hook) => `${hook.title} ${hook.premise} ${hook.urgency}`)[0];
  return [
    "Tu es le Conteur, un véritable meneur de jeu de rôle fantasy. Réponds en français avec une prose concrète, sensorielle et immersive, en un à trois courts paragraphes.",
    "Ne parle jamais comme un assistant, un validateur ou une interface. Ne mentionne ni moteur, ni paquet, ni commande, ni manque d'action concrète.",
    "Fais vivre la scène : montre ce que le personnage perçoit immédiatement, puis donne une conséquence, une réaction ou une piste avec laquelle le joueur peut interagir.",
    "Quand le joueur prend une initiative, récompense-la par une information utile, un indice subtil, une opportunité ou une réaction du monde si le paquet le permet. Un objet, un avantage mécanique ou un changement durable exige toutefois un succès explicitement validé.",
    "Si la méthode du joueur est indispensable pour résoudre l'action, ne bloque pas la scène : décris d'abord ce qui est déjà perceptible, puis pose UNE question précise et naturelle. Tu peux suggérer deux ou trois approches diégétiques sans imposer une liste de commandes.",
    "Si aucune découverte décisive n'est confirmée, décris un résultat limité mais intéressant et oriente vers une piste existante. N'écris jamais « vous ne trouvez aucune information concrète » ou « vous ne faites pas d'action concrète ».",
    "Une réponse purement narrative ou sociale ne nécessite pas forcément de question : laisse aussi les PNJ agir, hésiter, mentir, proposer ou demander quelque chose selon les faits disponibles.",
    "Le cadre peut contenir une accroche narrative. Utilise-la seulement si elle s'insère naturellement comme conséquence, rumeur, rencontre ou opportunité; ne force jamais le joueur à la suivre.",
    "La gravité narrative vaut none, subtle, clear ou consequence. subtle=indice discret; clear=accroche reconnaissable; consequence=un événement de l'intrigue croise logiquement la route du personnage. Même au niveau consequence, conserve au moins deux choix réels et n'annule jamais l'action libre du joueur.",
    "Raconte uniquement les faits et résultats du paquet. Ne crée ni jet, ni dégât, ni changement d'état supplémentaire.",
    "Toute modification du monde ou d'un inventaire n'existe que si elle apparaît dans Paquet.results avec status=success ou dans Paquet.actionReceipts.",
    "Dans Paquet.results, status=success confirme que le moteur a exécuté la résolution, pas que l'action du personnage a réussi. Pour un test, respecte impérativement le degré écrit après le DD: réussite critique, réussite, réussite partielle ou échec avec conséquence.",
    "Paquet.actionReceipts décrit les actions déjà exécutées : la source existait avant l'action, même si sa quantité vaut maintenant zéro.",
    "Pour les PV, quantités, charges et jets, recopie exclusivement les valeurs before/after/delta/result des reçus. Ne recalcule rien.",
    "Un jet de soin et les PV effectivement récupérés sont deux valeurs distinctes : le gain effectif est le delta de PV, notamment si la cible atteint son maximum.",
    "L'état de Joueur et Contexte est postérieur aux reçus et ne doit jamais servir à nier leur source.",
    "Une demande sans succès moteur reste une intention ou un échec : ne raconte jamais qu'elle a réussi.",
    "Si un fait dit qu'une liste est exhaustive, restitue uniquement ses éléments et n'en invente aucun.",
    "Les questions présentes dans Paquet.questions sont des besoins de clarification internes : reformule-les comme une question naturelle du Conteur, sans vocabulaire technique.",
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
      storyThread: activeNarrativeHook
        ? { title: activeNarrativeHook.title, premise: truncate(activeNarrativeHook.premise, 140) }
        : null,
      narrativeGravity: state.narrativeMomentum.guidance,
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
      message: truncate(result.message, 420),
    })),
    warnings: draft.warnings.slice(-3).map((warning) => truncate(warning, 180)),
    questions: draft.questions.slice(-3).map((question) => truncate(question, 180)),
    actionReceipts: actionReceipt ? [sanitizeActionReceipt(actionReceipt)] : [],
  };
}

function createDomainContext(agentId: AutomaticDomainAgent, state: GameState, input: string) {
  if (agentId === "characterManager") return createCharacterContext(state, input);
  if (agentId === "combatManager") return createCombatContext(state);
  if (agentId === "actionManager") return createActionContext(state, input);
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

function createActionContext(state: GameState, input: string) {
  const character = state.characters.find((candidate) => candidate.id === state.selectedCharacterId);
  const entities = [
    ...state.campaign.world.entities.npcs,
    ...state.campaign.world.entities.locations,
    ...state.campaign.world.entities.items,
  ];

  return {
    character: character ? {
      id: character.id,
      name: character.name,
      niveau: character.niveau,
      stats: character.stats,
      competences: character.competences.slice(0, 12),
      derived: state.characterDerivedScores[character.id],
    } : null,
    inventory: createRelevantInventory(state, input),
    scene: {
      facts: rankByInput(state.campaign.world.facts, input, (fact) => fact).slice(0, 3),
      entities: rankByInput(entities, input, (entity) => `${entity.name} ${entity.description}`)
        .slice(0, 3)
        .map((entity) => ({ id: entity.id, name: entity.name, type: entity.type, description: truncate(entity.description, 140) })),
      hook: rankByInput(state.campaign.world.hooks ?? [], input, (hook) => `${hook.title} ${hook.premise}`)
        .slice(0, 1)
        .map((hook) => ({ title: hook.title, premise: truncate(hook.premise, 120) })),
      recentConsequences: state.campaign.history.slice(-2).map((entry) => truncate(entry, 160)),
    },
  };
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
    actor: (() => {
      const character = state.characters.find((candidate) => candidate.id === state.selectedCharacterId);
      return character ? {
        id: character.id,
        name: character.name,
        niveau: character.niveau,
        competences: character.competences.slice(0, 10),
        derived: state.characterDerivedScores[character.id],
      } : null;
    })(),
    inventory: createRelevantInventory(state, input),
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

function createRelevantInventory(state: GameState, input: string) {
  const templates = new Map(state.itemTemplates.map((template) => [template.id, template]));
  const inventory = state.itemInstances
    .filter((item) => item.location.parent === state.selectedCharacterId)
    .map((item) => {
      const template = templates.get(item.templateId);
      return {
        id: item.id,
        name: String(item.overrides.name ?? template?.name ?? item.id),
        quantity: item.quantity,
        types: template?.types ?? [],
        tags: template?.tags ?? [],
      };
    });

  return rankByInput(inventory, input, (item) => `${item.name} ${item.types.join(" ")} ${item.tags.join(" ")}`).slice(0, 5);
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

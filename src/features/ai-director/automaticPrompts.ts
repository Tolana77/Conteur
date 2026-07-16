import type { GameState } from "../../store/useGameStore";
import type { GameActionReceipt } from "../../app/types";
import { getAgentCommandSchemaText } from "./commandPermissions";
import {
  assetContentSchemaText,
  contentCreationIdInstruction,
  effectOperationCatalog,
  enemyContentSchemaText,
  isContentTemplateActive,
} from "../content";
import type { AutomaticDomainAgent } from "./automaticRouting";
import type { AiResolutionDraft } from "./types";
import { ITEM_CREATION_POLICY_TEXT } from "../items/itemCreationPolicy";

export interface NarrationPacket {
  facts: string[];
  constraints: string[];
  results: Array<{ status: "success" | "error" | "info"; message: string }>;
  warnings: string[];
  questions: string[];
  actionReceipts: GameActionReceipt[];
}

const AGENT_INSTRUCTIONS: Record<AutomaticDomainAgent, string> = {
  characterManager: "Résous uniquement l'impact sur la fiche, l'inventaire, les objets, les capacités, les charges ou les PV. L'inventaire fourni est exhaustif : toute ressource absente est indisponible.",
  actionManager: "Arbitre une action improvisée. Une action ordinaire se résout sans jet. Une action incertaine aux conséquences intéressantes produit au maximum UNE commande resolveGameAction; le moteur préparera un jet que le joueur devra déclencher.",
  combatManager: "Résous uniquement tours, actions, cibles, portée, déplacement et conséquences tactiques à partir des ids fournis.",
  combatSetupManager: "Instancie et place les combattants nécessaires à une scène depuis des templates existants ou créés dans le dossier entrant. Ne conçois pas leurs règles.",
  tacticalTemplateManager: "Conçois uniquement des templates réutilisables d'ennemis et d'éléments tactiques. Réutilise les capacités existantes avant d'en demander de nouvelles.",
  assetTemplateManager: "Conçois des effets, capacités et objets réutilisables, puis crée l'instance demandée si son emplacement est établi. Réutilise et surcharge toujours un template existant quand cela suffit.",
  worldManager: "Arbitre l'exploration, la continuité de scène et les interactions avec le monde. Fournis détails sensoriels, réactions et pistes; si une découverte est incertaine, produis UNE commande resolveGameAction. Une vérité cachée reste cachée avant une résolution réussie.",
};

export function buildAutomaticDomainPrompt(
  agentId: AutomaticDomainAgent,
  state: GameState,
  playerInput: string,
  incomingDraft: AiResolutionDraft,
): string {
  return [
    `Rôle: ${agentId}. ${AGENT_INSTRUCTIONS[agentId]}`,
    "Réponds sans narration. Ne demande un autre spécialiste que si une donnée exécutable manque réellement; utilise agentRequests avec une raison et un input compacts. Le routeur local autorisera ou refusera la demande.",
    ...(agentId === "worldManager" ? [
      "Pour observer, chercher, examiner ou discuter, alimente draftPatch.facts et draftPatch.narrationInputs avec 1 à 3 éléments concrets : sensation, détail significatif, réaction, indice ou piste d'action.",
      "Ne réponds pas par une absence générique d'information. Si la résolution dépend réellement de la méthode, place une seule clarification utile dans draftPatch.questions après avoir fourni ce qui est perceptible sans test.",
      "Une récompense narrative peut être une piste, une confiance gagnée ou l'existence d'un objet à obtenir. Ne prétends jamais que l'objet est acquis sans commande moteur réussie.",
      "Continuité stricte : scene contient le lieu, la position, les présents et les événements actifs. Ne téléporte, n'ajoute ni ne retire rien sans l'indiquer dans draftPatch.scenePatch.",
      "Un événement avec turnsRemaining=0 doit progresser maintenant. Si le joueur attend, ne répète jamais l'étape précédente : fais arriver, passer, découvrir ou empirer l'événement, puis mets-le à jour ou résous-le.",
      "Réactions crédibles : évalue statut, normes du lieu, témoins, propriétaires et autorités. Une provocation publique déclenche au minimum attention, gêne ou mise en garde; un vol ou une violence observable déclenche une tentative d'intervention, sauf impossibilité explicitement établie.",
      "Toute menace différée annoncée au Narrateur doit aussi être inscrite dans scenePatch.upsertEvents avec un délai. Toute conséquence durable va dans scenePatch.consequences.",
      "Inscris aussi comme événement toute échéance, pression de PNJ ou occasion concrète qui peut progresser sans le joueur. N'en crée jamais pour une simple ambiance : chaque événement doit avoir une prochaine étape observable.",
      "scenePatch suit ce schéma compact : {locationId?,locationLabel?,playerPosition?,presentEntityIds?,elapsedMinutes?,socialTensionDelta?,alertLevel?,upsertEvents?:[{id,description,stage,turnsRemaining,urgency,relatedEntityIds}],resolveEventIds?:[],consequences?:[]}. presentEntityIds remplace la liste complète et ne contient que des ids connus.",
    ] : []),
    ...(agentId === "characterManager" ? [
      "Ne déduis jamais la possession d'un objet à partir du texte du joueur. Vérifie exclusivement context.inventory.items.",
      "Si le joueur décrit l'usage d'un objet absent, ajoute un fait missingResource visible; ne crée, ne donne et n'utilise aucun objet.",
    ] : []),
    ...(agentId === "assetTemplateManager" ? [
      "Chaîne fermée: crée d'abord les effets manquants, puis les capacités, puis l'objet, enfin son instance. Les commandes seront réordonnées par le moteur.",
      "Un effet est un assemblage d'opérations fermées, jamais un script. Référence ensuite son id dans effects: [{effectId,variables}].",
      "Pour une variante simple, utilise un templateId existant et les overrides de l'instance. Ne duplique pas un template pour un nom, une description, un poids ou un petit effet non statistique différent.",
      ITEM_CREATION_POLICY_TEXT,
      "Si tu crées une instance dans le sac, location={type:'inventory',parent:'selected'}; au sol, location={type:'world',parent:<locationId|null>}. N'accorde jamais gratuitement une ressource sans fait entrant qui l'autorise.",
      contentCreationIdInstruction,
      `Schémas de contenu: ${assetContentSchemaText}`,
    ] : []),
    ...(agentId === "tacticalTemplateManager" ? [
      "Un ennemi doit posséder au moins une attaque complète. Ses capacités sont référencées par abilityTemplateIds; demande assetTemplateManager uniquement si une capacité indispensable n'existe pas.",
      contentCreationIdInstruction,
      `Schéma ennemi: ${enemyContentSchemaText}`,
    ] : []),
    ...(agentId === "combatSetupManager" ? [
      "Utilise addEnemyToScene avec enemyTemplateId et enemy={id?,name?,side,position?,parent?}. N'invente pas un id de template absent du catalogue ou des commandes entrantes.",
      "Ne démarre le combat que si la scène et les participants sont prêts.",
    ] : []),
    ...(agentId === "actionManager" || agentId === "worldManager" ? [
      "Liberté d'action: n'écarte jamais une tentative uniquement parce qu'elle n'est pas prévue. Une méthode extravagante mais préparée peut devenir legendary (DD 28, jusqu'à 35), avec coût et conséquences cohérents.",
      "Aucun jet pour voir l'évidence, obtenir une information ordinaire, trouver un lieu commun ou agir sans risque ni conséquence intéressante.",
      "Si la méthode change la compétence ou la difficulté et qu'elle manque, pose UNE question dans draftPatch.questions et ne produis aucune commande de test.",
      "Compétences françaises canoniques seulement: Perception=SAG (remarquer), Investigation=INT (examiner/déduire), Survie=SAG (pistes/nature), Persuasion=CHA (coopération), Escamotage=DEX (subtiliser), Discrétion=DEX (rester invisible). Sprint n'est pas une compétence. La compétence impose sa caractéristique.",
      "Un test peut porter sur une caractéristique seule. Dans ce cas, fournis stat et omets skill : aucun bonus de maîtrise ne sera ajouté.",
      "Échelle: routine=pas de jet; plausible=DD10; difficult=DD15; extreme=DD22; legendary=DD28. Un DD explicite entre 5 et 35 peut affiner cette échelle.",
      "Utilise outcomes pour préannoncer des conséquences distinctes: critical, success, partial et failure. L'échec doit faire évoluer la situation, pas fermer la partie.",
      "Les outcomes peuvent révéler une piste, créer une opportunité ou décrire une réaction, mais ne doivent jamais ajouter directement un objet, des PV, une capacité ou une autre ressource au moteur.",
      "Si le joueur engage une composante consommable réellement présente dans context.inventory, déclare son id et sa quantité dans costs. N'invente jamais une composante absente du contexte.",
      "Ne demande une clarification que si méthode, cible ou ressource change réellement le test. Sinon, arbitre immédiatement.",
      "Une seule commande de test maximum par intention. N'utilise pas roll brut pour une action improvisée.",
    ] : []),
    ...(agentId === "assetTemplateManager" || agentId === "tacticalTemplateManager"
      ? []
      : ["N'invente aucun id. Une commande absente vaut mieux qu'une commande incertaine."]),
    "Toute commande à exécuter va dans commands à la racine. proposedCommands sert uniquement aux propositions non exécutables.",
    "Les intentions structurées du chat portent alreadyExecuted=true : ne génère jamais de commande pour les rejouer; transmets seulement leur résultat utile au Narrateur.",
    `Commandes autorisées:\n${getAgentCommandSchemaText(agentId)}`,
    "Format JSON strict et compact:",
    '{"narration":"","commands":[],"agentRequests":[],"draftPatch":{"facts":[],"narrationInputs":[],"scenePatch":{},"warnings":[],"questions":[]}}',
    `Action joueur: ${truncate(playerInput, 900)}`,
    `Intentions structurées: ${JSON.stringify(getLatestStructuredActions(state))}`,
    `Dossier entrant ciblé: ${JSON.stringify(createIncomingDraftContext(agentId, incomingDraft))}`,
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
    "Les PNJ réagissent selon leurs intérêts, leur peur, leur statut, les normes du lieu et ce qu'ils peuvent réellement percevoir. Une transgression observable appelle une conséquence sociale proportionnée; n'anesthésie jamais témoins ou gardes pour faciliter l'action du joueur.",
    "Respecte strictement Scène stable. N'ajoute aucun personnage présent, objet tenu, déplacement ou changement de lieu qui n'apparaisse pas dans la scène ou dans le paquet.",
    "Ne répète jamais lastNarratedBeat. Si le joueur attend ou ne fait rien, fais progresser l'événement actif le plus urgent; turnsRemaining=0 signifie que sa prochaine étape arrive maintenant.",
    "Le cadre peut contenir une accroche narrative. Utilise-la seulement si elle s'insère naturellement comme conséquence, rumeur, rencontre ou opportunité; ne force jamais le joueur à la suivre.",
    "La gravité narrative vaut none, subtle, clear ou consequence. subtle=indice discret; clear=accroche reconnaissable; consequence=un événement de l'intrigue croise logiquement la route du personnage. Même au niveau consequence, conserve au moins deux choix réels et n'annule jamais l'action libre du joueur.",
    "Raconte uniquement les faits et résultats du paquet. Ne crée ni jet, ni dégât, ni changement d'état supplémentaire.",
    "Si Paquet.results indique qu'un jet est proposé ou attend le joueur, raconte uniquement la mise en situation et invite-le à utiliser le bouton de lancer. Ne décide ni réussite ni échec avant ce lancer.",
    "Paquet.constraints contient des vérités internes obligatoires. Respecte-les sans les citer, sans les paraphraser comme des règles et sans révéler qu'elles viennent du moteur.",
    "Toute modification du monde ou d'un inventaire n'existe que si elle apparaît dans Paquet.results avec status=success ou dans Paquet.actionReceipts.",
    "Dans Paquet.results, status=success confirme que le moteur a exécuté la résolution, pas que l'action du personnage a réussi. Pour un test, respecte impérativement le degré écrit après le DD: réussite critique, réussite, réussite partielle ou échec avec conséquence.",
    "Paquet.actionReceipts décrit les actions déjà exécutées : la source existait avant l'action, même si sa quantité vaut maintenant zéro.",
    "Pour les PV, quantités, charges et jets, recopie exclusivement les valeurs before/after/delta/result des reçus. Ne recalcule rien.",
    "Un jet de soin et les PV effectivement récupérés sont deux valeurs distinctes : le gain effectif est le delta de PV, notamment si la cible atteint son maximum.",
    "L'état de Joueur et Contexte est postérieur aux reçus et ne doit jamais servir à nier leur source.",
    "Une demande sans succès moteur reste une intention ou un échec : ne raconte jamais qu'elle a réussi.",
    "Si le paquet contient missingResource, décris naturellement le geste interrompu ou l'absence constatée; l'objet ne doit apparaître sous aucune forme.",
    "Si un fait dit qu'une liste est exhaustive, restitue uniquement ses éléments et n'en invente aucun.",
    "Les questions présentes dans Paquet.questions sont des besoins de clarification internes : reformule-les comme une question naturelle du Conteur, sans vocabulaire technique.",
    "Avant une question sur une action vague et risquée, montre brièvement un danger ou avertissement immédiatement perceptible. L'intention n'est pas encore accomplie.",
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
    `Scène stable: ${JSON.stringify(compactSceneContext(state))}`,
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
  const visibleFacts = draft.facts
    .map((fact, index) => ({ fact, index, priority: getNarrationFactPriority(fact.kind, fact.source) }))
    .filter(({ fact }) => fact.visibility !== "hidden" && fact.visibility !== "gmOnly")
    .sort((left, right) => right.priority - left.priority || left.index - right.index)
    .slice(0, 8)
    .map(({ fact }) => truncate(fact.content, fact.kind === "inventorySnapshot" ? 900 : 260));
  const narrationInputs = draft.narrationInputs
    .map((input, index) => ({ input, index, priority: input.priority === "high" ? 2 : input.priority === "low" ? 0 : 1 }))
    .filter(({ input }) => input.visibility !== "hidden" && input.visibility !== "gmOnly")
    .sort((left, right) => right.priority - left.priority || left.index - right.index)
    .slice(0, 5)
    .map(({ input }) => truncate(input.content, 240));
  const constraints = draft.facts
    .filter((fact) => fact.visibility === "gmOnly")
    .sort((left, right) => Number(right.source === "localEngine") - Number(left.source === "localEngine"))
    .slice(0, 4)
    .map((fact) => truncate(fact.content, 320));

  return {
    facts: [...visibleFacts, ...narrationInputs].slice(0, 10),
    constraints,
    results: executionResults.slice(-5).map((result) => ({
      status: result.status,
      message: truncate(result.message, 420),
    })),
    warnings: draft.warnings.slice(-3).map((warning) => truncate(warning, 180)),
    questions: draft.questions.slice(-3).map((question) => truncate(question, 180)),
    actionReceipts: actionReceipt ? [sanitizeActionReceipt(actionReceipt)] : [],
  };
}

function getNarrationFactPriority(kind: string, source: string): number {
  if (source === "localEngine") return 4;
  if (/missingResource|authoritativeState|inventorySnapshot/iu.test(kind)) return 4;
  if (/consequence|social|scene|event|result/iu.test(kind)) return 3;
  return 1;
}

function createIncomingDraftContext(agentId: AutomaticDomainAgent, draft: AiResolutionDraft) {
  const terms: Record<AutomaticDomainAgent, string[]> = {
    characterManager: ["inventory", "item", "object", "resource", "personnage", "pv", "capacity"],
    actionManager: ["action", "check", "difficulty", "social", "resource", "scene", "world"],
    combatManager: ["combat", "target", "position", "movement", "attack", "resource", "scene"],
    combatSetupManager: ["combat", "enemy", "template", "position", "scene", "spawn", "terrain"],
    tacticalTemplateManager: ["enemy", "template", "combat", "terrain", "tactical", "monster", "ability"],
    assetTemplateManager: ["item", "object", "effect", "ability", "template", "inventory", "reward"],
    worldManager: ["world", "scene", "social", "npc", "event", "resource", "authoritative"],
  };
  const relevant = draft.facts.filter((fact) => {
    const searchable = normalize(`${fact.kind} ${fact.source} ${fact.content}`);
    return terms[agentId].some((term) => searchable.includes(term));
  });

  return {
    facts: (relevant.length ? relevant : draft.facts).slice(-6).map((fact) => ({
      kind: fact.kind,
      content: truncate(fact.content, 220),
      visibility: fact.visibility,
    })),
    narrationInputs: draft.narrationInputs.slice(-3).map((input) => truncate(input.content, 180)),
    proposedCommands: draft.proposedCommands
      .filter((command) => isCommandRelevantToAgent(command.type, agentId))
      .slice(-5),
    scenePatches: agentId === "worldManager" || agentId === "combatManager"
      ? draft.scenePatches.slice(-2)
      : [],
    warnings: draft.warnings.slice(-3).map((warning) => truncate(warning, 140)),
  };
}

function createDomainContext(agentId: AutomaticDomainAgent, state: GameState, input: string) {
  if (agentId === "characterManager") return createCharacterContext(state, input);
  if (agentId === "combatManager") return {
    ...createCombatContext(state),
    narrativeScene: compactSceneContext(state),
  };
  if (agentId === "actionManager") return createActionContext(state, input);
  if (agentId === "assetTemplateManager") return createAssetTemplateContext(state, input);
  if (agentId === "tacticalTemplateManager") return createTacticalTemplateContext(state, input);
  if (agentId === "combatSetupManager") return createCombatSetupContext(state, input);
  return createWorldContext(state, input);
}

function createAssetTemplateContext(state: GameState, input: string) {
  const character = state.characters.find((candidate) => candidate.id === state.selectedCharacterId);
  const activeEffectTemplates = state.effectTemplates.filter((template) =>
    isContentTemplateActive(state.disabledContentTemplateIds, "effect", template.id));
  const activeAbilityTemplates = state.abilityTemplates.filter((template) =>
    isContentTemplateActive(state.disabledContentTemplateIds, "ability", template.id));
  const activeItemTemplates = state.itemTemplates.filter((template) =>
    isContentTemplateActive(state.disabledContentTemplateIds, "item", template.id));
  return {
    destination: {
      selectedCharacterId: character?.id ?? null,
      locationId: state.narrativeScene.locationId,
      locationLabel: state.narrativeScene.locationLabel,
    },
    operations: effectOperationCatalog.map((operation) => ({
      id: operation.id,
      required: operation.requiredVariables,
      optional: operation.optionalVariables,
    })),
    effects: {
      ids: activeEffectTemplates.map((template) => template.id).slice(0, 80),
      relevant: rankByInput(
        activeEffectTemplates,
        input,
        (template) => `${template.name} ${template.tags.join(" ")} ${template.description}`,
      ).slice(0, 10),
    },
    abilities: {
      ids: activeAbilityTemplates.map((template) => template.id).slice(0, 80),
      relevant: rankByInput(
        activeAbilityTemplates,
        input,
        (template) => `${template.name} ${template.types.join(" ")} ${template.tags.join(" ")}`,
      ).slice(0, 8).map((template) => ({
        id: template.id,
        name: template.name,
        types: template.types,
        activation: template.activation,
        effects: template.effects,
      })),
    },
    items: {
      ids: activeItemTemplates.map((template) => template.id).slice(0, 100),
      relevant: rankByInput(
        activeItemTemplates,
        input,
        (template) => `${template.name} ${template.type} ${template.types.join(" ")} ${template.tags.join(" ")}`,
      ).slice(0, 10).map((template) => ({
        id: template.id,
        name: template.name,
        type: template.type,
        types: template.types,
        tags: template.tags,
        rarity: template.rarity,
        requiresAttunement: template.requiresAttunement,
        base: template.base,
        effects: template.effects,
        attacks: template.attacks,
        attackModifiers: template.attackModifiers,
        targetingV2: template.targetingV2,
      })),
    },
  };
}

function createTacticalTemplateContext(state: GameState, input: string) {
  const activeEnemyTemplates = state.enemyTemplates.filter((template) =>
    isContentTemplateActive(state.disabledContentTemplateIds, "enemy", template.id));
  const activeAbilityTemplates = state.abilityTemplates.filter((template) =>
    isContentTemplateActive(state.disabledContentTemplateIds, "ability", template.id));
  return {
    enemyTemplates: {
      ids: activeEnemyTemplates.map((template) => template.id).slice(0, 80),
      relevant: rankByInput(
        activeEnemyTemplates,
        input,
        (template) => `${template.name} ${template.category} ${template.tags.join(" ")}`,
      ).slice(0, 10),
    },
    reusableAbilityIds: activeAbilityTemplates
      .filter((template) => template.combatRole)
      .map((template) => ({ id: template.id, name: template.name, role: template.combatRole }))
      .slice(0, 40),
    encounterScale: {
      characterLevel: state.characters.find((character) => character.id === state.selectedCharacterId)?.niveau ?? 1,
      combatantCount: state.combat.combatants.length,
    },
  };
}

function createCombatSetupContext(state: GameState, input: string) {
  const activeEnemyTemplates = state.enemyTemplates.filter((template) =>
    isContentTemplateActive(state.disabledContentTemplateIds, "enemy", template.id));
  return {
    enemyTemplates: rankByInput(
      activeEnemyTemplates,
      input,
      (template) => `${template.name} ${template.category} ${template.tags.join(" ")}`,
    ).slice(0, 16).map((template) => ({
      id: template.id,
      name: template.name,
      level: template.level,
      category: template.category,
    })),
    scene: compactSceneContext(state),
    combat: {
      status: state.combat.status,
      map: { width: state.combat.map.width, height: state.combat.map.height, cellSize: state.combat.map.cellSize },
      occupied: state.combat.combatants.map((combatant) => ({
        id: combatant.id,
        side: combatant.side,
        position: combatant.position,
      })).slice(0, 24),
    },
  };
}

function isCommandRelevantToAgent(commandType: string, agentId: AutomaticDomainAgent): boolean {
  if (agentId === "assetTemplateManager") return /Item|Effect|Ability|grantAbility/u.test(commandType);
  if (agentId === "tacticalTemplateManager") return /EnemyTemplate|Tactical|TerrainTemplate/u.test(commandType);
  if (agentId === "combatSetupManager") return /Enemy|Combat|Terrain/u.test(commandType);
  if (agentId === "characterManager") return /Item|Ability|Character|heal/u.test(commandType);
  if (agentId === "combatManager") return /Combat|Damage|move|Turn|Detail/u.test(commandType);
  return true;
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
        tags: template?.tags ?? [],
        effects: [...(template?.effects ?? []), ...item.effects].slice(0, 3),
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
    inventory: {
      exhaustive: inventory.length <= 60,
      totalCount: inventory.length,
      items: inventory.slice(0, 60).map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        location: item.location,
        types: item.types,
      })),
      relevantDetails: rankByInput(
        inventory,
        input,
        (item) => `${item.name} ${item.types.join(" ")} ${item.tags.join(" ")}`,
      ).slice(0, 5),
    },
    abilities: rankByInput(abilities, input, (ability) => ability.name).slice(0, 6),
    scene: compactSceneContext(state),
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
      ...compactSceneContext(state),
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
  const presentIds = new Set(state.narrativeScene.presentEntityIds);
  const presentEntities = entities.filter((entity) => presentIds.has(entity.id));
  const relevantEntities = rankByInput(
    entities.filter((entity) => !presentIds.has(entity.id)),
    input,
    (entity) => `${entity.name} ${entity.description}`,
  );
  const scopedEntities = [...presentEntities, ...relevantEntities]
    .filter((entity, index, collection) => collection.findIndex((candidate) => candidate.id === entity.id) === index)
    .slice(0, 6);
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
    scene: {
      ...compactSceneContext(state),
      presentEntities: presentEntities.slice(0, 8).map((entity) => ({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        description: truncate(entity.description, 140),
        role: truncate(entity.details?.role ?? "", 80),
        desire: truncate(entity.details?.desire ?? "", 80),
        fear: truncate(entity.details?.fear ?? "", 80),
      })),
      recentTurns: state.messages.slice(-4).map((message) => ({
        sender: message.sender,
        content: truncate(message.content, 180),
      })),
    },
    name: state.campaign.world.name ?? state.campaign.name,
    pitch: truncate(state.campaign.world.pitch ?? "", 240),
    tone: truncate(state.campaign.world.tone ?? state.campaign.style, 120),
    themes: state.campaign.world.themes?.slice(0, 3) ?? [],
    rules: rankByInput(state.campaign.world.rules ?? [], input, (rule) => rule).slice(0, 2).map((rule) => truncate(rule, 140)),
    lore: truncate(state.campaign.world.lore, 240),
    facts: rankByInput(state.campaign.world.facts, input, (fact) => fact).slice(0, 3).map((fact) => truncate(fact, 180)),
    entities: scopedEntities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        description: truncate(entity.description, 140),
        role: truncate(entity.details?.role ?? "", 80),
        desire: truncate(entity.details?.desire ?? "", 80),
        fear: truncate(entity.details?.fear ?? "", 80),
        connections: entity.details?.connections?.slice(0, 3) ?? [],
      })),
    factions: rankByInput(state.campaign.world.factions ?? [], input, (faction) => `${faction.name} ${faction.goal} ${faction.method}`)
      .slice(0, 2),
    conflicts: rankByInput(state.campaign.world.conflicts ?? [], input, (conflict) => `${conflict.title} ${conflict.description} ${conflict.stakes}`)
      .slice(0, 2),
    hooks: rankByInput(state.campaign.world.hooks ?? [], input, (hook) => `${hook.title} ${hook.premise} ${hook.urgency}`)
      .slice(0, 1),
    secrets: rankByInput(state.campaign.world.secrets ?? [], input, (secret) => `${secret.truth} ${secret.clues.join(" ")}`)
      .slice(0, 1),
    timeline: (state.campaign.world.timeline ?? []).slice(0, 2),
    history: state.campaign.history.slice(-3).map((entry) => truncate(entry, 180)),
  };
}

function compactSceneContext(state: GameState) {
  const entities = [
    ...state.campaign.world.entities.npcs,
    ...state.campaign.world.entities.items,
    ...state.characters,
  ];
  const presentIds = new Set(state.narrativeScene.presentEntityIds);
  return {
    id: state.narrativeScene.id,
    revision: state.narrativeScene.revision,
    turn: state.narrativeScene.turn,
    elapsedMinutes: state.narrativeScene.elapsedMinutes,
    locationId: state.narrativeScene.locationId,
    locationLabel: state.narrativeScene.locationLabel,
    playerPosition: state.narrativeScene.playerPosition,
    presentEntityIds: state.narrativeScene.presentEntityIds,
    presentEntities: entities
      .filter((entity) => presentIds.has(entity.id))
      .slice(0, 8)
      .map((entity) => ({
        id: entity.id,
        name: entity.name,
        type: "type" in entity ? entity.type : "character",
      })),
    socialTension: state.narrativeScene.socialTension,
    alertLevel: state.narrativeScene.alertLevel,
    activeEvents: state.narrativeScene.activeEvents,
    recentConsequences: state.narrativeScene.recentConsequences.slice(-5),
    lastPlayerAction: truncate(state.narrativeScene.lastPlayerAction, 220),
    lastNarratedBeat: truncate(state.narrativeScene.lastNarratedBeat, 320),
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
    facts: packet.facts.slice(0, 10),
    constraints: packet.constraints.slice(-4),
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

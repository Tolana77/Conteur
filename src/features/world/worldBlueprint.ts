import type {
  AbilityInstance,
  AbilityTemplate,
  Campaign,
  Character,
  CharacterStats,
  Entity,
  ItemInstance,
  ItemTemplate,
  EffectTemplate,
  EnemyTemplate,
  GameActionTemplate,
  World,
} from "../../app/types";
import {
  createCampaignStartSnapshot,
  type CampaignStartSnapshot,
} from "../campaign/campaignStart";
import { createInitialNarrativeScene } from "../../core/game-engine/narrativeScene";
import { initialGameActionTemplates } from "../actions";
import { createInitialSpellbooks, initialSpellTemplates } from "../spells";

export const WORLD_BLUEPRINT_SCHEMA_VERSION = 3 as const;

export interface WorldCreationBrief {
  concept: string;
  genre: string;
  tone: string;
  themes: string;
  scope: string;
  playerRole: string;
  startingParty: string;
  startingEquipment: string;
  desiredElements: string;
  forbiddenElements: string;
  complexity: "compact" | "standard" | "dense";
}

export interface GeneratedWorldEntity {
  id: string;
  name: string;
  description: string;
  role: string;
  desire: string;
  fear: string;
  secret: string;
  importance: string;
  connections: string[];
  tags: string[];
  aliases?: string[];
  socialRank?: NonNullable<Entity["details"]>["socialRank"];
  access?: NonNullable<Entity["details"]>["access"];
  disposition?: string;
  protocol?: string;
  attentionRule?: string;
  delegatesTo?: string[];
  knownFacts?: string[];
  ownerId?: string;
  /** Extensions libres produites par l'IA : géographie, coutumes, horaires,
   * apparence, services, ressources, relations détaillées, etc. */
  data?: Record<string, WorldBlueprintDataValue>;
}

export type WorldBlueprintDataValue =
  | string
  | number
  | boolean
  | null
  | WorldBlueprintDataValue[]
  | { [key: string]: WorldBlueprintDataValue };

export interface GeneratedStartingCharacter {
  id: string;
  name: string;
  title?: string;
  description?: string;
  origin?: string;
  espece: string;
  classe: string;
  niveau: number;
  stats: CharacterStats;
  pv: number;
  maxPv: number;
  competences: string[];
  abilityTemplateIds: string[];
  history?: string[];
}

export interface GeneratedStartingItem {
  id: string;
  ownerId: string;
  templateId?: string;
  name: string;
  description: string;
  type: string;
  types: string[];
  tags: string[];
  quantity: number;
  weight: number;
  equipped: boolean;
}

export interface WorldBlueprint {
  schemaVersion: typeof WORLD_BLUEPRINT_SCHEMA_VERSION;
  campaign: {
    name: string;
    style: string;
    level: number;
    elevatorPitch: string;
    centralQuestion: string;
    openingScene: string;
  };
  party: {
    characters: GeneratedStartingCharacter[];
    startingItems: GeneratedStartingItem[];
  };
  world: {
    name: string;
    lore: string;
    tone: string;
    themes: string[];
    rules: string[];
    facts: string[];
    factions: Array<{
      id: string;
      name: string;
      goal: string;
      method: string;
      resource: string;
      relationship: string;
    }>;
    locations: GeneratedWorldEntity[];
    npcs: GeneratedWorldEntity[];
    items: GeneratedWorldEntity[];
    conflicts: Array<{
      id: string;
      title: string;
      description: string;
      stakes: string;
      participants: string[];
      escalation: string[];
    }>;
    secrets: Array<{
      id: string;
      truth: string;
      clues: string[];
      relatedIds: string[];
    }>;
    hooks: Array<{
      id: string;
      title: string;
      premise: string;
      urgency: string;
      relatedIds: string[];
    }>;
    timeline: Array<{
      id: string;
      event: string;
      trigger: string;
    }>;
  };
}

/** Groupe préparé séparément du monde et lié à la campagne au lancement. */
export interface CampaignPartySetup {
  characters: GeneratedStartingCharacter[];
  startingItems: GeneratedStartingItem[];
  abilityTemplates?: AbilityTemplate[];
  gameActionTemplates?: GameActionTemplate[];
  effectTemplates?: EffectTemplate[];
}

export interface WorldBlueprintParseResult {
  blueprint: WorldBlueprint | null;
  errors: string[];
  warnings: string[];
}

export const defaultWorldCreationBrief: WorldCreationBrief = {
  concept: "Une frontière ancienne où une paix fragile masque un phénomène impossible.",
  genre: "Fantasy sombre aventureuse",
  tone: "Mystérieux, humain, parfois lumineux",
  themes: "Mémoire, dette, loyauté, prix du pouvoir",
  scope: "Une région dense avec plusieurs communautés reliées",
  playerRole: "Des aventuriers libres, compétents mais encore peu connus",
  startingParty: "Un personnage joueur de niveau 1, cohérent avec le rôle proposé et prêt à être personnalisé",
  startingEquipment: "Un équipement modeste et utile à la scène d’ouverture, sans objet surpuissant",
  desiredElements: "Des choix sans solution parfaite, des lieux reconnaissables, des antagonistes compréhensibles",
  forbiddenElements: "Prophétie de l'élu, guerre manichéenne, exposition encyclopédique",
  complexity: "standard",
};

export function buildWorldCreationPrompt(
  brief: WorldCreationBrief,
): string {
  const counts = brief.complexity === "compact"
    ? { factions: 2, locations: 4, npcs: 5, items: 6, conflicts: 2, hooks: 3, secrets: 3 }
    : brief.complexity === "dense"
      ? { factions: 5, locations: 10, npcs: 12, items: 16, conflicts: 5, hooks: 8, secrets: 8 }
      : { factions: 3, locations: 6, npcs: 8, items: 10, conflicts: 3, hooks: 5, secrets: 5 };

  return [
    "Tu es concepteur senior de campagnes de jeu de rôle sandbox.",
    "Crée en français un univers immédiatement jouable, cohérent et riche en décisions. Ne rédige aucun commentaire hors JSON.",
    "",
    "CADRAGE",
    `Concept: ${brief.concept.trim()}`,
    `Genre: ${brief.genre.trim()}`,
    `Ton: ${brief.tone.trim()}`,
    `Thèmes: ${brief.themes.trim()}`,
    `Échelle: ${brief.scope.trim()}`,
    `Rôle des personnages: ${brief.playerRole.trim()}`,
    `Éléments souhaités: ${brief.desiredElements.trim() || "aucun"}`,
    `Éléments interdits: ${brief.forbiddenElements.trim() || "aucun"}`,
    "",
    "EXIGENCES NARRATIVES",
    "- Chaque faction poursuit un objectif légitime à ses propres yeux et possède une méthode contestable.",
    "- Les conflits doivent évoluer sans intervention des joueurs grâce à la timeline.",
    "- Chaque secret possède au moins deux indices concrets situés dans des lieux, PNJ ou objets existants.",
    "- Chaque PNJ veut quelque chose maintenant, craint une conséquence et entretient au moins une connexion utile.",
    "- Pour chaque PNJ, précise socialRank, access, disposition, protocol et attentionRule. Son rang doit réellement limiter qui obtient son attention; un souverain délègue les demandes ordinaires.",
    "- Valeurs fermées: socialRank vaut uniquement outsider, commoner, notable, noble, highNoble ou sovereign; access vaut uniquement open, guarded ou restricted. Ne traduis pas ces identifiants.",
    "- socialRank concerne seulement les PNJ. access concerne les PNJ et les lieux lorsque l'accès est pertinent. Omet ces champs plutôt que de leur inventer une autre valeur.",
    "- Pour chaque objet narratif détenu par un PNJ, renseigne ownerId avec l'id de ce PNJ. Sinon relie-le à son lieu par connections. Cela détermine qui peut réellement le manipuler ou le dérober.",
    "- Modélise aussi quelques possessions ordinaires susceptibles d'être manipulées (bourse, lettre, clé, outil, arme portée). Elles restent sobres et cohérentes avec le rang du PNJ; elles ne sont pas toutes des récompenses magiques.",
    "- PNJ, lieux et objets peuvent recevoir tous les champs JSON supplémentaires utiles : apparence, habitudes, horaires, géographie, climat, services, ressources, dangers, coutumes, habitants, architecture, etc. Ils seront conservés comme données narratives libres.",
    "- Les champs role, desire, fear, secret et importance sont surtout pertinents pour les PNJ. Pour un lieu ou un objet, adapte-les, laisse-les vides ou remplace leur intention par des champs libres plus précis.",
    "- Les accroches proposent une décision ou une urgence, jamais une simple mission linéaire.",
    "- La scène d'ouverture commence au milieu d'une situation active et se termine sur un choix clair.",
    "- Ne crée aucun personnage ni équipement dans cette réponse : la création du personnage est une étape séparée.",
    "- Retourne impérativement party.characters=[] et party.startingItems=[].",
    "- Préserve l'agence des joueurs: aucune issue, alliance ou victoire n'est prédéterminée.",
    "- Évite les noms génériques, les prophéties de l'élu et les factions entièrement bonnes ou mauvaises.",
    "- Les ids sont uniques, courts, en kebab-case et les relatedIds/connections/participants utilisent uniquement ces ids.",
    "",
    `VOLUME INDICATIF: environ ${counts.factions} factions, ${counts.locations} lieux, ${counts.npcs} PNJ, ${counts.items} objets manipulables, ${counts.conflicts} conflits, ${counts.hooks} accroches, ${counts.secrets} secrets et 5 événements. Ajoute ou retire librement des éléments selon les besoins du concept.`,
    "",
    "SOCLE JSON RECOMMANDÉ (les champs supplémentaires sont autorisés)",
    JSON.stringify(createBlueprintSkeleton(), null, 2),
    "",
    "Remplace toutes les valeurs d'exemple. Retourne uniquement un objet JSON valide, sans bloc Markdown.",
  ].join("\n");
}

export function buildWorldRepairPrompt(rawResponse: string, errors: string[]): string {
  return [
    "Corrige le JSON de monde ci-dessous sans changer ses idées créatives.",
    `Retourne uniquement le JSON complet corrigé, conforme à schemaVersion ${WORLD_BLUEPRINT_SCHEMA_VERSION}, sans Markdown.`,
    "Valeurs fermées: socialRank = outsider | commoner | notable | noble | highNoble | sovereign; access = open | guarded | restricted. Omet un champ non pertinent.",
    `Erreurs détectées:\n- ${errors.join("\n- ")}`,
    "JSON À CORRIGER:",
    rawResponse.trim(),
  ].join("\n\n");
}

export function parseWorldBlueprint(raw: string): WorldBlueprintParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cleaned = extractJsonObject(raw);
  let value: unknown;

  try {
    value = normalizeWorldBlueprintInput(JSON.parse(cleaned), warnings);
  } catch (initialError) {
    try {
      value = normalizeWorldBlueprintInput(JSON.parse(removeTrailingJsonCommas(cleaned)), warnings);
      warnings.push("Des virgules finales invalides ont été retirées automatiquement.");
    } catch {
      return {
        blueprint: null,
        errors: [`JSON invalide: ${initialError instanceof Error ? initialError.message : "syntaxe inconnue"}`],
        warnings,
      };
    }
  }

  const root = asRecord(value, "racine", errors);
  const campaign = asRecord(root?.campaign, "campaign", errors);
  const world = asRecord(root?.world, "world", errors);
  if (!root || !campaign || !world) return { blueprint: null, errors, warnings };
  const campaignLevel = boundedNumber(campaign.level, "campaign.level", errors, 1, 20, 1);
  const sourceVersion = Number(root.schemaVersion);
  const party = sourceVersion < WORLD_BLUEPRINT_SCHEMA_VERSION
    ? { characters: [], startingItems: [] }
    : parseStartingParty(root.party, campaignLevel, errors);

  if (sourceVersion < WORLD_BLUEPRINT_SCHEMA_VERSION) {
    warnings.push("Ancien plan de monde migré : son groupe a été retiré afin de créer un personnage propre à la nouvelle campagne.");
  }

  const blueprint: WorldBlueprint = {
    schemaVersion: WORLD_BLUEPRINT_SCHEMA_VERSION,
    campaign: {
      name: requiredString(campaign.name, "campaign.name", errors),
      style: requiredString(campaign.style, "campaign.style", errors),
      level: campaignLevel,
      elevatorPitch: requiredString(campaign.elevatorPitch, "campaign.elevatorPitch", errors),
      centralQuestion: requiredString(campaign.centralQuestion, "campaign.centralQuestion", errors),
      openingScene: requiredString(campaign.openingScene, "campaign.openingScene", errors),
    },
    party,
    world: {
      name: requiredString(world.name, "world.name", errors),
      lore: requiredString(world.lore, "world.lore", errors),
      tone: requiredString(world.tone, "world.tone", errors),
      themes: stringArray(world.themes, "world.themes", errors),
      rules: stringArray(world.rules, "world.rules", errors),
      facts: stringArray(world.facts, "world.facts", errors),
      factions: objectArray(world.factions, "world.factions", errors).map((item, index) => ({
        id: requiredId(item.id, `world.factions[${index}].id`, errors),
        name: requiredString(item.name, `world.factions[${index}].name`, errors),
        goal: requiredString(item.goal, `world.factions[${index}].goal`, errors),
        method: requiredString(item.method, `world.factions[${index}].method`, errors),
        resource: requiredString(item.resource, `world.factions[${index}].resource`, errors),
        relationship: requiredString(item.relationship, `world.factions[${index}].relationship`, errors),
      })),
      locations: parseEntities(world.locations, "world.locations", errors),
      npcs: parseEntities(world.npcs, "world.npcs", errors),
      items: parseEntities(world.items, "world.items", errors),
      conflicts: objectArray(world.conflicts, "world.conflicts", errors).map((item, index) => ({
        id: requiredId(item.id, `world.conflicts[${index}].id`, errors),
        title: requiredString(item.title, `world.conflicts[${index}].title`, errors),
        description: requiredString(item.description, `world.conflicts[${index}].description`, errors),
        stakes: requiredString(item.stakes, `world.conflicts[${index}].stakes`, errors),
        participants: stringArray(item.participants, `world.conflicts[${index}].participants`, errors),
        escalation: stringArray(item.escalation, `world.conflicts[${index}].escalation`, errors),
      })),
      secrets: objectArray(world.secrets, "world.secrets", errors).map((item, index) => ({
        id: requiredId(item.id, `world.secrets[${index}].id`, errors),
        truth: requiredString(item.truth, `world.secrets[${index}].truth`, errors),
        clues: stringArray(item.clues, `world.secrets[${index}].clues`, errors),
        relatedIds: stringArray(item.relatedIds, `world.secrets[${index}].relatedIds`, errors),
      })),
      hooks: objectArray(world.hooks, "world.hooks", errors).map((item, index) => ({
        id: requiredId(item.id, `world.hooks[${index}].id`, errors),
        title: requiredString(item.title, `world.hooks[${index}].title`, errors),
        premise: requiredString(item.premise, `world.hooks[${index}].premise`, errors),
        urgency: requiredString(item.urgency, `world.hooks[${index}].urgency`, errors),
        relatedIds: stringArray(item.relatedIds, `world.hooks[${index}].relatedIds`, errors),
      })),
      timeline: objectArray(world.timeline, "world.timeline", errors).map((item, index) => ({
        id: requiredId(item.id, `world.timeline[${index}].id`, errors),
        event: requiredString(item.event, `world.timeline[${index}].event`, errors),
        trigger: requiredString(item.trigger, `world.timeline[${index}].trigger`, errors),
      })),
    },
  };

  if (![1, 2, WORLD_BLUEPRINT_SCHEMA_VERSION].includes(Number(root.schemaVersion))) {
    warnings.push(`schemaVersion inconnue normalisée vers ${WORLD_BLUEPRINT_SCHEMA_VERSION}.`);
  }

  ensureUniqueBlueprintIds(blueprint, warnings);
  resolveBlueprintReferences(blueprint, warnings);
  validateBlueprintQuality(blueprint, errors, warnings);
  return { blueprint: errors.length ? null : blueprint, errors, warnings };
}

export function createCampaignFromBlueprint(
  blueprint: WorldBlueprint,
  characters?: Character[],
  campaignId = `campaign-${crypto.randomUUID()}`,
): Campaign {
  const boundCharacters = (characters ?? blueprint.party.characters.map((character) => toCharacter(character, campaignId)))
    .map((character) => ({ ...character, campaignId }));
  const toEntity = (entity: GeneratedWorldEntity, type: Entity["type"]): Entity => ({
    id: entity.id,
    name: entity.name,
    type,
    description: entity.description,
    details: {
      role: entity.role,
      desire: entity.desire,
      fear: entity.fear,
      secret: entity.secret,
      importance: entity.importance,
      connections: entity.connections,
      tags: entity.tags,
      aliases: entity.aliases,
      socialRank: entity.socialRank,
      access: entity.access,
      disposition: entity.disposition,
      protocol: entity.protocol,
      attentionRule: entity.attentionRule,
      delegatesTo: entity.delegatesTo,
      knownFacts: entity.knownFacts,
      ownerId: entity.ownerId,
      data: entity.data,
    },
  });
  const world: World = {
    name: blueprint.world.name,
    pitch: blueprint.campaign.elevatorPitch,
    tone: blueprint.world.tone,
    themes: blueprint.world.themes,
    rules: blueprint.world.rules,
    lore: blueprint.world.lore,
    facts: blueprint.world.facts,
    entities: {
      npcs: blueprint.world.npcs.map((entity) => toEntity(entity, "npc")),
      locations: blueprint.world.locations.map((entity) => toEntity(entity, "location")),
      items: blueprint.world.items.map((entity) => toEntity(entity, "item")),
    },
    factions: blueprint.world.factions,
    conflicts: blueprint.world.conflicts,
    secrets: blueprint.world.secrets,
    hooks: blueprint.world.hooks,
    timeline: blueprint.world.timeline,
    openingScene: blueprint.campaign.openingScene,
  };

  return {
    id: campaignId,
    name: blueprint.campaign.name,
    style: blueprint.campaign.style,
    level: blueprint.campaign.level,
    world,
    characters: boundCharacters,
    history: [
      blueprint.campaign.centralQuestion,
      `Ouverture : ${blueprint.campaign.openingScene}`,
    ],
    createdAt: Date.now(),
  };
}

export function createCampaignStartFromBlueprint(
  blueprint: WorldBlueprint,
  itemCatalog: ItemTemplate[],
  abilityCatalog: AbilityTemplate[],
  effectCatalog: EffectTemplate[] = [],
  enemyCatalog: EnemyTemplate[] = [],
  partySetup?: CampaignPartySetup,
): CampaignStartSnapshot {
  const campaignId = `campaign-${crypto.randomUUID()}`;
  const sourceParty = partySetup?.characters.length ? partySetup : blueprint.party;
  const fallbackParty = sourceParty.characters.length ? sourceParty : createFallbackParty(blueprint.campaign.level);
  const characters = fallbackParty.characters.map((character) => toCharacter(character, campaignId));
  const campaign = createCampaignFromBlueprint(blueprint, characters, campaignId);
  const mergedEffectCatalog = mergeTemplatesById(effectCatalog, partySetup?.effectTemplates ?? []);
  const mergedAbilityCatalog = mergeTemplatesById(abilityCatalog, partySetup?.abilityTemplates ?? []);
  const mergedGameActionCatalog = mergeTemplatesById(initialGameActionTemplates, partySetup?.gameActionTemplates ?? []);
  const catalogById = new Map(itemCatalog.map((template) => [template.id, template]));
  const generatedTemplates: ItemTemplate[] = [];
  const itemInstances: ItemInstance[] = fallbackParty.startingItems.map((item, index) => {
    const catalogTemplate = item.templateId ? catalogById.get(item.templateId) : undefined;
    const template = catalogTemplate ?? createGeneratedItemTemplate(item);

    if (!catalogTemplate) {
      generatedTemplates.push(template);
      catalogById.set(template.id, template);
    }

    const overrides: ItemInstance["overrides"] = catalogTemplate
      ? {
          ...(item.name !== catalogTemplate.name ? { name: item.name } : {}),
          ...(item.description !== catalogTemplate.description ? { description: item.description } : {}),
          ...(item.weight !== Number(catalogTemplate.base.weight ?? 0)
            ? { "base.weight": item.weight }
            : {}),
        }
      : {};
    const equipable = isEquipableTemplate(template);

    return {
      id: item.id,
      templateId: template.id,
      quantity: item.quantity,
      overrides,
      current: {},
      data: { inventoryOrder: index },
      effects: [],
      location: {
        type: item.equipped && equipable ? "equipped" : "inventory",
        parent: item.ownerId,
      },
    };
  });
  const abilityById = new Map(mergedAbilityCatalog.map((template) => [template.id, template]));
  const abilityInstances: AbilityInstance[] = fallbackParty.characters.flatMap((character) =>
    character.abilityTemplateIds.flatMap((templateId, index) => {
      const template = abilityById.get(templateId);
      if (!template) return [];
      const charges = template.charges
        ? Math.max(0, Math.min(template.charges.max, template.charges.initial ?? template.charges.max))
        : undefined;

      return [{
        id: `ability-${character.id}-${index + 1}`,
        templateId,
        ownerId: character.id,
        overrides: {},
        current: charges === undefined ? {} : { charges },
        data: {},
        effects: [],
      } satisfies AbilityInstance];
    }),
  );

  return createCampaignStartSnapshot({
    campaign,
    characters,
    selectedCharacterId: characters[0]?.id ?? "",
    openingScene: blueprint.campaign.openingScene,
    itemTemplates: [...itemCatalog, ...generatedTemplates],
    itemInstances,
    abilityTemplates: mergedAbilityCatalog,
    abilityInstances,
    gameActionTemplates: mergedGameActionCatalog,
    spellTemplates: initialSpellTemplates,
    spellbooks: createInitialSpellbooks(characters, initialSpellTemplates),
    effectTemplates: mergedEffectCatalog,
    enemyTemplates: enemyCatalog,
    narrativeScene: createInitialNarrativeScene(campaign, blueprint.campaign.openingScene),
  });
}

function createBlueprintSkeleton(): WorldBlueprint {
  const entityBase = {
    id: "id-unique",
    name: "Nom évocateur",
    description: "Description sensorielle et fonction de jeu",
    role: "Rôle dans le monde",
    desire: "Objectif immédiat",
    fear: "Conséquence redoutée",
    secret: "Information cachée",
    importance: "Pourquoi les joueurs s'y intéresseraient",
    connections: ["autre-id"],
    tags: ["mot-cle"],
    aliases: ["titre ou surnom"],
    data: {
      detailLibre: "Tout autre élément utile propre à ce PNJ, ce lieu ou cet objet",
    },
  };
  const npc: GeneratedWorldEntity = {
    ...entityBase,
    id: "npc-id",
    socialRank: "notable",
    access: "guarded",
    disposition: "Indifférent tant que ses intérêts ne sont pas concernés",
    protocol: "Les inconnus passent par son secrétaire",
    attentionRule: "Répond seulement aux demandes relevant de sa charge",
    delegatesTo: ["autre-id"],
    knownFacts: ["Information que ce PNJ connaît réellement"],
  };
  const location: GeneratedWorldEntity = {
    ...entityBase,
    id: "location-id",
    access: "open",
  };
  const item: GeneratedWorldEntity = {
    ...entityBase,
    id: "item-id",
    ownerId: "npc-id",
  };
  return {
    schemaVersion: WORLD_BLUEPRINT_SCHEMA_VERSION,
    campaign: {
      name: "Nom de campagne",
      style: "Genre et style de jeu",
      level: 1,
      elevatorPitch: "Promesse de campagne en deux phrases",
      centralQuestion: "Question dramatique sans réponse prédéfinie",
      openingScene: "Scène d'ouverture jouable avec tension et choix",
    },
    party: {
      characters: [],
      startingItems: [],
    },
    world: {
      name: "Nom du monde ou de la région",
      lore: "Fondation historique concise et causale",
      tone: "Ton précis",
      themes: ["thème"],
      rules: ["vérité ou règle propre à cet univers"],
      facts: ["fait public exploitable en jeu"],
      factions: [{ id: "faction-id", name: "Nom", goal: "But", method: "Méthode", resource: "Levier", relationship: "Rapport aux autres" }],
      locations: [location],
      npcs: [npc],
      items: [item],
      conflicts: [{ id: "conflict-id", title: "Titre", description: "Situation", stakes: "Enjeux", participants: ["faction-id"], escalation: ["étape 1", "étape 2"] }],
      secrets: [{ id: "secret-id", truth: "Vérité cachée", clues: ["indice concret 1", "indice concret 2"], relatedIds: ["npc-id"] }],
      hooks: [{ id: "hook-id", title: "Titre", premise: "Décision proposée", urgency: "Ce qui évolue", relatedIds: ["location-id"] }],
      timeline: [{ id: "event-id", event: "Évolution du monde", trigger: "Condition ou délai" }],
    },
  };
}

function parseStartingParty(
  value: unknown,
  campaignLevel: number,
  errors: string[],
): WorldBlueprint["party"] {
  const party = asRecord(value, "party", errors);
  if (!party) return createFallbackParty(campaignLevel);

  const characters = objectArray(party.characters, "party.characters", errors).map((item, index) => {
    const stats = asRecord(item.stats, `party.characters[${index}].stats`, errors);
    return {
      id: requiredId(item.id, `party.characters[${index}].id`, errors),
      name: requiredString(item.name, `party.characters[${index}].name`, errors),
      ...(optionalString(item.title) ? { title: optionalString(item.title) } : {}),
      ...(optionalString(item.description) ? { description: optionalString(item.description) } : {}),
      ...(optionalString(item.origin) ? { origin: optionalString(item.origin) } : {}),
      espece: requiredString(item.espece, `party.characters[${index}].espece`, errors),
      classe: requiredString(item.classe, `party.characters[${index}].classe`, errors),
      niveau: boundedNumber(item.niveau, `party.characters[${index}].niveau`, errors, 1, 20, campaignLevel),
      stats: {
        force: boundedNumber(stats?.force, `party.characters[${index}].stats.force`, errors, 1, 30, 10),
        dexterite: boundedNumber(stats?.dexterite, `party.characters[${index}].stats.dexterite`, errors, 1, 30, 10),
        constitution: boundedNumber(stats?.constitution, `party.characters[${index}].stats.constitution`, errors, 1, 30, 10),
        intelligence: boundedNumber(stats?.intelligence, `party.characters[${index}].stats.intelligence`, errors, 1, 30, 10),
        sagesse: boundedNumber(stats?.sagesse, `party.characters[${index}].stats.sagesse`, errors, 1, 30, 10),
        charisme: boundedNumber(stats?.charisme, `party.characters[${index}].stats.charisme`, errors, 1, 30, 10),
      },
      pv: boundedNumber(item.pv, `party.characters[${index}].pv`, errors, 0, 999, 10),
      maxPv: boundedNumber(item.maxPv, `party.characters[${index}].maxPv`, errors, 1, 999, 10),
      competences: stringArray(item.competences, `party.characters[${index}].competences`, errors),
      abilityTemplateIds: stringArray(
        item.abilityTemplateIds,
        `party.characters[${index}].abilityTemplateIds`,
        errors,
      ),
      ...(item.history === undefined
        ? {}
        : { history: stringArray(item.history, `party.characters[${index}].history`, errors) }),
    };
  });
  const startingItems = objectArray(party.startingItems, "party.startingItems", errors).map((item, index) => {
    const templateId = optionalString(item.templateId);
    return {
      id: requiredId(item.id, `party.startingItems[${index}].id`, errors),
      ownerId: requiredId(item.ownerId, `party.startingItems[${index}].ownerId`, errors),
      ...(templateId ? { templateId } : {}),
      name: requiredString(item.name, `party.startingItems[${index}].name`, errors),
      description: requiredString(item.description, `party.startingItems[${index}].description`, errors),
      type: requiredString(item.type, `party.startingItems[${index}].type`, errors),
      types: stringArray(item.types, `party.startingItems[${index}].types`, errors),
      tags: stringArray(item.tags, `party.startingItems[${index}].tags`, errors),
      quantity: boundedNumber(item.quantity, `party.startingItems[${index}].quantity`, errors, 1, 999, 1),
      weight: boundedDecimal(item.weight, `party.startingItems[${index}].weight`, errors, 0, 10_000, 0),
      equipped: booleanValue(item.equipped, `party.startingItems[${index}].equipped`, errors),
    };
  });

  return { characters, startingItems };
}

function createFallbackParty(level: number): WorldBlueprint["party"] {
  return {
    characters: [{
      id: "character-player",
      name: "Aventurier",
      espece: "À définir",
      classe: "Sans classe",
      niveau: level,
      stats: {
        force: 10,
        dexterite: 10,
        constitution: 10,
        intelligence: 10,
        sagesse: 10,
        charisme: 10,
      },
      pv: 10,
      maxPv: 10,
      competences: [],
      abilityTemplateIds: [],
    }],
    startingItems: [],
  };
}

function toCharacter(character: GeneratedStartingCharacter, campaignId: string): Character {
  return {
    id: character.id,
    campaignId,
    name: character.name,
    ...(character.title ? { title: character.title } : {}),
    ...(character.description ? { description: character.description } : {}),
    ...(character.origin ? { origin: character.origin } : {}),
    espece: character.espece,
    classe: character.classe,
    niveau: character.niveau,
    stats: { ...character.stats },
    pv: Math.min(character.pv, character.maxPv),
    maxPv: character.maxPv,
    inventaire: [],
    competences: [...character.competences],
    ...(character.history?.length ? { history: [...character.history] } : {}),
  };
}

function createGeneratedItemTemplate(item: GeneratedStartingItem): ItemTemplate {
  return {
    id: `tpl_world_${item.id.replace(/-/gu, "_")}`,
    type: item.type,
    types: [...item.types],
    tags: [...item.tags],
    name: item.name,
    description: item.description,
    rarity: "mundane",
    base: { weight: item.weight },
    effects: [],
    modules: {},
  };
}

function mergeTemplatesById<T extends { id: string }>(base: T[], additions: T[]): T[] {
  const merged = new Map(base.map((template) => [template.id, template]));
  additions.forEach((template) => merged.set(template.id, template));
  return [...merged.values()];
}

function isEquipableTemplate(template: ItemTemplate): boolean {
  const mechanics = new Set([template.type, ...template.types].map((value) => value.toLowerCase()));
  return mechanics.has("weapon") || mechanics.has("armor") || mechanics.has("accessory");
}

function parseEntities(value: unknown, path: string, errors: string[]): GeneratedWorldEntity[] {
  return objectArray(value, path, errors).map((item, index) => {
    const name = requiredString(item.name, `${path}[${index}].name`, errors);
    return {
      id: requiredId(item.id, `${path}[${index}].id`, errors),
      name,
      description: optionalString(item.description) ?? `Aucune description détaillée n'a encore été établie pour ${name}.`,
      role: optionalString(item.role) ?? "",
      desire: optionalString(item.desire) ?? "",
      fear: optionalString(item.fear) ?? "",
      secret: optionalString(item.secret) ?? "",
      importance: optionalString(item.importance) ?? "",
      connections: optionalStringArray(item.connections),
      tags: optionalStringArray(item.tags),
      aliases: item.aliases === undefined ? undefined : optionalStringArray(item.aliases),
      socialRank: parseOptionalSocialRank(item.socialRank),
      access: parseOptionalAccess(item.access),
      disposition: optionalString(item.disposition),
      protocol: optionalString(item.protocol),
      attentionRule: optionalString(item.attentionRule),
      delegatesTo: item.delegatesTo === undefined ? undefined : optionalStringArray(item.delegatesTo),
      knownFacts: item.knownFacts === undefined ? undefined : optionalStringArray(item.knownFacts),
      ownerId: optionalString(item.ownerId),
      data: collectEntityData(item),
    };
  });
}

function parseOptionalSocialRank(value: unknown): GeneratedWorldEntity["socialRank"] {
  if (value === undefined) return undefined;
  if (value === "outsider" || value === "commoner" || value === "notable" || value === "noble" || value === "highNoble" || value === "sovereign") {
    return value;
  }
  return undefined;
}

function parseOptionalAccess(value: unknown): GeneratedWorldEntity["access"] {
  if (value === undefined) return undefined;
  if (value === "open" || value === "guarded" || value === "restricted") return value;
  return undefined;
}

function validateBlueprintQuality(blueprint: WorldBlueprint, errors: string[], warnings: string[]): void {
  const ids = [
    ...blueprint.party.characters.map((item) => item.id),
    ...blueprint.party.startingItems.map((item) => item.id),
    ...blueprint.world.factions.map((item) => item.id),
    ...blueprint.world.locations.map((item) => item.id),
    ...blueprint.world.npcs.map((item) => item.id),
    ...blueprint.world.items.map((item) => item.id),
    ...blueprint.world.conflicts.map((item) => item.id),
    ...blueprint.world.secrets.map((item) => item.id),
    ...blueprint.world.hooks.map((item) => item.id),
    ...blueprint.world.timeline.map((item) => item.id),
  ];
  if (blueprint.world.factions.length < 2) warnings.push("Le monde gagnerait à posséder au moins deux factions.");
  if (blueprint.world.locations.length < 3) warnings.push("Le monde gagnerait à posséder au moins trois lieux.");
  if (blueprint.world.npcs.length < 3) warnings.push("Le monde gagnerait à posséder au moins trois PNJ.");
  if (blueprint.world.hooks.length < 3) warnings.push("La campagne gagnerait à posséder au moins trois accroches.");
  if (blueprint.world.secrets.length < 2) warnings.push("La campagne gagnerait à posséder au moins deux secrets.");
  if (blueprint.world.facts.length < 3) warnings.push("Le monde gagnerait à posséder au moins trois faits publics.");
  if (blueprint.world.timeline.length < 3) warnings.push("La chronologie devrait posséder au moins trois évolutions.");
  const knownIds = new Set(ids);
  const characterIds = new Set(blueprint.party.characters.map((character) => character.id));
  blueprint.party.startingItems.forEach((item) => {
    if (!characterIds.has(item.ownerId)) {
      errors.push(`${item.id}.ownerId référence un personnage inconnu: ${item.ownerId}.`);
    }
  });
  blueprint.party.characters.forEach((character) => {
    if (character.pv > character.maxPv) {
      errors.push(`${character.id}.pv ne peut pas dépasser maxPv.`);
    }
  });
  const validateReferences = (references: string[], path: string) => {
    const unknown = references.filter((id) => !knownIds.has(id));
    if (unknown.length) warnings.push(`${path} conserve des références non résolues: ${unknown.join(", ")}.`);
  };
  blueprint.world.conflicts.forEach((conflict) => validateReferences(conflict.participants, `${conflict.id}.participants`));
  blueprint.world.secrets.forEach((secret) => validateReferences(secret.relatedIds, `${secret.id}.relatedIds`));
  blueprint.world.hooks.forEach((hook) => validateReferences(hook.relatedIds, `${hook.id}.relatedIds`));
  [...blueprint.world.locations, ...blueprint.world.npcs, ...blueprint.world.items]
    .forEach((entity) => {
      validateReferences(entity.connections, `${entity.id}.connections`);
      validateReferences(entity.delegatesTo ?? [], `${entity.id}.delegatesTo`);
      validateReferences(entity.ownerId ? [entity.ownerId] : [], `${entity.id}.ownerId`);
    });
  blueprint.world.secrets.forEach((secret) => {
    if (secret.clues.length < 2) warnings.push(`${secret.id} devrait posséder au moins deux indices.`);
  });
  blueprint.world.conflicts.forEach((conflict) => {
    if (conflict.escalation.length < 2) warnings.push(`${conflict.id} devrait posséder plusieurs étapes d'escalade.`);
  });
}

function extractJsonObject(raw: string): string {
  const withoutFence = raw.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```\s*$/u, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  return start >= 0 && end > start ? withoutFence.slice(start, end + 1) : withoutFence;
}

function removeTrailingJsonCommas(value: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === ",") {
      let cursor = index + 1;
      while (/\s/u.test(value[cursor] ?? "")) cursor += 1;
      if (value[cursor] === "}" || value[cursor] === "]") continue;
    }
    result += character;
  }
  return result;
}

/** Accepte les variantes de clés courantes produites par les modèles tout en
 * ramenant les données vers le contrat stable attendu par le moteur. */
function normalizeWorldBlueprintInput(value: unknown, warnings: string[]): unknown {
  const source = looseRecord(value);
  if (!source) return value;
  const worldSource = pickRecord(source, ["world", "monde", "univers"])
    ?? (hasAnyKey(source, ["npcs", "pnjs", "locations", "lieux"]) ? source : {});
  const entitySource = pickRecord(worldSource, ["entities", "entites", "entités"]) ?? worldSource;
  const campaignSource = pickRecord(source, ["campaign", "campagne"])
    ?? source;
  const partySource = pickRecord(source, ["party", "groupe", "group"]);
  const campaignName = looseText(pick(campaignSource, ["name", "nom", "title", "titre"]))
    ?? looseText(pick(worldSource, ["name", "nom"]))
    ?? "Campagne sans titre";
  const worldName = looseText(pick(worldSource, ["name", "nom", "title", "titre"])) ?? campaignName;
  const rawVersion = looseInteger(pick(source, ["schemaVersion", "version"]));
  if (rawVersion === undefined) warnings.push("schemaVersion absente : format courant appliqué automatiquement.");

  return {
    schemaVersion: rawVersion ?? WORLD_BLUEPRINT_SCHEMA_VERSION,
    campaign: {
      name: campaignName,
      style: looseText(pick(campaignSource, ["style", "genre", "ambiance"])) ?? "Jeu de rôle sandbox",
      level: clamp(looseInteger(pick(campaignSource, ["level", "niveau"])) ?? 1, 1, 20),
      elevatorPitch: looseText(pick(campaignSource, ["elevatorPitch", "pitch", "resume", "résumé", "concept"]))
        ?? `Une aventure ouverte dans ${worldName}.`,
      centralQuestion: looseText(pick(campaignSource, ["centralQuestion", "questionCentrale", "question_centrale", "enjeuCentral"]))
        ?? "Que feront les personnages face aux tensions de ce monde ?",
      openingScene: looseText(pick(campaignSource, ["openingScene", "sceneOuverture", "scèneOuverture", "introduction", "depart"]))
        ?? looseText(pick(worldSource, ["openingScene", "sceneOuverture", "introduction"]))
        ?? `L'aventure commence dans ${worldName}, alors qu'une situation réclame une décision.`,
    },
    party: partySource ? {
      characters: pick(partySource, ["characters", "personnages"]) ?? [],
      startingItems: pick(partySource, ["startingItems", "objetsDepart", "équipement", "equipement"]) ?? [],
    } : { characters: [], startingItems: [] },
    world: {
      name: worldName,
      lore: looseText(pick(worldSource, ["lore", "histoire", "contexte", "background"]))
        ?? `L'histoire détaillée de ${worldName} reste à découvrir en jeu.`,
      tone: looseText(pick(worldSource, ["tone", "ton", "ambiance"]))
        ?? looseText(pick(campaignSource, ["style", "genre"]))
        ?? "Aventure",
      themes: looseStringArray(pick(worldSource, ["themes", "thèmes"])),
      rules: looseStringArray(pick(worldSource, ["rules", "regles", "règles", "verites", "vérités"])),
      facts: looseStringArray(pick(worldSource, ["facts", "faits", "faitsPublics", "informations"])),
      factions: normalizeFactions(pick(worldSource, ["factions", "groupes", "organisations"])),
      locations: normalizeEntities(pick(entitySource, ["locations", "lieux", "places", "endroits"]), "lieu"),
      npcs: normalizeEntities(pick(entitySource, ["npcs", "pnjs", "pnj", "personnagesNonJoueurs"]), "pnj"),
      items: normalizeEntities(pick(entitySource, ["items", "objets", "artefacts"]), "objet"),
      conflicts: normalizeConflicts(pick(worldSource, ["conflicts", "conflits", "tensions"])),
      secrets: normalizeSecrets(pick(worldSource, ["secrets", "mysteres", "mystères"])),
      hooks: normalizeHooks(pick(worldSource, ["hooks", "accroches", "quetes", "quêtes", "pistes"])),
      timeline: normalizeTimeline(pick(worldSource, ["timeline", "chronologie", "evenements", "événements"])),
    },
  };
}

function normalizeEntities(value: unknown, prefix: string): Array<Record<string, unknown>> {
  return looseObjectArray(value).map((item, index) => {
    const name = looseText(pick(item, ["name", "nom", "title", "titre"])) ?? `${prefix} ${index + 1}`;
    const details = looseRecord(item.details) ?? {};
    return {
      ...item,
      id: normalizeIdentifier(pick(item, ["id", "identifiant"]), `${prefix}-${name}`, index),
      name,
      description: looseText(pick(item, ["description", "details", "détails", "apparence"])) ?? "",
      role: looseText(pick(item, ["role", "rôle", "fonction", "purpose"])) ?? "",
      desire: looseText(pick(item, ["desire", "désir", "objectif", "goal", "motivation"])) ?? "",
      fear: looseText(pick(item, ["fear", "peur", "crainte"])) ?? "",
      secret: looseText(pick(item, ["secret", "secrets"])) ?? "",
      importance: looseText(pick(item, ["importance", "interet", "intérêt", "usage", "enjeu"])) ?? "",
      connections: looseStringArray(pick(item, ["connections", "connexions", "relations", "relatedIds"])),
      tags: looseStringArray(pick(item, ["tags", "motsCles", "mots-clés", "categories", "catégories"])),
      aliases: looseStringArray(pick(item, ["aliases", "alias", "surnoms", "autresNoms"])),
      socialRank: normalizeSocialRank(
        pick(item, ["socialRank", "rangSocial", "rang"])
          ?? pick(details, ["socialRank", "rangSocial", "rang"]),
      ),
      access: normalizeAccess(
        pick(item, ["access", "acces", "accès", "accessibilite", "accessibilité"])
          ?? pick(details, ["access", "acces", "accès", "accessibilite", "accessibilité"]),
      ),
      disposition: looseText(pick(item, ["disposition", "attitude", "humeur"])),
      protocol: looseText(pick(item, ["protocol", "protocole", "etiquette", "étiquette"])),
      attentionRule: looseText(pick(item, ["attentionRule", "regleAttention", "règleAttention"])),
      delegatesTo: looseStringArray(pick(item, ["delegatesTo", "delegueA", "délègueÀ"])),
      knownFacts: looseStringArray(pick(item, ["knownFacts", "faitsConnus", "connaissances"])),
      ownerId: looseText(pick(item, ["ownerId", "proprietaireId", "propriétaireId", "detenteurId", "détenteurId"])),
    };
  });
}

function normalizeFactions(value: unknown): Array<Record<string, unknown>> {
  return looseObjectArray(value).map((item, index) => {
    const name = looseText(pick(item, ["name", "nom", "title", "titre"])) ?? `Faction ${index + 1}`;
    return {
      id: normalizeIdentifier(pick(item, ["id", "identifiant"]), `faction-${name}`, index),
      name,
      goal: looseText(pick(item, ["goal", "but", "objectif"])) ?? "Objectif encore incertain",
      method: looseText(pick(item, ["method", "methode", "méthode", "moyens"])) ?? "Méthodes variables",
      resource: looseText(pick(item, ["resource", "ressource", "levier"])) ?? "Influence limitée",
      relationship: looseText(pick(item, ["relationship", "relations", "position"])) ?? "Relations à établir",
    };
  });
}

function normalizeConflicts(value: unknown): Array<Record<string, unknown>> {
  return looseObjectArray(value).map((item, index) => {
    const title = looseText(pick(item, ["title", "titre", "name", "nom"])) ?? `Conflit ${index + 1}`;
    return {
      id: normalizeIdentifier(pick(item, ["id", "identifiant"]), `conflit-${title}`, index),
      title,
      description: looseText(pick(item, ["description", "situation", "contexte"])) ?? title,
      stakes: looseText(pick(item, ["stakes", "enjeux", "risques"])) ?? "Les équilibres du monde peuvent changer.",
      participants: looseStringArray(pick(item, ["participants", "relatedIds", "acteurs"])),
      escalation: looseStringArray(pick(item, ["escalation", "escalade", "etapes", "étapes"])),
    };
  });
}

function normalizeSecrets(value: unknown): Array<Record<string, unknown>> {
  return looseObjectArray(value).map((item, index) => {
    const truth = looseText(pick(item, ["truth", "verite", "vérité", "secret", "description"])) ?? `Secret ${index + 1}`;
    return {
      id: normalizeIdentifier(pick(item, ["id", "identifiant"]), `secret-${truth}`, index),
      truth,
      clues: looseStringArray(pick(item, ["clues", "indices", "preuves"])),
      relatedIds: looseStringArray(pick(item, ["relatedIds", "liens", "connections", "connexions"])),
    };
  });
}

function normalizeHooks(value: unknown): Array<Record<string, unknown>> {
  return looseObjectArray(value).map((item, index) => {
    const title = looseText(pick(item, ["title", "titre", "name", "nom"])) ?? `Accroche ${index + 1}`;
    return {
      id: normalizeIdentifier(pick(item, ["id", "identifiant"]), `accroche-${title}`, index),
      title,
      premise: looseText(pick(item, ["premise", "prémisse", "description", "situation", "objectif"])) ?? title,
      urgency: looseText(pick(item, ["urgency", "urgence", "evolution", "évolution"])) ?? "La situation évoluera avec le temps.",
      relatedIds: looseStringArray(pick(item, ["relatedIds", "liens", "connections", "connexions"])),
    };
  });
}

function normalizeTimeline(value: unknown): Array<Record<string, unknown>> {
  return looseObjectArray(value).map((item, index) => {
    const event = looseText(pick(item, ["event", "evenement", "événement", "description", "name", "nom"])) ?? `Événement ${index + 1}`;
    return {
      id: normalizeIdentifier(pick(item, ["id", "identifiant"]), `evenement-${event}`, index),
      event,
      trigger: looseText(pick(item, ["trigger", "declencheur", "déclencheur", "condition", "date"])) ?? "Lorsque la fiction le justifie",
    };
  });
}

function ensureUniqueBlueprintIds(blueprint: WorldBlueprint, warnings: string[]): void {
  const used = new Set<string>();
  const groups: Array<Array<{ id: string }>> = [
    blueprint.party.characters,
    blueprint.party.startingItems,
    blueprint.world.factions,
    blueprint.world.locations,
    blueprint.world.npcs,
    blueprint.world.items,
    blueprint.world.conflicts,
    blueprint.world.secrets,
    blueprint.world.hooks,
    blueprint.world.timeline,
  ];
  groups.flat().forEach((entry) => {
    const original = entry.id;
    let next = original;
    let suffix = 2;
    while (used.has(next)) next = `${original}-${suffix++}`;
    if (next !== original) warnings.push(`Id dupliqué « ${original} » renommé automatiquement en « ${next} ».`);
    entry.id = next;
    used.add(next);
  });
}

function resolveBlueprintReferences(blueprint: WorldBlueprint, warnings: string[]): void {
  const named = [
    ...blueprint.world.factions,
    ...blueprint.world.locations,
    ...blueprint.world.npcs,
    ...blueprint.world.items,
  ];
  const lookup = new Map<string, string>();
  named.forEach((entry) => {
    lookup.set(normalizeLookup(entry.id), entry.id);
    if ("name" in entry) lookup.set(normalizeLookup(entry.name), entry.id);
  });
  let resolvedCount = 0;
  const resolve = (reference: string) => {
    const resolved = lookup.get(normalizeLookup(reference)) ?? reference;
    if (resolved !== reference) resolvedCount += 1;
    return resolved;
  };
  blueprint.world.conflicts.forEach((entry) => { entry.participants = entry.participants.map(resolve); });
  blueprint.world.secrets.forEach((entry) => { entry.relatedIds = entry.relatedIds.map(resolve); });
  blueprint.world.hooks.forEach((entry) => { entry.relatedIds = entry.relatedIds.map(resolve); });
  [...blueprint.world.locations, ...blueprint.world.npcs, ...blueprint.world.items].forEach((entry) => {
    entry.connections = entry.connections.map(resolve);
    if (entry.delegatesTo) entry.delegatesTo = entry.delegatesTo.map(resolve);
    if (entry.ownerId) entry.ownerId = resolve(entry.ownerId);
  });
  if (resolvedCount > 0) warnings.push(`${resolvedCount} référence(s) écrite(s) avec des noms ont été reliées automatiquement.`);
}

const ENTITY_CANONICAL_KEYS = new Set([
  "id", "identifiant", "name", "nom", "title", "titre", "description", "details", "détails", "apparence",
  "role", "rôle", "fonction", "purpose", "desire", "désir", "objectif", "goal", "motivation", "fear", "peur", "crainte",
  "secret", "secrets", "importance", "interet", "intérêt", "usage", "enjeu", "connections", "connexions", "relations", "relatedIds",
  "tags", "motsCles", "mots-clés", "categories", "catégories", "aliases", "alias", "surnoms", "autresNoms", "socialRank",
  "rangSocial", "rang", "access", "acces", "accès", "accessibilite", "accessibilité", "disposition", "attitude", "humeur",
  "protocol", "protocole", "etiquette", "étiquette", "attentionRule", "regleAttention", "règleAttention", "delegatesTo", "delegueA",
  "délègueÀ", "knownFacts", "faitsConnus", "connaissances", "ownerId", "proprietaireId", "propriétaireId", "detenteurId", "détenteurId", "data",
]);

function collectEntityData(item: Record<string, unknown>): Record<string, WorldBlueprintDataValue> | undefined {
  const data: Record<string, WorldBlueprintDataValue> = {};
  const explicitSources = [looseRecord(item.details), looseRecord(item.data)].filter((source): source is Record<string, unknown> => Boolean(source));
  explicitSources.forEach((source) => {
    Object.entries(source).forEach(([key, value]) => {
      const parsed = toBlueprintDataValue(value);
      if (parsed !== undefined) data[key] = parsed;
    });
  });
  Object.entries(item).forEach(([key, value]) => {
    if (ENTITY_CANONICAL_KEYS.has(key)) return;
    const parsed = toBlueprintDataValue(value);
    if (parsed !== undefined) data[key] = parsed;
  });
  return Object.keys(data).length ? data : undefined;
}

function toBlueprintDataValue(value: unknown, depth = 0): WorldBlueprintDataValue | undefined {
  if (depth > 6 || value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return undefined;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 100).flatMap((entry) => {
    const parsed = toBlueprintDataValue(entry, depth + 1);
    return parsed === undefined ? [] : [parsed];
  });
  const record = looseRecord(value);
  if (!record) return undefined;
  const result: Record<string, WorldBlueprintDataValue> = {};
  Object.entries(record).slice(0, 100).forEach(([key, entry]) => {
    const parsed = toBlueprintDataValue(entry, depth + 1);
    if (parsed !== undefined) result[key] = parsed;
  });
  return result;
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (record[key] !== undefined) return record[key];
  return undefined;
}

function pickRecord(record: Record<string, unknown>, keys: string[]): Record<string, unknown> | undefined {
  return looseRecord(pick(record, keys)) ?? undefined;
}

function hasAnyKey(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => record[key] !== undefined);
}

function looseRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function looseObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.reduce<Array<Record<string, unknown>>>((items, entry) => {
    const record = looseRecord(entry);
    if (record) items.push(record);
    else {
      const name = looseText(entry);
      if (name) items.push({ name });
    }
    return items;
  }, []);
  const record = looseRecord(value);
  if (!record) return [];
  return Object.entries(record).flatMap(([key, entry]) => {
    const child = looseRecord(entry);
    if (child) return [{ name: key, ...child }];
    const description = looseText(entry);
    return description ? [{ name: key, description }] : [];
  });
}

function looseText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function looseInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function looseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => looseText(entry) ?? []);
  const text = looseText(value);
  return text ? text.split(/[;,\n]/u).map((entry) => entry.trim()).filter(Boolean) : [];
}

function optionalStringArray(value: unknown): string[] {
  return looseStringArray(value);
}

function normalizeIdentifier(value: unknown, fallback: string, index: number): string {
  const source = looseText(value) ?? `${fallback}-${index + 1}`;
  const slug = normalizeLookup(source).replace(/\s+/gu, "-").replace(/[^a-z0-9-]/gu, "").replace(/-+/gu, "-").replace(/^-|-$/gu, "");
  return slug || `element-${index + 1}`;
}

function normalizeLookup(value: string): string {
  return value.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/gu, "").replace(/[’']/gu, " ").replace(/[^a-z0-9]+/gu, " ").trim();
}

function normalizeSocialRank(value: unknown): GeneratedWorldEntity["socialRank"] {
  const normalized = normalizeLookup(looseText(value) ?? "");
  const ranks: Record<string, GeneratedWorldEntity["socialRank"]> = {
    outsider: "outsider", etranger: "outsider", marginal: "outsider",
    commoner: "commoner", roturier: "commoner", commun: "commoner", peuple: "commoner",
    notable: "notable", bourgeois: "notable", influent: "notable",
    noble: "noble", aristocrate: "noble",
    highnoble: "highNoble", "high noble": "highNoble", "haute noblesse": "highNoble", "grand noble": "highNoble",
    sovereign: "sovereign", souverain: "sovereign", royal: "sovereign", monarque: "sovereign",
  };
  const exact = ranks[normalized];
  if (exact) return exact;
  if (/\b(empereur|imperatrice|roi|reine|souverain|souveraine|monarque)\b/u.test(normalized)) return "sovereign";
  if (/\b(haute noblesse|haut noble|grande noblesse|prince|princesse|duc|duchesse)\b/u.test(normalized)) return "highNoble";
  if (/\b(noble|noblesse|aristocrate)\b/u.test(normalized)) return "noble";
  if (/\b(notable|bourgeois|officier|influent)\b/u.test(normalized)) return "notable";
  if (/\b(roturier|commun|villageois|citadin|peuple)\b/u.test(normalized)) return "commoner";
  if (/\b(etranger|marginal|proscrit|hors la loi)\b/u.test(normalized)) return "outsider";
  return undefined;
}

function normalizeAccess(value: unknown): GeneratedWorldEntity["access"] {
  const normalized = normalizeLookup(looseText(value) ?? "");
  const access: Record<string, GeneratedWorldEntity["access"]> = {
    open: "open", ouvert: "open", libre: "open", public: "open", accessible: "open",
    guarded: "guarded", garde: "guarded", surveille: "guarded", controle: "guarded", filtre: "guarded",
    restricted: "restricted", restreint: "restricted", restreinte: "restricted", prive: "restricted", privee: "restricted",
    interdit: "restricted", interdite: "restricted", reserve: "restricted", reservee: "restricted", secret: "restricted",
    secrete: "restricted", ferme: "restricted", fermee: "restricted",
  };
  const exact = access[normalized];
  if (exact) return exact;
  if (/\b(interdit|interdite|restreint|restreinte|reserve|reservee|prive|privee|secret|secrete|ferme|fermee|inaccessible)\b/u.test(normalized)) return "restricted";
  if (/\b(garde|surveille|controle|filtre|escorte|autorisation)\b/u.test(normalized)) return "guarded";
  if (/\b(ouvert|libre|public|accessible)\b/u.test(normalized)) return "open";
  return undefined;
}

function asRecord(value: unknown, path: string, errors: string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path} doit être un objet.`);
    return null;
  }
  return value as Record<string, unknown>;
}

function objectArray(value: unknown, path: string, errors: string[]): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    errors.push(`${path} doit être un tableau.`);
    return [];
  }
  return value.flatMap((item, index) => {
    const record = asRecord(item, `${path}[${index}]`, errors);
    return record ? [record] : [];
  });
}

function requiredString(value: unknown, path: string, errors: string[]): string {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path} doit être une chaîne non vide.`);
    return "";
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown, path: string, errors: string[]): boolean {
  if (typeof value !== "boolean") {
    errors.push(`${path} doit être un booléen.`);
    return false;
  }
  return value;
}

function requiredId(value: unknown, path: string, errors: string[]): string {
  const id = requiredString(value, path, errors);
  if (id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) errors.push(`${path} doit être en kebab-case.`);
  return id;
}

function stringArray(value: unknown, path: string, errors: string[]): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    errors.push(`${path} doit être un tableau de chaînes non vides.`);
    return [];
  }
  return value.map((item) => String(item).trim());
}

function boundedNumber(
  value: unknown,
  path: string,
  errors: string[],
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    errors.push(`${path} doit être un entier entre ${minimum} et ${maximum}.`);
    return fallback;
  }
  return value;
}

function boundedDecimal(
  value: unknown,
  path: string,
  errors: string[],
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    errors.push(`${path} doit être un nombre entre ${minimum} et ${maximum}.`);
    return fallback;
  }
  return value;
}

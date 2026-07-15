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
  World,
} from "../../app/types";
import {
  createCampaignStartSnapshot,
  type CampaignStartSnapshot,
} from "../campaign/campaignStart";
import { createInitialNarrativeScene } from "../../core/game-engine/narrativeScene";

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
}

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
    ? { factions: 2, locations: 4, npcs: 5, conflicts: 2, hooks: 3, secrets: 3 }
    : brief.complexity === "dense"
      ? { factions: 5, locations: 10, npcs: 12, conflicts: 5, hooks: 8, secrets: 8 }
      : { factions: 3, locations: 6, npcs: 8, conflicts: 3, hooks: 5, secrets: 5 };

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
    "- Les accroches proposent une décision ou une urgence, jamais une simple mission linéaire.",
    "- La scène d'ouverture commence au milieu d'une situation active et se termine sur un choix clair.",
    "- Ne crée aucun personnage ni équipement dans cette réponse : la création du personnage est une étape séparée.",
    "- Retourne impérativement party.characters=[] et party.startingItems=[].",
    "- Préserve l'agence des joueurs: aucune issue, alliance ou victoire n'est prédéterminée.",
    "- Évite les noms génériques, les prophéties de l'élu et les factions entièrement bonnes ou mauvaises.",
    "- Les ids sont uniques, courts, en kebab-case et les relatedIds/connections/participants utilisent uniquement ces ids.",
    "",
    `VOLUMES: ${counts.factions} factions, ${counts.locations} lieux, ${counts.npcs} PNJ, 2 objets narratifs, ${counts.conflicts} conflits, ${counts.hooks} accroches, ${counts.secrets} secrets, 5 événements de timeline.`,
    "",
    "FORMAT JSON EXACT",
    JSON.stringify(createBlueprintSkeleton(), null, 2),
    "",
    "Remplace toutes les valeurs d'exemple. Retourne uniquement un objet JSON valide, sans bloc Markdown.",
  ].join("\n");
}

export function buildWorldRepairPrompt(rawResponse: string, errors: string[]): string {
  return [
    "Corrige le JSON de monde ci-dessous sans changer ses idées créatives.",
    `Retourne uniquement le JSON complet corrigé, conforme à schemaVersion ${WORLD_BLUEPRINT_SCHEMA_VERSION}, sans Markdown.`,
    `Erreurs détectées:\n- ${errors.join("\n- ")}`,
    "JSON À CORRIGER:",
    rawResponse.trim(),
  ].join("\n\n");
}

export function parseWorldBlueprint(raw: string): WorldBlueprintParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  let value: unknown;

  try {
    value = JSON.parse(cleaned);
  } catch (error) {
    return {
      blueprint: null,
      errors: [`JSON invalide: ${error instanceof Error ? error.message : "syntaxe inconnue"}`],
      warnings,
    };
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
    errors.push(`schemaVersion doit valoir ${WORLD_BLUEPRINT_SCHEMA_VERSION} (les versions 1 et 2 restent migrables).`);
  }

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
    effectTemplates: mergedEffectCatalog,
    enemyTemplates: enemyCatalog,
    narrativeScene: createInitialNarrativeScene(campaign, blueprint.campaign.openingScene),
  });
}

function createBlueprintSkeleton(): WorldBlueprint {
  const entity: GeneratedWorldEntity = {
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
      locations: [entity],
      npcs: [{ ...entity, id: "npc-id" }],
      items: [{ ...entity, id: "item-id" }],
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
  return objectArray(value, path, errors).map((item, index) => ({
    id: requiredId(item.id, `${path}[${index}].id`, errors),
    name: requiredString(item.name, `${path}[${index}].name`, errors),
    description: requiredString(item.description, `${path}[${index}].description`, errors),
    role: requiredString(item.role, `${path}[${index}].role`, errors),
    desire: requiredString(item.desire, `${path}[${index}].desire`, errors),
    fear: requiredString(item.fear, `${path}[${index}].fear`, errors),
    secret: requiredString(item.secret, `${path}[${index}].secret`, errors),
    importance: requiredString(item.importance, `${path}[${index}].importance`, errors),
    connections: stringArray(item.connections, `${path}[${index}].connections`, errors),
    tags: stringArray(item.tags, `${path}[${index}].tags`, errors),
  }));
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
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) errors.push(`Ids dupliqués: ${[...new Set(duplicates)].join(", ")}.`);
  if (blueprint.world.factions.length < 2) errors.push("Au moins deux factions sont nécessaires.");
  if (blueprint.world.locations.length < 3) errors.push("Au moins trois lieux sont nécessaires.");
  if (blueprint.world.npcs.length < 3) errors.push("Au moins trois PNJ sont nécessaires.");
  if (blueprint.world.hooks.length < 3) errors.push("Au moins trois accroches sont nécessaires.");
  if (blueprint.world.secrets.length < 2) errors.push("Au moins deux secrets sont nécessaires.");
  if (blueprint.world.facts.length < 3) errors.push("Au moins trois faits publics sont nécessaires.");
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
    if (unknown.length) errors.push(`${path} contient des ids inconnus: ${unknown.join(", ")}.`);
  };
  blueprint.world.conflicts.forEach((conflict) => validateReferences(conflict.participants, `${conflict.id}.participants`));
  blueprint.world.secrets.forEach((secret) => validateReferences(secret.relatedIds, `${secret.id}.relatedIds`));
  blueprint.world.hooks.forEach((hook) => validateReferences(hook.relatedIds, `${hook.id}.relatedIds`));
  [...blueprint.world.locations, ...blueprint.world.npcs, ...blueprint.world.items]
    .forEach((entity) => validateReferences(entity.connections, `${entity.id}.connections`));
  blueprint.world.secrets.forEach((secret) => {
    if (secret.clues.length < 2) warnings.push(`${secret.id} devrait posséder au moins deux indices.`);
  });
  blueprint.world.conflicts.forEach((conflict) => {
    if (conflict.escalation.length < 2) warnings.push(`${conflict.id} devrait posséder plusieurs étapes d'escalade.`);
  });
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

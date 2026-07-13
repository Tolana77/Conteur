import type { Campaign, Character, Entity, World } from "../../core/models";

export const WORLD_BLUEPRINT_SCHEMA_VERSION = 1 as const;

export interface WorldCreationBrief {
  concept: string;
  genre: string;
  tone: string;
  themes: string;
  scope: string;
  playerRole: string;
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
  desiredElements: "Des choix sans solution parfaite, des lieux reconnaissables, des antagonistes compréhensibles",
  forbiddenElements: "Prophétie de l'élu, guerre manichéenne, exposition encyclopédique",
  complexity: "standard",
};

export function buildWorldCreationPrompt(brief: WorldCreationBrief): string {
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
    "Retourne uniquement le JSON complet corrigé, conforme à schemaVersion 1, sans Markdown.",
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

  const blueprint: WorldBlueprint = {
    schemaVersion: WORLD_BLUEPRINT_SCHEMA_VERSION,
    campaign: {
      name: requiredString(campaign.name, "campaign.name", errors),
      style: requiredString(campaign.style, "campaign.style", errors),
      level: boundedNumber(campaign.level, "campaign.level", errors, 1, 20, 1),
      elevatorPitch: requiredString(campaign.elevatorPitch, "campaign.elevatorPitch", errors),
      centralQuestion: requiredString(campaign.centralQuestion, "campaign.centralQuestion", errors),
      openingScene: requiredString(campaign.openingScene, "campaign.openingScene", errors),
    },
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

  if (root.schemaVersion !== WORLD_BLUEPRINT_SCHEMA_VERSION) {
    errors.push(`schemaVersion doit valoir ${WORLD_BLUEPRINT_SCHEMA_VERSION}.`);
  }

  validateBlueprintQuality(blueprint, errors, warnings);
  return { blueprint: errors.length ? null : blueprint, errors, warnings };
}

export function createCampaignFromBlueprint(blueprint: WorldBlueprint, characters: Character[]): Campaign {
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
    id: `campaign-${crypto.randomUUID()}`,
    name: blueprint.campaign.name,
    style: blueprint.campaign.style,
    level: blueprint.campaign.level,
    world,
    characters,
    history: [
      blueprint.campaign.centralQuestion,
      `Ouverture : ${blueprint.campaign.openingScene}`,
    ],
    createdAt: Date.now(),
  };
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
    schemaVersion: 1,
    campaign: {
      name: "Nom de campagne",
      style: "Genre et style de jeu",
      level: 1,
      elevatorPitch: "Promesse de campagne en deux phrases",
      centralQuestion: "Question dramatique sans réponse prédéfinie",
      openingScene: "Scène d'ouverture jouable avec tension et choix",
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

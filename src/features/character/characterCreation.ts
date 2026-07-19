import type {
  AbilityTemplate,
  CharacterPerception,
  CharacterStats,
  EffectTemplate,
  EnemyTemplate,
  GameActionTemplate,
  ItemTemplate,
} from "../../app/types";
import {
  cloneDefaultPerception,
  getLanguageMasteryPoints,
  getMaximumLanguageMasteryPoints,
  normalizeCharacterPerception,
} from "../../core/game-engine/perception";
import {
  assetContentSchemaText,
  parseAbilityTemplate,
  parseEffectTemplate,
  resolveEffectReferences,
  type ContentCatalogContext,
} from "../content";
import type {
  CampaignPartySetup,
  GeneratedStartingCharacter,
  GeneratedStartingItem,
} from "../world/worldBlueprint";
import {
  hasDirectStatItemEffect,
  ITEM_CREATION_POLICY_TEXT,
} from "../items/itemCreationPolicy";

export const CHARACTER_CREATION_SCHEMA_VERSION = 1 as const;
export const CHARACTER_POINT_BUY_BUDGET = 27;

export const characterStatDefinitions: Array<{
  key: keyof CharacterStats;
  short: string;
  label: string;
}> = [
  { key: "force", short: "FOR", label: "Force" },
  { key: "dexterite", short: "DEX", label: "Dextérité" },
  { key: "constitution", short: "CON", label: "Constitution" },
  { key: "intelligence", short: "INT", label: "Intelligence" },
  { key: "sagesse", short: "SAG", label: "Sagesse" },
  { key: "charisme", short: "CHA", label: "Charisme" },
];

export const characterSkillDefinitions: Array<{
  name: string;
  stat: keyof CharacterStats;
}> = [
  { name: "Acrobaties", stat: "dexterite" },
  { name: "Arcanes", stat: "intelligence" },
  { name: "Athlétisme", stat: "force" },
  { name: "Discrétion", stat: "dexterite" },
  { name: "Dressage", stat: "sagesse" },
  { name: "Escamotage", stat: "dexterite" },
  { name: "Histoire", stat: "intelligence" },
  { name: "Intimidation", stat: "charisme" },
  { name: "Intuition", stat: "sagesse" },
  { name: "Investigation", stat: "intelligence" },
  { name: "Médecine", stat: "sagesse" },
  { name: "Nature", stat: "intelligence" },
  { name: "Perception", stat: "sagesse" },
  { name: "Persuasion", stat: "charisme" },
  { name: "Religion", stat: "intelligence" },
  { name: "Représentation", stat: "charisme" },
  { name: "Survie", stat: "sagesse" },
  { name: "Tromperie", stat: "charisme" },
];

export interface CharacterCreationPackage extends CampaignPartySetup {
  schemaVersion: typeof CHARACTER_CREATION_SCHEMA_VERSION;
  characters: [GeneratedStartingCharacter];
  abilityTemplates: AbilityTemplate[];
  gameActionTemplates: GameActionTemplate[];
  effectTemplates: EffectTemplate[];
}

export interface CharacterCreationContext {
  campaignName: string;
  campaignStyle: string;
  campaignLevel: number;
  worldName: string;
  worldPitch: string;
  playerRole: string;
  partyConcept: string;
  startingEquipment: string;
  itemTemplates: ItemTemplate[];
  abilityTemplates: AbilityTemplate[];
  gameActionTemplates: GameActionTemplate[];
  effectTemplates: EffectTemplate[];
  enemyTemplates?: EnemyTemplate[];
}

export interface CharacterCreationParseResult {
  setup: CharacterCreationPackage | null;
  errors: string[];
  warnings: string[];
}

export interface ClassicItemSelection {
  templateId: string;
  quantity: number;
  equipped: boolean;
}

export function createDefaultCharacterDraft(level = 1): GeneratedStartingCharacter {
  return {
    id: "character-player",
    name: "",
    title: "",
    description: "",
    origin: "",
    espece: "Humain",
    classe: "Aventurier",
    niveau: level,
    stats: {
      force: 10,
      dexterite: 10,
      constitution: 10,
      intelligence: 10,
      sagesse: 10,
      charisme: 10,
    },
    pv: getRecommendedStartingHp(level, 10),
    maxPv: getRecommendedStartingHp(level, 10),
    competences: [],
    abilityTemplateIds: [],
    perception: cloneDefaultPerception(),
    history: [],
  };
}

export function createClassicCharacterPackage(
  character: GeneratedStartingCharacter,
  selections: ClassicItemSelection[],
  context: CharacterCreationContext,
): CharacterCreationParseResult {
  const characterId = normalizeCharacterId(character.id || character.name);
  const itemById = new Map(context.itemTemplates.map((template) => [template.id, template]));
  const startingItems = selections.flatMap((selection, index): GeneratedStartingItem[] => {
    const template = itemById.get(selection.templateId);
    if (!template || selection.quantity <= 0) return [];
    return [createStartingItem(template, characterId, index, selection.quantity, selection.equipped)];
  });
  const setup: CharacterCreationPackage = {
    schemaVersion: CHARACTER_CREATION_SCHEMA_VERSION,
    characters: [{
      ...character,
      id: characterId,
      niveau: context.campaignLevel,
      pv: character.maxPv,
      history: character.origin?.trim()
        ? [...new Set([character.origin.trim(), ...(character.history ?? [])])]
        : character.history ?? [],
    }],
    startingItems,
    abilityTemplates: [],
    gameActionTemplates: [],
    effectTemplates: [],
  };
  return validateCharacterCreationPackage(setup, context);
}

export function buildCharacterCreationPrompt(
  playerDescription: string,
  context: CharacterCreationContext,
): string {
  const skillLimit = getMaximumSkillCount(context.campaignLevel);
  const abilityLimit = getMaximumAbilityCount(context.campaignLevel);
  const languageBudget = getMaximumLanguageMasteryPoints(context.campaignLevel);
  return [
    "Tu es concepteur de personnages pour un jeu de rôle sandbox.",
    "Transforme la description du joueur en un personnage jouable, cohérent avec la campagne et volontairement modeste. Retourne uniquement du JSON valide.",
    "",
    "CAMPAGNE",
    `Nom: ${context.campaignName}`,
    `Univers: ${context.worldName}`,
    `Style: ${context.campaignStyle}`,
    `Promesse: ${context.worldPitch}`,
    `Niveau imposé: ${context.campaignLevel}`,
    `Rôle attendu: ${context.playerRole}`,
    `Concept du groupe: ${context.partyConcept}`,
    `Équipement souhaité: ${context.startingEquipment}`,
    "",
    "DESCRIPTION DU JOUEUR",
    playerDescription.trim(),
    "",
    "ÉQUILIBRAGE OBLIGATOIRE",
    `- Chaque caractéristique est un entier de 8 à 15. Budget de points maximal: ${CHARACTER_POINT_BUY_BUDGET}, avec coûts 8=0, 9=1, 10=2, 11=3, 12=4, 13=5, 14=7, 15=9.`,
    `- Le niveau vaut exactement ${context.campaignLevel}. Maximum ${skillLimit} compétences maîtrisées et ${abilityLimit} capacités au total.`,
    `- Les langues ont deux maîtrises indépendantes: oral (entendre/parler) et written (lire/écrire). Valeurs: none, fragments, limited, fluent. Leur coût vaut respectivement 0, 1, 2 et 3 points par canal, pour un budget maximal de ${languageBudget}.`,
    "- limited signifie presque tout sauf certains mots; fragments signifie seulement quelques mots.",
    "- vision, hearing et speech valent normal, impaired ou none. N'ajoute une déficience que si la description du joueur la justifie.",
    `- Les PV max ne dépassent pas ${getMaximumStartingHp(context.campaignLevel, 15)}; le personnage commence avec tous ses PV.`,
    "- Traduis les forces de la description par des compromis. Aucun personnage ne maîtrise tout et aucune caractéristique ne dépasse 15.",
    "- Réutilise les capacités existantes avant d'en créer. Une nouvelle capacité doit être ciblée, limitée et compatible avec les effets fermés du moteur.",
    "- Une capacité active puissante possède peu de charges et se recharge au repos court ou long. Aucun dégât gratuit avec activation free.",
    "- Les objets de départ utilisent uniquement un templateId du catalogue. Choisis un équipement modeste et cohérent.",
    "- Pour chaque objet important, adapte name et description à l'univers, à l'origine ou à la faction du personnage. Ne change jamais sa mécanique pour une variation cosmétique.",
    ITEM_CREATION_POLICY_TEXT,
    "- Les ids créés sont en kebab-case. Préfixes: character-, ability-, effect-, starting-.",
    "",
    "COMPÉTENCES AUTORISÉES",
    characterSkillDefinitions.map((skill) => `${skill.name} (${statShort(skill.stat)})`).join(", "),
    "",
    "CAPACITÉS EXISTANTES",
    formatAbilityCatalog(context.abilityTemplates, context.gameActionTemplates ?? []),
    "",
    "EFFETS EXISTANTS",
    formatEffectCatalog(context.effectTemplates),
    "",
    "OBJETS DE DÉPART DISPONIBLES",
    formatItemCatalog(context.itemTemplates),
    "",
    "SCHÉMAS MÉCANIQUES",
    assetContentSchemaText,
    "",
    "FORMAT JSON EXACT",
    JSON.stringify(createCharacterResponseSkeleton(context.campaignLevel), null, 2),
    "",
    "Les tableaux effectTemplates et abilityTemplates restent vides si les catalogues suffisent. Ne crée jamais de template par simple variation cosmétique.",
    "Retourne uniquement l'objet JSON complet, sans Markdown ni commentaire.",
  ].join("\n");
}

export function buildCharacterRepairPrompt(rawResponse: string, errors: string[]): string {
  return [
    "Corrige ce JSON de personnage sans modifier son concept.",
    `Respecte schemaVersion ${CHARACTER_CREATION_SCHEMA_VERSION} et toutes les limites d'équilibrage.`,
    `Erreurs détectées:\n- ${errors.join("\n- ")}`,
    "JSON À CORRIGER:",
    rawResponse.trim(),
    "Retourne uniquement le JSON complet corrigé.",
  ].join("\n\n");
}

export function parseCharacterCreationPackage(
  raw: string,
  context: CharacterCreationContext,
): CharacterCreationParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    return {
      setup: null,
      errors: [`JSON invalide: ${error instanceof Error ? error.message : "syntaxe inconnue"}`],
      warnings,
    };
  }

  const root = record(parsed, "racine", errors);
  if (!root) return { setup: null, errors, warnings };
  if (root.schemaVersion !== CHARACTER_CREATION_SCHEMA_VERSION) {
    errors.push(`schemaVersion doit valoir ${CHARACTER_CREATION_SCHEMA_VERSION}.`);
  }

  const rawEffects = objectArray(root.effectTemplates ?? [], "effectTemplates", errors);
  const effectTemplates = rawEffects.flatMap((source, index) => {
    const result = parseEffectTemplate(source);
    if (!result.value) {
      result.errors.forEach((error) => errors.push(`effectTemplates[${index}]: ${error}`));
      return [];
    }
    return [result.value];
  });
  rejectCatalogCollisions(effectTemplates, context.effectTemplates, "effet", errors);

  const rawAbilities = objectArray(root.abilityTemplates ?? [], "abilityTemplates", errors);
  const plannedAbilityIds = new Set(rawAbilities.flatMap((source) => typeof source.id === "string" ? [source.id] : []));
  const contentContext: ContentCatalogContext = {
    effectTemplates: [...context.effectTemplates, ...effectTemplates],
    abilityTemplates: context.abilityTemplates,
    gameActionTemplates: context.gameActionTemplates ?? [],
    itemTemplates: context.itemTemplates,
    enemyTemplates: context.enemyTemplates ?? [],
    knownIds: {
      effectTemplateIds: new Set(effectTemplates.map((template) => template.id)),
      abilityTemplateIds: plannedAbilityIds,
      itemTemplateIds: new Set(),
      enemyTemplateIds: new Set(),
    },
  };
  const abilityBundles = rawAbilities.flatMap((source, index) => {
    const result = parseAbilityTemplate(source, contentContext);
    if (!result.value) {
      result.errors.forEach((error) => errors.push(`abilityTemplates[${index}]: ${error}`));
      return [];
    }
    return [result.value];
  });
  const abilityTemplates = abilityBundles.map((bundle) => bundle.ability);
  const gameActionTemplates = abilityBundles.map((bundle) => bundle.action);
  rejectCatalogCollisions(abilityTemplates, context.abilityTemplates, "capacité", errors);
  rejectCatalogCollisions(gameActionTemplates, context.gameActionTemplates ?? [], "action", errors);

  const characterSource = record(root.character, "character", errors);
  const character = characterSource
    ? parseGeneratedCharacter(characterSource, context.campaignLevel, errors)
    : null;
  const startingItems = character
    ? parseStartingItemInputs(root.startingItems, character.id, context.itemTemplates, errors)
    : [];

  if (!character) return { setup: null, errors, warnings };
  const setup: CharacterCreationPackage = {
    schemaVersion: CHARACTER_CREATION_SCHEMA_VERSION,
    characters: [character],
    startingItems,
    abilityTemplates,
    gameActionTemplates,
    effectTemplates,
  };
  return validateCharacterCreationPackage(setup, context, errors, warnings);
}

export function validateCharacterCreationPackage(
  setup: CharacterCreationPackage,
  context: CharacterCreationContext,
  initialErrors: string[] = [],
  initialWarnings: string[] = [],
): CharacterCreationParseResult {
  const errors = [...initialErrors];
  const warnings = [...initialWarnings];
  const character = setup.characters[0];
  if (!character) return { setup: null, errors: [...errors, "Un personnage est requis."], warnings };

  if (!character.name.trim()) errors.push("Le personnage doit avoir un nom.");
  if (!character.espece.trim()) errors.push("Le personnage doit avoir une espèce.");
  if (!character.classe.trim()) errors.push("Le personnage doit avoir une classe ou un archétype.");
  if (character.niveau !== context.campaignLevel) {
    errors.push(`Le niveau du personnage doit être ${context.campaignLevel}.`);
  }

  const pointCost = calculatePointBuyCost(character.stats);
  characterStatDefinitions.forEach(({ key, label }) => {
    const value = character.stats[key];
    if (!Number.isInteger(value) || value < 8 || value > 15) {
      errors.push(`${label} doit être comprise entre 8 et 15.`);
    }
  });
  if (pointCost > CHARACTER_POINT_BUY_BUDGET) {
    errors.push(`Budget de caractéristiques dépassé: ${pointCost}/${CHARACTER_POINT_BUY_BUDGET}.`);
  } else if (pointCost < 18) {
    warnings.push(`Le personnage n'utilise que ${pointCost}/${CHARACTER_POINT_BUY_BUDGET} points de caractéristiques.`);
  }

  const hpMaximum = getMaximumStartingHp(context.campaignLevel, character.stats.constitution);
  if (!Number.isInteger(character.maxPv) || character.maxPv < 1 || character.maxPv > hpMaximum) {
    errors.push(`Les PV max doivent être compris entre 1 et ${hpMaximum}.`);
  }
  if (character.pv !== character.maxPv) {
    errors.push("Un nouveau personnage doit commencer avec tous ses PV.");
  }

  character.perception = normalizeCharacterPerception(character.perception);
  const languagePoints = getLanguageMasteryPoints(character.perception);
  const languagePointLimit = getMaximumLanguageMasteryPoints(context.campaignLevel);
  if (character.perception.languages.length > 12) {
    errors.push("Un personnage ne peut pas référencer plus de 12 langues à sa création.");
  }
  if (languagePoints > languagePointLimit) {
    errors.push(`Trop de maîtrise linguistique: ${languagePoints}/${languagePointLimit} points.`);
  }
  if (!character.perception.languages.some((language) =>
    language.oral !== "none" || language.written !== "none")) {
    warnings.push("Le personnage ne maîtrise aucune langue, ni à l'oral ni à l'écrit.");
  }

  const canonicalSkills = canonicalizeSkills(character.competences, errors);
  character.competences = canonicalSkills;
  const skillLimit = getMaximumSkillCount(context.campaignLevel);
  if (canonicalSkills.length > skillLimit) {
    errors.push(`Trop de compétences maîtrisées: ${canonicalSkills.length}/${skillLimit}.`);
  }

  const allAbilityTemplates = [...context.abilityTemplates, ...setup.abilityTemplates];
  const allGameActions = [...(context.gameActionTemplates ?? []), ...(setup.gameActionTemplates ?? [])];
  const abilityIds = [...new Set(character.abilityTemplateIds)];
  character.abilityTemplateIds = abilityIds;
  abilityIds.forEach((id) => {
    if (!allAbilityTemplates.some((template) => template.id === id)) {
      errors.push(`Capacité inconnue: ${id}.`);
    }
  });
  const abilityLimit = getMaximumAbilityCount(context.campaignLevel);
  if (abilityIds.length > abilityLimit) {
    errors.push(`Trop de capacités de départ: ${abilityIds.length}/${abilityLimit}.`);
  }
  validateAbilityRequirements(abilityIds, allAbilityTemplates, allGameActions, setup.startingItems, context.itemTemplates, errors, warnings);
  validateCustomAbilityBalance(setup, context, errors, warnings);
  validateStartingItems(setup.startingItems, character.id, context.itemTemplates, errors, warnings);

  return {
    setup: errors.length ? null : {
      ...setup,
      characters: [{ ...character, pv: character.maxPv }],
    },
    errors,
    warnings: [...new Set(warnings)],
  };
}

export function calculatePointBuyCost(stats: CharacterStats): number {
  const costs: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
  return characterStatDefinitions.reduce((total, { key }) => total + (costs[stats[key]] ?? 99), 0);
}

export function getMaximumSkillCount(level: number): number {
  return Math.min(8, 4 + Math.floor((Math.max(1, level) - 1) / 4));
}

export function getMaximumAbilityCount(level: number): number {
  return Math.min(8, 2 + Math.floor((Math.max(1, level) - 1) / 3));
}

export function getRecommendedStartingHp(level: number, constitution: number): number {
  const modifier = Math.floor((constitution - 10) / 2);
  return Math.max(1, 8 + modifier + (Math.max(1, level) - 1) * Math.max(3, 5 + modifier));
}

export function getMaximumStartingHp(level: number, constitution: number): number {
  const modifier = Math.floor((constitution - 10) / 2);
  return Math.max(6, 10 + Math.max(1, level) * (4 + Math.max(0, modifier)));
}

export function isStartingEquipmentTemplate(template: ItemTemplate): boolean {
  const mechanics = new Set([template.type, ...template.types].map(normalize));
  const tags = new Set(template.tags.map(normalize));
  return template.rarity !== "rare" &&
    template.rarity !== "veryRare" &&
    template.rarity !== "legendary" &&
    template.rarity !== "artifact" &&
    !template.requiresAttunement &&
    !hasDirectStatItemEffect(template.effects) && ![
    "curse",
    "cursed",
    "chaos",
    "quest",
    "legendary",
  ].some((tag) => tags.has(tag)) && !mechanics.has("quest");
}

export function isEquipableCharacterTemplate(template: ItemTemplate): boolean {
  const mechanics = new Set([template.type, ...template.types].map(normalize));
  return mechanics.has("weapon") || mechanics.has("armor") || mechanics.has("accessory");
}

function parseGeneratedCharacter(
  source: Record<string, unknown>,
  campaignLevel: number,
  errors: string[],
): GeneratedStartingCharacter {
  const statsSource = record(source.stats, "character.stats", errors) ?? {};
  const stats = Object.fromEntries(characterStatDefinitions.map(({ key }) => [
    key,
    integer(statsSource[key], `character.stats.${key}`, errors, 8, 15, 10),
  ])) as unknown as CharacterStats;
  const maxPv = integer(source.maxPv, "character.maxPv", errors, 1, 500, getRecommendedStartingHp(campaignLevel, stats.constitution));
  const perception = normalizeCharacterPerception(source.perception);
  return {
    id: normalizeCharacterId(requiredString(source.id, "character.id", errors)),
    name: requiredString(source.name, "character.name", errors),
    ...(optionalString(source.title) ? { title: optionalString(source.title) } : {}),
    ...(optionalString(source.description) ? { description: optionalString(source.description) } : {}),
    ...(optionalString(source.origin) ? { origin: optionalString(source.origin) } : {}),
    espece: requiredString(source.espece, "character.espece", errors),
    classe: requiredString(source.classe, "character.classe", errors),
    niveau: integer(source.niveau, "character.niveau", errors, 1, 20, campaignLevel),
    stats,
    pv: maxPv,
    maxPv,
    competences: stringArray(source.competences, "character.competences", errors),
    abilityTemplateIds: stringArray(source.abilityTemplateIds, "character.abilityTemplateIds", errors),
    perception,
    ...(source.history === undefined ? {} : { history: stringArray(source.history, "character.history", errors) }),
  };
}

function parseStartingItemInputs(
  value: unknown,
  ownerId: string,
  itemTemplates: ItemTemplate[],
  errors: string[],
): GeneratedStartingItem[] {
  const byId = new Map(itemTemplates.map((template) => [template.id, template]));
  return objectArray(value ?? [], "startingItems", errors).flatMap((source, index) => {
    const templateId = requiredString(source.templateId, `startingItems[${index}].templateId`, errors);
    const template = byId.get(templateId);
    if (!template) {
      errors.push(`startingItems[${index}] référence un template inconnu: ${templateId}.`);
      return [];
    }
    const quantity = integer(source.quantity, `startingItems[${index}].quantity`, errors, 1, 20, 1);
    const equipped = boolean(source.equipped, `startingItems[${index}].equipped`, errors);
    return [createStartingItem(template, ownerId, index, quantity, equipped, {
      name: optionalString(source.name),
      description: optionalString(source.description),
    })];
  });
}

function createStartingItem(
  template: ItemTemplate,
  ownerId: string,
  index: number,
  quantity: number,
  equipped: boolean,
  presentation: { name?: string; description?: string } = {},
): GeneratedStartingItem {
  return {
    id: `starting-${index + 1}-${template.id.replace(/^tpl[_-]?/u, "").replace(/_/gu, "-")}`,
    ownerId,
    templateId: template.id,
    name: presentation.name ?? template.name,
    description: presentation.description ?? template.description,
    type: template.type,
    types: [...template.types],
    tags: [...template.tags],
    quantity: Math.max(1, Math.round(quantity)),
    weight: Number(template.base.weight ?? 0),
    equipped: equipped && isEquipableCharacterTemplate(template),
  };
}

function validateStartingItems(
  items: GeneratedStartingItem[],
  characterId: string,
  catalog: ItemTemplate[],
  errors: string[],
  warnings: string[],
): void {
  if (items.length > 8) errors.push("Le personnage ne peut pas commencer avec plus de 8 piles d'objets.");
  const totalQuantity = items.reduce((total, item) => total + item.quantity, 0);
  if (totalQuantity > 20) errors.push(`Trop d'objets de départ: ${totalQuantity}/20 unités.`);
  const ids = new Set<string>();
  items.forEach((item) => {
    if (ids.has(item.id)) errors.push(`Id d'objet dupliqué: ${item.id}.`);
    ids.add(item.id);
    if (item.ownerId !== characterId) errors.push(`${item.id} appartient à un autre personnage.`);
    const template = catalog.find((candidate) => candidate.id === item.templateId);
    if (!template) errors.push(`${item.id} utilise un template inconnu.`);
    if (template && !isStartingEquipmentTemplate(template)) {
      errors.push(`${template.name} est trop rare, maudit ou puissant pour être un objet de départ.`);
    }
    if (item.equipped && template && !isEquipableCharacterTemplate(template)) {
      errors.push(`${template.name} ne peut pas être équipé.`);
    }
  });
  if (!items.length) warnings.push("Le personnage commence sans équipement.");
}

function validateCustomAbilityBalance(
  setup: CharacterCreationPackage,
  context: CharacterCreationContext,
  errors: string[],
  warnings: string[],
): void {
  const level = context.campaignLevel;
  const effectCatalog = [...context.effectTemplates, ...setup.effectTemplates];
  const usedCustomIds = new Set(setup.characters[0].abilityTemplateIds);
  setup.abilityTemplates.forEach((ability) => {
    const action = setup.gameActionTemplates?.find((candidate) => candidate.id === ability.actionId)
      ?? context.gameActionTemplates?.find((candidate) => candidate.id === ability.actionId);
    const name = action?.name ?? ability.id;
    if (!action) {
      errors.push(`${ability.id}: action ${ability.actionId} introuvable.`);
      return;
    }
    if (!usedCustomIds.has(ability.id)) warnings.push(`La capacité créée ${name} n'est pas attribuée au personnage.`);
    if (ability.charges && ability.charges.max > 3 + Math.floor(level / 5)) {
      errors.push(`${name}: trop de charges pour le niveau ${level}.`);
    }
    const resolvedEffects = resolveEffectReferences(action.effects, effectCatalog);
    const consequentialEffects = new Set([
      "applyCondition",
      "createZone",
      "damage",
      "heal",
      "modifyResource",
      "modifyStat",
      "move",
      "randomDamage",
      "reduceDamage",
      "summon",
      "teleport",
    ]);
    if (action.activation.timing === "free" && resolvedEffects.some((effect) => consequentialEffects.has(effect.effectId))) {
      errors.push(`${name}: une action gratuite ne peut pas produire un effet mécanique majeur.`);
    }
    if (action.activation.timing === "passive" && resolvedEffects.some((effect) => ["damage", "heal", "move", "randomDamage", "summon", "teleport"].includes(effect.effectId))) {
      errors.push(`${name}: un passif ne peut pas exécuter directement cet effet.`);
    }
    if (action.targeting) {
      const range = estimateFormulaMaximum(action.targeting.aim.range, level);
      if (range > 6 + level * 6) errors.push(`${name}: portée trop élevée (${range} m).`);
      const area = action.targeting.area;
      const areaSize = Math.max(
        estimateFormulaMaximum(area?.radius, level),
        estimateFormulaMaximum(area?.length, level),
        estimateFormulaMaximum(area?.width, level),
      );
      if (areaSize > 2 + level * 2) errors.push(`${name}: zone d'effet trop vaste (${areaSize} m).`);
      if ((action.targeting.affects.maxTargets ?? 1) > 2 + Math.floor(level / 2)) {
        errors.push(`${name}: trop de cibles pour le niveau ${level}.`);
      }
    }
    resolvedEffects.forEach((effect) => {
      const value = effect.variables?.value;
      if (effect.effectId === "damage" || effect.effectId === "randomDamage") {
        const maximum = estimateFormulaMaximum(value, level);
        if (maximum > 12 + level * 6) errors.push(`${name}: dégâts potentiels trop élevés (${maximum}).`);
      }
      if (effect.effectId === "heal") {
        const maximum = estimateFormulaMaximum(value, level);
        if (maximum > 10 + level * 4) errors.push(`${name}: soin potentiel trop élevé (${maximum}).`);
      }
      if (effect.effectId === "teleport") {
        const range = estimateFormulaMaximum(effect.variables?.range, level);
        if (range > 3 + level * 1.5) errors.push(`${name}: téléportation trop longue (${range} m).`);
      }
      if (effect.effectId === "move") {
        const distance = estimateFormulaMaximum(effect.variables?.distance, level);
        if (distance > 3 + level) errors.push(`${name}: déplacement forcé trop long (${distance} m).`);
      }
      if (effect.effectId === "modifyStat") {
        const modifier = estimateFormulaMagnitude(effect.variables?.value, level);
        const maximum = action.activation.timing === "passive" ? 1 : 2;
        if (modifier > maximum) errors.push(`${name}: modification de caractéristique trop élevée (${modifier}).`);
      }
      if (effect.effectId === "reduceDamage") {
        const reduction = estimateFormulaMaximum(effect.variables?.value, level);
        if (reduction > 2 + Math.floor(level / 2)) errors.push(`${name}: réduction de dégâts trop élevée (${reduction}).`);
      }
      if (effect.effectId === "modifyResource") {
        const amount = estimateFormulaMagnitude(effect.variables?.value, level);
        if (amount > 1) errors.push(`${name}: modification de ressource trop élevée (${amount}).`);
      }
      if (effect.effectId === "createZone") {
        const radius = estimateFormulaMaximum(effect.variables?.radius, level);
        const damage = estimateFormulaMaximum(effect.variables?.damage, level);
        if (radius > 2 + level) errors.push(`${name}: zone créée trop vaste (${radius} m).`);
        if (damage > 8 + level * 4) errors.push(`${name}: dégâts de zone trop élevés (${damage}).`);
      }
      if (effect.effectId === "summon" && level < 5) {
        errors.push(`${name}: les invocations autonomes ne sont pas autorisées avant le niveau 5.`);
      }
    });
  });
}

function validateAbilityRequirements(
  abilityIds: string[],
  abilities: AbilityTemplate[],
  actions: GameActionTemplate[],
  items: GeneratedStartingItem[],
  itemTemplates: ItemTemplate[],
  errors: string[],
  warnings: string[],
): void {
  const equippedTemplateIds = new Set(items.filter((item) => item.equipped).map((item) => item.templateId));
  const equippedTemplates = itemTemplates.filter((template) => equippedTemplateIds.has(template.id));
  const equippedTags = new Set(equippedTemplates.flatMap((template) => template.tags.map(normalize)));
  const equippedTypes = new Set(equippedTemplates.flatMap((template) => [template.type, ...template.types].map(normalize)));

  abilityIds.forEach((abilityId) => {
    const ability = abilities.find((template) => template.id === abilityId);
    if (!ability) return;
    const name = actions.find((action) => action.id === ability.actionId)?.name ?? ability.id;
    ability.requirements?.forEach((requirement) => {
      if (requirement.type === "equippedItemTag" && !equippedTags.has(normalize(requirement.tag))) {
        errors.push(`${name} exige un objet équipé avec le tag ${requirement.tag}.`);
      }
      if (requirement.type === "equippedItemType" && !equippedTypes.has(normalize(requirement.itemType))) {
        errors.push(`${name} exige un objet équipé de type ${requirement.itemType}.`);
      }
    });
    if (ability.charges && (ability.charges.initial ?? ability.charges.max) === 0) {
      warnings.push(`${name} commence sans charge et devra être rechargée en jeu.`);
    }
  });
}

function estimateFormulaMaximum(value: unknown, level: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== "string") return 0;
  let total = 0;
  const withoutDice = value.replace(/(\d*)d(\d+)/giu, (_match, countText: string, sidesText: string) => {
    total += Math.max(1, Number(countText) || 1) * Number(sidesText);
    return " ";
  });
  total += (withoutDice.match(/\b(?:FOR|DEX|CON|INT|SAG|CHA)\b/giu)?.length ?? 0) * 5;
  total += (withoutDice.match(/\b(?:NIV|LEVEL)\b/giu)?.length ?? 0) * level;
  for (const match of withoutDice.matchAll(/(?:^|[^A-Za-z])([+-]?\s*\d+(?:\.\d+)?)/gu)) {
    total += Math.max(0, Number(match[1]?.replace(/\s/gu, "")) || 0);
  }
  return total;
}

function estimateFormulaMagnitude(value: unknown, level: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.abs(value);
  return estimateFormulaMaximum(value, level);
}

function canonicalizeSkills(skills: string[], errors: string[]): string[] {
  const known = new Map(characterSkillDefinitions.map((skill) => [normalize(skill.name), skill.name]));
  const canonical = skills.flatMap((skill) => {
    const match = known.get(normalize(skill));
    if (!match) {
      errors.push(`Compétence inconnue: ${skill}.`);
      return [];
    }
    return [match];
  });
  return [...new Set(canonical)];
}

function rejectCatalogCollisions<T extends { id: string }>(
  additions: T[],
  existing: T[],
  label: string,
  errors: string[],
): void {
  const existingIds = new Set(existing.map((template) => template.id));
  const seen = new Set<string>();
  additions.forEach((template) => {
    if (existingIds.has(template.id)) errors.push(`Le nouvel ${label} réutilise un id du catalogue: ${template.id}.`);
    if (seen.has(template.id)) errors.push(`Id de ${label} dupliqué: ${template.id}.`);
    seen.add(template.id);
  });
}

function createCharacterResponseSkeleton(level: number) {
  return {
    schemaVersion: CHARACTER_CREATION_SCHEMA_VERSION,
    character: {
      id: "character-nom",
      name: "Nom",
      title: "Titre facultatif",
      description: "Apparence, tempérament et manière d'agir",
      origin: "Origine et événement fondateur",
      espece: "Espèce",
      classe: "Archétype",
      niveau: level,
      stats: {
        force: 10,
        dexterite: 10,
        constitution: 10,
        intelligence: 10,
        sagesse: 10,
        charisme: 10,
      },
      maxPv: 10,
      competences: ["Perception", "Investigation"],
      abilityTemplateIds: [],
      perception: {
        vision: "normal",
        hearing: "normal",
        speech: "normal",
        languages: [{
          languageId: "commun",
          name: "Commun",
          oral: "fluent",
          written: "fluent",
        }],
      } satisfies CharacterPerception,
      history: ["Une phrase factuelle sur son passé"],
    },
    startingItems: [{
      templateId: "tpl_rations",
      name: "Rations des Marches",
      description: "Vivres préparés selon les usages de la région de départ.",
      quantity: 3,
      equipped: false,
    }],
    effectTemplates: [],
    abilityTemplates: [],
    gameActionTemplates: [],
  };
}

function formatAbilityCatalog(catalog: AbilityTemplate[], actions: GameActionTemplate[]): string {
  if (!catalog.length) return "Aucune.";
  return catalog.map((ability) => {
    const action = actions.find((candidate) => candidate.id === ability.actionId);
    const charges = ability.charges ? `, ${ability.charges.max} charge(s)` : "";
    return `- ${ability.id}: ${action?.name ?? ability.id} [${action?.combatRole ?? "utility"}, ${action?.activation.timing ?? "action"}${charges}]`;
  }).join("\n");
}

function formatEffectCatalog(catalog: EffectTemplate[]): string {
  if (!catalog.length) return "Utilise les opérations fermées du schéma.";
  return catalog.map((effect) => `- ${effect.id}: ${effect.name}`).join("\n");
}

function formatItemCatalog(catalog: ItemTemplate[]): string {
  const suitable = catalog.filter(isStartingEquipmentTemplate);
  if (!suitable.length) return "Aucun objet disponible.";
  return suitable.map((item) => {
    const attacks = item.attacks?.map((attack) => `${attack.name} ${attack.damage}/${attack.range}m`).join(", ");
    const defense = typeof item.base.defenseBase === "number"
      ? `DEF ${item.base.defenseBase}${Number(item.base.maxDexBonus) > 0 ? " + DEX" : ""}`
      : typeof item.base.defenseBonus === "number"
        ? `DEF +${item.base.defenseBonus}`
        : "";
    const mechanics = [attacks, defense].filter(Boolean).join("; ");
    return `- ${item.id}: ${item.name} — ${item.description} [${item.rarity}; ${[item.type, ...item.types].join(", ")}${mechanics ? `; ${mechanics}` : ""}]`;
  }).join("\n");
}

function normalizeCharacterId(value: string): string {
  const slug = normalize(value)
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 48);
  return slug.startsWith("character-") ? slug : `character-${slug || "player"}`;
}

function statShort(stat: keyof CharacterStats): string {
  return characterStatDefinitions.find((definition) => definition.key === stat)?.short ?? stat;
}

function record(value: unknown, path: string, errors: string[]): Record<string, unknown> | null {
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
    const parsed = record(item, `${path}[${index}]`, errors);
    return parsed ? [parsed] : [];
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

function stringArray(value: unknown, path: string, errors: string[]): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    errors.push(`${path} doit être un tableau de chaînes non vides.`);
    return [];
  }
  return value.map((item) => String(item).trim());
}

function integer(
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

function boolean(value: unknown, path: string, errors: string[]): boolean {
  if (typeof value !== "boolean") {
    errors.push(`${path} doit être un booléen.`);
    return false;
  }
  return value;
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim();
}

import type {
  AbilityRequirement,
  AbilityTemplate,
  ActionTargetKind,
  ActionTargetingRule,
  ActionTargetingV2,
  AffectKind,
  AimKind,
  AreaShape,
  EffectOperationId,
  EffectTemplate,
  EnemyAttackTemplate,
  EnemyBehaviorTemplate,
  EnemyTemplate,
  ItemAttackProfile,
  ItemEffectRef,
  ItemInstance,
  ItemModuleValue,
  ItemTemplate,
} from "../../app/types";
import { effectOperationCatalog } from "./contentCatalog";

export interface ContentCatalogContext {
  effectTemplates: EffectTemplate[];
  abilityTemplates: AbilityTemplate[];
  itemTemplates: ItemTemplate[];
  enemyTemplates: EnemyTemplate[];
  knownIds?: ContentCatalogKnownIds;
}

export interface ContentCatalogKnownIds {
  effectTemplateIds: ReadonlySet<string>;
  abilityTemplateIds: ReadonlySet<string>;
  itemTemplateIds: ReadonlySet<string>;
  enemyTemplateIds: ReadonlySet<string>;
}

export interface ContentValidationResult<T> {
  value: T | null;
  errors: string[];
}

export interface ItemInstanceInput {
  id?: string;
  templateId: string;
  quantity: number;
  overrides: ItemInstance["overrides"];
  current: ItemInstance["current"];
  data: ItemInstance["data"];
  effects: ItemEffectRef[];
  location: ItemInstance["location"];
}

export interface EnemySpawnInput {
  id?: string;
  name?: string;
  side: "players" | "allies" | "enemies" | "neutral";
  position?: { x: number; y: number };
  parent?: string | null;
}

const effectOperations = new Map(effectOperationCatalog.map((operation) => [operation.id, operation]));
const activationTimings = new Set(["action", "bonus", "reaction", "free", "passive"] as const);
const rechargeTriggers = new Set(["shortRest", "longRest", "encounter", "manual", "never"] as const);
const combatRoles = new Set(["attack", "support", "movement", "utility", "passive"] as const);
const aimKinds = new Set<AimKind>(["self", "entity", "position", "direction", "item"]);
const affectKinds = new Set<AffectKind>(["self", "living", "enemy", "ally", "object", "position"]);
const areaShapes = new Set<AreaShape>(["none", "circle", "cone", "line", "selfAura"]);

export function parseEffectTemplate(value: unknown): ContentValidationResult<EffectTemplate> {
  const errors: string[] = [];
  const source = record(value, "template d'effet", errors);
  if (!source) return { value: null, errors };
  const id = contentId(source.id, "effect.id", errors);
  const name = requiredString(source.name, "effect.name", errors);
  const description = requiredString(source.description, "effect.description", errors);
  const tags = stringArray(source.tags ?? [], "effect.tags", errors);
  const actions = objectArray(source.actions, "effect.actions", errors).flatMap((action, index) => {
    const operation = typeof action.operation === "string" && effectOperations.has(action.operation as EffectOperationId)
      ? action.operation as EffectOperationId
      : null;
    if (!operation) {
      errors.push(`effect.actions[${index}].operation est inconnue.`);
      return [];
    }
    const variables = scalarRecord(action.variables ?? {}, `effect.actions[${index}].variables`, errors);
    const definition = effectOperations.get(operation);
    definition?.requiredVariables.forEach((variable) => {
      if (!(variable in variables)) errors.push(`effect.actions[${index}] requiert la variable ${variable}.`);
    });
    validateOperationVariables(operation, variables, `effect.actions[${index}]`, errors);
    return [{ operation, variables }];
  });
  if (!actions.length) errors.push("Un template d'effet doit contenir au moins une action.");

  return errors.length ? { value: null, errors } : { value: { id, name, description, tags, actions }, errors };
}

export function parseItemTemplate(
  value: unknown,
  context: ContentCatalogContext,
): ContentValidationResult<ItemTemplate> {
  const errors: string[] = [];
  const source = record(value, "template d'objet", errors);
  if (!source) return { value: null, errors };
  const id = contentId(source.id, "item.id", errors);
  const type = requiredString(source.type, "item.type", errors);
  const types = stringArray(source.types, "item.types", errors);
  const tags = stringArray(source.tags ?? [], "item.tags", errors);
  const aliases = source.aliases === undefined ? undefined : stringArray(source.aliases, "item.aliases", errors);
  const name = requiredString(source.name, "item.name", errors);
  const description = requiredString(source.description, "item.description", errors);
  const base = scalarRecord(source.base, "item.base", errors);
  if (typeof base.weight !== "number" || !Number.isFinite(base.weight) || base.weight < 0) {
    errors.push("item.base.weight doit être un nombre positif ou nul.");
  }
  const effects = effectReferences(source.effects ?? [], "item.effects", errors);
  validateEffectReferences(effects, context, "item.effects", errors);
  const attacks = source.attacks === undefined ? undefined : parseItemAttacks(source.attacks, errors);
  const attackModifiers = source.attackModifiers === undefined
    ? undefined
    : objectArray(source.attackModifiers, "item.attackModifiers", errors).map((modifier, index) => ({
        id: contentId(modifier.id, `item.attackModifiers[${index}].id`, errors),
        name: requiredString(modifier.name, `item.attackModifiers[${index}].name`, errors),
        appliesToTags: modifier.appliesToTags === undefined ? undefined : stringArray(modifier.appliesToTags, `item.attackModifiers[${index}].appliesToTags`, errors),
        appliesToAttackKinds: modifier.appliesToAttackKinds === undefined
          ? undefined
          : enumArray(modifier.appliesToAttackKinds, ["melee", "ranged", "magic"] as const, `item.attackModifiers[${index}].appliesToAttackKinds`, errors),
        rangeModifier: optionalNumberOrString(modifier.rangeModifier, `item.attackModifiers[${index}].rangeModifier`, errors),
        damageModifier: optionalNumberOrString(modifier.damageModifier, `item.attackModifiers[${index}].damageModifier`, errors),
        damageType: optionalString(modifier.damageType),
        consumeOnUse: optionalBoolean(modifier.consumeOnUse, `item.attackModifiers[${index}].consumeOnUse`, errors),
      }));
  const targetingV2 = source.targetingV2 === undefined ? undefined : parseTargetingV2(source.targetingV2, "item.targetingV2", errors);
  const targeting = source.targeting === undefined
    ? targetingV2 ? toLegacyTargeting(targetingV2) : undefined
    : parseLegacyTargeting(source.targeting, "item.targeting", errors);
  const modules = moduleRecord(source.modules ?? {}, "item.modules", errors);
  if (!types.length) errors.push("item.types doit contenir au moins une catégorie fonctionnelle.");

  const template: ItemTemplate = {
    id,
    type,
    types,
    tags,
    ...(aliases ? { aliases } : {}),
    name,
    description,
    base,
    effects,
    ...(attacks ? { attacks } : {}),
    ...(attackModifiers ? { attackModifiers } : {}),
    ...(targeting ? { targeting } : {}),
    ...(targetingV2 ? { targetingV2 } : {}),
    modules,
  };
  return errors.length ? { value: null, errors } : { value: template, errors };
}

export function parseAbilityTemplate(
  value: unknown,
  context: ContentCatalogContext,
): ContentValidationResult<AbilityTemplate> {
  const errors: string[] = [];
  const source = record(value, "template de capacité", errors);
  if (!source) return { value: null, errors };
  const activationSource = record(source.activation, "ability.activation", errors) ?? {};
  const timing = activationTimings.has(activationSource.timing as never)
    ? activationSource.timing as AbilityTemplate["activation"]["timing"]
    : "action";
  if (!activationTimings.has(activationSource.timing as never)) errors.push("ability.activation.timing est invalide.");
  const targetingV2 = source.targetingV2 === undefined ? undefined : parseTargetingV2(source.targetingV2, "ability.targetingV2", errors);
  const targeting: ActionTargetingRule = source.targeting === undefined
    ? targetingV2 ? toLegacyTargeting(targetingV2) : { allowed: ["self"], required: false, defaultPriority: ["self"] }
    : parseLegacyTargeting(source.targeting, "ability.targeting", errors);
  const effects = effectReferences(source.effects ?? [], "ability.effects", errors);
  validateEffectReferences(effects, context, "ability.effects", errors);
  const combatRole = combatRoles.has(source.combatRole as never)
    ? source.combatRole as AbilityTemplate["combatRole"]
    : undefined;
  if (source.combatRole !== undefined && !combatRole) errors.push("ability.combatRole est invalide.");
  const charges = parseCharges(source.charges, errors);
  const resourceCost = parseResourceCost(source.resourceCost, errors);
  if (resourceCost?.type === "charge" && !charges) errors.push("Une capacité qui coûte des charges doit définir ability.charges.");

  const template: AbilityTemplate = {
    id: contentId(source.id, "ability.id", errors),
    name: requiredString(source.name, "ability.name", errors),
    description: requiredString(source.description, "ability.description", errors),
    types: stringArray(source.types, "ability.types", errors),
    tags: stringArray(source.tags ?? [], "ability.tags", errors),
    ...(combatRole ? { combatRole } : {}),
    activation: { timing },
    ...(resourceCost ? { resourceCost } : {}),
    targeting,
    ...(targetingV2 ? { targetingV2 } : {}),
    ...(charges ? { charges } : {}),
    ...(parseScaling(source.scaling, errors) ?? {}),
    ...(parseRequirements(source.requirements, errors) ?? {}),
    ...(parseDuration(source.duration, errors) ?? {}),
    effects,
    modules: moduleRecord(source.modules ?? { ability: {} }, "ability.modules", errors),
  };
  if (!template.types.length) errors.push("ability.types doit contenir au moins un type.");
  if (timing !== "passive" && !targetingV2) errors.push("ability.targetingV2 est requis pour une capacité active.");
  return errors.length ? { value: null, errors } : { value: template, errors };
}

export function parseEnemyTemplate(
  value: unknown,
  context: ContentCatalogContext,
): ContentValidationResult<EnemyTemplate> {
  const errors: string[] = [];
  const source = record(value, "template d'ennemi", errors);
  if (!source) return { value: null, errors };
  const attacks = objectArray(source.attacks, "enemy.attacks", errors).map((attack, index) =>
    parseEnemyAttack(attack, `enemy.attacks[${index}]`, errors));
  const abilityTemplateIds = stringArray(source.abilityTemplateIds ?? [], "enemy.abilityTemplateIds", errors);
  abilityTemplateIds.forEach((id) => {
    if (!hasKnownId(context.abilityTemplates, context.knownIds?.abilityTemplateIds, id)) {
      errors.push(`enemy.abilityTemplateIds référence une capacité inconnue: ${id}.`);
    }
  });
  const behaviorSource = record(source.behavior, "enemy.behavior", errors) ?? {};
  const behavior = parseEnemyBehavior(behaviorSource, errors);
  const hp = numberOrString(source.hp, "enemy.hp", errors);
  if (typeof hp === "number" && hp <= 0) errors.push("enemy.hp doit être positif.");
  if (!attacks.length) errors.push("Un ennemi doit posséder au moins une attaque.");

  const template: EnemyTemplate = {
    id: contentId(source.id, "enemy.id", errors),
    name: requiredString(source.name, "enemy.name", errors),
    description: requiredString(source.description, "enemy.description", errors),
    level: boundedInteger(source.level, "enemy.level", 0, 30, errors),
    category: requiredString(source.category, "enemy.category", errors),
    tags: stringArray(source.tags ?? [], "enemy.tags", errors),
    hp,
    defense: boundedInteger(source.defense, "enemy.defense", 1, 40, errors),
    initiative: boundedInteger(source.initiative, "enemy.initiative", -20, 30, errors),
    speed: boundedNumber(source.speed, "enemy.speed", 0, 100, errors),
    reach: boundedNumber(source.reach, "enemy.reach", 0, 30, errors),
    attacks,
    abilityTemplateIds,
    behavior,
    resistances: stringArray(source.resistances ?? [], "enemy.resistances", errors),
    vulnerabilities: stringArray(source.vulnerabilities ?? [], "enemy.vulnerabilities", errors),
    immunities: stringArray(source.immunities ?? [], "enemy.immunities", errors),
  };
  return errors.length ? { value: null, errors } : { value: template, errors };
}

export function parseItemInstanceInput(value: unknown, fallbackTemplateId?: string): ContentValidationResult<ItemInstanceInput> {
  const errors: string[] = [];
  const source = record(value ?? {}, "instance d'objet", errors) ?? {};
  const locationSource = record(source.location, "itemInstance.location", errors) ?? {};
  const locationType = locationSource.type === "inventory" || locationSource.type === "equipped" || locationSource.type === "world"
    ? locationSource.type
    : null;
  if (!locationType) errors.push("itemInstance.location.type doit valoir inventory, equipped ou world.");
  const parent = locationSource.parent === null || typeof locationSource.parent === "string" ? locationSource.parent : null;
  if (locationSource.parent !== null && typeof locationSource.parent !== "string") errors.push("itemInstance.location.parent doit être un id ou null.");
  const templateId = optionalString(source.templateId) ?? fallbackTemplateId ?? "";
  if (!templateId) errors.push("itemInstance.templateId est requis.");

  const input: ItemInstanceInput = {
    ...(optionalString(source.id) ? { id: optionalString(source.id) } : {}),
    templateId,
    quantity: boundedInteger(source.quantity ?? 1, "itemInstance.quantity", 1, 9999, errors),
    overrides: scalarRecord(source.overrides ?? {}, "itemInstance.overrides", errors),
    current: scalarRecord(source.current ?? {}, "itemInstance.current", errors),
    data: scalarRecord(source.data ?? {}, "itemInstance.data", errors),
    effects: effectReferences(source.effects ?? [], "itemInstance.effects", errors),
    location: { type: locationType ?? "world", parent },
  };
  return errors.length ? { value: null, errors } : { value: input, errors };
}

export function parseEnemySpawnInput(value: unknown): ContentValidationResult<EnemySpawnInput> {
  const errors: string[] = [];
  const source = record(value ?? {}, "instance d'ennemi", errors) ?? {};
  const side = source.side === "players" || source.side === "allies" || source.side === "neutral" || source.side === "enemies"
    ? source.side
    : "enemies";
  const positionSource = source.position === undefined ? null : record(source.position, "enemy.position", errors);
  const position = positionSource
    ? { x: boundedNumber(positionSource.x, "enemy.position.x", 0, 10_000, errors), y: boundedNumber(positionSource.y, "enemy.position.y", 0, 10_000, errors) }
    : undefined;
  const parent = source.parent === null || typeof source.parent === "string" ? source.parent : undefined;
  return errors.length ? { value: null, errors } : {
    value: {
      ...(optionalString(source.id) ? { id: optionalString(source.id) } : {}),
      ...(optionalString(source.name) ? { name: optionalString(source.name) } : {}),
      side,
      ...(position ? { position } : {}),
      ...(parent !== undefined ? { parent } : {}),
    },
    errors,
  };
}

export function validateEffectReferences(
  references: ItemEffectRef[],
  context: ContentCatalogContext,
  path: string,
  errors: string[],
): void {
  references.forEach((reference, index) => {
    const operation = effectOperations.get(reference.effectId as EffectOperationId);
    const custom = hasKnownId(context.effectTemplates, context.knownIds?.effectTemplateIds, reference.effectId);
    if (!operation && !custom) {
      errors.push(`${path}[${index}] référence un effet inconnu: ${reference.effectId}.`);
      return;
    }
    operation?.requiredVariables.forEach((variable) => {
      if (!(variable in (reference.variables ?? {}))) errors.push(`${path}[${index}] requiert la variable ${variable}.`);
    });
    if (operation) {
      validateOperationVariables(operation.id, reference.variables ?? {}, `${path}[${index}]`, errors);
    }
    const abilityId = reference.effectId === "grantAbility" ? reference.variables?.abilityTemplateId : undefined;
    if (
      typeof abilityId === "string" &&
      !hasKnownId(context.abilityTemplates, context.knownIds?.abilityTemplateIds, abilityId)
    ) {
      errors.push(`${path}[${index}] référence une capacité inconnue: ${abilityId}.`);
    }
    if (reference.effectId === "inventoryInteraction") {
      [reference.variables?.requiredTemplateId, reference.variables?.addTemplateId]
        .filter((id): id is string => typeof id === "string" && Boolean(id))
        .forEach((id) => {
          if (!hasKnownId(context.itemTemplates, context.knownIds?.itemTemplateIds, id)) {
            errors.push(`${path}[${index}] référence un objet inconnu: ${id}.`);
          }
        });
    }
    if (reference.effectId === "summon") {
      const enemyTemplateId = reference.variables?.enemyTemplateId;
      if (
        typeof enemyTemplateId === "string" &&
        !hasKnownId(context.enemyTemplates, context.knownIds?.enemyTemplateIds, enemyTemplateId)
      ) {
        errors.push(`${path}[${index}] référence un ennemi inconnu: ${enemyTemplateId}.`);
      }
    }
  });
}

function hasKnownId<T extends { id: string }>(
  catalog: T[],
  plannedIds: ReadonlySet<string> | undefined,
  id: string,
): boolean {
  return catalog.some((template) => template.id === id) || Boolean(plannedIds?.has(id));
}

function validateOperationVariables(
  operation: EffectOperationId,
  variables: Record<string, number | string | boolean>,
  path: string,
  errors: string[],
): void {
  const numberOrFormula = (key: string) => {
    const value = variables[key];
    if (value !== undefined && typeof value !== "number" && typeof value !== "string") {
      errors.push(`${path}.variables.${key} doit être un nombre ou une formule.`);
    }
  };
  const requiredStringVariable = (key: string) => {
    if (typeof variables[key] !== "string" || !String(variables[key]).trim()) {
      errors.push(`${path}.variables.${key} doit être une chaîne non vide.`);
    }
  };

  if (operation === "damage" || operation === "heal" || operation === "randomDamage") {
    numberOrFormula("value");
  }
  if (operation === "damage" || operation === "reduceDamage") requiredStringVariable("damageType");
  if (operation === "randomDamage") requiredStringVariable("damageTypes");
  if (operation === "modifyStat") {
    const stats = ["force", "dexterite", "constitution", "intelligence", "sagesse", "charisme"];
    if (typeof variables.stat !== "string" || !stats.includes(variables.stat)) {
      errors.push(`${path}.variables.stat doit être une caractéristique reconnue.`);
    }
    numberOrFormula("value");
  }
  if (operation === "reduceDamage" || operation === "teleport" || operation === "move") {
    numberOrFormula(operation === "move" ? "distance" : operation === "teleport" ? "range" : "value");
  }
  if (operation === "inventoryInteraction") requiredStringVariable("requiredTemplateId");
  if (operation === "grantAbility") requiredStringVariable("abilityTemplateId");
  if (operation === "applyCondition" || operation === "removeCondition") requiredStringVariable("condition");
  if (operation === "createZone") {
    requiredStringVariable("zoneKind");
    numberOrFormula("radius");
    numberOrFormula("damage");
  }
  if (operation === "modifyResource") {
    if (typeof variables.resource !== "string" || !["action", "bonus", "reaction", "movement"].includes(variables.resource)) {
      errors.push(`${path}.variables.resource doit valoir action, bonus, reaction ou movement.`);
    }
    if (typeof variables.op !== "string" || !["add", "subtract", "set"].includes(variables.op)) {
      errors.push(`${path}.variables.op doit valoir add, subtract ou set.`);
    }
    if (typeof variables.value !== "number" || !Number.isFinite(variables.value)) {
      errors.push(`${path}.variables.value doit être un nombre pour modifyResource.`);
    }
  }
  if (operation === "summon") {
    requiredStringVariable("enemyTemplateId");
    if (variables.count !== undefined && (typeof variables.count !== "number" || variables.count < 1 || variables.count > 8)) {
      errors.push(`${path}.variables.count doit être un nombre entre 1 et 8.`);
    }
    if (variables.side !== undefined && (typeof variables.side !== "string" || !["players", "allies", "enemies", "neutral"].includes(variables.side))) {
      errors.push(`${path}.variables.side est invalide.`);
    }
  }
  if (operation === "dispel" && !variables.condition && !variables.zoneKind) {
    errors.push(`${path}.variables doit préciser condition ou zoneKind.`);
  }
}

function parseItemAttacks(value: unknown, errors: string[]): ItemAttackProfile[] {
  return objectArray(value, "item.attacks", errors).map((attack, index) => ({
    id: contentId(attack.id, `item.attacks[${index}].id`, errors),
    name: requiredString(attack.name, `item.attacks[${index}].name`, errors),
    label: optionalString(attack.label) ?? requiredString(attack.name, `item.attacks[${index}].name`, errors),
    range: numberOrString(attack.range, `item.attacks[${index}].range`, errors),
    damage: numberOrString(attack.damage, `item.attacks[${index}].damage`, errors),
    damageType: requiredString(attack.damageType, `item.attacks[${index}].damageType`, errors),
    attackKind: enumValue(attack.attackKind, ["melee", "ranged", "magic"] as const, `item.attacks[${index}].attackKind`, errors),
    cost: enumValue(attack.cost, ["action", "bonus", "reaction"] as const, `item.attacks[${index}].cost`, errors),
    ...(attack.targetingV2 === undefined ? {} : { targetingV2: parseTargetingV2(attack.targetingV2, `item.attacks[${index}].targetingV2`, errors) }),
  }));
}

function parseEnemyAttack(source: Record<string, unknown>, path: string, errors: string[]): EnemyAttackTemplate {
  return {
    id: contentId(source.id, `${path}.id`, errors),
    name: requiredString(source.name, `${path}.name`, errors),
    attackKind: enumValue(source.attackKind, ["melee", "ranged", "magic"] as const, `${path}.attackKind`, errors) ?? "melee",
    attackBonus: boundedInteger(source.attackBonus, `${path}.attackBonus`, -20, 30, errors),
    damage: numberOrString(source.damage, `${path}.damage`, errors),
    damageType: requiredString(source.damageType, `${path}.damageType`, errors),
    range: boundedNumber(source.range, `${path}.range`, 0, 1_000, errors),
    cost: enumValue(source.cost, ["action", "bonus", "reaction"] as const, `${path}.cost`, errors) ?? "action",
    tags: stringArray(source.tags ?? [], `${path}.tags`, errors),
  };
}

function parseEnemyBehavior(source: Record<string, unknown>, errors: string[]): EnemyBehaviorTemplate {
  return {
    role: enumValue(source.role, ["artillery", "controller", "skirmisher", "soldier", "support", "brute"] as const, "enemy.behavior.role", errors) ?? "soldier",
    aggression: boundedInteger(source.aggression, "enemy.behavior.aggression", 0, 5, errors),
    preferredRange: boundedNumber(source.preferredRange, "enemy.behavior.preferredRange", 0, 1_000, errors),
    ...(source.retreatBelowHpPercent === undefined ? {} : { retreatBelowHpPercent: boundedNumber(source.retreatBelowHpPercent, "enemy.behavior.retreatBelowHpPercent", 0, 100, errors) }),
    priorities: stringArray(source.priorities ?? [], "enemy.behavior.priorities", errors),
  };
}

function parseTargetingV2(value: unknown, path: string, errors: string[]): ActionTargetingV2 {
  const source = record(value, path, errors) ?? {};
  const aim = record(source.aim, `${path}.aim`, errors) ?? {};
  const affects = record(source.affects, `${path}.affects`, errors) ?? {};
  const area = source.area === undefined ? null : record(source.area, `${path}.area`, errors);
  return {
    aim: {
      allowed: enumArray(aim.allowed, [...aimKinds], `${path}.aim.allowed`, errors),
      required: optionalBoolean(aim.required, `${path}.aim.required`, errors),
      range: optionalNumberOrString(aim.range, `${path}.aim.range`, errors),
      lineOfSight: optionalBoolean(aim.lineOfSight, `${path}.aim.lineOfSight`, errors),
    },
    ...(area ? { area: {
      shape: enumValue(area.shape, [...areaShapes], `${path}.area.shape`, errors) ?? "none",
      radius: optionalNumberOrString(area.radius, `${path}.area.radius`, errors),
      length: optionalNumberOrString(area.length, `${path}.area.length`, errors),
      width: optionalNumberOrString(area.width, `${path}.area.width`, errors),
    } } : {}),
    affects: {
      allowed: enumArray(affects.allowed, [...affectKinds], `${path}.affects.allowed`, errors),
      maxTargets: affects.maxTargets === undefined ? undefined : boundedInteger(affects.maxTargets, `${path}.affects.maxTargets`, 1, 100, errors),
      requiresLiving: optionalBoolean(affects.requiresLiving, `${path}.affects.requiresLiving`, errors),
    },
    defaultPriority: source.defaultPriority === undefined ? undefined : enumArray(source.defaultPriority, ["self", "nearestEnemy", "farthestPointAhead", "none"] as const, `${path}.defaultPriority`, errors),
    suggestedSides: source.suggestedSides === undefined ? undefined : enumArray(source.suggestedSides, ["self", "ally", "enemy", "neutral"] as const, `${path}.suggestedSides`, errors),
  };
}

function parseLegacyTargeting(value: unknown, path: string, errors: string[]): ActionTargetingRule {
  const source = record(value, path, errors) ?? {};
  return {
    allowed: enumArray(source.allowed, ["self", "character", "entity", "item", "position", "free"] as const, `${path}.allowed`, errors),
    required: optionalBoolean(source.required, `${path}.required`, errors),
    defaultPriority: source.defaultPriority === undefined ? undefined : enumArray(source.defaultPriority, ["self", "nearestEnemy", "farthestPointAhead", "none"] as const, `${path}.defaultPriority`, errors),
    range: optionalNumberOrString(source.range, `${path}.range`, errors),
    label: enumValue(source.label, ["cible", "destination"] as const, `${path}.label`, errors),
    lineOfSight: optionalBoolean(source.lineOfSight, `${path}.lineOfSight`, errors),
    suggestedSides: source.suggestedSides === undefined ? undefined : enumArray(source.suggestedSides, ["self", "ally", "enemy", "neutral"] as const, `${path}.suggestedSides`, errors),
  };
}

function toLegacyTargeting(targeting: ActionTargetingV2): ActionTargetingRule {
  const allowed = targeting.aim.allowed.flatMap<ActionTargetKind>((kind) => {
    if (kind === "self") return ["self"];
    if (kind === "entity") return ["entity", "character"];
    if (kind === "position") return ["position"];
    if (kind === "item") return ["item"];
    return ["free"];
  });
  return {
    allowed: [...new Set(allowed)],
    required: targeting.aim.required,
    defaultPriority: targeting.defaultPriority,
    range: targeting.aim.range,
    lineOfSight: targeting.aim.lineOfSight,
    suggestedSides: targeting.suggestedSides,
  };
}

function parseCharges(value: unknown, errors: string[]): AbilityTemplate["charges"] {
  if (value === undefined) return undefined;
  const source = record(value, "ability.charges", errors) ?? {};
  const max = boundedInteger(source.max, "ability.charges.max", 1, 100, errors);
  const initial = source.initial === undefined ? undefined : boundedInteger(source.initial, "ability.charges.initial", 0, max, errors);
  const recharge = enumArray(source.recharge, [...rechargeTriggers], "ability.charges.recharge", errors);
  const rechargeAmount = source.rechargeAmount === "full"
    ? "full"
    : source.rechargeAmount === undefined ? undefined : boundedInteger(source.rechargeAmount, "ability.charges.rechargeAmount", 1, max, errors);
  return { max, initial, recharge, rechargeAmount };
}

function parseResourceCost(value: unknown, errors: string[]): AbilityTemplate["resourceCost"] {
  if (value === undefined) return undefined;
  const source = record(value, "ability.resourceCost", errors) ?? {};
  const type = enumValue(source.type, ["charge", "mana", "action", "custom"] as const, "ability.resourceCost.type", errors);
  if (!type) return undefined;
  return { type, resource: optionalString(source.resource), amount: numberOrString(source.amount, "ability.resourceCost.amount", errors) };
}

function parseScaling(value: unknown, errors: string[]): Pick<AbilityTemplate, "scaling"> | undefined {
  if (value === undefined) return undefined;
  const source = record(value, "ability.scaling", errors) ?? {};
  const mode = enumValue(source.mode, ["abilityLevel", "characterLevel", "slotLevel", "itemLevel", "fixed"] as const, "ability.scaling.mode", errors);
  if (!mode) return undefined;
  return { scaling: { level: numberOrString(source.level, "ability.scaling.level", errors), mode, maxLevel: optionalNumberOrString(source.maxLevel, "ability.scaling.maxLevel", errors), notes: optionalString(source.notes) } };
}

function parseRequirements(value: unknown, errors: string[]): Pick<AbilityTemplate, "requirements"> | undefined {
  if (value === undefined) return undefined;
  const requirements: AbilityRequirement[] = [];
  objectArray(value, "ability.requirements", errors).forEach((source, index) => {
    const type = optionalString(source.type);
    if (type === "equippedItemTag" && typeof source.tag === "string") {
      requirements.push({ type, tag: source.tag });
      return;
    }
    if (type === "equippedItemType" && typeof source.itemType === "string") {
      requirements.push({ type, itemType: source.itemType });
      return;
    }
    if (type === "resource" && typeof source.resource === "string") {
      requirements.push({ type, resource: source.resource, min: numberOrString(source.min, `ability.requirements[${index}].min`, errors) });
      return;
    }
    if (type === "state" && typeof source.condition === "string") {
      requirements.push({ type, condition: source.condition, expected: typeof source.expected === "boolean" ? source.expected : undefined });
      return;
    }
    if (type === "targetCondition" && typeof source.condition === "string") {
      requirements.push({ type, condition: source.condition });
      return;
    }
    if (type === "combatStatus" && (source.status === "active" || source.status === "inactive" || source.status === "any")) {
      requirements.push({ type, status: source.status });
      return;
    }
    errors.push(`ability.requirements[${index}] est invalide.`);
  });
  return { requirements };
}

function parseDuration(value: unknown, errors: string[]): Pick<AbilityTemplate, "duration"> | undefined {
  if (value === undefined) return undefined;
  const source = record(value, "ability.duration", errors) ?? {};
  if (source.type === "instant" || source.type === "permanent") return { duration: { type: source.type } };
  if (source.type === "rounds") return { duration: { type: "rounds", value: numberOrString(source.value, "ability.duration.value", errors) } };
  if (source.type === "untilRest" && (source.rest === "short" || source.rest === "long")) return { duration: { type: "untilRest", rest: source.rest } };
  if (source.type === "concentration") return { duration: { type: "concentration", maxRounds: optionalNumberOrString(source.maxRounds, "ability.duration.maxRounds", errors) } };
  errors.push("ability.duration.type est invalide.");
  return undefined;
}

function effectReferences(value: unknown, path: string, errors: string[]): ItemEffectRef[] {
  return objectArray(value, path, errors).map((source, index) => ({
    effectId: requiredString(source.effectId, `${path}[${index}].effectId`, errors),
    ...(optionalString(source.nom) ? { nom: optionalString(source.nom) } : {}),
    variables: scalarRecord(source.variables ?? {}, `${path}[${index}].variables`, errors),
  }));
}

function moduleRecord(value: unknown, path: string, errors: string[]): ItemTemplate["modules"] {
  const source = record(value, path, errors);
  if (!source) return {};
  return Object.fromEntries(Object.entries(source).flatMap(([key, nested]) => {
    const nestedRecord = record(nested, `${path}.${key}`, errors);
    if (!nestedRecord) return [];
    const module: Record<string, ItemModuleValue> = {};
    Object.entries(nestedRecord).forEach(([field, fieldValue]) => {
      if (isModuleValue(fieldValue)) module[field] = fieldValue;
      else errors.push(`${path}.${key}.${field} doit être une valeur simple ou un tableau de valeurs simples.`);
    });
    return [[key, module]];
  }));
}

function scalarRecord(value: unknown, path: string, errors: string[]): Record<string, number | string | boolean> {
  const source = record(value, path, errors);
  if (!source) return {};
  const result: Record<string, number | string | boolean> = {};
  Object.entries(source).forEach(([key, item]) => {
    if (typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))) result[key] = item;
    else errors.push(`${path}.${key} doit être une valeur simple.`);
  });
  return result;
}

function record(value: unknown, path: string, errors: string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path} doit être un objet.`);
    return null;
  }
  return value as Record<string, unknown>;
}

function objectArray(value: unknown, path: string, errors: string[]): Record<string, unknown>[] {
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
  return value.trim().slice(0, 500);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : undefined;
}

function contentId(value: unknown, path: string, errors: string[]): string {
  const id = requiredString(value, path, errors);
  if (id && !/^[a-z][a-z0-9_-]{2,79}$/u.test(id)) errors.push(`${path} doit utiliser uniquement minuscules, chiffres, tirets ou underscores.`);
  return id;
}

function stringArray(value: unknown, path: string, errors: string[]): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} doit être un tableau.`);
    return [];
  }
  return value.flatMap((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      errors.push(`${path}[${index}] doit être une chaîne non vide.`);
      return [];
    }
    return [item.trim().slice(0, 120)];
  });
}

function numberOrString(value: unknown, path: string, errors: string[]): number | string {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && value.length <= 120) return value.trim();
  errors.push(`${path} doit être un nombre ou une formule courte.`);
  return 0;
}

function optionalNumberOrString(value: unknown, path: string, errors: string[]): number | string | undefined {
  return value === undefined ? undefined : numberOrString(value, path, errors);
}

function boundedInteger(value: unknown, path: string, minimum: number, maximum: number, errors: string[]): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    errors.push(`${path} doit être un entier entre ${minimum} et ${maximum}.`);
    return minimum;
  }
  return value;
}

function boundedNumber(value: unknown, path: string, minimum: number, maximum: number, errors: string[]): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    errors.push(`${path} doit être un nombre entre ${minimum} et ${maximum}.`);
    return minimum;
  }
  return value;
}

function optionalBoolean(value: unknown, path: string, errors: string[]): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  errors.push(`${path} doit être un booléen.`);
  return undefined;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string, errors: string[]): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && allowed.includes(value as T)) return value as T;
  errors.push(`${path} doit valoir ${allowed.join(", ")}.`);
  return undefined;
}

function enumArray<T extends string>(value: unknown, allowed: readonly T[], path: string, errors: string[]): T[] {
  const values = stringArray(value, path, errors);
  return values.flatMap((item) => {
    if (allowed.includes(item as T)) return [item as T];
    errors.push(`${path} contient une valeur inconnue: ${item}.`);
    return [];
  });
}

function isModuleValue(value: unknown): value is ItemModuleValue {
  if (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return true;
  return Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item)));
}

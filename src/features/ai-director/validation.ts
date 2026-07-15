import type {
  AbilityTemplate,
  Character,
  CombatScene,
  EffectTemplate,
  EnemyTemplate,
  ItemInstance,
  ItemTemplate,
} from "../../app/types";
import {
  parseAbilityTemplate,
  parseEffectTemplate,
  parseEnemySpawnInput,
  parseEnemyTemplate,
  parseItemInstanceInput,
  parseItemTemplate,
  validateEffectReferences,
  type ContentCatalogKnownIds,
} from "../content";
import { isItemEquipable } from "../items/itemRules";
import { isCommandAllowedForAgent } from "./commandPermissions";
import { resolveCheckSkill, resolveDifficultyClass } from "./improvisedActions";
import type { AiAgentId, AiDirectorCommand } from "./types";

export interface AiCommandValidation {
  command: AiDirectorCommand;
  status: "ready" | "warning" | "error";
  message: string;
}

export interface AiCommandValidationContext {
  agentId?: AiAgentId;
  characters: Character[];
  selectedCharacterId: string;
  combat: CombatScene;
  itemTemplates: ItemTemplate[];
  itemInstances: ItemInstance[];
  abilityTemplates: AbilityTemplate[];
  effectTemplates: EffectTemplate[];
  enemyTemplates: EnemyTemplate[];
  knownCatalogIds?: ContentCatalogKnownIds;
}

const creationPriority: Partial<Record<AiDirectorCommand["type"], number>> = {
  createEffectTemplate: 10,
  createAbilityTemplate: 20,
  createItemTemplate: 30,
  createEnemyTemplate: 40,
  createItem: 50,
  grantAbility: 50,
  addEnemyToScene: 60,
};

export function orderAiCommandsForExecution(commands: AiDirectorCommand[]): AiDirectorCommand[] {
  return commands
    .map((command, index) => ({ command, index }))
    .sort((left, right) =>
      (creationPriority[left.command.type] ?? 100) - (creationPriority[right.command.type] ?? 100) ||
      left.index - right.index)
    .map(({ command }) => command);
}

export function getAiCommandExecutionPriority(command: AiDirectorCommand): number {
  return creationPriority[command.type] ?? 100;
}

export function isContentCreationCommand(command: AiDirectorCommand): boolean {
  return creationPriority[command.type] !== undefined;
}

export function validateAiCommands(
  commands: AiDirectorCommand[],
  context: AiCommandValidationContext,
): AiCommandValidation[] {
  const evolvingContext: AiCommandValidationContext = {
    ...context,
    itemTemplates: [...context.itemTemplates],
    itemInstances: [...context.itemInstances],
    abilityTemplates: [...context.abilityTemplates],
    effectTemplates: [...context.effectTemplates],
    enemyTemplates: [...context.enemyTemplates],
    knownCatalogIds: collectKnownCatalogIdsForCommands(commands, context),
  };

  return orderAiCommandsForExecution(commands).map((command) => {
    const validation = validateAiCommand(command, evolvingContext);
    if (validation.status !== "error") applyValidatedCreationToContext(command, evolvingContext);
    return validation;
  });
}

function validateAiCommand(
  command: AiDirectorCommand,
  context: AiCommandValidationContext,
): AiCommandValidation {
  if (context.agentId && !isCommandAllowedForAgent(context.agentId, command.type)) {
    return error(command, `Commande "${command.type}" interdite pour cet agent.`);
  }

  if (command.type === "sendNarration") {
    return command.content.trim()
      ? ready(command, "Narration prête à ajouter au chat.")
      : error(command, "Narration vide.");
  }

  if (command.type === "adminCommand") {
    return command.command.trim()
      ? warning(command, `Commande admin libre: ${command.command}`)
      : error(command, "Commande admin vide.");
  }

  if (command.type === "dealDamage" || command.type === "heal") {
    const characterId = resolveCharacterId(command.characterId, context.selectedCharacterId);
    const character = context.characters.find((candidate) => candidate.id === characterId);

    if (!character) {
      return error(command, `Personnage introuvable: ${command.characterId}`);
    }

    if (command.amount <= 0) {
      return error(command, "Le montant doit être positif.");
    }

    return ready(
      command,
      command.type === "dealDamage"
        ? `${character.name} subira ${command.amount} dégâts${command.damageType ? ` ${command.damageType}` : ""}.`
        : `${character.name} récupérera ${command.amount} PV.`,
    );
  }

  if (command.type === "useItem") {
    const character = context.characters.find((candidate) => candidate.id === resolveCharacterId(command.characterId, context.selectedCharacterId));
    const item = context.itemInstances.find((candidate) => candidate.id === command.itemId);

    if (!character) {
      return error(command, `Personnage introuvable: ${command.characterId}`);
    }

    if (!item) {
      return error(command, `Objet introuvable: ${command.itemId}`);
    }

    return warning(command, `${character.name} utilisera ${item.id}. Effet exact validé par le moteur d'objets.`);
  }

  if (command.type === "giveItem") {
    const character = context.characters.find((candidate) => candidate.id === resolveCharacterId(command.characterId, context.selectedCharacterId));
    const template = context.itemTemplates.find((candidate) => candidate.id === command.templateId);

    if (!character) {
      return error(command, `Personnage introuvable: ${command.characterId}`);
    }

    if (!template) {
      return error(command, `Template d'objet introuvable: ${command.templateId}`);
    }

    return ready(command, `${character.name} recevra ${template.name} x${command.quantity ?? 1}.`);
  }

  if (command.type === "pickupItem") {
    const character = context.characters.find((candidate) => candidate.id === resolveCharacterId(command.characterId, context.selectedCharacterId));
    const item = context.itemInstances.find((candidate) => candidate.id === command.itemId);
    const template = item ? context.itemTemplates.find((candidate) => candidate.id === item.templateId) : undefined;

    if (!character) return error(command, `Personnage introuvable: ${command.characterId}`);
    if (!item) return error(command, `Objet introuvable: ${command.itemId}`);
    if (item.location.type !== "world") return error(command, `${template?.name ?? item.id} n'est pas disponible dans le monde.`);

    return ready(command, `${character.name} ramassera ${template?.name ?? item.id}.`);
  }

  if (command.type === "createItem") {
    const catalog = createCatalogContext(context);
    let templateId = command.templateId;
    let inlineTemplate: ItemTemplate | undefined;

    if (command.template) {
      const parsedTemplate = parseItemTemplate(command.template, catalog);
      if (!parsedTemplate.value) return error(command, parsedTemplate.errors.join(" "));
      const duplicate = context.itemTemplates.some((template) => template.id === parsedTemplate.value?.id);
      if (duplicate && command.mode !== "replace") {
        return error(command, `Le template d'objet ${parsedTemplate.value.id} existe déjà; utilise mode=replace pour le remplacer.`);
      }
      templateId = parsedTemplate.value.id;
      inlineTemplate = parsedTemplate.value;
    }

    if (!command.instance) return error(command, "createItem requiert un champ instance.");
    const normalizedInstance = normalizeItemInstanceAliases(command.instance, context.selectedCharacterId);
    const parsedInstance = parseItemInstanceInput(normalizedInstance, templateId);
    if (!parsedInstance.value) return error(command, parsedInstance.errors.join(" "));
    const effectiveTemplates = inlineTemplate
      ? [...context.itemTemplates.filter((template) => template.id !== templateId), inlineTemplate]
      : context.itemTemplates;
    if (!effectiveTemplates.some((template) => template.id === parsedInstance.value?.templateId)) {
      return error(command, `Template d'objet introuvable: ${parsedInstance.value.templateId}`);
    }
    if (parsedInstance.value.id && context.itemInstances.some((item) => item.id === parsedInstance.value?.id)) {
      return error(command, `L'instance ${parsedInstance.value.id} existe déjà.`);
    }
    if (
      parsedInstance.value.location.type !== "world" &&
      !context.characters.some((character) => character.id === parsedInstance.value?.location.parent)
    ) {
      return error(command, `Parent d'inventaire introuvable: ${parsedInstance.value.location.parent ?? "null"}.`);
    }
    const effectiveTemplate = effectiveTemplates.find((template) => template.id === parsedInstance.value?.templateId);
    if (
      parsedInstance.value.location.type === "equipped" &&
      effectiveTemplate &&
      !isItemEquipable([effectiveTemplate.type, ...effectiveTemplate.types])
    ) {
      return error(command, `${effectiveTemplate.name} ne peut pas être créé directement comme objet équipé.`);
    }
    const effectErrors: string[] = [];
    validateEffectReferences(parsedInstance.value.effects, catalog, "itemInstance.effects", effectErrors);
    if (effectErrors.length) return error(command, effectErrors.join(" "));
    return ready(command, `L'instance de ${parsedInstance.value.templateId} sera créée dans ${parsedInstance.value.location.type}.`);
  }

  if (command.type === "destroyItem") {
    const item = context.itemInstances.find((candidate) => candidate.id === command.itemId);

    return item
      ? warning(command, `${item.id} sera supprimé si la commande est exécutée.`)
      : error(command, `Objet introuvable: ${command.itemId}`);
  }

  if (command.type === "modifyItem") {
    const item = context.itemInstances.find((candidate) => candidate.id === command.itemId);
    if (!item) return error(command, `Objet introuvable: ${command.itemId}`);
    if (!isSafeItemModificationPath(command.path)) {
      return error(command, `Chemin de modification interdit: ${command.path}`);
    }
    if (command.path === "quantity" && (typeof command.value !== "number" || command.value < 1)) {
      return error(command, "quantity doit être un nombre supérieur ou égal à 1.");
    }
    return ready(command, `${command.itemId}.${command.path} sera modifié.`);
  }

  if (command.type === "changeCharacterStat") {
    const character = context.characters.find((candidate) => candidate.id === resolveCharacterId(command.characterId, context.selectedCharacterId));

    return character
      ? warning(command, `${character.name}: ${command.stat} ${command.mode === "add" ? `+${command.value}` : `= ${command.value}`}.`)
      : error(command, `Personnage introuvable: ${command.characterId}`);
  }

  if (command.type === "updateCharacterHistory") {
    const character = context.characters.find((candidate) =>
      candidate.id === resolveCharacterId(command.characterId, context.selectedCharacterId));
    return character && command.entry.trim()
      ? ready(command, `Une entrée sera ajoutée à l'historique de ${character.name}.`)
      : error(command, `Personnage introuvable ou entrée vide: ${command.characterId}`);
  }

  if (command.type === "grantAbility") {
    const character = context.characters.find((candidate) =>
      candidate.id === resolveCharacterId(command.characterId, context.selectedCharacterId));
    const template = context.abilityTemplates.find((candidate) => candidate.id === command.templateId);
    if (!character) return error(command, `Personnage introuvable: ${command.characterId}`);
    if (!template) return error(command, `Template de capacité introuvable: ${command.templateId}`);
    return ready(command, `${character.name} recevra la capacité ${template.name}.`);
  }

  if (command.type === "abilityCheck" || command.type === "skillCheck") {
    const character = context.characters.find((candidate) =>
      candidate.id === resolveCharacterId(command.characterId, context.selectedCharacterId));
    if (!character) return error(command, `Personnage introuvable: ${command.characterId}`);
    if (command.dc !== undefined && (command.dc < 5 || command.dc > 35)) {
      return error(command, "Le DD d'un test doit être compris entre 5 et 35.");
    }
    const resolvedSkill = command.skill
      ? resolveCheckSkill(command.skill, command.reason ?? "")
      : undefined;
    if (command.skill && !resolvedSkill) {
      return error(command, `Compétence inconnue ou inadaptée : ${command.skill}. Précisez la méthode ou utilisez une compétence canonique.`);
    }

    return ready(command, `${character.name} recevra une demande de test${resolvedSkill ? ` de ${resolvedSkill}` : ""} DD ${resolveDifficultyClass(undefined, command.dc)}.`);
  }

  if (command.type === "resolveGameAction") {
    const actorId = resolveCharacterId(command.actorId ?? "selected", context.selectedCharacterId);
    const character = context.characters.find((candidate) => candidate.id === actorId);
    if (!character) return error(command, `Personnage introuvable: ${command.actorId ?? "selected"}`);
    if (!command.action.trim()) return error(command, "L'action improvisée est vide.");
    if (command.dc !== undefined && (command.dc < 5 || command.dc > 35)) {
      return error(command, "Le DD d'une improvisation doit être compris entre 5 et 35.");
    }

    const requiredByItem = new Map<string, number>();
    (command.costs ?? []).forEach((cost) =>
      requiredByItem.set(cost.itemId, (requiredByItem.get(cost.itemId) ?? 0) + Math.max(1, Math.round(cost.quantity))));
    for (const [itemId, quantity] of requiredByItem) {
      const item = context.itemInstances.find((candidate) => candidate.id === itemId);
      if (!item || item.location.parent !== actorId || item.quantity < quantity) {
        return error(command, `Composante indisponible ou insuffisante: ${itemId} x${quantity}.`);
      }
    }

    const resolvedSkill = resolveCheckSkill(command.skill, command.action, command.method);
    if (command.skill && !resolvedSkill) {
      return error(command, `Compétence inconnue ou inadaptée : ${command.skill}. Précisez la méthode ou utilisez une compétence canonique.`);
    }
    const dc = resolveDifficultyClass(command.difficulty, command.dc);
    return ready(command, `${character.name} recevra une demande de test${resolvedSkill ? ` de ${resolvedSkill}` : ""} pour « ${command.action} » contre DD ${dc}.`);
  }

  if (command.type === "contestCheck" || command.type === "calculateHazardDamage") {
    return error(command, "Cette résolution structurée nécessite encore une conversion en commande moteur dédiée.");
  }

  if (command.type === "createEffectTemplate") {
    const parsed = parseEffectTemplate(command.template);
    if (!parsed.value) return error(command, parsed.errors.join(" "));
    return validateCatalogDuplicate(command, parsed.value, context.effectTemplates, "effet");
  }

  if (command.type === "createAbilityTemplate") {
    const parsed = parseAbilityTemplate(command.template, createCatalogContext(context));
    if (!parsed.value) return error(command, parsed.errors.join(" "));
    return validateCatalogDuplicate(command, parsed.value, context.abilityTemplates, "capacité");
  }

  if (command.type === "createItemTemplate") {
    const parsed = parseItemTemplate(command.template, createCatalogContext(context));
    if (!parsed.value) return error(command, parsed.errors.join(" "));
    return validateCatalogDuplicate(command, parsed.value, context.itemTemplates, "objet");
  }

  if (command.type === "createEnemyTemplate") {
    const parsed = parseEnemyTemplate(command.template, createCatalogContext(context));
    if (!parsed.value) return error(command, parsed.errors.join(" "));
    return validateCatalogDuplicate(command, parsed.value, context.enemyTemplates, "ennemi");
  }

  if (command.type === "addEnemyToScene") {
    if (!command.enemyTemplateId) return error(command, "addEnemyToScene requiert enemyTemplateId.");
    const template = context.enemyTemplates.find((candidate) => candidate.id === command.enemyTemplateId);
    if (!template) return error(command, `Template d'ennemi introuvable: ${command.enemyTemplateId}`);
    const parsed = parseEnemySpawnInput({
      ...(command.enemy ?? {}),
      ...(command.position ? { position: command.position } : {}),
    });
    if (!parsed.value) return error(command, parsed.errors.join(" "));
    return ready(command, `${parsed.value.name ?? template.name} sera ajouté à la scène.`);
  }

  if (
    command.type === "createCombatScene" ||
    command.type === "createCombatTerrain" ||
    command.type === "createTacticalElementTemplate" ||
    command.type === "createTerrainTemplate"
  ) {
    return error(command, "Ce type de création tactique n'a pas encore de schéma moteur stable.");
  }

  if (command.type === "moveCombatant") {
    const combatant = context.combat.combatants.find((candidate) => candidate.id === command.combatantId);

    if (!combatant) {
      return error(command, `Combattant introuvable: ${command.combatantId}`);
    }

    if (
      command.to.x < 0 ||
      command.to.y < 0 ||
      command.to.x > context.combat.map.width ||
      command.to.y > context.combat.map.height
    ) {
      return error(command, "Position hors carte.");
    }

    return ready(command, `${combatant.name} sera déplacé vers ${command.to.x.toFixed(1)}, ${command.to.y.toFixed(1)}.`);
  }

  if (command.type === "revealMapDetail" || command.type === "hideMapDetail") {
    const detail = context.combat.map.details?.find((candidate) => candidate.id === command.detailId);

    if (!detail) {
      return error(command, `Détail de carte introuvable: ${command.detailId}`);
    }

    return ready(command, `${detail.name} sera ${command.type === "revealMapDetail" ? "révélé" : "masqué"}.`);
  }

  if (command.type === "roll") {
    return command.formula.trim()
      ? ready(command, `Jet prévu: ${command.formula}.`)
      : error(command, "Formule de jet vide.");
  }

  if (command.type === "startCombat") {
    return ready(command, "Le combat sera démarré.");
  }

  if (command.type === "endCombat") {
    return ready(command, "Le combat sera terminé.");
  }

  if (command.type === "nextCombatTurn") {
    return ready(command, "Le tour de combat avancera.");
  }

  return error(command, "Commande inconnue.");
}

function createCatalogContext(context: AiCommandValidationContext) {
  return {
    effectTemplates: context.effectTemplates,
    abilityTemplates: context.abilityTemplates,
    itemTemplates: context.itemTemplates,
    enemyTemplates: context.enemyTemplates,
    knownIds: context.knownCatalogIds,
  };
}

export function collectKnownCatalogIdsForCommands(
  commands: AiDirectorCommand[],
  context: Pick<
    AiCommandValidationContext,
    "effectTemplates" | "abilityTemplates" | "itemTemplates" | "enemyTemplates"
  >,
): ContentCatalogKnownIds {
  const effectTemplateIds = new Set(context.effectTemplates.map((template) => template.id));
  const abilityTemplateIds = new Set(context.abilityTemplates.map((template) => template.id));
  const itemTemplateIds = new Set(context.itemTemplates.map((template) => template.id));
  const enemyTemplateIds = new Set(context.enemyTemplates.map((template) => template.id));

  commands.forEach((command) => {
    const id = getPlannedTemplateId(command);
    if (!id) return;
    if (command.type === "createEffectTemplate") effectTemplateIds.add(id);
    if (command.type === "createAbilityTemplate") abilityTemplateIds.add(id);
    if (command.type === "createItemTemplate" || command.type === "createItem") itemTemplateIds.add(id);
    if (command.type === "createEnemyTemplate") enemyTemplateIds.add(id);
  });

  return { effectTemplateIds, abilityTemplateIds, itemTemplateIds, enemyTemplateIds };
}

function getPlannedTemplateId(command: AiDirectorCommand): string | null {
  if (command.type === "createItem" && !command.template) return command.templateId ?? null;
  if (
    command.type !== "createEffectTemplate" &&
    command.type !== "createAbilityTemplate" &&
    command.type !== "createItemTemplate" &&
    command.type !== "createEnemyTemplate" &&
    command.type !== "createItem"
  ) {
    return null;
  }
  return command.template && typeof command.template.id === "string" ? command.template.id : null;
}

function validateCatalogDuplicate<T extends { id: string }>(
  command: AiDirectorCommand & { mode?: "create" | "replace" },
  template: T,
  catalog: T[],
  label: string,
): AiCommandValidation {
  const exists = catalog.some((candidate) => candidate.id === template.id);
  if (exists && command.mode !== "replace") {
    return error(command, `Le template ${label} ${template.id} existe déjà; utilise mode=replace pour le remplacer.`);
  }
  return ready(
    command,
    exists ? `Le template ${label} ${template.id} sera remplacé.` : `Le template ${label} ${template.id} sera créé.`,
  );
}

function normalizeItemInstanceAliases(
  instance: Record<string, unknown>,
  selectedCharacterId: string,
): Record<string, unknown> {
  const locationSource = instance.location && typeof instance.location === "object" && !Array.isArray(instance.location)
    ? instance.location as Record<string, unknown>
    : { type: "inventory", parent: selectedCharacterId };
  return {
    ...instance,
    location: {
      ...locationSource,
      parent: locationSource.parent === "selected" ? selectedCharacterId : locationSource.parent,
    },
  };
}

function isSafeItemModificationPath(path: string): boolean {
  return path === "quantity" ||
    path === "name" ||
    path === "description" ||
    path.startsWith("base.") ||
    path.startsWith("overrides.") ||
    path.startsWith("current.") ||
    path.startsWith("data.");
}

function replaceById<T extends { id: string }>(catalog: T[], template: T): T[] {
  return [...catalog.filter((candidate) => candidate.id !== template.id), template];
}

function applyValidatedCreationToContext(
  command: AiDirectorCommand,
  context: AiCommandValidationContext,
): void {
  const catalog = createCatalogContext(context);

  if (command.type === "createEffectTemplate") {
    const parsed = parseEffectTemplate(command.template).value;
    if (parsed) context.effectTemplates = replaceById(context.effectTemplates, parsed);
    return;
  }
  if (command.type === "createAbilityTemplate") {
    const parsed = parseAbilityTemplate(command.template, catalog).value;
    if (parsed) context.abilityTemplates = replaceById(context.abilityTemplates, parsed);
    return;
  }
  if (command.type === "createItemTemplate") {
    const parsed = parseItemTemplate(command.template, catalog).value;
    if (parsed) context.itemTemplates = replaceById(context.itemTemplates, parsed);
    return;
  }
  if (command.type === "createEnemyTemplate") {
    const parsed = parseEnemyTemplate(command.template, catalog).value;
    if (parsed) context.enemyTemplates = replaceById(context.enemyTemplates, parsed);
    return;
  }
  if (command.type === "createItem") {
    let templateId = command.templateId;
    if (command.template) {
      const parsedTemplate = parseItemTemplate(command.template, catalog).value;
      if (parsedTemplate) {
        context.itemTemplates = replaceById(context.itemTemplates, parsedTemplate);
        templateId = parsedTemplate.id;
      }
    }
    if (command.instance) {
      const parsedInstance = parseItemInstanceInput(
        normalizeItemInstanceAliases(command.instance, context.selectedCharacterId),
        templateId,
      ).value;
      if (parsedInstance) {
        context.itemInstances = [...context.itemInstances, {
          id: parsedInstance.id ?? `validation-item-${context.itemInstances.length}`,
          templateId: parsedInstance.templateId,
          quantity: parsedInstance.quantity,
          overrides: parsedInstance.overrides,
          current: parsedInstance.current,
          data: parsedInstance.data,
          effects: parsedInstance.effects,
          location: parsedInstance.location,
        }];
      }
    }
  }
}

function resolveCharacterId(characterId: string, selectedCharacterId: string): string {
  return characterId === "selected" ? selectedCharacterId : characterId;
}

function ready(command: AiDirectorCommand, message: string): AiCommandValidation {
  return { command, status: "ready", message };
}

function warning(command: AiDirectorCommand, message: string): AiCommandValidation {
  return { command, status: "warning", message };
}

function error(command: AiDirectorCommand, message: string): AiCommandValidation {
  return { command, status: "error", message };
}

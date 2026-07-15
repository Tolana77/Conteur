import { executeAdminCommand, type AdminCommandResult } from "../admin/adminCommands";
import type { GameState } from "../../store/useGameStore";
import type { AiPromptSnapshot } from "./promptBuilder";
import type { AiDirectorCommand } from "./types";
import { executeImprovisedCheck } from "./improvisedActions";
import {
  parseAbilityTemplate,
  parseEffectTemplate,
  parseEnemySpawnInput,
  parseEnemyTemplate,
  parseItemInstanceInput,
  parseItemTemplate,
  type ContentCatalogKnownIds,
} from "../content";

type AiExecutionActions = Pick<
  GameState,
  | "addGmMessage"
  | "dealDamage"
  | "healCharacter"
  | "setCharacterPv"
  | "changeCharacterStat"
  | "equipItem"
  | "unequipItem"
  | "giveItem"
  | "pickupItem"
  | "removeItem"
  | "modifyItemField"
  | "useItem"
  | "useAbility"
  | "rechargeAbility"
  | "setAbilityCharges"
  | "rest"
  | "startEncounter"
  | "startCombat"
  | "endCombat"
  | "addCharacterToCombat"
  | "addEntityToCombat"
  | "revealMapDetail"
  | "hideMapDetail"
  | "moveCombatant"
  | "nextCombatTurn"
  | "rollFormula"
  | "spendItemQuantity"
  | "recordCampaignEvent"
  | "registerEffectTemplate"
  | "registerItemTemplate"
  | "registerAbilityTemplate"
  | "registerEnemyTemplate"
  | "createItemInstance"
  | "grantAbilityToCharacter"
  | "spawnEnemyFromTemplate"
  | "appendCharacterHistory"
>;

export function executeAiCommand(
  command: AiDirectorCommand,
  snapshot: AiPromptSnapshot,
  actions: AiExecutionActions,
  options: { knownCatalogIds?: ContentCatalogKnownIds } = {},
): AdminCommandResult & { command: string } {
  if (command.type === "sendNarration") {
    actions.addGmMessage(command.content);
    return { status: "success", message: "Narration ajoutée au chat.", command: "sendNarration" };
  }

  if (command.type === "abilityCheck" || command.type === "skillCheck" || command.type === "resolveGameAction") {
    return executeImprovisedCheck(command, {
      characters: snapshot.characters,
      selectedCharacterId: snapshot.selectedCharacterId,
      derivedScores: snapshot.characterDerivedScores,
      itemInstances: snapshot.itemInstances,
      itemTemplates: snapshot.itemTemplates,
      rollFormula: actions.rollFormula,
      spendItemQuantity: actions.spendItemQuantity,
      recordCampaignEvent: actions.recordCampaignEvent,
    });
  }

  if (command.type === "modifyItem") {
    const success = actions.modifyItemField(command.itemId, command.path, command.value);
    return {
      status: success ? "success" : "error",
      message: success
        ? `${command.itemId}.${command.path} a été modifié.`
        : `Impossible de modifier ${command.itemId}.${command.path}.`,
      command: command.type,
    };
  }

  if (command.type === "updateCharacterHistory") {
    const characterId = command.characterId === "selected"
      ? snapshot.selectedCharacterId
      : command.characterId;
    const success = actions.appendCharacterHistory(characterId, command.entry);
    return {
      status: success ? "success" : "error",
      message: success ? `Historique de ${characterId} mis à jour.` : `Historique de ${characterId} non modifié.`,
      command: command.type,
    };
  }

  const catalogContext = {
    effectTemplates: snapshot.effectTemplates,
    abilityTemplates: snapshot.abilityTemplates,
    itemTemplates: snapshot.itemTemplates,
    enemyTemplates: snapshot.enemyTemplates,
    knownIds: options.knownCatalogIds,
  };

  if (command.type === "createEffectTemplate") {
    const parsed = parseEffectTemplate(command.template);
    if (!parsed.value) return executionError(command, parsed.errors);
    const success = actions.registerEffectTemplate(parsed.value, command.mode, { source: "ai" });
    return creationResult(command, success, `Effet ${parsed.value.name}`);
  }

  if (command.type === "createAbilityTemplate") {
    const parsed = parseAbilityTemplate(command.template, catalogContext);
    if (!parsed.value) return executionError(command, parsed.errors);
    const success = actions.registerAbilityTemplate(parsed.value, command.mode, { source: "ai" });
    return creationResult(command, success, `Capacité ${parsed.value.name}`);
  }

  if (command.type === "createItemTemplate") {
    const parsed = parseItemTemplate(command.template, catalogContext);
    if (!parsed.value) return executionError(command, parsed.errors);
    const success = actions.registerItemTemplate(parsed.value, command.mode, { source: "ai" });
    return creationResult(command, success, `Template d'objet ${parsed.value.name}`);
  }

  if (command.type === "createEnemyTemplate") {
    const parsed = parseEnemyTemplate(command.template, catalogContext);
    if (!parsed.value) return executionError(command, parsed.errors);
    const success = actions.registerEnemyTemplate(parsed.value, command.mode, { source: "ai" });
    return creationResult(command, success, `Ennemi ${parsed.value.name}`);
  }

  if (command.type === "createItem") {
    let templateId = command.templateId;
    let inlineTemplate = null;
    if (command.template) {
      const parsedTemplate = parseItemTemplate(command.template, catalogContext);
      if (!parsedTemplate.value) return executionError(command, parsedTemplate.errors);
      inlineTemplate = parsedTemplate.value;
      templateId = parsedTemplate.value.id;
    }
    if (!command.instance) return executionError(command, ["Le champ instance est requis."]);
    const instanceSource = normalizeItemInstanceAliases(command.instance, snapshot.selectedCharacterId);
    const parsedInstance = parseItemInstanceInput(instanceSource, templateId);
    if (!parsedInstance.value) return executionError(command, parsedInstance.errors);
    if (inlineTemplate && !actions.registerItemTemplate(inlineTemplate, command.mode, { source: "ai" })) {
      return creationResult(command, false, `Template d'objet ${inlineTemplate.name}`);
    }
    const item = actions.createItemInstance(parsedInstance.value);
    return item
      ? { status: "success", message: `Objet ${item.id} créé depuis ${item.templateId}.`, command: command.type }
      : { status: "error", message: "L'instance d'objet n'a pas pu être créée.", command: command.type };
  }

  if (command.type === "grantAbility") {
    const characterId = command.characterId === "selected"
      ? snapshot.selectedCharacterId
      : command.characterId;
    const ability = actions.grantAbilityToCharacter(characterId, command.templateId);
    return ability
      ? { status: "success", message: `Capacité ${command.templateId} accordée à ${characterId}.`, command: command.type }
      : { status: "error", message: "La capacité n'a pas pu être accordée.", command: command.type };
  }

  if (command.type === "addEnemyToScene") {
    if (!command.enemyTemplateId) return executionError(command, ["enemyTemplateId est requis."]);
    const parsed = parseEnemySpawnInput({
      ...(command.enemy ?? {}),
      ...(command.position ? { position: command.position } : {}),
    });
    if (!parsed.value) return executionError(command, parsed.errors);
    const combatantId = actions.spawnEnemyFromTemplate(command.enemyTemplateId, parsed.value);
    return combatantId
      ? { status: "success", message: `${command.enemyTemplateId} ajouté à la scène (${combatantId}).`, command: command.type }
      : { status: "error", message: "L'ennemi n'a pas pu être ajouté à la scène.", command: command.type };
  }

  const adminCommand = toAdminCommand(command);
  if (!adminCommand) {
    return { status: "error", message: "Commande non exécutable.", command: JSON.stringify(command) };
  }

  const result = executeAdminCommand(adminCommand, {
    characters: snapshot.characters,
    selectedCharacterId: snapshot.selectedCharacterId,
    itemTemplates: snapshot.itemTemplates,
    itemInstances: snapshot.itemInstances,
    abilityTemplates: snapshot.abilityTemplates,
    abilityInstances: snapshot.abilityInstances,
    combat: snapshot.combat,
    dealDamage: actions.dealDamage,
    healCharacter: actions.healCharacter,
    setCharacterPv: actions.setCharacterPv,
    changeCharacterStat: actions.changeCharacterStat,
    equipItem: actions.equipItem,
    unequipItem: actions.unequipItem,
    giveItem: actions.giveItem,
    pickupItem: actions.pickupItem,
    removeItem: actions.removeItem,
    useItem: actions.useItem,
    useAbility: actions.useAbility,
    rechargeAbility: actions.rechargeAbility,
    setAbilityCharges: actions.setAbilityCharges,
    rest: actions.rest,
    startEncounter: actions.startEncounter,
    startCombat: actions.startCombat,
    endCombat: actions.endCombat,
    addCharacterToCombat: actions.addCharacterToCombat,
    addEntityToCombat: actions.addEntityToCombat,
    revealMapDetail: actions.revealMapDetail,
    hideMapDetail: actions.hideMapDetail,
    moveCombatant: actions.moveCombatant,
    nextCombatTurn: actions.nextCombatTurn,
    rollFormula: actions.rollFormula,
  });

  return { ...result, command: adminCommand };
}

function normalizeItemInstanceAliases(
  instance: Record<string, unknown>,
  selectedCharacterId: string,
): Record<string, unknown> {
  const location = instance.location && typeof instance.location === "object" && !Array.isArray(instance.location)
    ? instance.location as Record<string, unknown>
    : { type: "inventory", parent: selectedCharacterId };
  return {
    ...instance,
    location: {
      ...location,
      parent: location.parent === "selected" ? selectedCharacterId : location.parent,
    },
  };
}

function executionError(
  command: AiDirectorCommand,
  errors: string[],
): AdminCommandResult & { command: string } {
  return { status: "error", message: errors.join(" "), command: command.type };
}

function creationResult(
  command: AiDirectorCommand,
  success: boolean,
  label: string,
): AdminCommandResult & { command: string } {
  return {
    status: success ? "success" : "error",
    message: success ? `${label} créé et enregistré.` : `${label} existe déjà ou n'a pas pu être enregistré.`,
    command: command.type,
  };
}

function toAdminCommand(command: AiDirectorCommand): string | null {
  if (command.type === "adminCommand") return command.command;
  if (command.type === "dealDamage") return `dealDamage ${command.characterId} ${command.amount} ${command.damageType ?? "force"}`;
  if (command.type === "heal") return `heal ${command.characterId} ${command.amount}`;
  if (command.type === "useItem") return `useItem ${command.itemId}`;
  if (command.type === "giveItem") return `giveItem ${command.characterId} ${command.templateId} ${command.quantity ?? 1}`;
  if (command.type === "pickupItem") return `pickupItem ${command.characterId} ${command.itemId}`;
  if (command.type === "destroyItem") return `removeItem ${command.itemId}`;

  if (command.type === "changeCharacterStat") {
    const value = command.mode === "add" && command.value >= 0 ? `+${command.value}` : String(command.value);
    return `changeStat ${command.characterId} ${command.stat} ${value}`;
  }

  if (command.type === "moveCombatant") return `moveCombatant ${command.combatantId} ${command.to.x} ${command.to.y}`;
  if (command.type === "revealMapDetail") return `revealDetail ${command.detailId}`;
  if (command.type === "hideMapDetail") return `hideDetail ${command.detailId}`;

  if (command.type === "roll") {
    const reason = command.reason ? ` "${command.reason.replace(/"/g, "'")}"` : "";
    return `roll "${command.formula.replace(/"/g, "'")}" ${command.visibility ?? "public"}${reason}`;
  }

  if (command.type === "startCombat") return "startCombat";
  if (command.type === "endCombat") return "endCombat";
  if (command.type === "nextCombatTurn") return "nextTurn";
  return null;
}

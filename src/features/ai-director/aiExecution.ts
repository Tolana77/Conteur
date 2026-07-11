import { executeAdminCommand, type AdminCommandResult } from "../admin/adminCommands";
import type { GameState } from "../../store/useGameStore";
import type { AiPromptSnapshot } from "./promptBuilder";
import type { AiDirectorCommand } from "./types";

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
  | "removeItem"
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
>;

export function executeAiCommand(
  command: AiDirectorCommand,
  snapshot: AiPromptSnapshot,
  actions: AiExecutionActions,
): AdminCommandResult & { command: string } {
  if (command.type === "sendNarration") {
    actions.addGmMessage(command.content);
    return { status: "success", message: "Narration ajoutée au chat.", command: "sendNarration" };
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

function toAdminCommand(command: AiDirectorCommand): string | null {
  if (command.type === "adminCommand") return command.command;
  if (command.type === "dealDamage") return `dealDamage ${command.characterId} ${command.amount} ${command.damageType ?? "force"}`;
  if (command.type === "heal") return `heal ${command.characterId} ${command.amount}`;
  if (command.type === "useItem") return `useItem ${command.itemId}`;
  if (command.type === "giveItem") return `giveItem ${command.characterId} ${command.templateId} ${command.quantity ?? 1}`;
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

import type { Character, CombatScene, ItemInstance, ItemTemplate } from "../../app/types";
import { isCommandAllowedForAgent } from "./commandPermissions";
import type { AiAgentId, AiDirectorCommand } from "./types";

export interface AiCommandValidation {
  command: AiDirectorCommand;
  status: "ready" | "warning" | "error";
  message: string;
}

export function validateAiCommands(
  commands: AiDirectorCommand[],
  context: {
    agentId?: AiAgentId;
    characters: Character[];
    selectedCharacterId: string;
    combat: CombatScene;
    itemTemplates: ItemTemplate[];
    itemInstances: ItemInstance[];
  },
): AiCommandValidation[] {
  return commands.map((command) => validateAiCommand(command, context));
}

function validateAiCommand(
  command: AiDirectorCommand,
  context: {
    agentId?: AiAgentId;
    characters: Character[];
    selectedCharacterId: string;
    combat: CombatScene;
    itemTemplates: ItemTemplate[];
    itemInstances: ItemInstance[];
  },
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

  if (command.type === "createItem") {
    return error(command, "Création d'objet non exécutable directement pour l'instant. À placer dans proposedCommands ou convertir en commande moteur dédiée.");
  }

  if (command.type === "destroyItem") {
    const item = context.itemInstances.find((candidate) => candidate.id === command.itemId);

    return item
      ? warning(command, `${item.id} sera supprimé si la commande est exécutée.`)
      : error(command, `Objet introuvable: ${command.itemId}`);
  }

  if (command.type === "modifyItem") {
    return error(command, "Modification fine d'objet non exécutable directement pour l'instant. À placer dans proposedCommands.");
  }

  if (command.type === "changeCharacterStat") {
    const character = context.characters.find((candidate) => candidate.id === resolveCharacterId(command.characterId, context.selectedCharacterId));

    return character
      ? warning(command, `${character.name}: ${command.stat} ${command.mode === "add" ? `+${command.value}` : `= ${command.value}`}.`)
      : error(command, `Personnage introuvable: ${command.characterId}`);
  }

  if (command.type === "updateCharacterHistory") {
    return error(command, "Historique joueur non exécutable directement pour l'instant. À placer dans proposedCommands.");
  }

  if (
    command.type === "abilityCheck" ||
    command.type === "skillCheck" ||
    command.type === "contestCheck" ||
    command.type === "resolveGameAction" ||
    command.type === "calculateHazardDamage"
  ) {
    return error(command, "Commande d'action structurée non exécutable directement. Utilise roll pour un jet final, ou garde cette commande en proposedCommands.");
  }

  if (
    command.type === "createCombatScene" ||
    command.type === "createCombatTerrain" ||
    command.type === "addEnemyToScene" ||
    command.type === "createEnemyTemplate" ||
    command.type === "createTacticalElementTemplate" ||
    command.type === "createTerrainTemplate" ||
    command.type === "createItemTemplate" ||
    command.type === "createEffectTemplate" ||
    command.type === "createAbilityTemplate"
  ) {
    return error(command, "Commande de création non exécutable directement pour l'instant. À placer dans proposedCommands pour validation.");
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

import type { AiAgentId, AiDirectorCommand } from "./types";

export type AiCommandType = AiDirectorCommand["type"];

interface AiCommandSchema {
  type: AiCommandType;
  schema: string;
  description: string;
}

export const aiCommandSchemas: AiCommandSchema[] = [
  { type: "sendNarration", schema: "{ type, content }", description: "Ajoute un texte visible dans le chat." },
  { type: "adminCommand", schema: "{ type, command, reason? }", description: "Commande libre réservée aux tests." },
  { type: "dealDamage", schema: "{ type, characterId, amount, damageType? }", description: "Inflige des dégâts à une fiche." },
  { type: "heal", schema: "{ type, characterId, amount }", description: "Soigne une fiche." },
  { type: "useItem", schema: "{ type, characterId, itemId, targetId? }", description: "Utilise un objet possédé." },
  { type: "giveItem", schema: "{ type, characterId, templateId, quantity? }", description: "Ajoute un objet existant à un inventaire." },
  { type: "pickupItem", schema: "{ type, characterId, itemId }", description: "Transfère dans le sac une instance déjà présente dans le monde." },
  { type: "createItem", schema: "{ type, templateId?, template?, instance?, reason? }", description: "Propose la création d'un template ou d'une instance d'objet." },
  { type: "destroyItem", schema: "{ type, itemId, reason? }", description: "Supprime une instance d'objet." },
  { type: "modifyItem", schema: "{ type, itemId, path, value, reason? }", description: "Modifie un champ précis d'une instance d'objet." },
  { type: "changeCharacterStat", schema: "{ type, characterId, stat, value, mode, reason? }", description: "Modifie une caractéristique ou stat de fiche." },
  { type: "updateCharacterHistory", schema: "{ type, characterId, entry, visibility? }", description: "Ajoute une entrée à l'historique du personnage." },
  { type: "abilityCheck", schema: "{ type, characterId, stat, dc?, skill?, visibility?, reason? }", description: "Demande un test de caractéristique." },
  { type: "skillCheck", schema: "{ type, characterId, skill, stat?, dc?, visibility?, reason? }", description: "Demande un test de compétence." },
  { type: "contestCheck", schema: "{ type, actorId, targetId, actorFormula, targetFormula, reason? }", description: "Résout un duel opposé." },
  {
    type: "resolveGameAction",
    schema: "{ type, actorId?, action, method?, desiredOutcome?, difficulty: routine|plausible|difficult|extreme|legendary, stat?, skill?, dc?, stakes?, costs?: [{ itemId, quantity, timing?: attempt|success }], outcomes?: { critical?, success?, partial?, failure? }, visibility? }",
    description: "Résout localement une improvisation par un test gradué et journalisé.",
  },
  { type: "calculateHazardDamage", schema: "{ type, hazard, formula, damageType?, save? }", description: "Calcule un danger: chute, piège, environnement." },
  { type: "createCombatScene", schema: "{ type, scene, reason? }", description: "Propose une scène de combat complète." },
  { type: "createCombatTerrain", schema: "{ type, terrain, reason? }", description: "Propose terrain, obstacles, zones et détails de carte." },
  { type: "addEnemyToScene", schema: "{ type, enemyTemplateId?, enemy?, position?, reason? }", description: "Propose l'ajout ou le placement d'un ennemi." },
  { type: "createEnemyTemplate", schema: "{ type, template, reason? }", description: "Crée un template d'ennemi réutilisable." },
  { type: "createTacticalElementTemplate", schema: "{ type, template, reason? }", description: "Crée un template de piège, obstacle, danger ou détail tactique." },
  { type: "createTerrainTemplate", schema: "{ type, template, reason? }", description: "Crée un template de terrain réutilisable." },
  { type: "createItemTemplate", schema: "{ type, template, reason? }", description: "Crée un template d'objet d'inventaire." },
  { type: "createEffectTemplate", schema: "{ type, template, reason? }", description: "Crée un template d'effet réutilisable." },
  { type: "createAbilityTemplate", schema: "{ type, template, reason? }", description: "Crée un template de capacité." },
  { type: "moveCombatant", schema: "{ type, combatantId, to: { x, y } }", description: "Déplace un combattant." },
  { type: "revealMapDetail", schema: "{ type, detailId }", description: "Révèle un détail de carte." },
  { type: "hideMapDetail", schema: "{ type, detailId }", description: "Masque un détail de carte." },
  { type: "roll", schema: "{ type, formula, visibility?, reason? }", description: "Lance une formule de dés." },
  { type: "startCombat", schema: "{ type }", description: "Démarre le combat." },
  { type: "endCombat", schema: "{ type }", description: "Termine le combat." },
  { type: "nextCombatTurn", schema: "{ type }", description: "Passe au tour suivant." },
];

const domainCommandPermissions: Record<AiAgentId, AiCommandType[]> = {
  requestAnalyzer: [],
  characterManager: [
    "useItem",
    "pickupItem",
    "destroyItem",
    "modifyItem",
    "changeCharacterStat",
    "updateCharacterHistory",
    "heal",
  ],
  actionManager: [
    "roll",
    "abilityCheck",
    "skillCheck",
    "contestCheck",
    "resolveGameAction",
    "calculateHazardDamage",
  ],
  combatManager: [
    "dealDamage",
    "moveCombatant",
    "startCombat",
    "endCombat",
    "nextCombatTurn",
    "revealMapDetail",
    "hideMapDetail",
  ],
  combatSetupManager: [
    "createCombatScene",
    "createCombatTerrain",
    "addEnemyToScene",
    "startCombat",
  ],
  tacticalTemplateManager: [
    "createEnemyTemplate",
    "createTacticalElementTemplate",
    "createTerrainTemplate",
  ],
  assetTemplateManager: [
    "createItemTemplate",
    "createEffectTemplate",
    "createAbilityTemplate",
    "createItem",
  ],
  worldManager: [
    "revealMapDetail",
    "hideMapDetail",
    "skillCheck",
    "resolveGameAction",
  ],
  narrationManager: [
    "sendNarration",
  ],
  rulesValidator: [],
};

export function getAllowedCommandTypes(agentId: AiAgentId): AiCommandType[] {
  return domainCommandPermissions[agentId];
}

export function isCommandAllowedForAgent(agentId: AiAgentId, commandType: AiCommandType): boolean {
  return domainCommandPermissions[agentId].includes(commandType);
}

export function getAgentCommandSchemaText(agentId: AiAgentId): string {
  const allowed = new Set(getAllowedCommandTypes(agentId));
  const schemas = aiCommandSchemas.filter((command) => allowed.has(command.type));

  if (schemas.length === 0) {
    return "Aucune commande autorisée pour cet agent. Utilise seulement draftPatch, warnings, questions ou suggestedAgents selon ton rôle.";
  }

  return schemas
    .map((command) => `- ${command.type}: ${command.schema} — ${command.description}`)
    .join("\n");
}

export function getAllCommandTypes(): AiCommandType[] {
  return aiCommandSchemas.map((command) => command.type);
}

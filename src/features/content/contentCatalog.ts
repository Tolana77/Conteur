import type { EffectOperationId } from "../../app/types";

export interface EffectOperationDefinition {
  id: EffectOperationId;
  name: string;
  description: string;
  requiredVariables: string[];
  optionalVariables: string[];
}

export const effectOperationCatalog: EffectOperationDefinition[] = [
  { id: "damage", name: "Dégâts", description: "Inflige des dégâts typés.", requiredVariables: ["value", "damageType"], optionalVariables: ["level", "perLevel"] },
  { id: "randomDamage", name: "Dégâts aléatoires", description: "Inflige des dégâts dont le type est choisi dans une liste.", requiredVariables: ["value", "damageTypes"], optionalVariables: ["level", "perLevel"] },
  { id: "heal", name: "Soin", description: "Rend des PV.", requiredVariables: ["value"], optionalVariables: ["level", "perLevel"] },
  { id: "modifyStat", name: "Modifier une caractéristique", description: "Bonus ou malus passif d'un objet équipé.", requiredVariables: ["stat", "value"], optionalVariables: [] },
  { id: "reduceDamage", name: "Résistance", description: "Réduit les dégâts reçus d'un type.", requiredVariables: ["damageType", "value"], optionalVariables: ["minDamage"] },
  { id: "preventUnequip", name: "Lien", description: "Empêche de déséquiper l'objet.", requiredVariables: [], optionalVariables: [] },
  { id: "inventoryInteraction", name: "Interaction d'inventaire", description: "Consomme ou ajoute un autre objet par template.", requiredVariables: ["requiredTemplateId"], optionalVariables: ["consumeRequired", "addTemplateId", "quantity"] },
  { id: "grantAbility", name: "Capacité accordée", description: "Accorde une capacité quand l'objet est équipé.", requiredVariables: ["abilityTemplateId"], optionalVariables: [] },
  { id: "applyCondition", name: "Appliquer un état", description: "Ajoute un état standardisé.", requiredVariables: ["condition"], optionalVariables: ["duration"] },
  { id: "removeCondition", name: "Retirer un état", description: "Retire un état standardisé.", requiredVariables: ["condition"], optionalVariables: [] },
  { id: "teleport", name: "Téléportation", description: "Téléporte vers la destination ciblée.", requiredVariables: ["range"], optionalVariables: ["value"] },
  { id: "move", name: "Déplacement forcé", description: "Déplace une cible vers la destination ciblée.", requiredVariables: ["distance"], optionalVariables: [] },
  { id: "createZone", name: "Créer une zone", description: "Ajoute une zone sur la carte.", requiredVariables: ["zoneKind"], optionalVariables: ["radius", "damage", "damageType", "condition", "color", "trigger", "name", "description", "rule"] },
  { id: "modifyResource", name: "Modifier une ressource", description: "Modifie action, bonus, réaction ou mouvement en combat.", requiredVariables: ["resource", "op", "value"], optionalVariables: [] },
  { id: "summon", name: "Invocation", description: "Ajoute une instance d'ennemi ou d'allié depuis un template.", requiredVariables: ["enemyTemplateId"], optionalVariables: ["count", "side"] },
  { id: "dispel", name: "Dissipation", description: "Retire un état ou une zone correspondant à un identifiant.", requiredVariables: [], optionalVariables: ["condition", "zoneKind"] },
];

export { initialEffectTemplates } from "./effectTemplates";
export { initialEnemyTemplates } from "./enemyTemplates";

import type { EffectOperationId, EffectTemplate, EnemyTemplate } from "../../app/types";

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

export const initialEffectTemplates: EffectTemplate[] = [
  {
    id: "effect-ember-burst",
    name: "Décharge de braise",
    description: "Une décharge de feu réutilisable par les objets et capacités.",
    tags: ["fire", "damage", "magic"],
    actions: [{ operation: "damage", variables: { value: "1d6 + INT", damageType: "feu" } }],
  },
];

export const initialEnemyTemplates: EnemyTemplate[] = [
  {
    id: "enemy-palace-guard",
    name: "Garde du palais",
    description: "Soldat discipliné entraîné à contenir les intrusions et protéger les dignitaires.",
    level: 1,
    category: "humanoid",
    tags: ["human", "guard", "law"],
    hp: 12,
    defense: 13,
    initiative: 1,
    speed: 9,
    reach: 1.5,
    attacks: [{
      id: "guard-spear",
      name: "Lance de garde",
      attackKind: "melee",
      attackBonus: 3,
      damage: "1d6 + 1",
      damageType: "perforant",
      range: 1.5,
      cost: "action",
      tags: ["weapon", "spear"],
    }],
    abilityTemplateIds: [],
    behavior: { role: "soldier", aggression: 3, preferredRange: 1.5, retreatBelowHpPercent: 20, priorities: ["protéger l'autorité", "bloquer la fuite", "désarmer"] },
    resistances: [],
    vulnerabilities: [],
    immunities: [],
  },
  {
    id: "enemy-ash-hound",
    name: "Molosse de cendre",
    description: "Prédateur bas et rapide dont la gueule exhale une chaleur suffocante.",
    level: 2,
    category: "beast",
    tags: ["beast", "fire", "tracker"],
    hp: "2d8 + 4",
    defense: 12,
    initiative: 2,
    speed: 12,
    reach: 1.5,
    attacks: [{
      id: "ash-hound-bite",
      name: "Morsure ardente",
      attackKind: "melee",
      attackBonus: 4,
      damage: "1d6 + 2",
      damageType: "feu",
      range: 1.5,
      cost: "action",
      tags: ["bite", "fire"],
    }],
    abilityTemplateIds: [],
    behavior: { role: "skirmisher", aggression: 4, preferredRange: 1.5, retreatBelowHpPercent: 15, priorities: ["encercler", "attaquer une cible isolée", "poursuivre"] },
    resistances: ["feu"],
    vulnerabilities: ["froid"],
    immunities: [],
  },
];

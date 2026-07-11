import type { ItemEffectRef } from "../../app/types";
import { getCombatConditionTemplate } from "../combat/conditionTemplates";
import type { EffectValue } from "./valueExpressions";

export type DamageType =
  | "acide"
  | "contondant"
  | "feu"
  | "force"
  | "foudre"
  | "froid"
  | "necrotique"
  | "perforant"
  | "poison"
  | "psychique"
  | "radiant"
  | "tonnerre"
  | "tranchant";

interface LevelEffectOptions {
  nom?: string;
  level?: number;
  perLevel?: number;
}

interface EffectCatalogEntry {
  effectId: string;
  nom: string;
  description: string;
  variables: string[];
  visibleInInventory: boolean;
}

export function modifyStat(stat: string, value: number): ItemEffectRef {
  return {
    effectId: "modifyStat",
    nom: "Bonus de caractéristique",
    variables: {
      stat,
      value,
    },
  };
}

export function preventUnequip(nom = "Lien éternel"): ItemEffectRef {
  return {
    effectId: "preventUnequip",
    nom,
    variables: {},
  };
}

export function heal(value: EffectValue, options: LevelEffectOptions = {}): ItemEffectRef {
  return {
    effectId: "heal",
    nom: options.nom ?? "Soin",
    variables: {
      value,
      level: options.level ?? 1,
      perLevel: options.perLevel ?? 0,
    },
  };
}

export function damage(
  value: EffectValue,
  damageType: DamageType,
  options: LevelEffectOptions = {},
): ItemEffectRef {
  return {
    effectId: "damage",
    nom: options.nom ?? "DM",
    variables: {
      value,
      damageType,
      level: options.level ?? 1,
      perLevel: options.perLevel ?? 0,
    },
  };
}

export function randomDamage(
  value: EffectValue,
  damageTypes: DamageType[],
  options: LevelEffectOptions = {},
): ItemEffectRef {
  return {
    effectId: "randomDamage",
    nom: options.nom ?? "Dégâts chaotiques",
    variables: {
      value,
      damageTypes: damageTypes.join(","),
      level: options.level ?? 1,
      perLevel: options.perLevel ?? 0,
    },
  };
}

export function reduceDamage(
  damageType: DamageType | "all",
  value: number,
  minDamage = 1,
  nom = "Résistance",
): ItemEffectRef {
  return {
    effectId: "reduceDamage",
    nom,
    variables: {
      damageType,
      value,
      minDamage,
    },
  };
}

export function inventoryInteraction(options: {
  nom?: string;
  requiredTemplateId: string;
  consumeRequired?: boolean;
  addTemplateId?: string;
  quantity?: number;
}): ItemEffectRef {
  return {
    effectId: "inventoryInteraction",
    nom: options.nom ?? "Interaction d'inventaire",
    variables: {
      requiredTemplateId: options.requiredTemplateId,
      consumeRequired: options.consumeRequired ?? false,
      addTemplateId: options.addTemplateId ?? "",
      quantity: options.quantity ?? 1,
    },
  };
}

export function grantAbility(abilityTemplateId: string, nom = "Capacité accordée"): ItemEffectRef {
  return {
    effectId: "grantAbility",
    nom,
    variables: {
      abilityTemplateId,
    },
  };
}

export function applyCondition(
  condition: string,
  options: { nom?: string; duration?: string | number } = {},
): ItemEffectRef {
  const conditionTemplate = getCombatConditionTemplate(condition);

  return {
    effectId: "applyCondition",
    nom: options.nom ?? conditionTemplate?.name ?? "État",
    variables: {
      condition: conditionTemplate?.id ?? condition,
      duration: options.duration ?? "",
    },
  };
}

export function removeCondition(condition: string, options: { nom?: string } = {}): ItemEffectRef {
  const conditionTemplate = getCombatConditionTemplate(condition);

  return {
    effectId: "removeCondition",
    nom: options.nom ?? conditionTemplate?.name ?? "Retrait d'état",
    variables: {
      condition: conditionTemplate?.id ?? condition,
    },
  };
}

export const itemEffectCatalog: EffectCatalogEntry[] = [
  {
    effectId: "preventUnequip",
    nom: "Lien éternel",
    description: "Empêche un objet équipé d'être rangé dans le sac.",
    variables: [],
    visibleInInventory: true,
  },
  {
    effectId: "modifyStat",
    nom: "Bonus de caractéristique",
    description: "Ajoute ou retire une valeur à une caractéristique tant que l'objet est équipé.",
    variables: ["stat", "value"],
    visibleInInventory: true,
  },
  {
    effectId: "heal",
    nom: "Soin",
    description: "Rend des PV quand l'objet est utilisé.",
    variables: ["value: number | formule", "level?", "perLevel?"],
    visibleInInventory: true,
  },
  {
    effectId: "damage",
    nom: "DM",
    description: "Inflige des dégâts typés quand l'objet est utilisé.",
    variables: ["value: number | formule", "damageType", "level?", "perLevel?"],
    visibleInInventory: true,
  },
  {
    effectId: "randomDamage",
    nom: "Dégâts chaotiques",
    description: "Inflige des dégâts dont le type est choisi parmi une liste.",
    variables: ["value: number | formule", "damageTypes", "level?", "perLevel?"],
    visibleInInventory: true,
  },
  {
    effectId: "reduceDamage",
    nom: "Résistance",
    description: "Réduit les dégâts d'un type donné, sans descendre sous un minimum.",
    variables: ["damageType", "value", "minDamage?"],
    visibleInInventory: true,
  },
  {
    effectId: "inventoryInteraction",
    nom: "Interaction d'inventaire",
    description: "Cherche, consomme ou crée d'autres objets dans le même inventaire.",
    variables: ["requiredTemplateId", "consumeRequired?", "addTemplateId?", "quantity?"],
    visibleInInventory: true,
  },
  {
    effectId: "grantAbility",
    nom: "Capacité accordée",
    description: "Accorde une capacité tant que l'objet est équipé. Ses charges sont gérées comme les autres capacités.",
    variables: ["abilityTemplateId"],
    visibleInInventory: true,
  },
  {
    effectId: "applyCondition",
    nom: "Appliquer un état",
    description: "Ajoute un état standardisé à une ou plusieurs cibles.",
    variables: ["condition", "duration?"],
    visibleInInventory: true,
  },
  {
    effectId: "removeCondition",
    nom: "Retirer un état",
    description: "Retire un état standardisé d'une cible.",
    variables: ["condition"],
    visibleInInventory: true,
  },
  {
    effectId: "move",
    nom: "Déplacement forcé",
    description: "Déplace une cible vers une position valide.",
    variables: ["distance", "mode: push|pull|slide"],
    visibleInInventory: true,
  },
  {
    effectId: "teleport",
    nom: "Téléportation",
    description: "Déplace instantanément une cible ou le lanceur vers une destination valide.",
    variables: ["range", "value?"],
    visibleInInventory: true,
  },
  {
    effectId: "createZone",
    nom: "Créer une zone",
    description: "Crée une zone persistante sur la carte de combat.",
    variables: ["zoneKind", "shape", "radius?", "duration?", "effectId?"],
    visibleInInventory: true,
  },
  {
    effectId: "modifyResource",
    nom: "Modifier une ressource",
    description: "Ajoute, retire ou fixe une ressource comme mana, inspiration ou charges.",
    variables: ["resource", "op: add|subtract|set", "value"],
    visibleInInventory: true,
  },
  {
    effectId: "grantAdvantage",
    nom: "Avantage",
    description: "Accorde un avantage contextuel à un prochain jet.",
    variables: ["scope", "duration?"],
    visibleInInventory: true,
  },
  {
    effectId: "reroll",
    nom: "Relance",
    description: "Permet de relancer un jet selon une condition.",
    variables: ["scope", "uses?"],
    visibleInInventory: true,
  },
  {
    effectId: "summon",
    nom: "Invocation",
    description: "Crée une entité temporaire contrôlée par le moteur.",
    variables: ["entityTemplateId", "duration?", "count?"],
    visibleInInventory: true,
  },
  {
    effectId: "dispel",
    nom: "Dissipation",
    description: "Tente de retirer un effet magique, une zone ou une condition.",
    variables: ["targetEffectTag?", "power?"],
    visibleInInventory: true,
  },
];

export const itemEffects = {
  preventUnequip: preventUnequip(),
  dexterityPlus1: modifyStat("dexterite", 1),
  dexterityPlus2: modifyStat("dexterite", 2),
  dexterityMinus1: modifyStat("dexterite", -1),
  constitutionPlus1: modifyStat("constitution", 1),
  constitutionMinus1: modifyStat("constitution", -1),
  charismaPlus1: modifyStat("charisme", 1),
  charismaPlus2: modifyStat("charisme", 2),
  charismaMinus1: modifyStat("charisme", -1),
  wisdomMinus1: modifyStat("sagesse", -1),
  heal1: heal(1),
  heal3: heal(3),
  heal4: heal("1d8 + CON"),
  damagePoison2: damage("1d4", "poison", { nom: "Poison" }),
  damageMixed1: [heal("1d4"), damage("1d4", "poison", { nom: "Poison" })],
  fireballLevel3: damage("1d6 + INT + NIV", "feu", { nom: "Boule de feu", level: 3, perLevel: 2 }),
  chaoticDamage3: randomDamage("1d6 + NIV", ["feu", "froid", "foudre", "poison"]),
  reduceFire2: reduceDamage("feu", 2, 1, "Résistance au feu"),
  transmuteMagnetStone: inventoryInteraction({
    nom: "Transmutation",
    requiredTemplateId: "tpl_magnet_stone",
    consumeRequired: true,
    addTemplateId: "tpl_singing_coin",
  }),
  grantEmberBolt: grantAbility("abl_ember_bolt", "Trait de braise"),
  applyPoisoned: applyCondition("poisoned"),
  applyConfused: applyCondition("confused"),
  applyCharmed: applyCondition("charmed"),
  applyUnhealable: applyCondition("unhealable"),
  removePoisoned: removeCondition("poisoned"),
} satisfies Record<string, ItemEffectRef | ItemEffectRef[]>;

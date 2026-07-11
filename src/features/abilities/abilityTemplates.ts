import type { AbilityTemplate } from "../../app/types";
import { itemEffects } from "../items";

export const initialAbilityTemplates: AbilityTemplate[] = [
  {
    id: "abl_second_wind",
    name: "Second souffle",
    description: "Reprendre son souffle au coeur de l'action pour récupérer quelques PV.",
    types: ["martial", "healing"],
    tags: ["survival", "breath", "self"],
    combatRole: "support",
    activation: {
      timing: "bonus",
    },
    resourceCost: { type: "charge", amount: 1 },
    targeting: {
      allowed: ["self"],
      required: true,
      defaultPriority: ["self"],
    },
    targetingV2: {
      aim: { allowed: ["self"], required: true },
      area: { shape: "none" },
      affects: { allowed: ["self"], maxTargets: 1 },
      defaultPriority: ["self"],
      suggestedSides: ["self"],
    },
    charges: {
      max: 1,
      initial: 1,
      recharge: ["shortRest", "longRest"],
      rechargeAmount: "full",
    },
    scaling: { level: 1, mode: "characterLevel", notes: "Le soin peut évoluer avec le niveau du personnage." },
    duration: { type: "instant" },
    effects: [itemEffects.heal4],
    modules: {
      ability: {},
    },
  },
  {
    id: "abl_shadow_step",
    name: "Pas d'ombre",
    description: "Se téléporter jusqu'à 3 m dans un angle mort avant de réapparaître.",
    types: ["movement", "utility"],
    tags: ["shadow", "stealth", "positioning"],
    combatRole: "movement",
    activation: {
      timing: "bonus",
    },
    resourceCost: { type: "charge", amount: 1 },
    targeting: {
      allowed: ["position", "free"],
      required: true,
      defaultPriority: ["farthestPointAhead"],
      range: 3,
    },
    targetingV2: {
      aim: { allowed: ["position"], required: true, range: 3, lineOfSight: false },
      area: { shape: "none" },
      affects: { allowed: ["self"], maxTargets: 1 },
      defaultPriority: ["farthestPointAhead"],
      suggestedSides: ["self"],
    },
    charges: {
      max: 2,
      initial: 2,
      recharge: ["longRest"],
      rechargeAmount: "full",
    },
    requirements: [{ type: "state", condition: "notRestrained", expected: true }],
    scaling: { level: 1, mode: "fixed" },
    duration: { type: "instant" },
    effects: [
      {
        effectId: "teleport",
        nom: "Téléportation",
        variables: {
          value: "3 m",
          range: 3,
        },
      },
    ],
    modules: {
      ability: {},
    },
  },
  {
    id: "abl_rallying_cry",
    name: "Cri de ralliement",
    description: "Rassembler les alliés proches par une injonction claire et brutale.",
    types: ["social", "support"],
    tags: ["voice", "morale", "group"],
    combatRole: "support",
    activation: {
      timing: "action",
    },
    resourceCost: { type: "charge", amount: 1 },
    targeting: {
      allowed: ["entity", "position", "free"],
      required: true,
      defaultPriority: ["nearestEnemy", "farthestPointAhead"],
      range: 6,
    },
    targetingV2: {
      aim: { allowed: ["entity", "position"], required: true, range: 6, lineOfSight: true },
      area: { shape: "circle", radius: 6 },
      affects: { allowed: ["ally", "living"], requiresLiving: true },
      defaultPriority: ["nearestEnemy", "farthestPointAhead"],
      suggestedSides: ["ally"],
    },
    charges: {
      max: 1,
      initial: 0,
      recharge: ["manual"],
      rechargeAmount: "full",
    },
    scaling: { level: 1, mode: "abilityLevel" },
    duration: { type: "rounds", value: 1 },
    effects: [],
    modules: {
      ability: {},
    },
  },
  {
    id: "abl_quick_shot",
    name: "Tir instinctif",
    description: "Décocher sans prendre le temps de viser, assez vite pour surprendre.",
    types: ["martial", "attack"],
    tags: ["ranged", "weapon", "reflex"],
    combatRole: "attack",
    activation: {
      timing: "reaction",
    },
    resourceCost: { type: "charge", amount: 1 },
    targeting: {
      allowed: ["entity", "character", "free"],
      required: true,
      defaultPriority: ["nearestEnemy"],
      range: 18,
    },
    targetingV2: {
      aim: { allowed: ["entity", "position"], required: true, range: 18, lineOfSight: true },
      area: { shape: "none" },
      affects: { allowed: ["living"], maxTargets: 1, requiresLiving: true },
      defaultPriority: ["nearestEnemy"],
      suggestedSides: ["enemy"],
    },
    charges: {
      max: 1,
      initial: 1,
      recharge: ["encounter", "shortRest", "longRest"],
      rechargeAmount: "full",
    },
    requirements: [{ type: "equippedItemTag", tag: "ranged" }],
    scaling: { level: 1, mode: "characterLevel" },
    duration: { type: "instant" },
    effects: [
      {
        effectId: "damage",
        nom: "Tir instinctif",
        variables: {
          value: 3,
          damageType: "perforant",
        },
      },
    ],
    modules: {
      ability: {},
    },
  },
  {
    id: "abl_sixth_sense",
    name: "Sixième sens",
    description: "Sentir une menace diffuse avant qu'elle ne se formule clairement.",
    types: ["passive"],
    tags: ["awareness", "danger", "instinct"],
    combatRole: "passive",
    activation: {
      timing: "passive",
    },
    resourceCost: { type: "custom", resource: "none", amount: 0 },
    targeting: {
      allowed: ["self"],
      required: false,
      defaultPriority: ["self"],
    },
    targetingV2: {
      aim: { allowed: ["self"], required: false },
      area: { shape: "none" },
      affects: { allowed: ["self"], maxTargets: 1 },
      defaultPriority: ["self"],
      suggestedSides: ["self"],
    },
    scaling: { level: 1, mode: "fixed" },
    duration: { type: "permanent" },
    effects: [],
    modules: {
      ability: {},
    },
  },
  {
    id: "abl_ember_bolt",
    name: "Trait de braise",
    description: "Projeter une braise concentrée depuis un catalyseur magique.",
    types: ["magic", "attack"],
    tags: ["fire", "wand", "ranged"],
    combatRole: "attack",
    activation: {
      timing: "action",
    },
    resourceCost: { type: "charge", amount: 1 },
    targeting: {
      allowed: ["entity", "position", "free"],
      required: true,
      defaultPriority: ["nearestEnemy"],
      range: 12,
    },
    targetingV2: {
      aim: { allowed: ["entity", "position"], required: true, range: 12, lineOfSight: true },
      area: { shape: "none" },
      affects: { allowed: ["living"], maxTargets: 1, requiresLiving: true },
      defaultPriority: ["nearestEnemy"],
      suggestedSides: ["enemy"],
    },
    charges: {
      max: 3,
      initial: 3,
      recharge: ["shortRest", "longRest"],
      rechargeAmount: "full",
    },
    requirements: [{ type: "equippedItemTag", tag: "catalyst" }],
    scaling: { level: 1, mode: "itemLevel", maxLevel: 5, notes: "Augmenter level ou perLevel pour créer une version rare." },
    duration: { type: "instant" },
    effects: [
      {
        effectId: "damage",
        nom: "Trait de braise",
        variables: {
          value: "1d6 + INT",
          damageType: "feu",
          level: 1,
          perLevel: 0,
        },
      },
    ],
    modules: {
      ability: {
        source: "item",
      },
    },
  },
];

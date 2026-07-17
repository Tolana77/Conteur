import type {
  AbilityDuration,
  AbilityRechargeTrigger,
  AbilityRequirement,
  AbilityTemplate,
  AffectKind,
  AimKind,
  AreaRule,
  GameActionScalingRule,
  GameActionTemplate,
  SuggestedTargetSide,
} from "../../app/types";

interface CatalogAbilityInput {
  id: string;
  name: string;
  description: string;
  timing: GameActionTemplate["activation"]["timing"];
  combatRole: NonNullable<GameActionTemplate["combatRole"]>;
  types: string[];
  tags: string[];
  aim: AimKind[];
  aimRequired?: boolean;
  affects: AffectKind[];
  range?: number;
  lineOfSight?: boolean;
  area?: AreaRule;
  suggestedSides?: SuggestedTargetSide[];
  defaultPriority?: NonNullable<GameActionTemplate["targeting"]["defaultPriority"]>;
  maxTargets?: number;
  charges?: number;
  recharge?: AbilityRechargeTrigger[];
  requirements?: AbilityRequirement[];
  duration?: AbilityDuration;
  effects: GameActionTemplate["effects"];
  scaling?: GameActionScalingRule[];
  modules?: AbilityTemplate["modules"];
}

export const initialAbilityActionTemplates: GameActionTemplate[] = [];

function catalogAbility(input: CatalogAbilityInput): AbilityTemplate {
  const defaultPriority = input.defaultPriority ?? (input.aim.includes("self") ? ["self"] : ["nearestEnemy"]);
  const actionId = `action-ability-${input.id.replace(/^abl_/, "").replaceAll("_", "-")}`;
  const inferredScaling = input.scaling ?? inferAbilityScaling(input.effects, input.combatRole);

  initialAbilityActionTemplates.push({
    id: actionId,
    name: input.name,
    description: input.description,
    types: input.types,
    tags: input.tags,
    combatRole: input.combatRole,
    activation: { timing: input.timing },
    targeting: {
      aim: {
        allowed: input.aim,
        required: input.aimRequired ?? true,
        range: input.range,
        lineOfSight: input.lineOfSight,
      },
      area: input.area ?? { shape: "none" },
      affects: {
        allowed: input.affects,
        maxTargets: input.maxTargets,
        requiresLiving: input.affects.includes("living"),
      },
      defaultPriority,
      suggestedSides: input.suggestedSides,
    },
    duration: input.duration ?? { type: "instant" },
    effects: input.effects,
    ...(inferredScaling.length > 0 ? { scaling: inferredScaling } : {}),
  });

  return {
    id: input.id,
    actionId,
    ...(input.charges !== undefined
      ? {
          resourceCost: { type: "charge" as const, amount: 1 },
          charges: {
            max: input.charges,
            initial: input.charges,
            recharge: input.recharge ?? ["shortRest", "longRest"],
            rechargeAmount: "full" as const,
          },
        }
      : {}),
    ...(input.requirements ? { requirements: input.requirements } : {}),
    modules: input.modules ?? { ability: {} },
  };
}

function inferAbilityScaling(
  effects: GameActionTemplate["effects"],
  combatRole: NonNullable<GameActionTemplate["combatRole"]>,
): GameActionScalingRule[] {
  if (combatRole !== "attack") return [];

  return effects.flatMap((effect, effectIndex) => {
    const value = effect.variables?.value;
    if (typeof value !== "string") return [];
    const die = value.match(/(?:^|\s)(?:\d+)?d(\d+)/i);
    if (!die) return [];
    return [{
      effectIndex,
      variable: "value",
      mode: "characterLevel" as const,
      baseLevel: 1,
      addPerStep: `1d${die[1]}`,
      thresholds: [5, 11, 17],
      maxLevel: 20,
    }];
  });
}

export const initialAbilityTemplates: AbilityTemplate[] = [
  catalogAbility({
    id: "abl_second_wind",
    name: "Second souffle",
    description: "Reprendre son souffle au cœur de l'affrontement pour recouvrer une part de sa vitalité.",
    timing: "bonus",
    combatRole: "support",
    types: ["martial", "healing"],
    tags: ["survival", "breath", "self"],
    aim: ["self"],
    affects: ["self"],
    suggestedSides: ["self"],
    charges: 1,
    effects: [{ effectId: "heal", nom: "Soin", variables: { value: "1d6 + NIV" } }],
  }),
  catalogAbility({
    id: "abl_shadow_step",
    name: "Pas d'ombre",
    description: "Se téléporter jusqu'à 3 m dans un angle mort avant de réapparaître.",
    timing: "bonus",
    combatRole: "movement",
    types: ["movement", "utility"],
    tags: ["shadow", "stealth", "positioning"],
    aim: ["position"],
    affects: ["self"],
    range: 3,
    lineOfSight: false,
    defaultPriority: ["farthestPointAhead"],
    suggestedSides: ["self"],
    charges: 2,
    recharge: ["longRest"],
    requirements: [{ type: "state", condition: "notRestrained", expected: true }],
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
  }),
  catalogAbility({
    id: "abl_rallying_cry",
    name: "Cri de ralliement",
    description: "Rassembler les alliés proches par une injonction ferme qui dissipe leur effroi.",
    timing: "action",
    combatRole: "support",
    types: ["social", "support"],
    tags: ["voice", "morale", "group"],
    aim: ["entity", "position"],
    affects: ["ally", "living"],
    range: 6,
    lineOfSight: true,
    area: { shape: "circle", radius: 6 },
    suggestedSides: ["ally"],
    maxTargets: 6,
    charges: 1,
    duration: { type: "rounds", value: 1 },
    effects: [
      { effectId: "removeCondition", nom: "Ralliement", variables: { condition: "frightened" } },
      { effectId: "effect-reaction-refresh", variables: {} },
    ],
  }),
  catalogAbility({
    id: "abl_quick_shot",
    name: "Tir instinctif",
    description: "Décocher sans prendre le temps de viser, assez vite pour surprendre.",
    timing: "reaction",
    combatRole: "attack",
    types: ["martial", "attack"],
    tags: ["ranged", "weapon", "reflex"],
    aim: ["entity", "position"],
    affects: ["living"],
    range: 18,
    lineOfSight: true,
    maxTargets: 1,
    suggestedSides: ["enemy"],
    charges: 1,
    recharge: ["encounter", "shortRest", "longRest"],
    requirements: [{ type: "equippedItemTag", tag: "ranged" }],
    effects: [
      {
        effectId: "damage",
        nom: "Tir instinctif",
        variables: {
          value: "1d6",
          damageType: "perforant",
        },
      },
    ],
  }),
  catalogAbility({
    id: "abl_sixth_sense",
    name: "Sixième sens",
    description: "Sentir une menace diffuse avant qu'elle ne se formule clairement.",
    timing: "passive",
    combatRole: "passive",
    types: ["passive"],
    tags: ["awareness", "danger", "instinct"],
    aim: ["self"],
    aimRequired: false,
    affects: ["self"],
    suggestedSides: ["self"],
    duration: { type: "permanent" },
    effects: [],
  }),
  catalogAbility({
    id: "abl_ember_bolt",
    name: "Trait de braise",
    description: "Projeter une braise concentrée depuis un catalyseur magique.",
    timing: "action",
    combatRole: "attack",
    types: ["magic", "attack"],
    tags: ["fire", "wand", "ranged"],
    aim: ["entity", "position"],
    affects: ["living"],
    range: 12,
    lineOfSight: true,
    maxTargets: 1,
    suggestedSides: ["enemy"],
    charges: 3,
    requirements: [{ type: "equippedItemTag", tag: "catalyst" }],
    effects: [
      {
        effectId: "damage",
        nom: "Trait de braise",
        variables: {
          value: "1d6 + INT",
          damageType: "feu",
        },
      },
    ],
    scaling: [{ effectIndex: 0, variable: "value", mode: "itemLevel", baseLevel: 1, addPerStep: "1d6", maxLevel: 5 }],
    modules: { ability: { source: "item" } },
  }),
  catalogAbility({
    id: "abl_power_strike",
    name: "Coup puissant",
    description: "Concentrer toute sa force dans une frappe lourde qui ouvre une plaie.",
    timing: "action", combatRole: "attack", types: ["martial", "attack"], tags: ["melee", "weapon", "strength"],
    aim: ["entity"], affects: ["living"], range: 1.5, lineOfSight: true, suggestedSides: ["enemy"], charges: 2,
    requirements: [{ type: "equippedItemType", itemType: "weapon" }],
    effects: [{ effectId: "effect-bleeding-wound", variables: { value: "1d8 + FOR" } }],
  }),
  catalogAbility({
    id: "abl_sweeping_strike",
    name: "Frappe circulaire",
    description: "Balayer les adversaires regroupés devant soi.",
    timing: "action", combatRole: "attack", types: ["martial", "attack"], tags: ["melee", "weapon", "area"],
    aim: ["direction"], affects: ["living"], range: 1.5, lineOfSight: true,
    area: { shape: "cone", length: 1.5 }, suggestedSides: ["enemy"], charges: 1,
    requirements: [{ type: "equippedItemType", itemType: "weapon" }],
    effects: [{ effectId: "damage", nom: "Frappe circulaire", variables: { value: "1d6 + FOR", damageType: "tranchant" } }],
  }),
  catalogAbility({
    id: "abl_trip_attack",
    name: "Frappe renversante",
    description: "Frapper les appuis pour jeter la cible au sol.",
    timing: "action", combatRole: "attack", types: ["martial", "attack", "control"], tags: ["melee", "prone"],
    aim: ["entity"], affects: ["living"], range: 1.5, lineOfSight: true, suggestedSides: ["enemy"], charges: 2,
    requirements: [{ type: "equippedItemType", itemType: "weapon" }],
    effects: [
      { effectId: "damage", nom: "Frappe", variables: { value: "1d4 + FOR", damageType: "contondant" } },
      { effectId: "effect-knockdown", variables: {} },
    ],
  }),
  catalogAbility({
    id: "abl_disarming_strike",
    name: "Désarmement",
    description: "Détourner l'arme adverse d'un coup précis.",
    timing: "action", combatRole: "utility", types: ["martial", "control"], tags: ["melee", "disarm"],
    aim: ["entity"], affects: ["living"], range: 1.5, lineOfSight: true, suggestedSides: ["enemy"], charges: 2,
    requirements: [{ type: "equippedItemType", itemType: "weapon" }],
    effects: [{ effectId: "effect-disarm", variables: {} }],
  }),
  catalogAbility({
    id: "abl_shove",
    name: "Bousculade",
    description: "Repousser brutalement une cible proche.",
    timing: "action", combatRole: "movement", types: ["martial", "control"], tags: ["melee", "push", "strength"],
    aim: ["entity"], affects: ["living", "object"], range: 1.5, lineOfSight: true, suggestedSides: ["enemy"], charges: 3,
    effects: [{ effectId: "effect-force-push", variables: {} }],
  }),
  catalogAbility({
    id: "abl_riposte",
    name: "Riposte",
    description: "Profiter d'une ouverture pour répondre immédiatement.",
    timing: "reaction", combatRole: "attack", types: ["martial", "attack", "reaction"], tags: ["melee", "weapon", "counter"],
    aim: ["entity"], affects: ["living"], range: 1.5, lineOfSight: true, suggestedSides: ["enemy"], charges: 1,
    requirements: [{ type: "equippedItemType", itemType: "weapon" }],
    effects: [{ effectId: "damage", nom: "Riposte", variables: { value: "1d6 + FOR", damageType: "tranchant" } }],
  }),
  catalogAbility({
    id: "abl_precise_shot",
    name: "Tir précis",
    description: "Prendre le temps de viser une cible visible à longue portée.",
    timing: "action", combatRole: "attack", types: ["martial", "attack"], tags: ["ranged", "weapon", "precision"],
    aim: ["entity"], affects: ["living", "object"], range: 24, lineOfSight: true, suggestedSides: ["enemy"], charges: 2,
    requirements: [{ type: "equippedItemTag", tag: "ranged" }],
    effects: [{ effectId: "damage", nom: "Tir précis", variables: { value: "1d8", damageType: "perforant" } }],
  }),
  catalogAbility({
    id: "abl_pinning_shot",
    name: "Tir entravant",
    description: "Clouer un vêtement ou un membre pour ralentir la cible.",
    timing: "action", combatRole: "attack", types: ["martial", "attack", "control"], tags: ["ranged", "weapon", "slow"],
    aim: ["entity"], affects: ["living"], range: 18, lineOfSight: true, suggestedSides: ["enemy"], charges: 2,
    requirements: [{ type: "equippedItemTag", tag: "ranged" }],
    effects: [
      { effectId: "damage", nom: "Tir entravant", variables: { value: "1d6", damageType: "perforant" } },
      { effectId: "effect-slow", variables: {} },
    ],
  }),
  catalogAbility({
    id: "abl_arrow_volley",
    name: "Volée",
    description: "Faire pleuvoir des projectiles sur une petite zone.",
    timing: "action", combatRole: "attack", types: ["martial", "attack"], tags: ["ranged", "weapon", "area"],
    aim: ["position"], affects: ["living"], range: 18, lineOfSight: true,
    area: { shape: "circle", radius: 2 }, suggestedSides: ["enemy"], defaultPriority: ["nearestEnemy", "farthestPointAhead"], charges: 1,
    requirements: [{ type: "equippedItemTag", tag: "ranged" }],
    effects: [{ effectId: "damage", nom: "Volée", variables: { value: "1d6", damageType: "perforant" } }],
  }),
  catalogAbility({
    id: "abl_feint",
    name: "Feinte",
    description: "Forcer une cible à découvrir sa garde pour la marquer.",
    timing: "bonus", combatRole: "support", types: ["martial", "utility"], tags: ["melee", "deception", "mark"],
    aim: ["entity"], affects: ["living"], range: 1.5, lineOfSight: true, suggestedSides: ["enemy"], charges: 2,
    effects: [{ effectId: "effect-mark", variables: {} }],
  }),
  catalogAbility({
    id: "abl_challenge",
    name: "Défi",
    description: "Provoquer un adversaire et concentrer son attention.",
    timing: "action", combatRole: "support", types: ["martial", "social", "control"], tags: ["voice", "taunt"],
    aim: ["entity"], affects: ["living"], range: 9, lineOfSight: true, suggestedSides: ["enemy"], charges: 2,
    effects: [{ effectId: "effect-taunt", variables: {} }],
  }),
  catalogAbility({
    id: "abl_intimidating_shout",
    name: "Cri intimidant",
    description: "Faire vaciller les ennemis proches par une menace retentissante.",
    timing: "action", combatRole: "support", types: ["martial", "social", "control"], tags: ["voice", "fear", "area"],
    aim: ["direction"], affects: ["living"], range: 6, lineOfSight: true,
    area: { shape: "cone", length: 6 }, suggestedSides: ["enemy"], charges: 1,
    effects: [{ effectId: "effect-fear", variables: {} }],
  }),
  catalogAbility({
    id: "abl_first_aid",
    name: "Premiers secours",
    description: "Stopper une hémorragie et remettre rapidement un allié sur pied.",
    timing: "action", combatRole: "support", types: ["medical", "support"], tags: ["healing", "mundane", "touch"],
    aim: ["self", "entity"], affects: ["self", "living"], range: 1.5, lineOfSight: true, suggestedSides: ["self", "ally"], charges: 2,
    effects: [
      { effectId: "effect-minor-healing", variables: {} },
      { effectId: "removeCondition", nom: "Bandage", variables: { condition: "bleeding" } },
    ],
  }),
  catalogAbility({
    id: "abl_healing_touch",
    name: "Toucher guérisseur",
    description: "Canaliser une énergie réparatrice au contact.",
    timing: "action", combatRole: "support", types: ["supernatural", "support"], tags: ["healing", "touch"],
    aim: ["self", "entity"], affects: ["self", "living"], range: 1.5, lineOfSight: true, suggestedSides: ["self", "ally"], charges: 2,
    effects: [{ effectId: "effect-standard-healing", variables: {} }],
  }),
  catalogAbility({
    id: "abl_purge_toxins",
    name: "Purge des toxines",
    description: "Neutraliser rapidement un poison actif.",
    timing: "action", combatRole: "support", types: ["medical", "support"], tags: ["cleanse", "poison", "touch"],
    aim: ["self", "entity"], affects: ["self", "living"], range: 1.5, lineOfSight: true, suggestedSides: ["self", "ally"], charges: 1,
    effects: [{ effectId: "effect-antidote", variables: {} }],
  }),
  catalogAbility({
    id: "abl_fleet_step",
    name: "Foulée rapide",
    description: "Puiser dans ses réserves pour couvrir davantage de terrain.",
    timing: "bonus", combatRole: "movement", types: ["martial", "movement"], tags: ["speed", "self"],
    aim: ["self"], affects: ["self"], lineOfSight: false, suggestedSides: ["self"], charges: 2,
    effects: [{ effectId: "effect-speed-boost", variables: {} }],
  }),
  catalogAbility({
    id: "abl_evasive_step",
    name: "Écart fulgurant",
    description: "Se dérober d'un mouvement fulgurant vers un point proche.",
    timing: "reaction", combatRole: "movement", types: ["martial", "movement", "reaction"], tags: ["dodge", "teleport"],
    aim: ["position"], affects: ["self"], range: 3, lineOfSight: false, suggestedSides: ["self"],
    defaultPriority: ["farthestPointAhead"], charges: 1,
    effects: [{ effectId: "effect-short-teleport", variables: {} }],
  }),
  catalogAbility({
    id: "abl_dispel",
    name: "Dissipation",
    description: "Briser une malédiction simple ou disperser une zone magique opaque.",
    timing: "action", combatRole: "utility", types: ["supernatural", "utility"], tags: ["dispel", "cleanse"],
    aim: ["entity", "position"], affects: ["living", "position"], range: 9, lineOfSight: true, suggestedSides: ["ally", "enemy"], charges: 1,
    effects: [
      { effectId: "effect-dispel-curse", variables: {} },
      { effectId: "effect-dispel-zone", variables: {} },
    ],
  }),
  catalogAbility({
    id: "abl_camouflage",
    name: "Camouflage",
    description: "Se fondre dans le décor jusqu'à être difficile à repérer.",
    timing: "action", combatRole: "utility", types: ["exploration", "utility"], tags: ["stealth", "self"],
    aim: ["self"], affects: ["self"], lineOfSight: false, suggestedSides: ["self"], charges: 1, recharge: ["shortRest", "longRest"],
    effects: [{ effectId: "effect-invisibility", nom: "Camouflage", variables: { duration: "jusqu'au prochain mouvement brusque" } }],
  }),
  catalogAbility({
    id: "abl_smoke_veil",
    name: "Voile de fumée",
    description: "Déployer une fumée épaisse sur un point proche.",
    timing: "action", combatRole: "utility", types: ["alchemy", "control"], tags: ["smoke", "zone"],
    aim: ["position"], affects: ["position"], range: 6, lineOfSight: true, area: { shape: "circle", radius: 2 },
    defaultPriority: ["farthestPointAhead"], charges: 1,
    effects: [{ effectId: "effect-smoke-cloud", variables: {} }],
  }),
  catalogAbility({
    id: "abl_frost_breath",
    name: "Souffle de givre",
    description: "Exhaler un cône de froid mordant.",
    timing: "action", combatRole: "attack", types: ["supernatural", "attack"], tags: ["cold", "breath", "area"],
    aim: ["direction"], affects: ["living"], range: 4.5, lineOfSight: true, area: { shape: "cone", length: 4.5 },
    suggestedSides: ["enemy"], charges: 1, recharge: ["encounter", "shortRest", "longRest"],
    effects: [{ effectId: "effect-frost-bite", variables: { value: "2d6" } }],
  }),
  catalogAbility({
    id: "abl_flame_breath",
    name: "Souffle de feu",
    description: "Projeter un cône de flammes qui peut embraser les victimes.",
    timing: "action", combatRole: "attack", types: ["supernatural", "attack"], tags: ["fire", "breath", "area"],
    aim: ["direction"], affects: ["living", "object"], range: 4.5, lineOfSight: true, area: { shape: "cone", length: 4.5 },
    suggestedSides: ["enemy"], charges: 1, recharge: ["encounter", "shortRest", "longRest"],
    effects: [
      { effectId: "effect-ember-burst", variables: { value: "2d6" } },
      { effectId: "effect-burning", variables: {} },
    ],
  }),
  catalogAbility({
    id: "abl_lightning_arc",
    name: "Arc électrique",
    description: "Libérer une décharge qui traverse une ligne de cibles.",
    timing: "action", combatRole: "attack", types: ["supernatural", "attack"], tags: ["lightning", "line", "area"],
    aim: ["direction"], affects: ["living", "object"], range: 9, lineOfSight: true, area: { shape: "line", length: 9, width: 0.5 },
    suggestedSides: ["enemy"], charges: 2,
    effects: [{ effectId: "effect-lightning-shock", variables: { value: "2d6" } }],
  }),
  catalogAbility({
    id: "abl_thunder_clap",
    name: "Déflagration tonnante",
    description: "Faire éclater une onde de choc tout autour de soi.",
    timing: "action", combatRole: "attack", types: ["supernatural", "attack", "control"], tags: ["thunder", "aura", "push"],
    aim: ["self"], affects: ["living", "object"], range: 1.5, lineOfSight: false, area: { shape: "selfAura", radius: 1.5 },
    suggestedSides: ["enemy"], charges: 1,
    effects: [{ effectId: "effect-thunder-push", variables: {} }],
  }),
  catalogAbility({
    id: "abl_hypnotic_gaze",
    name: "Regard hypnotique",
    description: "Capturer brièvement l'attention d'une créature par le regard.",
    timing: "action", combatRole: "support", types: ["supernatural", "social", "control"], tags: ["charm", "gaze"],
    aim: ["entity"], affects: ["living"], range: 6, lineOfSight: true, suggestedSides: ["enemy"], charges: 1,
    effects: [{ effectId: "effect-charm", variables: {} }],
  }),
  catalogAbility({
    id: "abl_spectral_bonds",
    name: "Liens spectraux",
    description: "Faire surgir des entraves immatérielles autour d'une cible.",
    timing: "action", combatRole: "support", types: ["supernatural", "control"], tags: ["restraint", "magic"],
    aim: ["entity"], affects: ["living"], range: 9, lineOfSight: true, suggestedSides: ["enemy"], charges: 2,
    effects: [{ effectId: "effect-restrain", variables: {} }],
  }),
  catalogAbility({
    id: "abl_call_wolf",
    name: "Appel du loup",
    description: "Appeler un compagnon lupin pour la durée de l'affrontement.",
    timing: "action", combatRole: "support", types: ["nature", "summon"], tags: ["beast", "ally", "summon"],
    aim: ["position"], affects: ["position"], range: 3, lineOfSight: true, suggestedSides: ["ally"],
    defaultPriority: ["farthestPointAhead"], charges: 1, recharge: ["longRest"],
    effects: [{ effectId: "effect-summon-wolf", variables: {} }],
  }),
  catalogAbility({
    id: "abl_action_surge",
    name: "Élan héroïque",
    description: "Puiser dans ses dernières réserves pour agir une fois de plus.",
    timing: "free", combatRole: "support", types: ["martial", "support"], tags: ["action", "self"],
    aim: ["self"], affects: ["self"], lineOfSight: false, suggestedSides: ["self"], charges: 1, recharge: ["shortRest", "longRest"],
    effects: [{ effectId: "effect-action-surge", variables: {} }],
  }),
  catalogAbility({
    id: "abl_hunters_mark",
    name: "Marque du chasseur",
    description: "Désigner une proie afin de ne plus perdre sa trace.",
    timing: "bonus", combatRole: "support", types: ["exploration", "martial", "support"], tags: ["mark", "tracking"],
    aim: ["entity"], affects: ["living"], range: 18, lineOfSight: true, suggestedSides: ["enemy"], charges: 2,
    effects: [{ effectId: "effect-mark", variables: { duration: "jusqu'à la fin de la scène" } }],
  }),
  catalogAbility({
    id: "abl_calming_presence",
    name: "Présence apaisante",
    description: "Rendre courage aux alliés proches et calmer leur panique.",
    timing: "action", combatRole: "support", types: ["social", "support"], tags: ["morale", "aura", "healing"],
    aim: ["self"], affects: ["self", "ally", "living"], range: 3, lineOfSight: false, area: { shape: "selfAura", radius: 3 },
    suggestedSides: ["self", "ally"], charges: 1,
    effects: [
      { effectId: "removeCondition", nom: "Apaisement", variables: { condition: "frightened" } },
      { effectId: "effect-minor-healing", variables: {} },
    ],
  }),
];

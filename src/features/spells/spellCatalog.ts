import type {
  ActionTargeting,
  AbilityDuration,
  AbilityCombatRole,
  GameActionScalingRule,
  GameActionTemplate,
  ItemEffectRef,
  SpellComponents,
  SpellSchool,
  SpellTemplate,
  SpellcastingClassId,
  SpellLevel,
} from "../../app/types";

interface SpellUpcastInput {
  effectIndex: number;
  variable: string;
  addPerSlotLevel: number | string;
}

type SpellInput = {
  id: string;
  name: string;
  description: string;
  level: SpellLevel;
  school: SpellSchool;
  classes: SpellcastingClassId[];
  targeting: ActionTargeting;
  effects?: ItemEffectRef[];
  components?: SpellComponents;
  timing?: GameActionTemplate["activation"]["timing"];
  duration?: AbilityDuration;
  concentration?: boolean;
  ritual?: boolean;
  tags?: string[];
  upcast?: SpellUpcastInput[];
};

const W: SpellcastingClassId = "wizard";
const C: SpellcastingClassId = "cleric";
const B: SpellcastingClassId = "bard";
const D: SpellcastingClassId = "druid";
const S: SpellcastingClassId = "sorcerer";
const K: SpellcastingClassId = "warlock";
const P: SpellcastingClassId = "paladin";
const R: SpellcastingClassId = "ranger";

const instant: AbilityDuration = { type: "instant" };
const oneMinute: AbilityDuration = { type: "rounds", value: 10 };
const oneHour: AbilityDuration = { type: "rounds", value: 600 };
const VS: SpellComponents = { verbal: true, somatic: true };
const V: SpellComponents = { verbal: true, somatic: false };
const S_ONLY: SpellComponents = { verbal: false, somatic: true };

function material(
  description: string,
  options: {
    focusAllowed?: boolean;
    itemTemplateId?: string;
    itemTag?: string;
    name?: string;
    quantity?: number;
    consumed?: boolean;
  } = {},
): SpellComponents {
  const hasRequirement = Boolean(options.itemTemplateId || options.itemTag);
  return {
    verbal: true,
    somatic: true,
    material: {
      description,
      focusAllowed: options.focusAllowed ?? !hasRequirement,
      requirements: hasRequirement
        ? [{
            name: options.name ?? description,
            quantity: options.quantity ?? 1,
            consumed: options.consumed ?? false,
            ...(options.itemTemplateId ? { itemTemplateId: options.itemTemplateId } : {}),
            ...(options.itemTag ? { itemTag: options.itemTag } : {}),
          }]
        : [],
    },
  };
}

function selfTarget(radius = 0): ActionTargeting {
  return {
    aim: { allowed: ["self"], required: false, range: 0, lineOfSight: false },
    area: radius > 0 ? { shape: "selfAura", radius } : { shape: "none" },
    affects: { allowed: ["self", ...(radius > 0 ? ["living" as const] : [])], includeSelf: true },
    defaultPriority: ["self"],
    suggestedSides: ["self", "ally"],
  };
}

function creatureTarget(
  range: number,
  sides: Array<"self" | "ally" | "enemy" | "neutral"> = ["enemy"],
  includeSelf = false,
): ActionTargeting {
  return {
    aim: { allowed: includeSelf ? ["self", "entity"] : ["entity"], required: true, range, lineOfSight: true },
    area: { shape: "none" },
    affects: { allowed: includeSelf ? ["self", "living"] : ["living"], maxTargets: 1, requiresLiving: true, includeSelf },
    defaultPriority: includeSelf ? ["self"] : ["nearestEnemy"],
    suggestedSides: sides,
  };
}

function pointTarget(range: number, radius = 0, lineOfSight = true): ActionTargeting {
  return {
    aim: { allowed: ["entity", "position"], required: true, range, lineOfSight },
    area: radius > 0 ? { shape: "circle", radius } : { shape: "none" },
    affects: { allowed: ["living", "object", "position"] },
    defaultPriority: ["nearestEnemy", "farthestPointAhead"],
    suggestedSides: ["enemy"],
  };
}

function destinationTarget(range: number, lineOfSight = true): ActionTargeting {
  return {
    aim: { allowed: ["position"], required: true, range, lineOfSight, label: "destination" },
    area: { shape: "none" },
    affects: { allowed: ["position"], maxTargets: 1 },
    defaultPriority: ["farthestPointAhead"],
  };
}

function touchTarget(sides: Array<"self" | "ally" | "enemy" | "neutral"> = ["self", "ally"]): ActionTargeting {
  return creatureTarget(1.5, sides, true);
}

function objectTarget(range: number): ActionTargeting {
  return {
    aim: { allowed: ["item", "entity", "position"], required: true, range, lineOfSight: true },
    area: { shape: "none" },
    affects: { allowed: ["object", "position"], maxTargets: 1 },
    defaultPriority: ["none"],
    suggestedSides: ["neutral"],
  };
}

function damage(value: number | string, damageType: string, nom = "Dégâts"): ItemEffectRef {
  return { effectId: "damage", nom, variables: { value, damageType } };
}

function heal(value: number | string, nom = "Soin"): ItemEffectRef {
  return { effectId: "heal", nom, variables: { value } };
}

function condition(conditionId: string, duration: number | string, nom: string): ItemEffectRef {
  return { effectId: "applyCondition", nom, variables: { condition: conditionId, duration } };
}

function removeCondition(conditionId: string, nom: string): ItemEffectRef {
  return { effectId: "removeCondition", nom, variables: { condition: conditionId } };
}

export const initialSpellActionTemplates: GameActionTemplate[] = [];

function spell(input: SpellInput): SpellTemplate {
  const actionId = `action-${input.id}`;
  const effects = input.effects ?? [];
  const scaling = createSpellScaling(input, effects);

  initialSpellActionTemplates.push({
    id: actionId,
    name: input.name,
    description: input.description,
    types: ["magic", inferSpellCombatRole(effects)],
    tags: [input.school, ...(input.tags ?? [])],
    combatRole: inferSpellCombatRole(effects),
    activation: { timing: input.timing ?? "action" },
    targeting: input.targeting,
    duration: input.duration ?? instant,
    effects,
    ...(scaling.length > 0 ? { scaling } : {}),
  });

  return {
    id: input.id,
    actionId,
    minimumSlotLevel: input.level,
    school: input.school,
    classes: [...input.classes],
    tags: ["spell", input.school, `level-${input.level}`, ...(input.tags ?? [])],
    components: input.components ?? VS,
    concentration: input.concentration ?? false,
    ritual: input.ritual ?? false,
  };
}

function createSpellScaling(
  input: SpellInput,
  effects: ItemEffectRef[],
): GameActionScalingRule[] {
  const slotScaling = (input.upcast ?? []).map((rule) => ({
    effectIndex: rule.effectIndex,
    variable: rule.variable,
    mode: "slotLevel" as const,
    baseLevel: input.level,
    addPerStep: rule.addPerSlotLevel,
    maxLevel: 9,
  }));

  const cantripScaling = input.level === 0
    ? effects.flatMap((effect, effectIndex) => {
        if (effect.effectId !== "damage" && effect.effectId !== "randomDamage" && effect.effectId !== "heal") return [];
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
      })
    : [];

  return [...slotScaling, ...cantripScaling];
}

function inferSpellCombatRole(effects: ItemEffectRef[]): AbilityCombatRole {
  if (effects.some((effect) => ["damage", "randomDamage"].includes(effect.effectId))) return "attack";
  if (effects.some((effect) => ["heal", "removeCondition"].includes(effect.effectId))) return "support";
  if (effects.some((effect) => ["move", "teleport"].includes(effect.effectId))) return "movement";
  return "utility";
}

/**
 * Catalogue de départ : 100 sorts, indépendants des capacités. Les descriptions
 * sont volontairement courtes ; les règles exécutables vivent dans `effects`.
 */
export const initialSpellTemplates: SpellTemplate[] = [
  // Tours mineurs (10)
  spell({ id: "spell-fire-bolt", name: "Trait de feu", description: "Projette une braise concentrée sur une cible.", level: 0, school: "evocation", classes: [W, S], targeting: creatureTarget(36), effects: [damage("1d10", "feu", "Trait de feu")] }),
  spell({ id: "spell-ray-of-frost", name: "Rayon de givre", description: "Un rayon glacé blesse et ralentit brièvement.", level: 0, school: "evocation", classes: [W, S], targeting: creatureTarget(18), effects: [damage("1d8", "froid", "Rayon de givre"), condition("slowed", 1, "Givre")] }),
  spell({ id: "spell-sacred-spark", name: "Étincelle sacrée", description: "Une lueur radiante frappe une créature visible.", level: 0, school: "evocation", classes: [C], targeting: creatureTarget(18), effects: [damage("1d8", "radiant", "Étincelle sacrée")] }),
  spell({ id: "spell-thorn-whip", name: "Ronce fouettante", description: "Une liane épineuse lacère puis attire la cible.", level: 0, school: "transmutation", classes: [D], targeting: creatureTarget(9), effects: [damage("1d6", "perforant", "Ronce fouettante"), { effectId: "move", nom: "Traction", variables: { distance: 3, mode: "pull" } }] }),
  spell({ id: "spell-cruel-mockery", name: "Moquerie cruelle", description: "Une pique enchantée trouble l'assurance de la cible.", level: 0, school: "enchantment", classes: [B], targeting: creatureTarget(18), components: V, effects: [damage("1d4", "psychique", "Moquerie cruelle"), condition("distracted", 1, "Déstabilisé")] }),
  spell({ id: "spell-mage-hand", name: "Main du mage", description: "Crée une main spectrale capable de manipuler de petits objets.", level: 0, school: "conjuration", classes: [W, B, S, K], targeting: objectTarget(9), effects: [condition("mage-hand", 10, "Main spectrale")] }),
  spell({ id: "spell-light", name: "Lumière", description: "Fait rayonner un objet comme une lanterne.", level: 0, school: "evocation", classes: [W, B, C, D, S], targeting: objectTarget(1.5), effects: [condition("luminous", "1 heure", "Lumière")] }),
  spell({ id: "spell-mending", name: "Réparation", description: "Répare une cassure ou déchirure simple sur un objet.", level: 0, school: "transmutation", classes: [W, B, D, S], targeting: objectTarget(1.5), components: material("deux petits aimants", { focusAllowed: true }), effects: [removeCondition("broken", "Réparation")] }),
  spell({ id: "spell-guidance", name: "Assistance", description: "Guide brièvement une créature dans sa prochaine tentative.", level: 0, school: "divination", classes: [C, D], targeting: touchTarget(), concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [condition("guided", 10, "Assistance")] }),
  spell({ id: "spell-minor-illusion", name: "Illusion mineure", description: "Produit un son ou une image illusoire de petite taille.", level: 0, school: "illusion", classes: [W, B, S, K], targeting: pointTarget(9, 0), components: S_ONLY, duration: oneMinute, effects: [condition("minor-illusion", 10, "Illusion mineure")] }),

  // Niveau 1 (16)
  spell({ id: "spell-magic-missile", name: "Projectile magique", description: "Trois projectiles de force frappent sans manquer leurs cibles désignées.", level: 1, school: "evocation", classes: [W, S], targeting: creatureTarget(36), components: VS, effects: [damage("3d4 + 3", "force", "Projectile magique")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d4 + 1" }] }),
  spell({ id: "spell-arcane-armor", name: "Armure mystique", description: "Une protection invisible renforce la défense d'une créature sans armure.", level: 1, school: "abjuration", classes: [W, S], targeting: touchTarget(), duration: { type: "untilRest", rest: "long" }, effects: [condition("arcane-armor", "repos long", "Armure mystique")] }),
  spell({ id: "spell-shield", name: "Bouclier", description: "Une barrière instantanée détourne une attaque imminente.", level: 1, school: "abjuration", classes: [W, S], targeting: selfTarget(), timing: "reaction", duration: { type: "rounds", value: 1 }, effects: [condition("shielded", 1, "Bouclier")] }),
  spell({ id: "spell-sleep", name: "Sommeil", description: "Une onde soporifique plonge les créatures fragiles dans le sommeil.", level: 1, school: "enchantment", classes: [W, B, S], targeting: pointTarget(27, 3), components: material("une pincée de sable fin", { focusAllowed: true }), duration: oneMinute, effects: [condition("unconscious", 10, "Sommeil")] }),
  spell({ id: "spell-thunderwave", name: "Onde tonnante", description: "Une onde sonore blesse et repousse autour du lanceur.", level: 1, school: "evocation", classes: [W, B, D, S], targeting: selfTarget(4.5), effects: [damage("2d8", "tonnerre", "Onde tonnante"), { effectId: "move", nom: "Repoussement", variables: { distance: 3, mode: "push" } }], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d8" }] }),
  spell({ id: "spell-comprehend-languages", name: "Compréhension des langues", description: "Permet de comprendre le sens littéral des langues entendues ou lues.", level: 1, school: "divination", classes: [W, B, K], targeting: selfTarget(), ritual: true, duration: oneHour, components: material("une pincée de suie et de sel", { focusAllowed: true }), effects: [condition("understands-languages", "1 heure", "Compréhension des langues")] }),
  spell({ id: "spell-detect-magic", name: "Détection de la magie", description: "Révèle les présences et signatures magiques proches.", level: 1, school: "divination", classes: [W, B, C, D, P, R, S], targeting: selfTarget(9), ritual: true, concentration: true, duration: { type: "concentration", maxRounds: 100 }, effects: [condition("detect-magic", 100, "Détection de la magie")] }),
  spell({ id: "spell-cure-wounds", name: "Soin des blessures", description: "Referme les blessures d'une créature touchée.", level: 1, school: "evocation", classes: [B, C, D, P, R], targeting: touchTarget(), effects: [heal("1d8 + INC", "Soin des blessures")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d8" }] }),
  spell({ id: "spell-healing-word", name: "Mot guérisseur", description: "Une parole brève rend des forces à distance.", level: 1, school: "evocation", classes: [B, C, D], targeting: creatureTarget(18, ["self", "ally"], true), components: V, timing: "bonus", effects: [heal("1d4 + INC", "Mot guérisseur")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d4" }] }),
  spell({ id: "spell-bless", name: "Bénédiction", description: "Accorde une faveur divine à plusieurs alliés.", level: 1, school: "enchantment", classes: [C, P], targeting: creatureTarget(9, ["self", "ally"], true), concentration: true, duration: { type: "concentration", maxRounds: 10 }, components: material("une goutte d'eau bénite", { focusAllowed: true }), effects: [condition("blessed", 10, "Bénédiction")] }),
  spell({ id: "spell-command", name: "Injonction", description: "Impose un ordre bref à une créature qui vous comprend.", level: 1, school: "enchantment", classes: [C, P], targeting: creatureTarget(18), components: V, duration: { type: "rounds", value: 1 }, effects: [condition("commanded", 1, "Injonction")] }),
  spell({ id: "spell-faerie-fire", name: "Lueur féerique", description: "Des lueurs colorées révèlent les silhouettes dans une zone.", level: 1, school: "evocation", classes: [B, D], targeting: pointTarget(18, 3), concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [condition("outlined", 10, "Lueur féerique")] }),
  spell({ id: "spell-entangle", name: "Enchevêtrement", description: "Des plantes jaillissent et entravent une zone.", level: 1, school: "conjuration", classes: [D, R], targeting: pointTarget(27, 3), concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [{ effectId: "createZone", nom: "Végétation entravante", variables: { zoneKind: "terrain", radius: 3, condition: "restrained", color: "#3F5641" } }] }),
  spell({ id: "spell-hunters-mark", name: "Marque du chasseur", description: "Désigne une proie et facilite sa poursuite.", level: 1, school: "divination", classes: [R], targeting: creatureTarget(27), timing: "bonus", concentration: true, duration: { type: "concentration", maxRounds: 600 }, effects: [condition("hunters-mark", 600, "Marque du chasseur")] }),
  spell({ id: "spell-luminous-smite", name: "Châtiment lumineux", description: "Charge la prochaine frappe d'une lumière éclatante.", level: 1, school: "evocation", classes: [P], targeting: selfTarget(), timing: "bonus", concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [condition("luminous-smite", 10, "Châtiment lumineux")] }),
  spell({ id: "spell-charm-person", name: "Charme d'une personne", description: "Dispose temporairement une personne à votre égard.", level: 1, school: "enchantment", classes: [W, B, D, S, K], targeting: creatureTarget(9), duration: oneHour, effects: [condition("charmed", "1 heure", "Charme d'une personne")] }),

  // Niveau 2 (14)
  spell({ id: "spell-misty-step", name: "Pas brumeux", description: "Téléporte le lanceur vers un point visible proche.", level: 2, school: "conjuration", classes: [W, S, K], targeting: destinationTarget(9), components: V, timing: "bonus", effects: [{ effectId: "teleport", nom: "Pas brumeux", variables: { range: 9 } }] }),
  spell({ id: "spell-invisibility", name: "Invisibilité", description: "Rend une créature invisible jusqu'à une action hostile.", level: 2, school: "illusion", classes: [W, B, S, K], targeting: touchTarget(), concentration: true, duration: { type: "concentration", maxRounds: 600 }, components: material("un cil dans de la gomme", { focusAllowed: true }), effects: [condition("hidden", 600, "Invisibilité")] }),
  spell({ id: "spell-mirror-image", name: "Image miroir", description: "Crée des doubles illusoires qui détournent les attaques.", level: 2, school: "illusion", classes: [W, S, K], targeting: selfTarget(), duration: oneMinute, effects: [condition("mirror-images", 10, "Images miroir")] }),
  spell({ id: "spell-web", name: "Toile d'araignée", description: "Remplit une zone de filaments collants et inflammables.", level: 2, school: "conjuration", classes: [W, S], targeting: pointTarget(18, 3), concentration: true, duration: { type: "concentration", maxRounds: 600 }, components: material("un morceau de toile d'araignée", { focusAllowed: true }), effects: [{ effectId: "createZone", nom: "Toile", variables: { zoneKind: "terrain", radius: 3, condition: "restrained", color: "#E4D8BE" } }] }),
  spell({ id: "spell-scorching-ray", name: "Rayons ardents", description: "Projette plusieurs rayons de feu sur les cibles choisies.", level: 2, school: "evocation", classes: [W, S], targeting: creatureTarget(36), effects: [damage("6d6", "feu", "Rayons ardents")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "2d6" }] }),
  spell({ id: "spell-shatter", name: "Fracas", description: "Une détonation brutale secoue créatures et objets.", level: 2, school: "evocation", classes: [W, B, S, K], targeting: pointTarget(18, 3), components: material("un éclat de mica", { focusAllowed: true }), effects: [damage("3d8", "tonnerre", "Fracas")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d8" }] }),
  spell({ id: "spell-silence", name: "Silence", description: "Aucun son ne peut être produit dans la zone.", level: 2, school: "illusion", classes: [B, C, R], targeting: pointTarget(36, 6), ritual: true, concentration: true, duration: { type: "concentration", maxRounds: 100 }, components: V, effects: [{ effectId: "createZone", nom: "Silence", variables: { zoneKind: "darkness", radius: 6, condition: "silenced", color: "#4B3B66" } }] }),
  spell({ id: "spell-lesser-restoration", name: "Restauration mineure", description: "Met fin à une affliction physique ou sensorielle courante.", level: 2, school: "abjuration", classes: [B, C, D, P, R], targeting: touchTarget(), effects: [removeCondition("poisoned", "Restauration"), removeCondition("blinded", "Restauration"), removeCondition("paralyzed", "Restauration")] }),
  spell({ id: "spell-spiritual-weapon", name: "Arme spirituelle", description: "Invoque une arme spectrale qui frappe à distance.", level: 2, school: "evocation", classes: [C], targeting: creatureTarget(18), timing: "bonus", duration: oneMinute, effects: [damage("1d8 + INC", "force", "Arme spirituelle")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d8" }] }),
  spell({ id: "spell-hold-person", name: "Paralysie d'une personne", description: "Paralyse brièvement une créature humanoïde.", level: 2, school: "enchantment", classes: [W, B, C, D, S, K], targeting: creatureTarget(18), concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [condition("paralyzed", 10, "Paralysie")] }),
  spell({ id: "spell-suggestion", name: "Suggestion", description: "Insuffle une ligne de conduite raisonnable à une créature.", level: 2, school: "enchantment", classes: [W, B, S, K], targeting: creatureTarget(9), components: V, concentration: true, duration: { type: "concentration", maxRounds: 4800 }, effects: [condition("suggested", "8 heures", "Suggestion")] }),
  spell({ id: "spell-spike-growth", name: "Croissance d'épines", description: "Camoufle un tapis d'épines qui blesse au passage.", level: 2, school: "transmutation", classes: [D, R], targeting: pointTarget(45, 6), concentration: true, duration: { type: "concentration", maxRounds: 100 }, effects: [{ effectId: "createZone", nom: "Épines", variables: { zoneKind: "hazard", radius: 6, damage: "2d4", damageType: "perforant", trigger: "enter", color: "#3F5641" } }] }),
  spell({ id: "spell-pass-without-trace", name: "Passage sans trace", description: "Étend un voile discret sur le groupe proche.", level: 2, school: "abjuration", classes: [D, R], targeting: selfTarget(9), concentration: true, duration: { type: "concentration", maxRounds: 600 }, components: material("des cendres de feuille", { focusAllowed: true }), effects: [condition("pass-without-trace", 600, "Passage sans trace")] }),
  spell({ id: "spell-detect-thoughts", name: "Détection des pensées", description: "Perçoit les pensées superficielles des esprits proches.", level: 2, school: "divination", classes: [W, B, S], targeting: selfTarget(9), concentration: true, duration: { type: "concentration", maxRounds: 10 }, components: material("une pièce de cuivre", { focusAllowed: true }), effects: [condition("detect-thoughts", 10, "Détection des pensées")] }),

  // Niveau 3 (14)
  spell({ id: "spell-fireball", name: "Boule de feu", description: "Une explosion de flammes embrase une large zone.", level: 3, school: "evocation", classes: [W, S], targeting: pointTarget(45, 6), components: material("soufre et guano", { focusAllowed: true }), effects: [damage("8d6", "feu", "Boule de feu")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d6" }] }),
  spell({ id: "spell-lightning-bolt", name: "Éclair", description: "Un trait de foudre traverse les créatures alignées.", level: 3, school: "evocation", classes: [W, S], targeting: pointTarget(30, 0), components: material("un morceau de fourrure et une tige d'ambre", { focusAllowed: true }), effects: [damage("8d6", "foudre", "Éclair")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d6" }] }),
  spell({ id: "spell-counterspell", name: "Contresort", description: "Interrompt une incantation au moment où elle se forme.", level: 3, school: "abjuration", classes: [W, S, K], targeting: creatureTarget(18), components: S_ONLY, timing: "reaction", effects: [condition("spell-countered", 1, "Contresort")] }),
  spell({ id: "spell-dispel-magic", name: "Dissipation de la magie", description: "Met fin à un effet magique persistant.", level: 3, school: "abjuration", classes: [W, B, C, D, P, S, K], targeting: objectTarget(36), effects: [{ effectId: "dispel", nom: "Dissipation", variables: { condition: "magic-effect" } }] }),
  spell({ id: "spell-fly", name: "Vol", description: "Confère une vitesse de vol à une créature.", level: 3, school: "transmutation", classes: [W, S, K], targeting: touchTarget(), concentration: true, duration: { type: "concentration", maxRounds: 100 }, components: material("une plume d'oiseau", { focusAllowed: true }), effects: [condition("flying", 100, "Vol")] }),
  spell({ id: "spell-haste", name: "Hâte", description: "Accélère les gestes et les déplacements d'une créature.", level: 3, school: "transmutation", classes: [W, S], targeting: creatureTarget(9, ["self", "ally"], true), concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [condition("hasted", 10, "Hâte"), { effectId: "modifyResource", nom: "Action accélérée", variables: { resource: "action", op: "add", value: 1 } }] }),
  spell({ id: "spell-slow", name: "Lenteur", description: "Altère le rythme d'un groupe de créatures.", level: 3, school: "transmutation", classes: [W, S], targeting: pointTarget(36, 6), concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [condition("slowed", 10, "Lenteur")] }),
  spell({ id: "spell-magic-circle", name: "Cercle magique", description: "Trace une protection contre une catégorie de créatures.", level: 3, school: "abjuration", classes: [W, C, P, K], targeting: pointTarget(3, 3), duration: oneHour, components: material("poudre d'argent consacrée", { itemTag: "silver-powder", consumed: true, name: "Poudre d'argent consacrée" }), effects: [{ effectId: "createZone", nom: "Cercle magique", variables: { zoneKind: "trigger", radius: 3, condition: "warded", color: "#9C7A2E" } }] }),
  spell({ id: "spell-spirit-guardians", name: "Gardiens spirituels", description: "Des esprits protecteurs tourbillonnent autour du lanceur.", level: 3, school: "conjuration", classes: [C], targeting: selfTarget(4.5), concentration: true, duration: { type: "concentration", maxRounds: 100 }, components: material("un symbole sacré", { focusAllowed: true }), effects: [damage("3d8", "radiant", "Gardiens spirituels")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d8" }] }),
  spell({ id: "spell-revivify", name: "Rappel à la vie", description: "Rappelle une créature morte depuis moins d'une minute.", level: 3, school: "necromancy", classes: [C, P], targeting: touchTarget(), components: material("un diamant", { itemTag: "diamond", consumed: true, name: "Diamant" }), effects: [heal(1, "Retour à la vie"), removeCondition("dead", "Rappel à la vie")] }),
  spell({ id: "spell-call-lightning", name: "Appel de la foudre", description: "Convoque un nuage d'où tombent des éclairs répétés.", level: 3, school: "conjuration", classes: [D], targeting: pointTarget(36, 1.5), concentration: true, duration: { type: "concentration", maxRounds: 100 }, effects: [damage("3d10", "foudre", "Appel de la foudre")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d10" }] }),
  spell({ id: "spell-plant-growth", name: "Croissance végétale", description: "Fait proliférer la végétation pour ralentir une vaste zone.", level: 3, school: "transmutation", classes: [B, D, R], targeting: pointTarget(45, 12), components: VS, effects: [{ effectId: "createZone", nom: "Croissance végétale", variables: { zoneKind: "terrain", radius: 12, condition: "slowed", color: "#3F5641" } }] }),
  spell({ id: "spell-hypnotic-pattern", name: "Motif hypnotique", description: "Un motif lumineux fascine les créatures qui le contemplent.", level: 3, school: "illusion", classes: [W, B, S, K], targeting: pointTarget(36, 4.5), components: S_ONLY, concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [condition("incapacitated", 10, "Hypnose")] }),
  spell({ id: "spell-fear", name: "Peur", description: "Projette une image terrifiante devant le lanceur.", level: 3, school: "illusion", classes: [W, B, S, K], targeting: pointTarget(9, 0), concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [condition("frightened", 10, "Peur")] }),

  // Niveau 4 (12)
  spell({ id: "spell-dimension-door", name: "Porte dimensionnelle", description: "Téléporte instantanément le lanceur et un compagnon.", level: 4, school: "conjuration", classes: [W, B, S, K], targeting: destinationTarget(150, false), components: V, effects: [{ effectId: "teleport", nom: "Porte dimensionnelle", variables: { range: 150 } }] }),
  spell({ id: "spell-greater-invisibility", name: "Invisibilité supérieure", description: "Maintient l'invisibilité même pendant le combat.", level: 4, school: "illusion", classes: [W, B, S], targeting: touchTarget(), concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [condition("hidden", 10, "Invisibilité supérieure")] }),
  spell({ id: "spell-stoneskin", name: "Peau de pierre", description: "Durcit la peau contre les blessures physiques.", level: 4, school: "abjuration", classes: [W, D, R, S], targeting: touchTarget(), concentration: true, duration: { type: "concentration", maxRounds: 600 }, components: material("poussière de diamant", { itemTag: "diamond-dust", consumed: true, name: "Poussière de diamant" }), effects: [condition("stoneskin", 600, "Peau de pierre")] }),
  spell({ id: "spell-polymorph", name: "Métamorphose", description: "Transforme temporairement une créature en bête.", level: 4, school: "transmutation", classes: [W, B, D, S], targeting: creatureTarget(18, ["self", "ally", "enemy"], true), concentration: true, duration: { type: "concentration", maxRounds: 600 }, components: material("un cocon vide", { focusAllowed: true }), effects: [condition("polymorphed", 600, "Métamorphose")] }),
  spell({ id: "spell-ice-storm", name: "Tempête de grêle", description: "Une pluie de glace écrase et gèle une zone.", level: 4, school: "evocation", classes: [W, D, S], targeting: pointTarget(90, 6), components: material("une goutte d'eau et de la poussière", { focusAllowed: true }), effects: [damage("2d8 + 4d6", "froid", "Tempête de grêle"), condition("slowed", 1, "Sol gelé")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d8" }] }),
  spell({ id: "spell-wall-of-fire", name: "Mur de feu", description: "Érige une barrière de flammes ardentes.", level: 4, school: "evocation", classes: [W, D, S], targeting: pointTarget(36, 6), concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [{ effectId: "createZone", nom: "Mur de feu", variables: { zoneKind: "hazard", radius: 6, damage: "5d8", damageType: "feu", trigger: "enter", color: "#8C0F00" } }] }),
  spell({ id: "spell-blight", name: "Flétrissement", description: "Draine brutalement l'humidité et la vitalité d'une cible.", level: 4, school: "necromancy", classes: [W, D, S, K], targeting: creatureTarget(9), effects: [damage("8d8", "necrotique", "Flétrissement")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d8" }] }),
  spell({ id: "spell-freedom-of-movement", name: "Liberté de mouvement", description: "Protège une créature des entraves et ralentissements.", level: 4, school: "abjuration", classes: [B, C, D, R], targeting: touchTarget(), duration: oneHour, components: material("une lanière de cuir", { focusAllowed: true }), effects: [removeCondition("restrained", "Liberté de mouvement"), removeCondition("immobilized", "Liberté de mouvement"), condition("free-movement", "1 heure", "Liberté de mouvement")] }),
  spell({ id: "spell-guardian-of-faith", name: "Gardien de la foi", description: "Invoque un gardien immobile qui frappe les intrus.", level: 4, school: "conjuration", classes: [C], targeting: pointTarget(9), duration: { type: "rounds", value: 4800 }, components: V, effects: [{ effectId: "createZone", nom: "Gardien de la foi", variables: { zoneKind: "trigger", radius: 3, damage: 20, damageType: "radiant", trigger: "enter", color: "#9C7A2E" } }] }),
  spell({ id: "spell-confusion", name: "Confusion", description: "Désorganise les pensées et les actions dans une zone.", level: 4, school: "enchantment", classes: [W, B, D, S], targeting: pointTarget(27, 3), concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [condition("confused", 10, "Confusion")] }),
  spell({ id: "spell-hallucinatory-terrain", name: "Terrain hallucinatoire", description: "Donne à un vaste terrain l'apparence d'un autre paysage.", level: 4, school: "illusion", classes: [W, B, D, K], targeting: pointTarget(90, 45), duration: { type: "rounds", value: 14400 }, components: material("un petit mélange de terre et de mousse", { focusAllowed: true }), effects: [condition("hallucinatory-terrain", "24 heures", "Terrain hallucinatoire")] }),
  spell({ id: "spell-compulsion", name: "Compulsion", description: "Force plusieurs créatures à se déplacer selon votre injonction.", level: 4, school: "enchantment", classes: [B], targeting: pointTarget(9, 9), concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [condition("compelled", 10, "Compulsion")] }),

  // Niveau 5 (10)
  spell({ id: "spell-cone-of-cold", name: "Cône de froid", description: "Un souffle glacial balaie une large zone devant le lanceur.", level: 5, school: "evocation", classes: [W, S], targeting: pointTarget(18), components: material("un petit cône de cristal", { focusAllowed: true }), effects: [damage("8d8", "froid", "Cône de froid")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d8" }] }),
  spell({ id: "spell-wall-of-force", name: "Mur de force", description: "Crée une barrière invisible presque infranchissable.", level: 5, school: "evocation", classes: [W], targeting: pointTarget(36, 6), concentration: true, duration: { type: "concentration", maxRounds: 100 }, components: material("une pincée de poudre de gemme", { focusAllowed: true }), effects: [{ effectId: "createZone", nom: "Mur de force", variables: { zoneKind: "cover", radius: 6, condition: "blocked", color: "#4B3B66" } }] }),
  spell({ id: "spell-teleportation-circle", name: "Cercle de téléportation", description: "Ouvre brièvement un passage vers un cercle connu.", level: 5, school: "conjuration", classes: [W, B, S], targeting: pointTarget(3), components: material("craies et encres magiques", { itemTemplateId: "tpl_chalk", consumed: true, quantity: 1, name: "Craie rituelle" }), effects: [{ effectId: "teleport", nom: "Cercle de téléportation", variables: { range: 10000 } }] }),
  spell({ id: "spell-dominate-person", name: "Domination de personne", description: "Prend le contrôle mental d'une personne.", level: 5, school: "enchantment", classes: [W, B, S], targeting: creatureTarget(18), concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [condition("dominated", 10, "Domination")] }),
  spell({ id: "spell-raise-dead", name: "Retour à la vie", description: "Rappelle une créature morte depuis moins de dix jours.", level: 5, school: "necromancy", classes: [B, C, P], targeting: touchTarget(), components: material("un diamant précieux", { itemTag: "diamond", consumed: true, name: "Diamant précieux" }), effects: [heal(1, "Retour à la vie"), removeCondition("dead", "Retour à la vie")] }),
  spell({ id: "spell-flame-strike", name: "Colonne de flamme", description: "Un pilier mêlant feu et lumière divine s'abat sur une zone.", level: 5, school: "evocation", classes: [C], targeting: pointTarget(18, 3), effects: [damage("4d6", "feu", "Flamme"), damage("4d6", "radiant", "Lumière divine")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d6" }, { effectIndex: 1, variable: "value", addPerSlotLevel: "1d6" }] }),
  spell({ id: "spell-commune-with-nature", name: "Communion avec la nature", description: "Révèle les faits majeurs du territoire naturel environnant.", level: 5, school: "divination", classes: [D, R], targeting: selfTarget(), ritual: true, effects: [condition("communing-with-nature", 1, "Communion avec la nature")] }),
  spell({ id: "spell-insect-plague", name: "Fléau d'insectes", description: "Une nuée vorace obscurcit et dévore une zone.", level: 5, school: "conjuration", classes: [C, D, S], targeting: pointTarget(90, 6), concentration: true, duration: { type: "concentration", maxRounds: 100 }, components: material("quelques grains et une goutte de miel", { focusAllowed: true }), effects: [{ effectId: "createZone", nom: "Fléau d'insectes", variables: { zoneKind: "hazard", radius: 6, damage: "4d10", damageType: "perforant", trigger: "startTurn", color: "#6E5A3C" } }] }),
  spell({ id: "spell-hold-monster", name: "Paralysie d'une créature", description: "Paralyse une créature quelle que soit sa nature.", level: 5, school: "enchantment", classes: [W, B, S, K], targeting: creatureTarget(27), concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [condition("paralyzed", 10, "Paralysie")] }),
  spell({ id: "spell-modify-memory", name: "Modification de mémoire", description: "Altère le souvenir récent d'une créature.", level: 5, school: "enchantment", classes: [W, B], targeting: creatureTarget(9), concentration: true, duration: { type: "concentration", maxRounds: 10 }, effects: [condition("memory-modified", "permanent", "Mémoire modifiée")] }),

  // Niveau 6 (8)
  spell({ id: "spell-disintegrate", name: "Désintégration", description: "Un rayon vert pulvérise la matière qu'il frappe.", level: 6, school: "transmutation", classes: [W, S], targeting: creatureTarget(18), components: material("une pierre magnétique et de la poussière", { focusAllowed: true }), effects: [damage("10d6 + 40", "force", "Désintégration")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "3d6" }] }),
  spell({ id: "spell-globe-of-invulnerability", name: "Globe d'invulnérabilité", description: "Un globe immobile bloque les magies plus faibles.", level: 6, school: "abjuration", classes: [W, S], targeting: selfTarget(3), concentration: true, duration: { type: "concentration", maxRounds: 10 }, components: material("une perle de verre", { focusAllowed: true }), effects: [condition("globe-invulnerability", 10, "Globe d'invulnérabilité")] }),
  spell({ id: "spell-chain-lightning", name: "Chaîne d'éclairs", description: "Un éclair bondit d'une cible à plusieurs autres.", level: 6, school: "evocation", classes: [W, S], targeting: creatureTarget(45), components: material("un éclat d'ambre", { focusAllowed: true }), effects: [damage("10d8", "foudre", "Chaîne d'éclairs")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d8" }] }),
  spell({ id: "spell-contingency", name: "Contingence", description: "Lie un sort à une condition précise choisie à l'avance.", level: 6, school: "evocation", classes: [W], targeting: selfTarget(), duration: { type: "permanent" }, components: material("une figurine ouvragée", { itemTag: "arcane-figurine", consumed: false, name: "Figurine ouvragée" }), effects: [condition("contingency", "jusqu'au déclenchement", "Contingence")] }),
  spell({ id: "spell-heal", name: "Guérison suprême", description: "Restaure immédiatement une grande quantité de vitalité.", level: 6, school: "evocation", classes: [C, D], targeting: creatureTarget(18, ["self", "ally"], true), components: VS, effects: [heal(70, "Guérison suprême")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: 10 }] }),
  spell({ id: "spell-heroes-feast", name: "Festin des héros", description: "Crée un banquet qui fortifie durablement ses convives.", level: 6, school: "conjuration", classes: [C, D], targeting: selfTarget(9), components: material("un bol serti de gemmes", { itemTag: "jeweled-bowl", consumed: true, name: "Bol serti de gemmes" }), duration: { type: "untilRest", rest: "long" }, effects: [heal("2d10", "Festin des héros"), condition("heroes-feast", "repos long", "Festin des héros")] }),
  spell({ id: "spell-wind-walk", name: "Marche sur le vent", description: "Transforme le groupe en formes nuageuses rapides.", level: 6, school: "transmutation", classes: [D], targeting: selfTarget(9), duration: { type: "rounds", value: 4800 }, components: material("du feu et de l'eau bénite", { focusAllowed: true }), effects: [condition("wind-walk", "8 heures", "Marche sur le vent")] }),
  spell({ id: "spell-mass-suggestion", name: "Suggestion collective", description: "Insuffle la même conduite à un groupe de créatures.", level: 6, school: "enchantment", classes: [W, B, S, K], targeting: pointTarget(18, 18), components: V, duration: { type: "rounds", value: 14400 }, effects: [condition("suggested", "24 heures", "Suggestion collective")] }),

  // Niveau 7 (6)
  spell({ id: "spell-teleport", name: "Téléportation", description: "Transporte instantanément un groupe vers une destination connue.", level: 7, school: "conjuration", classes: [W, B, S], targeting: destinationTarget(1000000, false), components: V, effects: [{ effectId: "teleport", nom: "Téléportation", variables: { range: 1000000 } }] }),
  spell({ id: "spell-forcecage", name: "Cage de force", description: "Enferme une zone dans une prison de force invisible.", level: 7, school: "evocation", classes: [W, B, K], targeting: pointTarget(30, 3), duration: oneHour, components: material("poussière de rubis", { itemTag: "ruby-dust", consumed: true, name: "Poussière de rubis" }), effects: [{ effectId: "createZone", nom: "Cage de force", variables: { zoneKind: "cover", radius: 3, condition: "trapped", color: "#9C7A2E" } }] }),
  spell({ id: "spell-resurrection", name: "Résurrection", description: "Rappelle une créature morte depuis moins d'un siècle.", level: 7, school: "necromancy", classes: [B, C], targeting: touchTarget(), components: material("un diamant exceptionnel", { itemTag: "diamond", consumed: true, quantity: 2, name: "Diamants exceptionnels" }), effects: [heal(1, "Résurrection"), removeCondition("dead", "Résurrection")] }),
  spell({ id: "spell-fire-storm", name: "Tempête de feu", description: "Des nappes de feu frappent plusieurs zones choisies.", level: 7, school: "evocation", classes: [C, D, S], targeting: pointTarget(45, 9), effects: [damage("7d10", "feu", "Tempête de feu")], upcast: [{ effectIndex: 0, variable: "value", addPerSlotLevel: "1d10" }] }),
  spell({ id: "spell-arcane-sword", name: "Épée arcanique", description: "Une lame de force flotte et frappe sur ordre.", level: 7, school: "evocation", classes: [W, B], targeting: creatureTarget(18), timing: "bonus", concentration: true, duration: { type: "concentration", maxRounds: 10 }, components: material("une réplique miniature d'épée", { focusAllowed: true }), effects: [damage("3d10", "force", "Épée arcanique")] }),
  spell({ id: "spell-etherealness", name: "Forme éthérée", description: "Fait glisser le lanceur dans le plan éthéré.", level: 7, school: "transmutation", classes: [W, B, C, S, K], targeting: selfTarget(), duration: { type: "rounds", value: 480 }, components: VS, effects: [condition("ethereal", "8 heures", "Forme éthérée")] }),

  // Niveau 8 (5)
  spell({ id: "spell-maze", name: "Labyrinthe", description: "Bannit temporairement une créature dans un dédale extradimensionnel.", level: 8, school: "conjuration", classes: [W], targeting: creatureTarget(18), concentration: true, duration: { type: "concentration", maxRounds: 100 }, effects: [condition("banished-maze", 100, "Labyrinthe")] }),
  spell({ id: "spell-dominate-monster", name: "Domination de monstre", description: "Prend le contrôle mental de n'importe quelle créature.", level: 8, school: "enchantment", classes: [W, B, S, K], targeting: creatureTarget(18), concentration: true, duration: { type: "concentration", maxRounds: 600 }, effects: [condition("dominated", 600, "Domination de monstre")] }),
  spell({ id: "spell-mind-blank", name: "Esprit impénétrable", description: "Protège totalement un esprit des intrusions et divinations.", level: 8, school: "abjuration", classes: [W, B], targeting: touchTarget(), duration: { type: "rounds", value: 14400 }, effects: [condition("mind-blank", "24 heures", "Esprit impénétrable")] }),
  spell({ id: "spell-earthquake", name: "Tremblement de terre", description: "Fait se rompre le sol dans une vaste zone.", level: 8, school: "evocation", classes: [C, D, S], targeting: pointTarget(150, 30), concentration: true, duration: { type: "concentration", maxRounds: 10 }, components: material("une motte de terre et une pierre", { focusAllowed: true }), effects: [{ effectId: "createZone", nom: "Tremblement de terre", variables: { zoneKind: "hazard", radius: 30, damage: "5d6", damageType: "contondant", condition: "prone", trigger: "startTurn", color: "#6E5A3C" } }] }),
  spell({ id: "spell-holy-aura", name: "Aura sacrée", description: "Une lumière protectrice enveloppe les alliés proches.", level: 8, school: "abjuration", classes: [C], targeting: selfTarget(9), concentration: true, duration: { type: "concentration", maxRounds: 10 }, components: material("un reliquaire sacré", { itemTag: "holy-reliquary", consumed: false, name: "Reliquaire sacré" }), effects: [condition("holy-aura", 10, "Aura sacrée")] }),

  // Niveau 9 (5)
  spell({ id: "spell-wish", name: "Souhait", description: "Altère la réalité dans les limites consenties par le Conteur.", level: 9, school: "conjuration", classes: [W, S], targeting: selfTarget(), components: V, effects: [condition("wish-invoked", 1, "Souhait")] }),
  spell({ id: "spell-time-stop", name: "Arrêt du temps", description: "Accorde au lanceur quelques instants hors du cours normal du temps.", level: 9, school: "transmutation", classes: [W, S], targeting: selfTarget(), components: V, effects: [condition("time-stopped", "1d4 + 1 tours", "Arrêt du temps"), { effectId: "modifyResource", nom: "Temps supplémentaire", variables: { resource: "action", op: "add", value: 2 } }] }),
  spell({ id: "spell-mass-heal", name: "Guérison collective", description: "Distribue une immense réserve de vitalité entre les alliés.", level: 9, school: "evocation", classes: [C], targeting: selfTarget(18), effects: [heal(700, "Guérison collective")] }),
  spell({ id: "spell-meteor-swarm", name: "Nuée de météores", description: "Des météores dévastent plusieurs zones éloignées.", level: 9, school: "evocation", classes: [W, S], targeting: pointTarget(1500, 12), effects: [damage("20d6", "feu", "Nuée de météores"), damage("20d6", "contondant", "Impact météorique")] }),
  spell({ id: "spell-true-resurrection", name: "Résurrection véritable", description: "Rend la vie et un corps intact à une âme libre.", level: 9, school: "necromancy", classes: [C, D], targeting: touchTarget(), components: material("des diamants légendaires", { itemTag: "diamond", consumed: true, quantity: 5, name: "Diamants légendaires" }), effects: [heal(200, "Résurrection véritable"), removeCondition("dead", "Résurrection véritable")] }),
];

if (initialSpellTemplates.length !== 100) {
  throw new Error(`Le catalogue de sorts doit contenir exactement 100 entrées (${initialSpellTemplates.length} actuellement).`);
}

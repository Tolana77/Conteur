import type {
  EffectTemplate,
  ItemEffectRef,
  ItemRarity,
  ItemTemplate,
} from "../../app/types";

export const itemRarities: ItemRarity[] = [
  "mundane",
  "common",
  "uncommon",
  "rare",
  "veryRare",
  "legendary",
  "artifact",
];

export const ITEM_CREATION_POLICY_TEXT = [
  "Réutilisation obligatoire: cherche d'abord le template mécaniquement le plus proche. Un autre nom, propriétaire, matériau, origine, apparence ou description se fait sur l'instance avec overrides.name et overrides.description.",
  "Une légère variation de poids ou un effet exceptionnel propre à un exemplaire se fait aussi sur l'instance. Crée un template seulement si le profil d'attaque, la défense, le ciblage ou un ensemble d'effets réutilisable change réellement.",
  "Équipement ordinaire: aucun bonus direct de caractéristique et aucun bonus magique implicite. Repères D&D light: dague 1d4, arme simple 1d6, arme martiale 1d8, arme lourde à deux mains 1d10 à 2d6.",
  "Bonus de caractéristique: exceptionnel, magique, rare ou supérieur, avec harmonisation requise; valeur absolue maximale 2. Préfère portée, option d'attaque, résistance, capacité à charges ou avantage circonstanciel.",
  "Objet magique: préfère une capacité limitée, une résistance ou un usage à charges à un bonus numérique permanent. Ne simule jamais un bonus d'attaque ou de dégâts en modifiant une caractéristique du personnage.",
  "Les objets de départ sont mundane ou common. Ils utilisent un template du catalogue et reçoivent un nom et une description adaptés à la campagne via l'instance.",
].join("\n");

const functionalTags = new Set([
  "ammunition",
  "bound",
  "catalyst",
  "cursed",
  "finesse",
  "heavy",
  "light",
  "loading",
  "magnetic",
  "magic",
  "melee",
  "ranged",
  "reach",
  "thrown",
  "throwable",
  "two-handed",
  "versatile",
]);

export function normalizeItemRarity(value: unknown): ItemRarity {
  return itemRarities.includes(value as ItemRarity) ? value as ItemRarity : "mundane";
}

export function findMechanicallyEquivalentItemTemplate(
  template: ItemTemplate,
  catalog: ItemTemplate[],
): ItemTemplate | undefined {
  const signature = createMechanicalSignature(template);
  return catalog.find((candidate) =>
    candidate.id !== template.id && createMechanicalSignature(candidate) === signature,
  );
}

export function validateDirectStatItemEffects(
  template: Pick<ItemTemplate, "effects" | "rarity" | "requiresAttunement" | "tags">,
  effectTemplates: EffectTemplate[] = [],
): string[] {
  const adjustments = resolveDirectStatAdjustments(template.effects, effectTemplates);
  if (!adjustments.length) return [];

  const errors: string[] = [];
  if (itemRarities.indexOf(template.rarity) < itemRarities.indexOf("rare")) {
    errors.push("Un bonus direct de caractéristique exige une rareté rare ou supérieure.");
  }
  if (!template.requiresAttunement) {
    errors.push("Un bonus direct de caractéristique exige requiresAttunement=true.");
  }
  if (!template.tags.some((tag) => tag === "magic" || tag === "magique")) {
    errors.push("Un bonus direct de caractéristique exige le tag magic.");
  }
  adjustments.forEach((value) => {
    if (!Number.isFinite(value) || Math.abs(value) > 2) {
      errors.push("Un bonus direct de caractéristique doit être compris entre -2 et +2.");
    }
  });
  return [...new Set(errors)];
}

export function hasDirectStatItemEffect(
  effects: ItemEffectRef[],
  effectTemplates: EffectTemplate[] = [],
): boolean {
  return resolveDirectStatAdjustments(effects, effectTemplates).length > 0;
}

function resolveDirectStatAdjustments(
  effects: ItemEffectRef[],
  effectTemplates: EffectTemplate[],
): number[] {
  return effects.flatMap((effect) => {
    if (effect.effectId === "modifyStat") return [Number(effect.variables?.value)];
    const template = effectTemplates.find((candidate) => candidate.id === effect.effectId);
    return template?.actions
      .filter((action) => action.operation === "modifyStat")
      .map((action) => Number(effect.variables?.value ?? action.variables.value)) ?? [];
  });
}

function createMechanicalSignature(template: ItemTemplate): string {
  const base = Object.fromEntries(
    Object.entries(template.base).filter(([key]) => !["cost", "price", "weight"].includes(key)),
  );
  return stableStringify({
    type: template.type,
    types: [...template.types].sort(),
    functionalTags: template.tags.filter((tag) => functionalTags.has(tag)).sort(),
    base,
    effects: template.effects,
    attacks: template.attacks ?? [],
    attackModifiers: template.attackModifiers ?? [],
    targetingV2: template.targetingV2 ?? null,
    requiresAttunement: template.requiresAttunement ?? false,
    modules: template.modules,
  });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

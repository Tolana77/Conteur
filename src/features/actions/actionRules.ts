import type {
  CharacterStats,
  GameActionScalingRule,
  GameActionTemplate,
  ItemEffectRef,
} from "../../app/types";

export interface GameActionScalingContext {
  characterLevel?: number;
  abilityLevel?: number;
  slotLevel?: number;
  itemLevel?: number;
  castingAbility?: keyof CharacterStats;
  displayLevel?: number;
  baseLevel?: number;
}

export function getGameActionTemplate(
  templates: GameActionTemplate[],
  actionId: string | undefined,
): GameActionTemplate | undefined {
  if (!actionId) return undefined;
  return templates.find((template) => template.id === actionId);
}

/**
 * Résout les valeurs variables d'une action sans modifier son template.
 * Le même pipeline sert aux capacités, aux sorts et plus tard aux objets.
 */
export function resolveGameActionEffects(
  action: GameActionTemplate,
  context: GameActionScalingContext = {},
): ItemEffectRef[] {
  return action.effects.map((effect, effectIndex) => {
    const variables: Record<string, number | string | boolean> = {
      ...(effect.variables ?? {}),
      ...(context.displayLevel !== undefined ? { level: context.displayLevel } : {}),
      ...(context.baseLevel !== undefined ? { baseLevel: context.baseLevel } : {}),
    };

    action.scaling
      ?.filter((rule) => rule.effectIndex === effectIndex)
      .forEach((rule) => {
        const steps = getScalingSteps(rule, context);
        if (steps <= 0) return;
        variables[rule.variable] = addScaledValue(
          variables[rule.variable],
          rule.addPerStep,
          steps,
        );
      });

    if (context.castingAbility) {
      const abbreviation = statAbbreviations[context.castingAbility];
      Object.entries(variables).forEach(([key, value]) => {
        if (typeof value === "string") {
          variables[key] = value.replace(/\bINC\b/g, abbreviation);
        }
      });
    }

    return { ...effect, variables };
  });
}

function getScalingSteps(
  rule: GameActionScalingRule,
  context: GameActionScalingContext,
): number {
  const rawLevel = context[rule.mode];
  if (!Number.isFinite(rawLevel)) return 0;
  const level = Math.max(0, Math.min(rule.maxLevel ?? Number.MAX_SAFE_INTEGER, Number(rawLevel)));

  if (rule.thresholds && rule.thresholds.length > 0) {
    return rule.thresholds.filter((threshold) => level >= threshold).length;
  }

  const every = Math.max(1, Math.floor(rule.every ?? 1));
  return Math.max(0, Math.floor((level - rule.baseLevel) / every));
}

function addScaledValue(
  base: number | string | boolean | undefined,
  increment: number | string,
  steps: number,
): number | string {
  if (typeof base === "number" && typeof increment === "number") {
    return base + increment * steps;
  }

  const baseText = typeof base === "number" || typeof base === "string" ? String(base) : "0";
  return [baseText, ...Array.from({ length: steps }, () => String(increment))].join(" + ");
}

const statAbbreviations: Record<keyof CharacterStats, string> = {
  force: "FOR",
  dexterite: "DEX",
  constitution: "CON",
  intelligence: "INT",
  sagesse: "SAG",
  charisme: "CHA",
};

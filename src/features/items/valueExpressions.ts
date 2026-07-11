import type { CharacterStats } from "../../core/models";

export type EffectValue = number | string;

export interface ValueExpressionContext {
  level: number;
  stats: CharacterStats;
  modifiers: CharacterStats;
}

const statAliases: Record<string, keyof CharacterStats> = {
  FOR: "force",
  DEX: "dexterite",
  CON: "constitution",
  INT: "intelligence",
  SAG: "sagesse",
  CHA: "charisme",
};

export function formatEffectValueExpression(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim()) {
    return normalizeExpression(value);
  }

  return "";
}

export function resolveEffectValue(value: unknown, context: ValueExpressionContext): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return 0;
  }

  return normalizeExpression(value)
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((total, part) => total + resolveExpressionPart(part, context), 0);
}

function normalizeExpression(value: string): string {
  return value
    .trim()
    .replace(/\s*\+\s*/g, " + ")
    .replace(/\b(niv|niveau|level|lvl)\b/gi, "NIV")
    .replace(/\b(for|force)\b/gi, "FOR")
    .replace(/\b(dex|dextérité|dexterite)\b/gi, "DEX")
    .replace(/\b(con|constitution)\b/gi, "CON")
    .replace(/\b(int|intelligence)\b/gi, "INT")
    .replace(/\b(sag|sagesse)\b/gi, "SAG")
    .replace(/\b(cha|charisme)\b/gi, "CHA");
}

function resolveExpressionPart(part: string, context: ValueExpressionContext): number {
  const normalizedPart = part.toUpperCase();
  const diceMatch = normalizedPart.match(/^(\d*)D(\d+)$/);

  if (diceMatch) {
    const count = Math.max(1, Number(diceMatch[1] || 1));
    const sides = Math.max(1, Number(diceMatch[2]));
    let total = 0;

    for (let index = 0; index < count; index += 1) {
      total += Math.floor(Math.random() * sides) + 1;
    }

    return total;
  }

  if (normalizedPart === "NIV") {
    return context.level;
  }

  const stat = statAliases[normalizedPart];

  if (stat) {
    return context.modifiers[stat];
  }

  const fixedValue = Number(normalizedPart);

  return Number.isFinite(fixedValue) ? fixedValue : 0;
}

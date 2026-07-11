import type { DiceKind, DiceRoll, DiceRollTerm, DiceVisibility } from "../../app/types";

interface ParsedDiceTerm {
  count: number;
  sides: number;
  sign: 1 | -1;
}

interface ParsedFormula {
  diceTerms: ParsedDiceTerm[];
  modifier: number;
  modifierTerms: DiceRollTerm[];
}

export interface RollFormulaOptions {
  visibility?: DiceVisibility;
  reason?: string;
  variables?: Record<string, number | { value: number; color?: string }>;
}

function normalizeVariableName(value: string): string {
  return value.trim().toUpperCase();
}

function resolveVariable(
  value: string,
  variables: RollFormulaOptions["variables"],
): { label: string; value: number; color?: string } | null {
  const variable = variables?.[normalizeVariableName(value)];

  if (typeof variable === "number") {
    return { label: normalizeVariableName(value), value: variable };
  }

  if (variable && typeof variable.value === "number") {
    return { label: normalizeVariableName(value), value: variable.value, color: variable.color };
  }

  return null;
}

function parseDiceFormula(formula: string, variables: RollFormulaOptions["variables"]): ParsedFormula {
  const normalizedFormula = formula
    .trim()
    .replace(/−/g, "-")
    .replace(/\s+/g, "")
    .toLowerCase();

  if (!normalizedFormula) {
    throw new Error("La formule de dé est vide.");
  }

  const parts = normalizedFormula.match(/[+-]?[^+-]+/g) ?? [];
  const diceTerms: ParsedDiceTerm[] = [];
  const modifierTerms: DiceRollTerm[] = [];
  let modifier = 0;

  parts.forEach((part) => {
    const sign: 1 | -1 = part.startsWith("-") ? -1 : 1;
    const value = part.replace(/^[+-]/, "");
    const diceMatch = value.match(/^(\d*)d(\d+)$/);

    if (diceMatch) {
      const count = Number(diceMatch[1] || 1);
      const sides = Number(diceMatch[2]);

      if (!Number.isInteger(count) || count < 1 || !Number.isInteger(sides) || sides < 2) {
        throw new Error(`Formule de dé invalide : ${formula}`);
      }

      diceTerms.push({ count, sides, sign });
      return;
    }

    const numericValue = Number(value);

    if (Number.isFinite(numericValue)) {
      const finalValue = sign * numericValue;
      modifier += finalValue;
      modifierTerms.push({
        kind: "modifier",
        label: String(numericValue),
        value: finalValue,
      });
      return;
    }

    const variable = resolveVariable(value, variables);

    if (!variable) {
      throw new Error(`Modificateur inconnu dans la formule : ${value.toUpperCase()}`);
    }

    const finalValue = sign * variable.value;
    modifier += finalValue;
    modifierTerms.push({
      kind: "modifier",
      label: variable.label,
      value: finalValue,
      color: variable.color,
    });
  });

  if (diceTerms.length === 0) {
    throw new Error(`La formule doit contenir au moins un dé : ${formula}`);
  }

  return { diceTerms, modifier, modifierTerms };
}

function rollOneDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function getDiceKind(primarySides: number): DiceKind {
  if (primarySides === 20) {
    return "d20";
  }

  if (primarySides === 6) {
    return "d6";
  }

  return "custom";
}

export function rollDiceFormula(formula: string, options: RollFormulaOptions = {}): DiceRoll {
  const parsedFormula = parseDiceFormula(formula, options.variables);
  const rolls: number[] = [];
  const terms: DiceRollTerm[] = [];
  let diceTotal = 0;

  parsedFormula.diceTerms.forEach((term) => {
    for (let index = 0; index < term.count; index += 1) {
      const roll = rollOneDie(term.sides);
      rolls.push(term.sign * roll);
      diceTotal += term.sign * roll;
      terms.push({
        kind: "die",
        label: `1d${term.sides}`,
        sides: term.sides,
        value: term.sign * roll,
      });
    }
  });

  const firstDice = parsedFormula.diceTerms[0];

  if (!firstDice) {
    throw new Error(`La formule doit contenir au moins un dé : ${formula}`);
  }

  return {
    id: `roll-${crypto.randomUUID()}`,
    kind: getDiceKind(firstDice.sides),
    formula: formula.trim(),
    sides: firstDice.sides,
    rolls,
    modifier: parsedFormula.modifier,
    terms: [...terms, ...parsedFormula.modifierTerms],
    result: diceTotal + parsedFormula.modifier,
    visibility: options.visibility ?? "public",
    reason: options.reason,
    timestamp: Date.now(),
  };
}

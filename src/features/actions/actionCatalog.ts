import type { GameActionTemplate } from "../../app/types";
import { initialAbilityActionTemplates } from "../abilities/abilityTemplates";
import { initialSpellActionTemplates } from "../spells/spellCatalog";

export const initialGameActionTemplates: GameActionTemplate[] = [
  ...initialAbilityActionTemplates,
  ...initialSpellActionTemplates,
];

const duplicateActionIds = initialGameActionTemplates
  .filter((template, index, templates) => templates.findIndex((candidate) => candidate.id === template.id) !== index)
  .map((template) => template.id);

if (duplicateActionIds.length > 0) {
  throw new Error(`Identifiants d'action dupliqués : ${[...new Set(duplicateActionIds)].join(", ")}`);
}

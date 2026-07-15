import type { AbilityInstance, AbilityTemplate } from "../../app/types";

function getInitialCharges(template: AbilityTemplate): number | undefined {
  if (!template.charges) {
    return undefined;
  }

  return Math.max(0, Math.min(template.charges.max, template.charges.initial ?? template.charges.max));
}

export function createAbilityInstance(
  id: string,
  templateId: string,
  ownerId: string,
  templates: AbilityTemplate[],
  grantedByItemId?: string,
): AbilityInstance {
  const template = templates.find((candidate) => candidate.id === templateId);
  const charges = template ? getInitialCharges(template) : undefined;

  return {
    id,
    templateId,
    ownerId,
    ...(grantedByItemId ? { grantedByItemId } : {}),
    overrides: {},
    current: charges === undefined ? {} : { charges },
    data: {},
    effects: [],
  };
}

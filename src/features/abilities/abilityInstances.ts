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

export function createInitialAbilityInstances(
  characterId: string,
  templates: AbilityTemplate[],
): AbilityInstance[] {
  return [
    createAbilityInstance("ability-second-wind-01", "abl_second_wind", characterId, templates),
    createAbilityInstance("ability-shadow-step-01", "abl_shadow_step", characterId, templates),
    createAbilityInstance("ability-rallying-cry-01", "abl_rallying_cry", characterId, templates),
    createAbilityInstance("ability-quick-shot-01", "abl_quick_shot", characterId, templates),
    createAbilityInstance("ability-sixth-sense-01", "abl_sixth_sense", characterId, templates),
  ];
}

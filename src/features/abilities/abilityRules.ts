import type {
  AbilityInstance,
  AbilityRechargeTrigger,
  AbilityTemplate,
} from "../../app/types";

export function getAbilityMaxCharges(template: AbilityTemplate | undefined): number | null {
  return template?.charges?.max ?? null;
}

export function getAbilityCharges(
  ability: AbilityInstance,
  template: AbilityTemplate | undefined,
): number | null {
  const maxCharges = getAbilityMaxCharges(template);

  if (maxCharges === null) {
    return null;
  }

  const charges = Number(ability.current.charges);
  return Number.isFinite(charges) ? Math.max(0, Math.min(maxCharges, charges)) : maxCharges;
}

export function canUseAbility(
  ability: AbilityInstance,
  template: AbilityTemplate | undefined,
): boolean {
  const charges = getAbilityCharges(ability, template);
  return charges === null || charges > 0;
}

export function useAbilityCharge(
  ability: AbilityInstance,
  template: AbilityTemplate | undefined,
): AbilityInstance {
  const charges = getAbilityCharges(ability, template);

  if (charges === null || charges <= 0) {
    return ability;
  }

  return {
    ...ability,
    current: {
      ...ability.current,
      charges: charges - 1,
    },
  };
}

export function rechargeAbility(
  ability: AbilityInstance,
  template: AbilityTemplate | undefined,
  trigger: AbilityRechargeTrigger,
): AbilityInstance {
  if (!template?.charges || !template.charges.recharge.includes(trigger)) {
    return ability;
  }

  const currentCharges = getAbilityCharges(ability, template) ?? template.charges.max;
  const amount = template.charges.rechargeAmount ?? "full";
  const nextCharges =
    amount === "full" ? template.charges.max : Math.min(template.charges.max, currentCharges + amount);

  return {
    ...ability,
    current: {
      ...ability.current,
      charges: nextCharges,
    },
  };
}

export function setAbilityCharges(
  ability: AbilityInstance,
  template: AbilityTemplate | undefined,
  charges: number,
): AbilityInstance {
  const maxCharges = getAbilityMaxCharges(template);

  if (maxCharges === null) {
    return ability;
  }

  return {
    ...ability,
    current: {
      ...ability.current,
      charges: Math.max(0, Math.min(maxCharges, charges)),
    },
  };
}

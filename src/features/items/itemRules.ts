import type { ItemEffectRef } from "../../app/types";

const equipableTags = new Set(["weapon", "armor", "accessory"]);

export function hasItemEffect(effects: ItemEffectRef[], effectId: string): boolean {
  return effects.some((effect) => effect.effectId === effectId);
}

export function isItemEquipable(types: string[]): boolean {
  return types.some((type) => equipableTags.has(type));
}

export function isItemUsable(types: string[]): boolean {
  return types.includes("consumable");
}

export function preventsUnequip(effects: ItemEffectRef[]): boolean {
  return hasItemEffect(effects, "preventUnequip");
}

export function getEquipmentRoleFromTypes(types: string[]): "weapon" | "armor" | "other" {
  if (types.includes("weapon")) {
    return "weapon";
  }

  if (types.includes("armor")) {
    return "armor";
  }

  return "other";
}

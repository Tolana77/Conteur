import type { ItemInstance } from "../../app/types";
import { itemEffects } from "./itemEffects";

function createItemInstance(
  id: string,
  templateId: string,
  quantity: number,
  locationType: ItemInstance["location"]["type"],
  parent: string | null,
): ItemInstance {
  return {
    id,
    templateId,
    quantity,
    overrides: {},
    current: {},
    data: {},
    effects: [],
    location: {
      type: locationType,
      parent,
    },
  };
}

export function createInitialItemInstances(characterId: string): ItemInstance[] {
  return [
    createItemInstance("item-shortbow-01", "tpl_shortbow", 1, "equipped", characterId),
    createItemInstance("item-rations-01", "tpl_rations", 3, "inventory", characterId),
    createItemInstance("item-healing-potion-01", "tpl_healing_potion", 2, "inventory", characterId),
    createItemInstance("item-heavy-arrows-01", "tpl_heavy_arrows", 6, "inventory", characterId),
    createItemInstance("item-poison-vial-01", "tpl_poison_vial", 1, "inventory", characterId),
    createItemInstance("item-shadow-cloak-01", "tpl_shadow_cloak", 1, "inventory", characterId),
    createItemInstance("item-eternal-bond-boots-01", "tpl_eternal_bond_boots", 1, "equipped", characterId),
    createItemInstance("item-nameless-ring-01", "tpl_nameless_ring", 1, "inventory", characterId),
    createItemInstance("item-blank-scroll-01", "tpl_blank_scroll", 1, "inventory", characterId),
    createItemInstance("item-cracked-armor-01", "tpl_cracked_armor", 1, "inventory", characterId),
    createItemInstance("item-singing-coin-01", "tpl_singing_coin", 1, "inventory", characterId),
    createItemInstance("item-giant-mushroom-01", "tpl_giant_mushroom", 2, "inventory", characterId),
    createItemInstance("item-magnet-stone-01", "tpl_magnet_stone", 1, "inventory", characterId),
    createItemInstance("item-glass-dagger-01", "tpl_glass_dagger", 1, "inventory", characterId),
    createItemInstance("item-mirror-mask-01", "tpl_mirror_mask", 1, "inventory", characterId),
    createItemInstance("item-cursed-chalice-01", "tpl_cursed_chalice", 1, "inventory", characterId),
    createItemInstance("item-fireball-scroll-01", "tpl_fireball_scroll", 1, "inventory", characterId),
    createItemInstance("item-chaos-flask-01", "tpl_chaos_flask", 1, "inventory", characterId),
    createItemInstance("item-ember-ward-01", "tpl_ember_ward", 1, "inventory", characterId),
    createItemInstance("item-alchemical-converter-01", "tpl_alchemical_converter", 1, "inventory", characterId),
    createItemInstance("item-ember-staff-01", "tpl_ember_staff", 1, "inventory", characterId),
  ].map((item, index) => {
    const overrides =
      item.id === "item-healing-potion-01"
        ? {
            ...item.overrides,
            name: "Potion rouge trouble",
            description: "Une potion de soin plus sombre que prévu, mais l'effet reste familier.",
          }
        : item.overrides;
    const effects =
      item.id === "item-cracked-armor-01"
        ? [...item.effects, itemEffects.reduceFire2]
        : item.effects;

    return {
      ...item,
      overrides,
      effects,
      data: {
        ...item.data,
        inventoryOrder: index,
      },
    };
  });
}

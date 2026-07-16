import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

const { initialItemTemplates } = await vite.ssrLoadModule("/src/features/items/itemTemplates.ts");
const { initialAbilityTemplates } = await vite.ssrLoadModule("/src/features/abilities/abilityTemplates.ts");
const {
  initialEffectTemplates,
  initialEnemyTemplates,
} = await vite.ssrLoadModule("/src/features/content/contentCatalog.ts");
const {
  parseItemInstanceInput,
  parseItemTemplate,
} = await vite.ssrLoadModule("/src/features/content/contentValidation.ts");
const { useGameStore } = await vite.ssrLoadModule("/src/store/useGameStore.ts");

const catalogContext = {
  itemTemplates: initialItemTemplates,
  abilityTemplates: initialAbilityTemplates,
  effectTemplates: initialEffectTemplates,
  enemyTemplates: initialEnemyTemplates,
};

initialItemTemplates.forEach((template) => {
  const parsed = parseItemTemplate(template, catalogContext);
  assert.deepEqual(parsed.errors, [], `${template.id}: ${parsed.errors.join(" ")}`);
  assert.ok(parsed.value);
});

const directStatItems = initialItemTemplates.filter((template) =>
  template.effects.some((effect) => effect.effectId === "modifyStat"));
assert.deepEqual(directStatItems.map((template) => template.id), ["tpl_nameless_ring"]);
assert.equal(directStatItems[0].rarity, "rare");
assert.equal(directStatItems[0].requiresAttunement, true);

const shortbow = initialItemTemplates.find((template) => template.id === "tpl_shortbow");
const dagger = initialItemTemplates.find((template) => template.id === "tpl_dagger");
const quarterstaff = initialItemTemplates.find((template) => template.id === "tpl_quarterstaff");
const leatherArmor = initialItemTemplates.find((template) => template.id === "tpl_leather_armor");
assert.ok(shortbow && dagger && quarterstaff && leatherArmor);
assert.equal(shortbow.attacks[0].damage, "1d6");
assert.equal(dagger.attacks.find((attack) => attack.id === "throw")?.range, 6);
assert.equal(quarterstaff.attacks.find((attack) => attack.id === "two-handed-strike")?.damage, "1d8");
assert.equal(leatherArmor.base.defenseBase, 11);

const cosmeticDuplicate = {
  ...structuredClone(shortbow),
  id: "item-bow-of-the-north",
  name: "Arc des Marches du Nord",
  description: "Le même arc, décoré selon les usages du Nord.",
  base: { ...shortbow.base, weight: 1.1 },
};
const duplicateResult = parseItemTemplate(cosmeticDuplicate, catalogContext);
assert.equal(duplicateResult.value, null);
assert.ok(duplicateResult.errors.some((error) => error.includes("tpl_shortbow")));

const unbalancedStatItem = {
  ...structuredClone(leatherArmor),
  id: "item-common-strength-coat",
  name: "Cuirasse trop généreuse",
  rarity: "common",
  requiresAttunement: false,
  tags: ["armor", "magic"],
  effects: [{ effectId: "modifyStat", variables: { stat: "force", value: 3 } }],
};
const unbalancedResult = parseItemTemplate(unbalancedStatItem, catalogContext);
assert.equal(unbalancedResult.value, null);
assert.ok(unbalancedResult.errors.some((error) => error.includes("rareté rare")));
assert.ok(unbalancedResult.errors.some((error) => error.includes("-2 et +2")));

const instanceStatResult = parseItemInstanceInput({
  templateId: "tpl_dagger",
  quantity: 1,
  overrides: { name: "Dague du guet" },
  current: {},
  data: {},
  effects: [{ effectId: "modifyStat", variables: { stat: "dexterite", value: 1 } }],
  location: { type: "inventory", parent: "selected" },
});
assert.equal(instanceStatResult.value, null);
assert.ok(instanceStatResult.errors.some((error) => error.includes("template rare harmonisé")));

useGameStore.setState({ itemInstances: [] });
const character = useGameStore.getState().characters.find((candidate) =>
  candidate.id === useGameStore.getState().selectedCharacterId);
assert.ok(character);
const dexterityModifier = Math.floor((character.stats.dexterite - 10) / 2);
const armor = useGameStore.getState().giveItem(character.id, "tpl_leather_armor", 1);
assert.ok(armor);
useGameStore.getState().equipItem(armor.id);
assert.equal(useGameStore.getState().characterDerivedScores[character.id].defense, 11 + dexterityModifier);
const shield = useGameStore.getState().giveItem(character.id, "tpl_shield", 1);
assert.ok(shield);
useGameStore.getState().equipItem(shield.id);
assert.equal(useGameStore.getState().characterDerivedScores[character.id].defense, 13 + dexterityModifier);

useGameStore.setState((state) => ({
  characters: state.characters.map((candidate) => candidate.id === character.id
    ? { ...candidate, stats: { ...candidate.stats, dexterite: 20 } }
    : candidate),
  itemInstances: [],
}));
const crackedArmor = useGameStore.getState().giveItem(character.id, "tpl_cracked_armor", 1);
assert.ok(crackedArmor);
useGameStore.getState().equipItem(crackedArmor.id);
assert.equal(useGameStore.getState().characterDerivedScores[character.id].defense, 14);

useGameStore.setState((state) => ({
  characters: state.characters.map((candidate) => candidate.id === character.id
    ? { ...candidate, stats: { ...candidate.stats, dexterite: 8 } }
    : candidate),
  itemInstances: [],
}));
const chainMail = useGameStore.getState().giveItem(character.id, "tpl_chain_mail", 1);
assert.ok(chainMail);
useGameStore.getState().equipItem(chainMail.id);
assert.equal(useGameStore.getState().characterDerivedScores[character.id].defense, 16);

await vite.close();
console.log("Tests catalogue et équilibre des objets OK");

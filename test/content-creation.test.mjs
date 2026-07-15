import assert from "node:assert/strict";
import { createServer } from "vite";

const localStorageData = new Map();
globalThis.localStorage = {
  getItem: (key) => localStorageData.get(key) ?? null,
  setItem: (key, value) => localStorageData.set(key, String(value)),
  removeItem: (key) => localStorageData.delete(key),
  clear: () => localStorageData.clear(),
  key: (index) => [...localStorageData.keys()][index] ?? null,
  get length() { return localStorageData.size; },
};

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

const { executeAiCommand } = await vite.ssrLoadModule("/src/features/ai-director/aiExecution.ts");
const {
  collectKnownCatalogIdsForCommands,
  orderAiCommandsForExecution,
  validateAiCommands,
} = await vite.ssrLoadModule("/src/features/ai-director/validation.ts");

const effectTemplate = {
  id: "effect-test-frost",
  name: "Morsure de givre",
  description: "Un effet de froid réutilisable.",
  tags: ["froid", "degats"],
  actions: [{ operation: "damage", variables: { value: "1d6 + INT", damageType: "froid" } }],
};

const targetingV2 = {
  aim: { allowed: ["entity"], required: true, range: 12, lineOfSight: true },
  affects: { allowed: ["living"], includeSelf: false },
  area: { shape: "none" },
};

const abilityTemplate = {
  id: "ability-test-frost-bolt",
  name: "Trait de givre",
  description: "Projette une pointe de givre.",
  types: ["capacity"],
  tags: ["magic", "offensive"],
  combatRole: "attack",
  activation: { timing: "action" },
  resourceCost: { type: "charge", amount: 1 },
  targetingV2,
  charges: { max: 2, initial: 2, recharge: ["shortRest"], rechargeAmount: "full" },
  effects: [{ effectId: effectTemplate.id, variables: {} }],
  modules: { ability: {} },
};

const itemTemplate = {
  id: "item-test-frost-wand",
  type: "focus",
  types: ["accessory", "equipable"],
  tags: ["magic", "wood"],
  name: "Baguette de givre",
  description: "Une baguette pâle chargée de froid.",
  base: { weight: 0.4 },
  effects: [{ effectId: "grantAbility", variables: { abilityTemplateId: abilityTemplate.id } }],
  modules: { item: {} },
};

const enemyTemplate = {
  id: "enemy-test-frost-cultist",
  name: "Adepte du givre",
  description: "Un occultiste protégé par le froid.",
  level: 2,
  category: "humanoid",
  tags: ["cultist", "frost"],
  hp: "2d8 + 2",
  defense: 12,
  initiative: 1,
  speed: 9,
  reach: 1.5,
  attacks: [{
    id: "frost-dagger",
    name: "Dague gelée",
    attackKind: "melee",
    attackBonus: 3,
    damage: "1d4 + 1",
    damageType: "froid",
    range: 1.5,
    cost: "action",
    tags: ["weapon"],
  }],
  abilityTemplateIds: [abilityTemplate.id],
  behavior: {
    role: "controller",
    aggression: 3,
    preferredRange: 9,
    retreatBelowHpPercent: 20,
    priorities: ["ralentir", "rester à distance"],
  },
  resistances: ["froid"],
  vulnerabilities: ["feu"],
  immunities: [],
};

const summonAbilityTemplate = {
  id: "ability-test-summon-cultist",
  name: "Appel du givre",
  description: "Invoque un adepte depuis son profil réutilisable.",
  types: ["capacity"],
  tags: ["magic", "summon"],
  combatRole: "support",
  activation: { timing: "action" },
  targetingV2: {
    aim: { allowed: ["position"], required: true, range: 6, lineOfSight: true },
    affects: { allowed: ["position"], includeSelf: false },
    area: { shape: "none" },
  },
  effects: [{ effectId: "summon", variables: { enemyTemplateId: enemyTemplate.id, count: 1, side: "allies" } }],
  modules: { ability: {} },
};

const commands = [
  {
    type: "createItem",
    templateId: itemTemplate.id,
    instance: {
      id: "item-instance-test-frost-wand",
      quantity: 1,
      overrides: { name: "Baguette givrée d'Ysée" },
      current: {},
      data: {},
      effects: [],
      location: { type: "inventory", parent: "selected" },
    },
  },
  { type: "addEnemyToScene", enemyTemplateId: enemyTemplate.id, enemy: { id: "npc-test-cultist", side: "enemies" }, position: { x: 8, y: 6 } },
  { type: "createEnemyTemplate", template: enemyTemplate },
  { type: "createItemTemplate", template: itemTemplate },
  { type: "grantAbility", characterId: "selected", templateId: abilityTemplate.id },
  { type: "createAbilityTemplate", template: summonAbilityTemplate },
  { type: "createAbilityTemplate", template: abilityTemplate },
  { type: "createEffectTemplate", template: effectTemplate },
];

const context = {
  characters: [{ id: "character-test", name: "Héroïne" }],
  selectedCharacterId: "character-test",
  combat: { status: "setup", map: { width: 20, height: 20, details: [] }, combatants: [] },
  itemTemplates: [],
  itemInstances: [],
  abilityTemplates: [],
  effectTemplates: [],
  enemyTemplates: [],
};

const validations = validateAiCommands(commands, context);
assert.deepEqual(
  validations.map((validation) => validation.command.type),
  [
    "createEffectTemplate",
    "createAbilityTemplate",
    "createAbilityTemplate",
    "createItemTemplate",
    "createEnemyTemplate",
    "createItem",
    "grantAbility",
    "addEnemyToScene",
  ],
);
assert.equal(validations.every((validation) => validation.status !== "error"), true, validations.map((validation) => validation.message).join("\n"));

const invalidSummon = validateAiCommands([{
  type: "createAbilityTemplate",
  template: {
    ...summonAbilityTemplate,
    id: "ability-test-invalid-summon",
    effects: [{ effectId: "summon", variables: { enemyTemplateId: "enemy-missing" } }],
  },
}], context);
assert.equal(invalidSummon[0].status, "error");
assert.match(invalidSummon[0].message, /ennemi inconnu/u);

const runtime = {
  effectTemplates: [],
  abilityTemplates: [],
  itemTemplates: [],
  enemyTemplates: [],
  itemInstances: [],
  abilityInstances: [],
  spawned: [],
};

const actions = {
  registerEffectTemplate(template) { runtime.effectTemplates.push(template); return true; },
  registerAbilityTemplate(template) { runtime.abilityTemplates.push(template); return true; },
  registerItemTemplate(template) { runtime.itemTemplates.push(template); return true; },
  registerEnemyTemplate(template) { runtime.enemyTemplates.push(template); return true; },
  createItemInstance(input) {
    const item = { ...input, id: input.id ?? "generated-item" };
    runtime.itemInstances.push(item);
    return item;
  },
  grantAbilityToCharacter(characterId, templateId) {
    const ability = { id: "granted-ability", ownerId: characterId, templateId };
    runtime.abilityInstances.push(ability);
    return ability;
  },
  spawnEnemyFromTemplate(templateId, input) {
    runtime.spawned.push({ templateId, input });
    return "combatant-test-cultist";
  },
};

function snapshot() {
  return {
    campaign: { id: "campaign-test" },
    characters: context.characters,
    selectedCharacterId: context.selectedCharacterId,
    messages: [],
    narrativeMomentum: {},
    combat: context.combat,
    itemTemplates: runtime.itemTemplates,
    itemInstances: runtime.itemInstances,
    abilityTemplates: runtime.abilityTemplates,
    abilityInstances: runtime.abilityInstances,
    effectTemplates: runtime.effectTemplates,
    enemyTemplates: runtime.enemyTemplates,
    characterDerivedScores: {},
    narrativeScene: {},
  };
}

const results = orderAiCommandsForExecution(commands).map((command) =>
  executeAiCommand(command, snapshot(), actions, {
    knownCatalogIds: collectKnownCatalogIdsForCommands(commands, context),
  }));
assert.equal(results.every((result) => result.status === "success"), true, results.map((result) => result.message).join("\n"));
assert.equal(runtime.effectTemplates[0].id, effectTemplate.id);
assert.equal(
  runtime.abilityTemplates.find((template) => template.id === abilityTemplate.id).effects[0].effectId,
  effectTemplate.id,
);
assert.equal(runtime.abilityTemplates.some((template) => template.id === summonAbilityTemplate.id), true);
assert.equal(runtime.itemTemplates[0].effects[0].variables.abilityTemplateId, abilityTemplate.id);
assert.equal(runtime.itemInstances[0].location.parent, "character-test");
assert.equal(runtime.enemyTemplates[0].abilityTemplateIds[0], abilityTemplate.id);
assert.equal(runtime.spawned[0].templateId, enemyTemplate.id);

const { useGameStore } = await vite.ssrLoadModule("/src/store/useGameStore.ts");
const store = useGameStore.getState();
const modifierBefore = store.characterDerivedScores[store.selectedCharacterId].modifiers.force;
assert.equal(store.registerEffectTemplate(effectTemplate), true);
assert.equal(store.registerAbilityTemplate(abilityTemplate), true);
assert.equal(store.registerItemTemplate(itemTemplate), true);
assert.equal(store.registerEnemyTemplate(enemyTemplate), true);
assert.equal(store.registerEffectTemplate({
  id: "effect-test-strength",
  name: "Force du givre",
  description: "Accroît la force quand l'objet est équipé.",
  tags: ["stat"],
  actions: [{ operation: "modifyStat", variables: { stat: "force", value: 2 } }],
}), true);
assert.equal(store.registerItemTemplate({
  id: "item-test-frost-belt",
  type: "garment",
  types: ["accessory"],
  tags: ["magic"],
  name: "Ceinture du givre",
  description: "Une ceinture qui raidit les muscles.",
  base: { weight: 0.8 },
  effects: [{ effectId: "effect-test-strength", variables: {} }],
  modules: { item: {} },
}), true);
const realItem = store.createItemInstance({
  id: "item-instance-store-frost-wand",
  templateId: itemTemplate.id,
  quantity: 1,
  overrides: {},
  current: {},
  data: {},
  effects: [],
  location: { type: "inventory", parent: store.selectedCharacterId },
});
assert.equal(realItem?.templateId, itemTemplate.id);
const equippedBelt = store.createItemInstance({
  id: "item-instance-store-frost-belt",
  templateId: "item-test-frost-belt",
  quantity: 1,
  overrides: {},
  current: {},
  data: {},
  effects: [],
  location: { type: "equipped", parent: store.selectedCharacterId },
});
assert.equal(equippedBelt?.templateId, "item-test-frost-belt");
const realEnemyId = store.spawnEnemyFromTemplate(enemyTemplate.id, {
  id: "npc-store-frost-cultist",
  side: "enemies",
  position: { x: 9, y: 7 },
});
assert.equal(typeof realEnemyId, "string");
const mutatedStore = useGameStore.getState();
assert.equal(mutatedStore.itemInstances.some((item) => item.id === realItem?.id), true);
assert.equal(mutatedStore.combat.combatants.some((combatant) => combatant.id === realEnemyId), true);
assert.equal(mutatedStore.campaign.world.entities.npcs.some((entity) => entity.id === "npc-store-frost-cultist"), true);
assert.equal(mutatedStore.characterDerivedScores[store.selectedCharacterId].modifiers.force, modifierBefore + 1);

const workshopTemplate = {
  id: "item-test-workshop-token",
  type: "misc",
  types: ["misc"],
  tags: ["test"],
  name: "Jeton d'atelier",
  description: "Objet temporaire utilisé pour tester le cycle de vie du catalogue.",
  base: { weight: 0.01 },
  effects: [],
  modules: { item: {} },
};
assert.equal(useGameStore.getState().registerItemTemplate(
  workshopTemplate,
  "create",
  { source: "admin" },
), true);
assert.equal(useGameStore.getState().contentAuditLog[0].templateId, workshopTemplate.id);
assert.equal(useGameStore.getState().contentAuditLog[0].source, "admin");
assert.equal(useGameStore.getState().setContentTemplateActive("item", workshopTemplate.id, false), true);
assert.equal(useGameStore.getState().createItemInstance({
  id: "item-instance-disabled-workshop-token",
  templateId: workshopTemplate.id,
  quantity: 1,
  overrides: {},
  current: {},
  data: {},
  effects: [],
  location: { type: "inventory", parent: store.selectedCharacterId },
}), null);
assert.equal(useGameStore.getState().setContentTemplateActive("item", workshopTemplate.id, true), true);
const workshopInstance = useGameStore.getState().createItemInstance({
  id: "item-instance-workshop-token",
  templateId: workshopTemplate.id,
  quantity: 1,
  overrides: {},
  current: {},
  data: {},
  effects: [],
  location: { type: "inventory", parent: store.selectedCharacterId },
});
assert.equal(workshopInstance?.templateId, workshopTemplate.id);
const blockedDeletion = useGameStore.getState().deleteContentTemplate("item", workshopTemplate.id);
assert.equal(blockedDeletion.success, false);
assert.match(blockedDeletion.reasons.join(" "), /Instance d'objet/u);
useGameStore.getState().removeItem(workshopInstance.id);
assert.equal(useGameStore.getState().deleteContentTemplate("item", workshopTemplate.id).success, true);
assert.equal(useGameStore.getState().itemTemplates.some((template) => template.id === workshopTemplate.id), false);
assert.equal(useGameStore.getState().contentAuditLog[0].action, "delete");
assert.equal(
  useGameStore.getState().deleteContentTemplate("effect", "effect-ember-burst").success,
  false,
);

await vite.close();
console.log("Tests création de contenu MJ IA OK");

import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

const {
  getSelectableTargetKinds,
  getTargetingLabel,
  normalizeActionTargeting,
  resolveActionTargets,
} = await vite.ssrLoadModule("/src/features/combat/targeting.ts");
const {
  initialAbilityTemplates,
  initialAbilityActionTemplates,
} = await vite.ssrLoadModule("/src/features/abilities/abilityTemplates.ts");
const { initialItemTemplates } = await vite.ssrLoadModule("/src/features/items/itemTemplates.ts");

function combatant(id, sourceType, side, x, y) {
  return {
    id: `combatant-${id}`,
    sourceId: id,
    sourceType,
    name: id,
    side,
    hp: 10,
    maxHp: 10,
    position: { x, y },
  };
}

const actor = combatant("hero", "character", "players", 1, 1);
const enemy = combatant("enemy", "entity", "enemies", 5, 1);
const ally = combatant("ally", "character", "allies", 5, 2);
const barrel = combatant("barrel", "hazard", "neutral", 5, 3);
const combat = {
  status: "active",
  map: {
    width: 20,
    height: 20,
    cellSize: 0.5,
    obstacles: [],
    elements: [],
    details: [],
  },
  combatants: [actor, enemy, ally, barrel],
};

const healingTargeting = {
  aim: { allowed: ["self", "entity"], required: true, range: 6, lineOfSight: true },
  area: { shape: "none" },
  affects: { allowed: ["self", "living"], maxTargets: 1, requiresLiving: true },
  defaultPriority: ["self"],
  suggestedSides: ["self", "ally"],
};

const enemyHealing = resolveActionTargets({
  actor,
  combat,
  fallbackCharacterId: actor.sourceId,
  target: { kind: "entity", id: enemy.sourceId, label: enemy.name },
  targeting: healingTargeting,
});
assert.equal(enemyHealing.invalidReason, undefined);
assert.deepEqual(enemyHealing.affectedCombatants.map((target) => target.id), [enemy.id]);

const fireballTargeting = {
  aim: { allowed: ["entity", "position"], required: true, range: 12, lineOfSight: true },
  area: { shape: "circle", radius: 2.1 },
  affects: { allowed: ["living", "object", "position"], includeSelf: false },
  suggestedSides: ["enemy"],
};
const fireball = resolveActionTargets({
  actor,
  combat,
  fallbackCharacterId: actor.sourceId,
  target: {
    kind: "position",
    id: "position:5,1",
    label: "Position libre",
    position: { x: 5, y: 1 },
  },
  targeting: fireballTargeting,
});
assert.equal(fireball.invalidReason, undefined);
assert.deepEqual(
  new Set(fireball.affectedCombatants.map((target) => target.id)),
  new Set([enemy.id, ally.id, barrel.id]),
);

const destinationTargeting = {
  aim: { allowed: ["position"], required: true, range: 3, lineOfSight: false },
  area: { shape: "none" },
  affects: { allowed: ["self"], maxTargets: 1 },
};
assert.equal(getTargetingLabel(destinationTargeting), "destination");
const destination = resolveActionTargets({
  actor,
  combat,
  fallbackCharacterId: actor.sourceId,
  target: {
    kind: "position",
    id: "position:3,1",
    label: "Position libre",
    position: { x: 3, y: 1 },
  },
  targeting: destinationTargeting,
});
assert.equal(destination.invalidReason, undefined);
assert.deepEqual(destination.affectedCombatants.map((target) => target.id), [actor.id]);

const combatWithWall = {
  ...combat,
  map: {
    ...combat.map,
    obstacles: [{
      id: "wall",
      name: "Mur",
      x: 2.5,
      y: 0,
      width: 0.5,
      height: 3,
      blocksMovement: true,
      blocksLineOfSight: true,
    }],
  },
};
const blockedTarget = resolveActionTargets({
  actor,
  combat: combatWithWall,
  fallbackCharacterId: actor.sourceId,
  target: { kind: "entity", id: enemy.sourceId, label: enemy.name },
  targeting: fireballTargeting,
});
assert.equal(blockedTarget.invalidReason, "Ligne de vue bloquée.");

const wallDestination = resolveActionTargets({
  actor,
  combat: combatWithWall,
  fallbackCharacterId: actor.sourceId,
  target: {
    kind: "position",
    id: "position:2.7,1",
    label: "Position libre",
    position: { x: 2.7, y: 1 },
  },
  targeting: destinationTargeting,
});
assert.equal(wallDestination.invalidReason, "Cette position est occupée par un obstacle.");

const legacy = normalizeActionTargeting({
  allowed: ["entity", "character", "position", "free"],
  required: true,
  range: 9,
  lineOfSight: true,
  defaultPriority: ["nearestEnemy"],
  suggestedSides: ["enemy"],
});
assert.ok(legacy);
assert.deepEqual(getSelectableTargetKinds(legacy), ["character", "entity", "position"]);
assert.equal("allowed" in legacy, false);
assert.equal(legacy.aim.range, 9);

for (const template of [...initialAbilityTemplates, ...initialItemTemplates]) {
  assert.equal("targetingV2" in template, false, `${template.id} conserve targetingV2`);
}
assert.equal(JSON.stringify([...initialAbilityTemplates, ...initialItemTemplates]).includes('"targetingV2"'), false);
assert.equal(initialAbilityActionTemplates.every((template) => template.targeting?.aim && template.targeting.affects), true);

await vite.close();
console.log("Tests du ciblage canonique OK");

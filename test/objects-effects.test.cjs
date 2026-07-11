const assert = require("assert");
const { resetDatabase, getDb } = require("../src/db.js");
const { evaluateCondition } = require("../src/conditions.js");
const { triggerEvent } = require("../src/engine.js");
const { getContents, moveInstance } = require("../src/location.js");
const { resolve } = require("../src/resolve.js");

function resetFixture() {
  resetDatabase({
    templates: [
      {
        id: "tpl_item",
        type: "object",
        name: "Objet neutre",
        description: "Objet de test.",
        base: {
          weight: 1,
          hp: 4,
          hpMax: 10,
          hardness: 3
        },
        effects: [{ effectId: "eff_tick", variables: { from: "template" } }],
        modules: {}
      },
      {
        id: "tpl_list",
        type: "object",
        name: "Objet à liste",
        description: "Objet de test avec listes.",
        base: {},
        effects: [
          { effectId: "eff_remove_me", variables: {} },
          { effectId: "eff_keep_me", variables: {} }
        ],
        modules: {}
      },
      {
        id: "tpl_container",
        type: "container",
        name: "Boîte",
        description: "Contenant de test.",
        base: { weight: 2 },
        effects: [],
        modules: { container: { capacityWeight: 20 } }
      }
    ],
    effects: [
      {
        id: "eff_tick",
        triggers: ["onTick"],
        conditions: { all: [] },
        actions: [
          { type: "modifyData", target: "self", attribute: "ticks", op: "add", value: 1 }
        ],
        tags: [],
        modules: {}
      },
      {
        id: "eff_add_hp",
        triggers: ["onTick"],
        conditions: { all: [] },
        actions: [
          { type: "modifyCurrent", target: "self", attribute: "hp", op: "add", value: 2 }
        ],
        tags: [],
        modules: {}
      },
      {
        id: "eff_add_kills",
        triggers: ["onTick"],
        conditions: { all: [] },
        actions: [
          { type: "modifyData", target: "self", attribute: "kills", op: "add", value: 2 }
        ],
        tags: [],
        modules: {}
      }
    ],
    instances: [
      {
        id: "inst_scalar",
        templateId: "tpl_item",
        quantity: 1,
        overrides: { "name": "Objet renommé", "base.weight": 2.3 },
        current: {},
        data: {},
        effects: [{ effectId: "eff_add_hp", variables: { from: "instance" } }],
        location: { type: "world", parent: "zone_a" }
      },
      {
        id: "inst_list",
        templateId: "tpl_list",
        quantity: 1,
        overrides: {
          "effects.-": "eff_remove_me",
          "effects.+": { effectId: "eff_added", variables: {} }
        },
        current: {},
        data: {},
        effects: [],
        location: { type: "world", parent: "zone_a" }
      },
      {
        id: "inst_current",
        templateId: "tpl_item",
        quantity: 1,
        overrides: {},
        current: { hp: 3 },
        data: { hp: 99 },
        effects: [],
        location: { type: "world", parent: "zone_b" }
      },
      {
        id: "inst_data",
        templateId: "tpl_item",
        quantity: 1,
        overrides: {},
        current: {},
        data: {},
        effects: [{ effectId: "eff_add_kills", variables: {} }],
        location: { type: "world", parent: "zone_b" }
      },
      {
        id: "inst_box",
        templateId: "tpl_container",
        quantity: 1,
        overrides: {},
        current: {},
        data: {},
        effects: [],
        location: { type: "world", parent: "zone_a" }
      }
    ]
  });
}

resetFixture();

{
  const resolved = resolve("inst_scalar");
  assert.strictEqual(resolved.name, "Objet renommé");
  assert.strictEqual(resolved.base.weight, 2.3);
}

{
  const resolved = resolve("inst_scalar");
  assert.deepStrictEqual(
    resolved.effects.map((effect) => effect.effectId),
    ["eff_tick", "eff_add_hp"]
  );
}

{
  const resolved = resolve("inst_list");
  assert.deepStrictEqual(
    resolved.effects.map((effect) => effect.effectId),
    ["eff_keep_me", "eff_added"]
  );
}

{
  assert.strictEqual(
    evaluateCondition(
      { attribute: "hp", operator: "<=", value: 50, unit: "percent" },
      resolve("inst_current")
    ),
    true
  );
}

{
  const resolved = resolve("inst_current");
  assert.strictEqual(
    evaluateCondition(
      {
        all: [
          { attribute: "hp", operator: "==", value: 3 },
          { any: [
            { attribute: "weight", operator: ">", value: 100 },
            { attribute: "hardness", operator: "==", value: 3 }
          ] }
        ]
      },
      resolved
    ),
    true
  );
}

{
  assert.strictEqual(resolve("inst_current").current.hp, 3);
}

{
  triggerEvent("onTick", "inst_scalar");
  assert.strictEqual(getDb().instances.get("inst_scalar").current.hp, 6);
}

{
  triggerEvent("onTick", "inst_data");
  assert.strictEqual(getDb().instances.get("inst_data").data.kills, 2);
  assert.strictEqual(resolve("inst_data").base.kills, undefined);
}

{
  moveInstance("inst_scalar", "container", "inst_box");
  const contents = getContents("inst_box");
  assert.deepStrictEqual(contents.map((item) => item.id), ["inst_scalar"]);
}

console.log("Tests objets/effets OK");

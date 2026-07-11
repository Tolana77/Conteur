const { getDb } = require("./db");
const { executeAction } = require("./actions");
const { evaluateCondition } = require("./conditions");
const { resolve } = require("./resolve");

function triggerEvent(eventName, instanceId, params = {}) {
  const db = getDb();
  const resolved = resolve(instanceId);
  const executed = [];

  for (const effectRef of resolved.effects) {
    const effect = db.effects.get(effectRef.effectId);

    if (!effect || !Array.isArray(effect.triggers) || !effect.triggers.includes(eventName)) {
      continue;
    }

    if (!evaluateCondition(effect.conditions, resolved)) {
      continue;
    }

    for (const action of effect.actions || []) {
      executeAction(action, instanceId, params);
      executed.push({ effectId: effect.id, actionType: action.type });
    }
  }

  return executed;
}

module.exports = {
  triggerEvent,
};

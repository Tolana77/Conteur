const { getDb, log } = require("./db");
const { getAttribute } = require("./conditions");
const { rollDice } = require("./dice");
const { resolve, setByPath } = require("./resolve");

function resolveTarget(action, params, sourceInstanceId) {
  if (action.target === "self") {
    return sourceInstanceId;
  }

  if (action.target === "target") {
    return params && params.targetId;
  }

  return action.target;
}

function getMutableInstance(instanceId) {
  const instance = getDb().instances.get(instanceId);

  if (!instance) {
    log(`Action ignorée: cible introuvable "${instanceId}".`);
    return null;
  }

  instance.current = instance.current || {};
  instance.data = instance.data || {};
  instance.effects = instance.effects || [];

  return instance;
}

function readCurrentStart(instanceId, attribute) {
  const resolved = resolve(instanceId);
  const value = getAttribute(resolved, attribute);
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function mutateCurrent(instanceId, attribute, op, value) {
  const instance = getMutableInstance(instanceId);

  if (!instance) {
    return;
  }

  const start = readCurrentStart(instanceId, attribute);
  const numericValue = Number(value);
  const nextValue =
    op === "set" ? numericValue : op === "subtract" ? start - numericValue : start + numericValue;

  setByPath(instance.current, attribute, nextValue);
}

function mutateData(instanceId, attribute, op, value) {
  const instance = getMutableInstance(instanceId);

  if (!instance) {
    return;
  }

  const currentValue = instance.data[attribute] ?? 0;
  let nextValue = value;

  if (op === "add") {
    nextValue = Number(currentValue) + Number(value);
  } else if (op === "subtract") {
    nextValue = Number(currentValue) - Number(value);
  }

  setByPath(instance.data, attribute, nextValue);
}

function executeAction(action, sourceInstanceId, params) {
  const targetId = resolveTarget(action, params, sourceInstanceId);

  if (!targetId) {
    log(`Action ignorée: aucune cible pour "${action.type}".`);
    return;
  }

  switch (action.type) {
    case "damage":
      mutateCurrent(targetId, "hp", "subtract", rollDice(action.value));
      return;
    case "heal":
      mutateCurrent(targetId, "hp", "add", rollDice(action.value));
      return;
    case "applyEffect": {
      const target = getMutableInstance(targetId);

      if (target) {
        target.effects.push({
          effectId: action.effect,
          variables: action.variables || {},
        });
      }
      return;
    }
    case "modifyCurrent":
      mutateCurrent(targetId, action.attribute, action.op, action.value);
      return;
    case "modifyData":
      mutateData(targetId, action.attribute, action.op, action.value);
      return;
    default:
      log(`Action inconnue ignorée: "${action.type}".`);
  }
}

module.exports = {
  executeAction,
  mutateCurrent,
  mutateData,
};

const { clone, getDb } = require("./db");

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getByPath(source, dotPath) {
  if (!dotPath) {
    return source;
  }

  return dotPath.split(".").reduce((current, key) => {
    if (current === undefined || current === null) {
      return undefined;
    }

    return current[key];
  }, source);
}

function setByPath(target, dotPath, value) {
  const parts = dotPath.split(".");
  let cursor = target;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];

    if (!isObject(cursor[key]) && !Array.isArray(cursor[key])) {
      cursor[key] = {};
    }

    cursor = cursor[key];
  }

  cursor[parts[parts.length - 1]] = clone(value);
}

function addByPath(target, dotPath, value) {
  const path = dotPath.slice(0, -2);
  const current = getByPath(target, path);

  if (!Array.isArray(current)) {
    setByPath(target, path, []);
  }

  getByPath(target, path).push(clone(value));
}

function removeByPath(target, dotPath, value) {
  const path = dotPath.slice(0, -2);
  const current = getByPath(target, path);

  if (!Array.isArray(current)) {
    return;
  }

  setByPath(
    target,
    path,
    current.filter((item) => {
      if (isObject(value)) {
        return !deepEqual(item, value);
      }

      return item !== value && item.id !== value && item.effectId !== value;
    }),
  );
}

function applyOverrides(resolvedTemplate, overrides) {
  const result = clone(resolvedTemplate);

  // Convention: les overrides utilisent des dot-paths. "chemin.+" ajoute
  // dans une liste, "chemin.-" retire par id/effectId ou égalité profonde.
  for (const [dotPath, value] of Object.entries(overrides || {})) {
    if (dotPath.endsWith(".+")) {
      addByPath(result, dotPath, value);
    } else if (dotPath.endsWith(".-")) {
      removeByPath(result, dotPath, value);
    } else {
      setByPath(result, dotPath, value);
    }
  }

  return result;
}

function resolve(instanceId) {
  const db = getDb();
  const instance = db.instances.get(instanceId);

  if (!instance) {
    throw new Error(`Instance introuvable: ${instanceId}`);
  }

  const template = db.templates.get(instance.templateId);

  if (!template) {
    throw new Error(`Template introuvable pour templateId "${instance.templateId}".`);
  }

  const templateAfterOverrides = applyOverrides(template, instance.overrides || {});

  return {
    id: instance.id,
    templateId: instance.templateId,
    type: templateAfterOverrides.type,
    quantity: instance.quantity ?? 1,
    name: templateAfterOverrides.name,
    description: templateAfterOverrides.description,
    base: clone(templateAfterOverrides.base || {}),
    // Les modules sont opaques: le moteur les transporte mais ne les
    // interprète que dans les systèmes qui les connaissent explicitement.
    modules: clone(templateAfterOverrides.modules || {}),
    effects: [
      ...clone(templateAfterOverrides.effects || []),
      ...clone(instance.effects || []),
    ],
    // current porte uniquement l'état mutable qui a un pendant dans base.
    current: clone(instance.current || {}),
    // data porte les données libres sans pendant dans base.
    data: clone(instance.data || {}),
    location: clone(instance.location || { type: "world", parent: null }),
  };
}

module.exports = {
  applyOverrides,
  deepEqual,
  getByPath,
  resolve,
  setByPath,
};

const { getDb } = require("./db");

function moveInstance(instanceId, type, parent) {
  const instance = getDb().instances.get(instanceId);

  if (!instance) {
    throw new Error(`Instance introuvable: ${instanceId}`);
  }

  instance.location = { type, parent };
}

function getContents(parentId) {
  return [...getDb().instances.values()].filter(
    (instance) => instance.location && instance.location.parent === parentId,
  );
}

module.exports = {
  getContents,
  moveInstance,
};

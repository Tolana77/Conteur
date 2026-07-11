const fs = require("fs");
const path = require("path");
const paths = require("./paths");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function readJsonDirectory(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".json"))
    .flatMap((fileName) => {
      const fullPath = path.join(directory, fileName);
      const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      return Array.isArray(parsed) ? parsed : [parsed];
    });
}

function indexById(records, label) {
  const indexed = new Map();

  for (const record of records) {
    if (!record || typeof record.id !== "string") {
      throw new Error(`${label}: chaque entrée doit avoir un id string.`);
    }

    if (indexed.has(record.id)) {
      throw new Error(`${label}: id dupliqué "${record.id}".`);
    }

    indexed.set(record.id, clone(record));
  }

  return indexed;
}

function loadDatabase() {
  return {
    templates: indexById(readJsonDirectory(paths.templatesDir), "templates"),
    effects: indexById(readJsonDirectory(paths.effectsDir), "effects"),
    instances: indexById(readJsonDirectory(paths.instancesDir), "instances"),
    logs: [],
  };
}

let database = loadDatabase();

function getDb() {
  return database;
}

function resetDatabase(nextDatabase) {
  database = nextDatabase
    ? {
        templates: indexById(nextDatabase.templates || [], "templates"),
        effects: indexById(nextDatabase.effects || [], "effects"),
        instances: indexById(nextDatabase.instances || [], "instances"),
        logs: [],
      }
    : loadDatabase();
}

function log(message) {
  database.logs.push(message);
}

module.exports = {
  clone,
  getDb,
  log,
  resetDatabase,
};

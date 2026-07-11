const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  templatesDir: path.join(DATA_DIR, "templates"),
  effectsDir: path.join(DATA_DIR, "effects"),
  instancesDir: path.join(DATA_DIR, "instances"),
};

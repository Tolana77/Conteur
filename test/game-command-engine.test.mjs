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

const {
  createInitialNarrativeScene,
  createLocalGameRuntimeAdapter,
  parseGameCommand,
  replayGameEvents,
} = await vite.ssrLoadModule("/src/core/game-engine/index.ts");

const character = {
  id: "character-engine-test",
  name: "Maëlys",
  espece: "humaine",
  classe: "éclaireuse",
  niveau: 2,
  stats: {
    force: 10,
    dexterite: 14,
    constitution: 12,
    intelligence: 11,
    sagesse: 13,
    charisme: 9,
  },
  pv: 7,
  maxPv: 12,
  inventaire: [],
  competences: [],
  history: [],
};
const campaign = {
  id: "campaign-engine-test",
  name: "Campagne moteur",
  style: "fantasy",
  level: 2,
  world: {
    name: "Les Marches",
    lore: "Une frontière oubliée.",
    facts: ["La passe est fermée."],
    entities: { npcs: [], locations: [], items: [] },
  },
  characters: [character],
  history: [],
  createdAt: 1,
};
const initialSnapshot = {
  revision: 0,
  campaign,
  characters: [character],
  messages: [],
  narrativeScene: createInitialNarrativeScene(campaign),
  processedCommandIds: [],
};

let nextId = 0;
const runtime = createLocalGameRuntimeAdapter({
  now: () => 1_800_000_000_000,
  createId: (prefix) => `${prefix}-test-${++nextId}`,
});

const hpCommand = runtime.createCommand(
  initialSnapshot,
  {
    type: "character.adjustHp",
    payload: { characterId: character.id, amount: 20, reason: "heal" },
  },
  { id: "system-test", role: "system" },
);
assert.equal(hpCommand.expectedRevision, 0);
assert.equal(hpCommand.campaignId, campaign.id);
assert.equal(hpCommand.protocolVersion, 1);
assert.equal(parseGameCommand(hpCommand).success, true);
const malformedCommand = parseGameCommand({
  ...hpCommand,
  payload: { characterId: character.id, amount: "vingt", reason: "heal" },
});
assert.equal(malformedCommand.success, false);
assert.match(malformedCommand.errors.join(" "), /amount/u);

const frozenSnapshot = deepFreeze(structuredClone(initialSnapshot));
const hpResult = runtime.execute(frozenSnapshot, hpCommand);
assert.equal(hpResult.ok, true);
assert.equal(initialSnapshot.characters[0].pv, 7, "Le moteur ne doit pas muter l'entrée.");
assert.equal(hpResult.state.characters[0].pv, 12, "Les PV sont bornés par maxPv.");
assert.equal(hpResult.state.campaign.characters[0].pv, 12, "La campagne reste synchronisée.");
assert.equal(hpResult.state.revision, 1);
assert.equal(hpResult.events[0].type, "character.hpChanged");

const replayed = replayGameEvents(initialSnapshot, hpResult.events);
assert.deepEqual(replayed, hpResult.state, "Le journal doit reconstruire la même projection.");

const duplicate = runtime.execute(hpResult.state, hpCommand);
assert.equal(duplicate.ok, false);
assert.equal(duplicate.code, "DUPLICATE_COMMAND");

const staleCommand = { ...hpCommand, id: "command-stale", expectedRevision: 0 };
const staleResult = runtime.execute(hpResult.state, staleCommand);
assert.equal(staleResult.ok, false);
assert.equal(staleResult.code, "REVISION_CONFLICT");
assert.equal(staleResult.currentRevision, 1);

const playerWorldCommand = runtime.createCommand(
  initialSnapshot,
  { type: "world.addFact", payload: { value: "Un fait interdit." } },
  { id: "player-test", role: "player" },
);
const denied = runtime.execute(initialSnapshot, playerWorldCommand);
assert.equal(denied.ok, false);
assert.equal(denied.code, "PERMISSION_DENIED");

const worldCommand = runtime.createCommand(
  initialSnapshot,
  { type: "world.addFact", payload: { value: "  Une cloche sonne au nord.  " } },
  { id: "gm-test", role: "gm" },
);
const worldResult = runtime.execute(initialSnapshot, worldCommand);
assert.equal(worldResult.ok, true);
assert.deepEqual(worldResult.state.campaign.world.facts, [
  "La passe est fermée.",
  "Une cloche sonne au nord.",
]);

const { useGameStore } = await vite.ssrLoadModule("/src/store/useGameStore.ts");
const storeBefore = useGameStore.getState();
const storeCharacter = storeBefore.characters[0];
assert.ok(storeCharacter, "La campagne locale doit contenir un personnage de test.");
const storeRevision = storeBefore.gameRevision;
storeBefore.setCharacterPv(storeCharacter.id, storeCharacter.pv - 1);
const storeAfter = useGameStore.getState();
assert.equal(storeAfter.gameRevision, storeRevision + 1);
assert.equal(storeAfter.gameEvents.at(-1)?.type, "character.hpChanged");
assert.equal(storeAfter.characters[0].pv, Math.max(0, storeCharacter.pv - 1));

await vite.close();
console.log("Tests moteur de commandes OK");

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

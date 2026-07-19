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

try {
  const { useGameStore } = await vite.ssrLoadModule("/src/store/useGameStore.ts");
  const {
    applyMultiplayerProjection,
    createMultiplayerProjection,
    parseMultiplayerProjection,
  } = await vite.ssrLoadModule("/src/features/multiplayer/gameProjection.ts");
  const { parseMultiplayerTurnActions } = await vite.ssrLoadModule(
    "/src/features/multiplayer/useMultiplayerStore.ts",
  );

  const parsedActions = parseMultiplayerTurnActions([
    {
      id: "intent-valid",
      kind: "attack",
      targetId: "weapon-1",
      label: "Tirer",
      command: "commande falsifiée",
      createdAt: 10,
      target: { kind: "position", id: "position:2,3", label: "Sol", position: { x: 2, y: 3 } },
    },
    { id: "intent-invalid", kind: "deleteCampaign", targetId: "all", label: "Triche" },
  ]);
  assert.equal(parsedActions.length, 1);
  assert.equal(parsedActions[0].command, "attack weapon-1");
  assert.deepEqual(parsedActions[0].target.position, { x: 2, y: 3 });

  const base = useGameStore.getState();
  const playerCharacter = base.characters[0];
  const otherCharacter = {
    ...playerCharacter,
    id: "character-other",
    name: "Compagnon secret",
    inventaire: [{ id: "legacy-secret", name: "Secret", description: "", quantity: 1 }],
    history: ["Histoire privée"],
  };
  const state = {
    ...base,
    characters: [playerCharacter, otherCharacter],
    campaign: {
      ...base.campaign,
      characters: [playerCharacter, otherCharacter],
      world: {
        ...base.campaign.world,
        secrets: [{ id: "secret-1", truth: "Le roi est mort.", clues: [], relatedIds: [] }],
        entities: {
          ...base.campaign.world.entities,
          npcs: [{
            id: "npc-secret",
            name: "Conseiller",
            type: "npc",
            description: "Un conseiller austère.",
            details: { secret: "Traître", data: { hiddenPlan: "Fuir" }, knownFacts: ["Il sert le roi."] },
          }],
        },
      },
    },
    narrativeScene: {
      ...base.narrativeScene,
      presentEntityIds: ["npc-secret"],
    },
    diceRolls: [
      { id: "public-roll", visibility: "public" },
      { id: "hidden-roll", visibility: "hidden" },
      { id: "gm-roll", visibility: "gmOnly" },
    ],
    itemInstances: [
      { ...createItem("own-item", "own-template", "inventory", playerCharacter.id), data: { effectsState: "unknown" } },
      createItem("other-item", "other-template", "inventory", otherCharacter.id),
      createItem("visible-sword", "sword-template", "equipped", otherCharacter.id),
    ],
    itemTemplates: [
      { ...createItemTemplate("own-template"), effects: [{ effectId: "secret-effect", variables: {} }] },
      createItemTemplate("other-template"),
      createItemTemplate("sword-template"),
    ],
    effectTemplates: [
      ...base.effectTemplates,
      { id: "secret-effect", name: "Malédiction secrète", description: "Secret", tags: [], actions: [] },
    ],
  };
  const member = {
    roomId: "room-test",
    userId: "user-player",
    displayName: "Ariane",
    role: "player",
    characterId: playerCharacter.id,
    joinedAt: new Date(0).toISOString(),
    online: true,
  };
  const projection = createMultiplayerProjection(state, "room-test", member, 7);

  assert.deepEqual(projection.state.campaign.world.secrets, []);
  assert.equal(projection.state.campaign.world.entities.npcs[0].details.secret, undefined);
  assert.equal(projection.state.campaign.world.entities.npcs[0].details.data, undefined);
  assert.deepEqual(projection.state.diceRolls.map((roll) => roll.id), ["public-roll"]);
  assert.deepEqual(
    projection.state.itemInstances.map((item) => item.id).sort(),
    ["own-item", "visible-sword"],
  );
  assert.equal(projection.state.characters[1].inventaire.length, 0);
  assert.equal(projection.state.characters[1].history, undefined);
  assert.equal("aiApiTraces" in projection.state, false);
  assert.equal("campaignStartSnapshot" in projection.state, false);
  assert.equal(JSON.stringify(projection).includes("Malédiction secrète"), false);
  assert.equal(projection.state.itemInstances.find((item) => item.id === "own-item").effects.length, 0);

  const parsed = parseMultiplayerProjection(projection, "room-test", "user-player");
  assert.equal(parsed.sequence, 7);
  assert.throws(
    () => parseMultiplayerProjection(projection, "room-test", "other-user"),
    /autre joueur/u,
  );

  const applied = applyMultiplayerProjection(base, parsed);
  assert.equal(applied.selectedCharacterId, playerCharacter.id);
  assert.equal(applied.uiSettings, base.uiSettings);
  assert.equal(applied.aiApiTraces, base.aiApiTraces);
  assert.deepEqual(applied.gameEvents, []);

  console.log("Tests fondation multijoueur OK");
} finally {
  await vite.close();
}

function createItem(id, templateId, type, parent) {
  return {
    id,
    templateId,
    quantity: 1,
    overrides: {},
    current: {},
    data: {},
    effects: [],
    location: { type, parent },
  };
}

function createItemTemplate(id) {
  return {
    id,
    type: "misc",
    types: ["misc"],
    tags: ["mundane"],
    name: id,
    description: "Objet de test.",
    rarity: "mundane",
    base: { weight: 1 },
    effects: [],
    modules: { item: {} },
  };
}

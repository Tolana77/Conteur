import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "vite";

const localStorageData = new Map();
const onboardingMigration = readFileSync(
  new URL("../supabase/migrations/202607190002_multiplayer_character_onboarding.sql", import.meta.url),
  "utf8",
);
const perceptionMigration = readFileSync(
  new URL("../supabase/migrations/202607190003_multiplayer_perception.sql", import.meta.url),
  "utf8",
);
assert.match(onboardingMigration, /role in \('host', 'admin', 'player', 'spectator'\)/u);
assert.match(onboardingMigration, /if not public\.is_multiplayer_host\(p_room_id\) then/u);
assert.match(onboardingMigration, /multiplayer_character_presets/u);
assert.match(onboardingMigration, /multiplayer_character_requests/u);
assert.match(perceptionMigration, /communication_channel in \('oral', 'written'\)/u);
assert.match(perceptionMigration, /communication_language_id/u);
assert.match(perceptionMigration, /submit_multiplayer_turn\(uuid, text, jsonb, text, text, text, text\)/u);
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
  const {
    createMultiplayerCharacterContext,
  } = await vite.ssrLoadModule("/src/features/multiplayer/characterOnboarding.ts");
  const {
    extractSpokenDialogue,
    projectMessagesForRecipient,
  } = await vite.ssrLoadModule("/src/features/multiplayer/messageVisibility.ts");
  const {
    applyPerceptionConditions,
    createCommunicationPayload,
    resolveCommunicationForObserver,
  } = await vite.ssrLoadModule("/src/core/game-engine/perception.ts");
  const {
    createClassicCharacterPackage,
    createDefaultCharacterDraft,
  } = await vite.ssrLoadModule("/src/features/character/characterCreation.ts");

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
  assert.equal(
    extractSpokenDialogue('Je frappe le rat et je crie « Mort au rat ! » puis "Recule !"'),
    "Mort au rat ! Recule !",
  );

  const speakerPerception = createPerception({
    elfique: { oral: "fluent", written: "fragments" },
  });
  const listenerPerception = createPerception({
    elfique: { oral: "limited", written: "fluent" },
  });
  const oralSignal = createCommunicationPayload(
    "La porte secrète se trouve sous le vieux pont.",
    "oral",
    "elfique",
    speakerPerception,
  );
  assert.ok(oralSignal);
  const partialOral = resolveCommunicationForObserver(oralSignal, listenerPerception, "stable-seed");
  assert.equal(partialOral.perception.mastery, "limited");
  assert.equal(partialOral.perception.status, "partial");
  assert.match(partialOral.content, /\[…\]/u);
  assert.equal(
    resolveCommunicationForObserver(oralSignal, listenerPerception, "stable-seed").content,
    partialOral.content,
  );
  const fluentOral = resolveCommunicationForObserver(oralSignal, speakerPerception, "fluent-seed");
  assert.equal(fluentOral.perception.mastery, "fluent");
  assert.equal(fluentOral.content, oralSignal.content);

  const writtenSignal = createCommunicationPayload(
    "Le sceau royal est un faux.",
    "written",
    "elfique",
    speakerPerception,
  );
  assert.ok(writtenSignal);
  assert.equal(
    resolveCommunicationForObserver(writtenSignal, listenerPerception, "written-seed").perception.mastery,
    "fragments",
  );
  const fragmentaryWritten = resolveCommunicationForObserver(
    writtenSignal,
    listenerPerception,
    "written-seed",
  );
  assert.equal(fragmentaryWritten.perception.status, "partial");
  assert.notEqual(fragmentaryWritten.content, writtenSignal.content);
  const unknownLanguage = resolveCommunicationForObserver(
    oralSignal,
    createPerception({ commun: { oral: "fluent", written: "fluent" } }),
    "unknown-seed",
  );
  assert.equal(unknownLanguage.perception.status, "unknown");
  assert.equal(unknownLanguage.perception.languageId, "unknown");
  assert.equal(unknownLanguage.content.includes("porte secrète"), false);
  const deafListener = resolveCommunicationForObserver(
    oralSignal,
    { ...listenerPerception, hearing: "none" },
    "deaf-seed",
  );
  assert.equal(deafListener.perception.status, "imperceptible");
  assert.equal(deafListener.content, null);
  const mutedSignal = createCommunicationPayload(
    "Personne ne doit entendre ceci.",
    "oral",
    "elfique",
    { ...speakerPerception, speech: "none" },
  );
  assert.ok(mutedSignal);
  assert.equal(mutedSignal.emitted, false);
  const temporarySensoryLoss = applyPerceptionConditions(
    listenerPerception,
    ["blinded", "deafened", "silenced"],
  );
  assert.equal(temporarySensoryLoss.vision, "none");
  assert.equal(temporarySensoryLoss.hearing, "none");
  assert.equal(temporarySensoryLoss.speech, "none");

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
    messages: [
      { id: "gm-visible", sender: "gm", content: "Le rat bondit.", timestamp: 1 },
      {
        id: "own-private",
        sender: "player",
        content: "Je prépare un piège derrière mon dos.",
        timestamp: 2,
        authorId: "user-player",
        authorName: "Ariane",
      },
      {
        id: "other-spoken",
        sender: "player",
        content: 'Je donne un coup de hache et je crie "Mort au rat !"',
        spokenContent: "Mort au rat !",
        timestamp: 3,
        authorId: "user-other",
        authorName: "Nainbécile",
        actions: [{ id: "secret-action" }],
      },
      {
        id: "other-silent",
        sender: "player",
        content: "Je subtilise discrètement la clef.",
        timestamp: 4,
        authorId: "user-other",
        authorName: "Nainbécile",
      },
    ],
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
    playerColor: "#5689B8",
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
  assert.deepEqual(
    projection.state.messages.map((message) => message.id),
    ["gm-visible", "own-private", "other-spoken"],
  );
  assert.equal(projection.state.messages.find((message) => message.id === "other-spoken").content, "Mort au rat !");
  assert.equal(projection.state.messages.find((message) => message.id === "other-spoken").actions, undefined);
  assert.deepEqual(
    projectMessagesForRecipient(state.messages, "user-other", false).map((message) => message.id),
    ["gm-visible", "other-spoken", "other-silent"],
  );

  const languageMessages = [{
    id: "elfique-secret",
    sender: "player",
    content: 'Je murmure "La couronne est fausse."',
    timestamp: 5,
    authorId: "user-other",
    characterId: otherCharacter.id,
    communication: createCommunicationPayload(
      "La couronne est fausse.",
      "oral",
      "elfique",
      speakerPerception,
    ),
  }];
  const languageCharacters = [
    { ...playerCharacter, perception: createPerception({ commun: { oral: "fluent", written: "fluent" } }) },
    { ...otherCharacter, perception: speakerPerception },
  ];
  const hiddenLanguageProjection = projectMessagesForRecipient(
    languageMessages,
    "user-player",
    false,
    languageCharacters,
    playerCharacter.id,
  );
  assert.equal(hiddenLanguageProjection.length, 1);
  assert.equal(hiddenLanguageProjection[0].content.includes("couronne"), false);
  assert.equal(hiddenLanguageProjection[0].communication.languageId, "unknown");
  assert.equal(JSON.stringify(hiddenLanguageProjection).includes("couronne est fausse"), false);
  const mutedProjection = projectMessagesForRecipient(
    [{ ...languageMessages[0], id: "muted", communication: mutedSignal }],
    "user-player",
    false,
    languageCharacters,
    playerCharacter.id,
  );
  assert.deepEqual(mutedProjection, []);

  const adminProjection = createMultiplayerProjection(state, "room-test", {
    ...member,
    userId: "user-admin",
    displayName: "Mélisande",
    role: "admin",
    characterId: null,
    playerColor: "#A263B0",
  }, 8);
  assert.equal(adminProjection.state.campaign.world.secrets.length, 1);
  assert.equal(adminProjection.state.characters[1].history[0], "Histoire privée");
  assert.equal(adminProjection.state.messages.length, 4);

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

  const creationState = useGameStore.getState();
  const creationContext = createMultiplayerCharacterContext(creationState);
  const draft = {
    ...createDefaultCharacterDraft(creationState.campaign.level),
    name: "Ysilde de relève",
    classe: "Éclaireuse",
  };
  const creationResult = createClassicCharacterPackage(draft, [], creationContext);
  assert.ok(creationResult.setup);
  const createdCharacter = creationResult.setup
    ? useGameStore.getState().addCharacterFromPackage(creationResult.setup)
    : null;
  assert.ok(createdCharacter);
  const stateAfterCreation = useGameStore.getState();
  assert.equal(stateAfterCreation.characters.some((character) => character.id === createdCharacter.id), true);
  assert.equal(stateAfterCreation.campaign.characters.some((character) => character.id === createdCharacter.id), true);
  assert.equal(
    stateAfterCreation.campaignStartSnapshot.characters.some((character) => character.id === createdCharacter.id),
    true,
  );
  assert.ok(stateAfterCreation.characterDerivedScores[createdCharacter.id]);

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

function createPerception(languages, senses = {}) {
  return {
    vision: senses.vision ?? "normal",
    hearing: senses.hearing ?? "normal",
    speech: senses.speech ?? "normal",
    languages: Object.entries(languages).map(([languageId, mastery]) => ({
      languageId,
      name: languageId === "commun" ? "Commun" : languageId === "elfique" ? "Elfique" : languageId,
      oral: mastery.oral,
      written: mastery.written,
    })),
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

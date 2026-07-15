import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});
const {
  advanceNarrativeScene,
  applyNarrativeScenePatch,
  createInitialNarrativeScene,
} = await vite.ssrLoadModule("/src/core/game-engine/narrativeScene.ts");
const { resolveAutomaticLocalRequest } = await vite.ssrLoadModule("/src/features/ai-director/automaticLocalResolution.ts");
const { createNarrationPacket } = await vite.ssrLoadModule("/src/features/ai-director/automaticPrompts.ts");
const { routePlayerInput } = await vite.ssrLoadModule("/src/features/ai-director/automaticRouting.ts");
const { normalizeCampaignStartSnapshot } = await vite.ssrLoadModule("/src/features/campaign/campaignStart.ts");

const campaign = {
  id: "campaign-test",
  name: "Couronne test",
  style: "Fantasy politique",
  level: 1,
  characters: [{ id: "hero-test" }],
  history: [],
  createdAt: 1,
  world: {
    name: "Royaume test",
    openingScene: "Dans la Salle du trône, Dame Ysée attend près du dais.",
    lore: "",
    facts: [],
    entities: {
      npcs: [{ id: "npc-ysee", name: "Dame Ysée", type: "npc", description: "Une dame de cour." }],
      locations: [{ id: "loc-throne", name: "Salle du trône", type: "location", description: "Le cœur du palais." }],
      items: [],
    },
  },
};

const initialScene = createInitialNarrativeScene(campaign);
assert.equal(initialScene.locationId, "loc-throne");
assert.deepEqual(initialScene.presentEntityIds, ["npc-ysee"]);

const migratedStart = normalizeCampaignStartSnapshot({
  version: 1,
  campaign,
  characters: campaign.characters,
  selectedCharacterId: "hero-test",
  openingScene: campaign.world.openingScene,
  itemTemplates: [],
  itemInstances: [],
  abilityTemplates: [],
  abilityInstances: [],
});
assert.equal(migratedStart?.version, 4);
assert.equal(migratedStart?.narrativeScene.locationId, "loc-throne");

const sceneWithApproach = applyNarrativeScenePatch(initialScene, {
  upsertEvents: [{
    id: "event-footsteps",
    description: "Des pas approchent de la cachette.",
    stage: "encore dans le couloir",
    turnsRemaining: 1,
    urgency: "rising",
    relatedEntityIds: [],
  }],
}, campaign);
const advancedScene = advanceNarrativeScene(sceneWithApproach, "J'attends.");
assert.equal(advancedScene.activeEvents[0]?.turnsRemaining, 0);
assert.equal(advancedScene.activeEvents[0]?.urgency, "immediate");

const baseState = {
  selectedCharacterId: "hero-test",
  messages: [],
  combat: { status: "inactive" },
  narrativeScene: advancedScene,
  itemTemplates: [],
  itemInstances: [],
};

assert.deepEqual(
  routePlayerInput("Je vole l'épée du roi devant toute la cour.", baseState).agents,
  ["characterManager", "actionManager", "worldManager"],
);
assert.deepEqual(
  routePlayerInput("Je me cure les ongles avec un couteau.", baseState).agents,
  ["characterManager", "worldManager"],
);
assert.deepEqual(
  routePlayerInput("Je crie comme un ivrogne devant la dame de la cour.", { ...baseState, narrativeScene: initialScene }).agents,
  ["worldManager"],
);
assert.deepEqual(
  routePlayerInput("Bonjour", { ...baseState, narrativeScene: initialScene }).agents,
  [],
);

const missingKnife = resolveAutomaticLocalRequest(
  "Je me cure les ongles avec un couteau.",
  baseState,
);
assert.equal(missingKnife.continueToAgents, true);
assert.equal(missingKnife.draftPatch?.facts?.some((fact) => fact.kind === "missingResource"), true);

const waiting = resolveAutomaticLocalRequest("J'attends.", baseState);
assert.equal(waiting.continueToAgents, true);
assert.equal(waiting.draftPatch?.facts?.some((fact) => fact.kind === "continuityConstraint"), true);

const socialDisruption = resolveAutomaticLocalRequest(
  "Je crie comme un ivrogne devant la dame de la cour.",
  { ...baseState, narrativeScene: initialScene },
);
assert.equal(socialDisruption.draftPatch?.facts?.some((fact) => fact.kind === "socialCoherenceConstraint"), true);
assert.equal((socialDisruption.draftPatch?.scenePatches?.[0]?.socialTensionDelta ?? 0) > 0, true);

const packet = createNarrationPacket({
  intentions: [],
  facts: [{
    source: "localEngine",
    kind: "inventoryAuthority",
    content: "Le couteau est absent.",
    visibility: "gmOnly",
  }],
  suggestedAgents: [],
  proposedCommands: [],
  narrationInputs: [],
  scenePatches: [],
  safety: [],
  warnings: [],
  questions: [],
}, []);
assert.deepEqual(packet.facts, []);
assert.deepEqual(packet.constraints, ["Le couteau est absent."]);

await vite.close();
console.log("Tests fondations MJ IA OK");

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
const {
  buildGroundingReport,
  createGroundingDraftPatch,
  validateGroundedNarration,
} = await vite.ssrLoadModule("/src/features/ai-director/grounding.ts");
const {
  createManipulableObjectContext,
} = await vite.ssrLoadModule("/src/features/world/manipulableObjects.ts");
const { normalizeCampaignStartSnapshot } = await vite.ssrLoadModule("/src/features/campaign/campaignStart.ts");
const { parseAiGatewayHealth } = await vite.ssrLoadModule("/src/features/ai-director/httpAiGateway.ts");

const vercelStructuredError = parseAiGatewayHealth(JSON.stringify({
  error: { code: "FUNCTION_INVOCATION_FAILED", message: "La fonction a échoué." },
}), 500, false);
assert.equal(vercelStructuredError.ok, false);
assert.equal(vercelStructuredError.error, "FUNCTION_INVOCATION_FAILED : La fonction a échoué.");
const nonJsonHealth = parseAiGatewayHealth("<!doctype html><title>Not found</title>", 404, false);
assert.match(nonJsonHealth.error, /contrat attendu.*HTTP 404/u);
const healthyGateway = parseAiGatewayHealth(JSON.stringify({
  ok: true,
  configuration: {
    enabled: true,
    providerUrlHost: "api.groq.com",
    hasApiKey: true,
    model: "modele-test",
  },
  providerStatus: 200,
}), 200, true);
assert.equal(healthyGateway.ok, true);
assert.equal(healthyGateway.configuration?.providerUrlHost, "api.groq.com");

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
  messages: [],
  combat: { status: "inactive" },
  abilityTemplates: [],
  abilityInstances: [],
});
assert.equal(migratedStart?.version, 6);
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

const queen = {
  id: "npc-queen",
  name: "Reine Aléandra",
  type: "npc",
  description: "La souveraine du royaume.",
  details: {
    role: "Reine du royaume",
    socialRank: "sovereign",
    access: "restricted",
    desire: "Conclure une alliance fragile",
    connections: [],
  },
};
const groundingState = {
  campaign: {
    ...campaign,
    world: {
      ...campaign.world,
      facts: [],
      entities: {
        ...campaign.world.entities,
        npcs: [queen],
      },
    },
  },
  characters: [{
    id: "hero-test",
    name: "Aldren",
    history: [],
  }],
  selectedCharacterId: "hero-test",
  itemTemplates: [],
  itemInstances: [],
  messages: [],
  combat: { status: "inactive" },
  narrativeScene: {
    ...advancedScene,
    presentEntityIds: [queen.id],
    lastNarratedBeat: "Des pas lourds approchent derrière la porte.",
  },
};

const horseReport = buildGroundingReport("J'appelle mon cheval.", groundingState);
assert.equal(horseReport.claims[0]?.subject, "cheval");
assert.equal(horseReport.claims[0]?.status, "unverified");
assert.equal(horseReport.requiresWorldManager, true);
assert.match(createGroundingDraftPatch(horseReport)?.facts?.[0]?.content ?? "", /faire apparaître|matérialiser/u);
assert.deepEqual(
  validateGroundedNarration("Aucun cheval ne répond à votre appel.", "J'appelle mon cheval.", horseReport, groundingState),
  [],
);
assert.match(
  validateGroundedNarration("Votre cheval traverse la cour et vient à vous.", "J'appelle mon cheval.", horseReport, groundingState)[0] ?? "",
  /matérialise/u,
);
assert.equal(buildGroundingReport("J'ai un cheval.", groundingState).claims[0]?.status, "unverified");
assert.equal(buildGroundingReport("J'appelle Tornade.", groundingState).claims[0]?.subject, "tornade");
assert.deepEqual(buildGroundingReport("Mon personnage a peur.", groundingState).claims, []);

const unknownQueenState = {
  ...groundingState,
  campaign: {
    ...groundingState.campaign,
    world: {
      ...groundingState.campaign.world,
      entities: { ...groundingState.campaign.world.entities, npcs: [] },
    },
  },
  narrativeScene: { ...groundingState.narrativeScene, presentEntityIds: [] },
};
const unknownQueenReport = buildGroundingReport("Je parle à la reine.", unknownQueenState);
assert.equal(unknownQueenReport.claims[0]?.subject, "reine");
assert.equal(unknownQueenReport.claims[0]?.status, "unverified");

const ownedKnifeState = {
  ...groundingState,
  itemTemplates: [{
    id: "tpl-knife",
    name: "Couteau",
    type: "weapon",
    types: ["weapon"],
    tags: ["knife"],
    aliases: ["lame"],
  }],
  itemInstances: [{
    id: "knife-1",
    templateId: "tpl-knife",
    quantity: 1,
    overrides: {},
    location: { type: "inventory", parent: "hero-test" },
  }],
};
assert.equal(buildGroundingReport("Je sors mon couteau.", ownedKnifeState).claims[0]?.status, "established");

const manipulableState = {
  ...groundingState,
  itemTemplates: [
    { id: "tpl-purse", name: "Bourse de cuir", description: "Une petite bourse fermée.", type: "container", types: ["container"], tags: [], aliases: ["bourse"] },
    { id: "tpl-torch", name: "Torche", description: "Une torche encore sèche.", type: "tool", types: ["tool"], tags: [], aliases: [] },
  ],
  itemInstances: [
    { id: "item-held-purse", templateId: "tpl-purse", quantity: 1, overrides: {}, current: {}, data: {}, effects: [], location: { type: "world", parent: queen.id } },
    { id: "item-ground-torch", templateId: "tpl-torch", quantity: 1, overrides: {}, current: {}, data: {}, effects: [], location: { type: "world", parent: "loc-throne" } },
    { id: "item-remote-torch", templateId: "tpl-torch", quantity: 1, overrides: { name: "Torche lointaine" }, current: {}, data: {}, effects: [], location: { type: "world", parent: "loc-elsewhere" } },
  ],
};
const manipulableObjects = createManipulableObjectContext(manipulableState, "Je détrousse la reine.");
assert.deepEqual(manipulableObjects.map((object) => object.id).sort(), ["item-ground-torch", "item-held-purse"]);
assert.equal(manipulableObjects.find((object) => object.id === "item-held-purse")?.affordances.includes("takeFromHolder"), true);
assert.equal(manipulableObjects.find((object) => object.id === "item-ground-torch")?.affordances.includes("pickUp"), true);
assert.deepEqual(
  routePlayerInput("Je détrousse la reine.", manipulableState).agents,
  ["actionManager", "worldManager"],
);
assert.equal(
  resolveAutomaticLocalRequest("Je ramasse la bourse.", manipulableState).commands.length,
  0,
  "Un objet détenu ne doit jamais être ramassé comme un objet au sol.",
);
assert.equal(
  resolveAutomaticLocalRequest("Je ramasse la torche.", manipulableState).commands[0]?.type,
  "pickupItem",
);

const queenReport = buildGroundingReport("Je demande audience à la reine.", groundingState);
assert.equal(queenReport.npcDossiers[0]?.rank, "sovereign");
assert.equal(queenReport.npcDossiers[0]?.access, "restricted");
assert.match(queenReport.npcDossiers[0]?.attentionRule ?? "", /ignore un manant/u);
assert.equal(queenReport.npcDossiers[0]?.directAttentionAllowed, false);
assert.match(
  validateGroundedNarration(
    "La reine vous sourit et vous répond avec intérêt.",
    "Je demande audience à la reine.",
    queenReport,
    groundingState,
  )[0] ?? "",
  /attention directe/u,
);
assert.deepEqual(
  validateGroundedNarration(
    "La reine poursuit son entretien sans vous regarder; un garde vient recueillir votre requête.",
    "Je demande audience à la reine.",
    queenReport,
    groundingState,
  ),
  [],
);
assert.deepEqual(routePlayerInput("Je salue la reine.", groundingState, queenReport).agents, ["worldManager"]);

const audienceState = {
  ...groundingState,
  narrativeScene: {
    ...groundingState.narrativeScene,
    recentConsequences: ["Audience accordée : Aldren a été introduit auprès de la reine."],
  },
};
assert.equal(
  buildGroundingReport("Je réponds à la reine.", audienceState).npcDossiers[0]?.directAttentionAllowed,
  true,
);

const disruptionReport = buildGroundingReport("Je crie comme un ivrogne devant la reine.", groundingState);
assert.equal(disruptionReport.socialIncident?.witnessed, true);
assert.match(
  validateGroundedNarration(
    "Votre voix résonne longuement dans la salle.",
    "Je crie comme un ivrogne devant la reine.",
    disruptionReport,
    groundingState,
  )[0] ?? "",
  /réaction/u,
);
assert.deepEqual(
  validateGroundedNarration(
    "Un silence tombe; les regards se tournent vers vous tandis qu'un garde s'approche.",
    "Je crie comme un ivrogne devant la reine.",
    disruptionReport,
    groundingState,
  ),
  [],
);

const absentQueenState = {
  ...groundingState,
  narrativeScene: { ...groundingState.narrativeScene, presentEntityIds: [] },
};
const absentQueenReport = buildGroundingReport("Je parle de la reine.", absentQueenState);
assert.match(
  validateGroundedNarration("La Reine Aléandra s'approche et vous répond.", "Je parle de la reine.", absentQueenReport, absentQueenState)[0] ?? "",
  /absente/u,
);

const waitingReport = buildGroundingReport("J'attends.", groundingState);
assert.equal(waitingReport.mustAdvanceScene, true);
assert.match(
  validateGroundedNarration(
    "Des pas lourds approchent derrière la porte.",
    "J'attends.",
    waitingReport,
    groundingState,
  )[0] ?? "",
  /répète|reproduit/u,
);

const baseState = {
  campaign,
  characters: campaign.characters,
  selectedCharacterId: "hero-test",
  messages: [],
  combat: { status: "inactive" },
  narrativeScene: advancedScene,
  itemTemplates: [],
  itemInstances: [],
};

assert.deepEqual(
  routePlayerInput("Je vole l'épée du roi devant toute la cour.", baseState).agents,
  ["actionManager", "worldManager"],
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

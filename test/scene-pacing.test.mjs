import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

const {
  buildScenePacingPrompt,
  isGroundedScenePacingNarration,
  sanitizeScenePacingPatch,
  selectScenePacingOpportunity,
} = await vite.ssrLoadModule("/src/features/ai-director/scenePacingPolicy.ts");

const npc = {
  id: "npc-capitaine",
  name: "Capitaine Ysée",
  type: "npc",
  description: "La capitaine surveille la salle et protège la porte nord.",
  details: {
    role: "Officière du guet",
    desire: "Obtenir une réponse claire",
    fear: "Perdre le contrôle de la salle",
    secret: "Elle a volé le sceau.",
  },
};
const baseState = {
  campaign: {
    id: "campaign-test",
    name: "Test",
    world: {
      lore: "",
      facts: [],
      entities: { npcs: [npc], locations: [], items: [] },
    },
    characters: [],
    history: [],
  },
  messages: [
    { id: "player-1", sender: "player", content: "J'observe la porte.", timestamp: 1 },
    { id: "gm-1", sender: "gm", content: "Des coups sourds résonnent derrière la porte.", timestamp: 2 },
  ],
  narrativeScene: {
    id: "scene-test",
    revision: 2,
    turn: 1,
    elapsedMinutes: 1,
    locationId: null,
    locationLabel: "Salle du guet",
    playerPosition: "près de la table",
    presentEntityIds: [npc.id],
    socialTension: 0,
    alertLevel: 0,
    activeEvents: [],
    recentConsequences: [],
    lastPlayerAction: "J'observe la porte.",
    lastNarratedBeat: "Des coups sourds résonnent derrière la porte.",
    lastProactiveBeatAt: 0,
    lastProactiveTurn: null,
    lastProactiveKey: "",
  },
  combat: { status: "inactive" },
  pendingGameDecision: null,
  pendingActionIntents: [],
  playerCheckRequests: [],
};

assert.equal(selectScenePacingOpportunity(baseState), null, "Aucun prétexte générique ne doit créer une relance.");

const event = {
  id: "event-door",
  description: "Quelqu'un force la porte nord depuis le couloir.",
  stage: "La poignée tremble",
  turnsRemaining: 1,
  urgency: "rising",
  relatedEntityIds: [npc.id],
};
const eventState = {
  ...baseState,
  narrativeScene: { ...baseState.narrativeScene, activeEvents: [event] },
};
const eventOpportunity = selectScenePacingOpportunity(eventState);
assert.equal(eventOpportunity?.kind, "event");
assert.equal(eventOpportunity?.focusId, event.id);

const unchangedPatch = sanitizeScenePacingPatch(eventState, eventOpportunity, {
  upsertEvents: [event],
  consequences: ["La porte reste fermée."],
});
assert.equal(unchangedPatch, null, "Un événement doit réellement changer d'étape.");

const eventPatch = sanitizeScenePacingPatch(eventState, eventOpportunity, {
  locationLabel: "Lieu inventé",
  playerPosition: "ailleurs",
  socialTensionDelta: 8,
  alertLevel: 4,
  upsertEvents: [{ ...event, stage: "Le premier gond cède", turnsRemaining: 0 }],
  consequences: ["Le gond supérieur de la porte vient de céder."],
});
assert.equal(eventPatch.locationLabel, undefined);
assert.equal(eventPatch.playerPosition, undefined);
assert.equal(eventPatch.socialTensionDelta, 1);
assert.equal(eventPatch.alertLevel, 1);
assert.equal(eventPatch.upsertEvents[0].stage, "Le premier gond cède");

assert.equal(
  isGroundedScenePacingNarration("Le temps passe tandis que vous réfléchissez.", eventOpportunity),
  false,
);
assert.equal(
  isGroundedScenePacingNarration("Le gond supérieur éclate. La porte s'incline brusquement vers la salle.", eventOpportunity),
  true,
);

const alreadyUsedState = {
  ...eventState,
  narrativeScene: { ...eventState.narrativeScene, lastProactiveTurn: 1 },
};
assert.equal(selectScenePacingOpportunity(alreadyUsedState), null);

const socialState = {
  ...baseState,
  narrativeScene: { ...baseState.narrativeScene, socialTension: 3 },
};
const socialOpportunity = selectScenePacingOpportunity(socialState);
assert.equal(socialOpportunity?.kind, "social");
assert.equal(socialOpportunity?.focusId, npc.id);
assert.equal(
  sanitizeScenePacingPatch(socialState, socialOpportunity, { socialTensionDelta: 1 }),
  null,
  "Une pression sociale doit laisser une conséquence concrète.",
);
assert.ok(sanitizeScenePacingPatch(socialState, socialOpportunity, {
  socialTensionDelta: 1,
  consequences: ["Ysée exige désormais une réponse immédiate."],
}));
assert.equal(
  isGroundedScenePacingNarration("La capitaine exige une réponse.", socialOpportunity),
  false,
  "Le PNJ focal doit être nommé sans ambiguïté.",
);
assert.equal(
  isGroundedScenePacingNarration("La capitaine Ysée referme sa main sur la poignée. « Votre réponse. Maintenant. »", socialOpportunity),
  true,
);

const prompt = buildScenePacingPrompt(eventState, eventOpportunity);
assert.ok(prompt.includes("Quelqu'un force la porte nord"));
assert.ok(!prompt.includes("Elle a volé le sceau"), "Un secret sans rapport ne doit pas être envoyé au Narrateur.");
assert.ok(!prompt.includes("inventaire"), "La relance ne reçoit aucun inventaire.");

await vite.close();
console.log("Tests rythme narratif contextuel OK");

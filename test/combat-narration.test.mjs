import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

const {
  collectNewNarratableCombatEntries,
  isLegacyTechnicalCombatMessage,
} = await vite.ssrLoadModule("/src/features/combat/combatNarration.ts");
const {
  buildCombatNarrationPrompt,
  isNarratedCombatText,
} = await vite.ssrLoadModule("/src/features/ai-director/combatNarrationPolicy.ts");

const before = {
  log: [{ id: "old", type: "action", text: "Ancien fait", timestamp: 1 }],
};
const after = {
  log: [
    { id: "damage", type: "damage", text: "Ysée inflige 4 dégâts à Orme.", timestamp: 4 },
    { id: "turn", type: "turn", text: "Tour de Ysée.", timestamp: 3 },
    { id: "move", type: "move", text: "Ysée se déplace de 2 m.", timestamp: 2 },
    ...before.log,
  ],
};
assert.deepEqual(collectNewNarratableCombatEntries(before, after), [
  { type: "move", text: "Ysée se déplace de 2 m." },
  { type: "damage", text: "Ysée inflige 4 dégâts à Orme." },
]);

assert.equal(isLegacyTechnicalCombatMessage({
  id: "message-legacy",
  sender: "gm",
  content: "Résumé combat : utiliser Arc court.",
  timestamp: 1,
}), true);
assert.equal(isLegacyTechnicalCombatMessage({
  id: "message-story",
  sender: "gm",
  content: "La flèche fend l'air.",
  timestamp: 1,
}), false);

const cues = [{
  id: "cue-1",
  kind: "enemyTurn",
  round: 2,
  entries: collectNewNarratableCombatEntries(before, after),
  createdAt: 5,
}];
const prompt = buildCombatNarrationPrompt(cues, [{
  id: "story",
  sender: "gm",
  content: "Orme lève son bouclier.",
  timestamp: 1,
}]);
assert.ok(prompt.includes("Ysée inflige 4 dégâts"));
assert.ok(prompt.includes("Orme lève son bouclier"));
assert.ok(!prompt.includes("position"));

assert.equal(isNarratedCombatText("Tour de : Ysée.", cues), false);
assert.equal(isNarratedCombatText("Ysée se déplace de 2 m.", cues), false);
assert.equal(
  isNarratedCombatText("Ysée bondit hors de sa garde et sa lame heurte Orme avant que son bouclier ne se referme.", cues),
  true,
);

const reactionCue = [{
  ...cues[0],
  entries: [{ type: "action", text: "Orme peut utiliser Tir instinctif en réaction contre Ysée." }],
}];
assert.equal(isNarratedCombatText("Ysée surgit dans la ligne de mire d'Orme.", reactionCue), false);
assert.equal(
  isNarratedCombatText("Ysée surgit dans la ligne de mire d'Orme. Déclenchez-vous Tir instinctif ?", reactionCue),
  true,
);

await vite.close();
console.log("Tests narration de combat OK");

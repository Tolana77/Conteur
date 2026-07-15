import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

const {
  prepareImprovisedCheck,
  resolveCharacterStat,
  resolveCheckSkill,
  resolvePlayerCheckRequest,
} = await vite.ssrLoadModule("/src/features/ai-director/improvisedActions.ts");
const { resolveAutomaticLocalRequest } = await vite.ssrLoadModule(
  "/src/features/ai-director/automaticLocalResolution.ts",
);

const character = {
  id: "hero-test",
  name: "Ariane",
  stats: {
    force: 10,
    dexterite: 14,
    constitution: 12,
    intelligence: 16,
    sagesse: 14,
    charisme: 11,
  },
  competences: ["Arcanes", "Investigation", "Perception"],
};
const derivedScores = {
  "hero-test": {
    modifiers: {
      force: 0,
      dexterite: 2,
      constitution: 1,
      intelligence: 3,
      sagesse: 2,
      charisme: 0,
    },
    proficiencyBonus: 2,
  },
};
const preparationContext = {
  characters: [character],
  selectedCharacterId: character.id,
  derivedScores,
};

assert.equal(resolveCheckSkill("Sprint", "chercher une taverne", "observer les enseignes"), "Perception");
assert.equal(resolveCharacterStat("DEX", "Perception"), "sagesse");
assert.equal(resolveCheckSkill("Sprint", "courir très vite"), undefined);

const ordinarySearch = prepareImprovisedCheck({
  type: "resolveGameAction",
  action: "Chercher une taverne",
  method: "Observer les enseignes",
  difficulty: "plausible",
  skill: "Sprint",
  stat: "DEX",
}, preparationContext);
assert.equal(ordinarySearch.status, "noRoll");

const invalidRiskySkill = prepareImprovisedCheck({
  type: "resolveGameAction",
  action: "Franchir le gouffre sous les tirs",
  difficulty: "difficult",
  stakes: "Une chute grave",
  skill: "Sprint",
  stat: "DEX",
}, preparationContext);
assert.equal(invalidRiskySkill.status, "error");
assert.match(invalidRiskySkill.message, /compétence reconnue/);

const rawStrengthCheck = prepareImprovisedCheck({
  type: "resolveGameAction",
  action: "Soulever la herse avant sa chute",
  difficulty: "difficult",
  stakes: "La herse bloque le passage",
  stat: "FOR",
}, preparationContext);
assert.equal(rawStrengthCheck.status, "ready");
assert.equal(rawStrengthCheck.request.skill, undefined);
assert.equal(rawStrengthCheck.request.stat, "force");
assert.equal(rawStrengthCheck.request.modifierPreview, 0);

const rawDexterityCheck = prepareImprovisedCheck({
  type: "abilityCheck",
  characterId: character.id,
  stat: "DEX",
  dc: 15,
  reason: "Garder l'équilibre sur la corniche",
}, preparationContext);
assert.equal(rawDexterityCheck.status, "ready");
assert.equal(rawDexterityCheck.request.skill, undefined);
assert.equal(rawDexterityCheck.request.stat, "dexterite");
assert.equal(rawDexterityCheck.request.modifierPreview, 2);

const prepared = prepareImprovisedCheck({
  type: "resolveGameAction",
  action: "Déchiffrer une rune instable",
  method: "Étudier ses résonances magiques",
  difficulty: "difficult",
  stakes: "Une erreur déclenche le sceau",
  skill: "Sprint",
  stat: "DEX",
  outcomes: { success: "Le sceau est compris", failure: "Le sceau réagit" },
}, preparationContext);
assert.equal(prepared.status, "ready");
assert.equal(prepared.request.skill, "Arcanes");
assert.equal(prepared.request.stat, "intelligence");
assert.equal(prepared.request.modifierPreview, 5);
assert.equal(prepared.request.visibility, "public");

let rollCount = 0;
const resolved = resolvePlayerCheckRequest({
  ...prepared.request,
  id: "check-test",
  createdAt: 10,
  status: "pending",
}, {
  characters: [character],
  derivedScores,
  itemInstances: [],
  itemTemplates: [],
  rollFormula: (formula, visibility, reason) => {
    rollCount += 1;
    assert.equal(formula, "1d20 + 5");
    assert.equal(visibility, "public");
    return {
      id: "roll-test",
      sides: 20,
      rolls: [12],
      modifier: 5,
      result: 17,
      formula,
      visibility,
      reason,
      timestamp: 20,
    };
  },
  spendItemQuantity: () => true,
  recordCampaignEvent: () => {},
  now: () => 30,
});
assert.equal(rollCount, 1);
assert.equal(resolved.status, "success");
assert.equal(resolved.resolution.result, 17);
assert.equal(resolved.resolution.degree, "success");

const localState = {
  selectedCharacterId: character.id,
  messages: [],
  itemTemplates: [],
  itemInstances: [],
  narrativeScene: {
    locationLabel: "Rue principale",
    presentEntityIds: [],
    lastNarratedBeat: "",
    alertLevel: 0,
  },
};

const tavernClarification = resolveAutomaticLocalRequest("Je cherche une taverne.", localState);
assert.equal(tavernClarification.continueToAgents, true);
assert.equal(tavernClarification.commands.length, 0);
assert.match(tavernClarification.draftPatch.questions[0], /Comment vous y prenez-vous/);

const theftClarification = resolveAutomaticLocalRequest("Je vole le roi.", localState);
assert.equal(theftClarification.commands.length, 0);
assert.equal(theftClarification.draftPatch.scenePatches.length, 0);
assert.match(theftClarification.draftPatch.questions[0], /Que cherchez-vous à dérober/);

await vite.close();
console.log("Tests demandes de jets joueur OK");

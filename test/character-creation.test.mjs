import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

const {
  CHARACTER_POINT_BUY_BUDGET,
  calculatePointBuyCost,
  createClassicCharacterPackage,
  createDefaultCharacterDraft,
  getRecommendedStartingHp,
  parseCharacterCreationPackage,
} = await vite.ssrLoadModule("/src/features/character/characterCreation.ts");
const {
  createCampaignStartFromBlueprint,
  parseWorldBlueprint,
} = await vite.ssrLoadModule("/src/features/world/worldBlueprint.ts");
const {
  createCampaignStartSnapshot,
  normalizeCampaignStartSnapshot,
} = await vite.ssrLoadModule("/src/features/campaign/campaignStart.ts");
const { initialItemTemplates } = await vite.ssrLoadModule("/src/features/items/index.ts");
const { initialAbilityTemplates } = await vite.ssrLoadModule("/src/features/abilities/index.ts");
const { initialEffectTemplates, initialEnemyTemplates } = await vite.ssrLoadModule("/src/features/content/index.ts");
const { useGameStore } = await vite.ssrLoadModule("/src/store/useGameStore.ts");

const context = {
  campaignName: "Les Veilleurs du gué",
  campaignStyle: "Fantasy politique",
  campaignLevel: 1,
  worldName: "Ormeval",
  worldPitch: "Une frontière où les serments coûtent plus cher que l'or.",
  playerRole: "Des voyageurs encore peu connus",
  partyConcept: "Un personnage solitaire qui pourra rencontrer des alliés en jeu",
  startingEquipment: "Un paquetage modeste",
  itemTemplates: initialItemTemplates,
  abilityTemplates: initialAbilityTemplates,
  effectTemplates: initialEffectTemplates,
  enemyTemplates: initialEnemyTemplates,
};

const draft = {
  ...createDefaultCharacterDraft(1),
  name: "Maëlle Veyre",
  title: "Messagère sans sceau",
  description: "Une cavalière attentive qui évite la magie tapageuse.",
  origin: "Ancienne messagère royale accusée d'avoir perdu une lettre.",
  classe: "Éclaireuse",
  stats: {
    force: 8,
    dexterite: 15,
    constitution: 14,
    intelligence: 13,
    sagesse: 12,
    charisme: 10,
  },
  competences: ["Perception", "Investigation", "Survie", "Discrétion"],
  abilityTemplateIds: ["abl_second_wind"],
};
draft.maxPv = getRecommendedStartingHp(1, draft.stats.constitution);
draft.pv = draft.maxPv;

assert.equal(calculatePointBuyCost(draft.stats), CHARACTER_POINT_BUY_BUDGET);
const classic = createClassicCharacterPackage(
  draft,
  [{ templateId: "tpl_rations", quantity: 3, equipped: false }],
  context,
);
assert.equal(classic.errors.length, 0);
assert.ok(classic.setup);
assert.equal(classic.setup.characters[0].name, "Maëlle Veyre");
assert.equal(classic.setup.startingItems[0].ownerId, "character-player");

const overpowered = createClassicCharacterPackage({
  ...draft,
  stats: {
    force: 15,
    dexterite: 15,
    constitution: 15,
    intelligence: 15,
    sagesse: 15,
    charisme: 15,
  },
}, [], context);
assert.equal(overpowered.setup, null);
assert.ok(overpowered.errors.some((error) => error.includes("Budget de caractéristiques dépassé")));

const assistedJson = {
  schemaVersion: 1,
  character: {
    id: "character-maelle",
    name: "Maëlle Veyre",
    title: "Messagère sans sceau",
    description: "Une cavalière attentive qui combat seulement si la route l'exige.",
    origin: "Une lettre royale perdue a brisé sa réputation.",
    espece: "Humaine",
    classe: "Éclaireuse",
    niveau: 1,
    stats: draft.stats,
    maxPv: 10,
    competences: draft.competences,
    abilityTemplateIds: ["ability-spark-thread"],
    history: ["Elle recherche toujours la lettre disparue."],
  },
  startingItems: [{ templateId: "tpl_rations", quantity: 3, equipped: false }],
  effectTemplates: [{
    id: "effect-spark-thread",
    name: "Fil d'étincelle",
    description: "Une étincelle brève et dirigée.",
    tags: ["magic", "fire", "damage"],
    actions: [{ operation: "damage", variables: { value: "1d4", damageType: "feu" } }],
  }],
  abilityTemplates: [{
    id: "ability-spark-thread",
    name: "Fil d'étincelle",
    description: "Projette une étincelle modeste à courte portée.",
    types: ["magic", "attack"],
    tags: ["fire", "ranged"],
    combatRole: "attack",
    activation: { timing: "action" },
    resourceCost: { type: "charge", amount: 1 },
    targetingV2: {
      aim: { allowed: ["entity"], required: true, range: 6, lineOfSight: true },
      area: { shape: "none" },
      affects: { allowed: ["living"], maxTargets: 1, requiresLiving: true },
      defaultPriority: ["nearestEnemy"],
      suggestedSides: ["enemy"],
    },
    charges: { max: 2, initial: 2, recharge: ["longRest"], rechargeAmount: "full" },
    scaling: { level: 1, mode: "fixed" },
    duration: { type: "instant" },
    effects: [{ effectId: "effect-spark-thread", variables: {} }],
    modules: { ability: {} },
  }],
};

const assisted = parseCharacterCreationPackage(JSON.stringify(assistedJson), context);
assert.equal(assisted.errors.length, 0);
assert.ok(assisted.setup);
assert.equal(assisted.setup.abilityTemplates[0].id, "ability-spark-thread");

const excessiveDamageJson = structuredClone(assistedJson);
excessiveDamageJson.effectTemplates[0].actions[0].variables.value = "20d20";
const excessiveDamage = parseCharacterCreationPackage(JSON.stringify(excessiveDamageJson), context);
assert.equal(excessiveDamage.setup, null);
assert.ok(excessiveDamage.errors.some((error) => error.includes("dégâts potentiels trop élevés")));

const blueprint = {
  schemaVersion: 3,
  campaign: {
    name: context.campaignName,
    style: context.campaignStyle,
    level: 1,
    elevatorPitch: context.worldPitch,
    centralQuestion: "Qui possède réellement la frontière ?",
    openingScene: "La cloche du gué sonne alors qu'aucun voyageur n'est visible.",
  },
  party: { characters: [], startingItems: [] },
  world: {
    name: context.worldName,
    lore: "Une marche disputée depuis trois générations.",
    tone: "Tendu et humain",
    themes: ["dette", "frontière"],
    rules: ["Les serments publics ont valeur de contrat."],
    facts: ["Le gué ferme au crépuscule.", "Deux maisons prélèvent le même impôt.", "Les lettres royales sont rares."],
    factions: [],
    locations: [],
    npcs: [],
    items: [],
    conflicts: [],
    secrets: [],
    hooks: [],
    timeline: [],
  },
};

const makeEntity = (id) => ({
  id,
  name: id,
  description: `Description de ${id}`,
  role: "Rôle de jeu",
  desire: "Obtenir une réponse",
  fear: "Perdre son influence",
  secret: "Un secret exploitable",
  importance: "Un choix possible",
  connections: [],
  tags: ["test"],
});
const legacyBlueprint = {
  ...blueprint,
  schemaVersion: 2,
  party: { characters: [draft], startingItems: [] },
  world: {
    ...blueprint.world,
    factions: [
      { id: "faction-one", name: "Faction une", goal: "But", method: "Méthode", resource: "Ressource", relationship: "Rivale" },
      { id: "faction-two", name: "Faction deux", goal: "But", method: "Méthode", resource: "Ressource", relationship: "Rivale" },
    ],
    locations: [makeEntity("location-one"), makeEntity("location-two"), makeEntity("location-three")],
    npcs: [makeEntity("npc-one"), makeEntity("npc-two"), makeEntity("npc-three")],
    hooks: [
      { id: "hook-one", title: "Piste une", premise: "Choix", urgency: "Bientôt", relatedIds: [] },
      { id: "hook-two", title: "Piste deux", premise: "Choix", urgency: "Bientôt", relatedIds: [] },
      { id: "hook-three", title: "Piste trois", premise: "Choix", urgency: "Bientôt", relatedIds: [] },
    ],
    secrets: [
      { id: "secret-one", truth: "Vérité", clues: ["Indice A", "Indice B"], relatedIds: [] },
      { id: "secret-two", truth: "Vérité", clues: ["Indice C", "Indice D"], relatedIds: [] },
    ],
    timeline: [
      { id: "timeline-one", event: "Événement", trigger: "Demain" },
      { id: "timeline-two", event: "Événement", trigger: "Après" },
      { id: "timeline-three", event: "Événement", trigger: "Enfin" },
    ],
  },
};
const migratedBlueprint = parseWorldBlueprint(JSON.stringify(legacyBlueprint));
assert.equal(migratedBlueprint.errors.length, 0);
assert.ok(migratedBlueprint.blueprint);
assert.deepEqual(migratedBlueprint.blueprint.party, { characters: [], startingItems: [] });
assert.ok(migratedBlueprint.warnings.some((warning) => warning.includes("groupe a été retiré")));

const start = createCampaignStartFromBlueprint(
  blueprint,
  initialItemTemplates,
  initialAbilityTemplates,
  initialEffectTemplates,
  initialEnemyTemplates,
  assisted.setup,
);
assert.equal(start.characters.length, 1);
assert.equal(start.characters[0].campaignId, start.campaign.id);
assert.equal(start.campaign.characters[0].campaignId, start.campaign.id);
assert.equal(start.itemInstances[0].location.parent, start.characters[0].id);
assert.equal(start.abilityInstances[0].ownerId, start.characters[0].id);
assert.ok(start.abilityTemplates.some((template) => template.id === "ability-spark-thread"));
assert.ok(start.effectTemplates.some((template) => template.id === "effect-spark-thread"));

const wrongCampaignCharacter = { ...start.characters[0], campaignId: "campaign-foreign" };
const rebound = createCampaignStartSnapshot({
  ...start,
  characters: [wrongCampaignCharacter],
  campaign: { ...start.campaign, characters: [wrongCampaignCharacter] },
});
assert.equal(rebound.characters[0].campaignId, rebound.campaign.id);
const restored = normalizeCampaignStartSnapshot(JSON.parse(JSON.stringify(rebound)));
assert.ok(restored);
assert.equal(restored.characters[0].id, start.characters[0].id);
assert.equal(restored.characters[0].campaignId, start.campaign.id);

useGameStore.getState().startCampaign(start);
useGameStore.getState().setCharacterPortrait(start.characters[0].id, "data:image/png;base64,portrait-test");
const startingDexterity = start.characters[0].stats.dexterite;
useGameStore.getState().changeCharacterStat(start.characters[0].id, "dexterite", 1, "add");
assert.equal(useGameStore.getState().characters[0].stats.dexterite, startingDexterity + 1);
useGameStore.getState().restartCampaign();
assert.equal(useGameStore.getState().characters[0].id, start.characters[0].id);
assert.equal(useGameStore.getState().characters[0].campaignId, start.campaign.id);
assert.equal(useGameStore.getState().characters[0].stats.dexterite, startingDexterity);
assert.equal(useGameStore.getState().characterPortraits[start.characters[0].id], "data:image/png;base64,portrait-test");

const secondStart = createCampaignStartFromBlueprint(
  { ...blueprint, campaign: { ...blueprint.campaign, name: "Une autre campagne" } },
  initialItemTemplates,
  initialAbilityTemplates,
  initialEffectTemplates,
  initialEnemyTemplates,
  classic.setup,
);
useGameStore.getState().startCampaign(secondStart);
assert.notEqual(secondStart.campaign.id, start.campaign.id);
assert.equal(secondStart.characters[0].campaignId, secondStart.campaign.id);
assert.deepEqual(useGameStore.getState().characterPortraits, {});

await vite.close();
console.log("Tests création de personnage OK");

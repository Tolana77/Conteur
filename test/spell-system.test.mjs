import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const directory = await mkdtemp(path.join(tmpdir(), "le-conteur-spells-"));
const outfile = path.join(directory, "spells.mjs");
const storeOutfile = path.join(directory, "store.mjs");

try {
  await build({
    entryPoints: [path.resolve("src/features/spells/index.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    logLevel: "silent",
  });

  const spells = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  assert.equal(spells.initialSpellTemplates.length, 100, "Le catalogue doit contenir 100 sorts.");
  assert.equal(spells.initialSpellActionTemplates.length, 100, "Chaque sort doit référencer une action unique.");
  assert.equal(spells.initialSpellTemplates.find((spell) => spell.id === "spell-fireball")?.minimumSlotLevel, 3);
  assert.equal(spells.initialSpellTemplates.find((spell) => spell.id === "spell-magic-missile")?.minimumSlotLevel, 1);

  assert.deepEqual(
    spells.createSpellSlots("full", 5).map(({ level, max }) => [level, max]),
    [[1, 4], [2, 3], [3, 2]],
  );
  assert.deepEqual(spells.createSpellSlots("half", 1), []);
  assert.deepEqual(
    spells.createSpellSlots("half", 2).map(({ level, max }) => [level, max]),
    [[1, 2]],
  );

  const character = {
    id: "test-wizard",
    campaignId: "test-campaign",
    name: "Arcaniste",
    espece: "Humain",
    classe: "Magicien",
    niveau: 5,
    stats: { force: 8, dexterite: 12, constitution: 12, intelligence: 16, sagesse: 10, charisme: 10 },
    pv: 20,
    maxPv: 20,
    inventaire: [],
    competences: [],
  };
  const book = spells.createInitialSpellbook(character, spells.initialSpellTemplates);
  assert.ok(book);
  assert.equal(spells.getSpellPreparationLimit(character), 8);

  const fireball = spells.initialSpellTemplates.find((spell) => spell.id === "spell-fireball");
  assert.ok(fireball);
  const withoutFocus = spells.checkSpellCast({
    character,
    book: { ...book, knownSpellIds: [...book.knownSpellIds, fireball.id], preparedSpellIds: [...book.preparedSpellIds, fireball.id] },
    spell: fireball,
    slotLevel: 3,
    itemInstances: [],
    itemTemplates: [],
  });
  assert.equal(withoutFocus.canCast, false);
  assert.match(withoutFocus.reasons.join(" "), /matérielle/i);

  const focusTemplate = { id: "focus", tags: ["spell-focus"] };
  const withFocus = spells.checkSpellCast({
    character,
    book: { ...book, knownSpellIds: [...book.knownSpellIds, fireball.id], preparedSpellIds: [...book.preparedSpellIds, fireball.id] },
    spell: fireball,
    slotLevel: 3,
    itemInstances: [{ id: "focus-1", templateId: "focus", quantity: 1, location: { type: "inventory", parent: character.id } }],
    itemTemplates: [focusTemplate],
  });
  assert.equal(withFocus.canCast, true);

  const missile = spells.initialSpellTemplates.find((spell) => spell.id === "spell-magic-missile");
  const missileAction = spells.initialSpellActionTemplates.find((action) => action.id === missile.actionId);
  const scaledMissile = spells.resolveSpellEffects(missile, missileAction, 3);
  assert.equal(scaledMissile[0].variables.value, "3d4 + 3 + 1d4 + 1 + 1d4 + 1");
  const cureWounds = spells.initialSpellTemplates.find((spell) => spell.id === "spell-cure-wounds");
  const cureWoundsAction = spells.initialSpellActionTemplates.find((action) => action.id === cureWounds.actionId);
  assert.equal(spells.resolveSpellEffects(cureWounds, cureWoundsAction, 1, "charisme")[0].variables.value, "1d8 + CHA");

  const rested = spells.restoreSpellSlots(
    spells.spendSpellSlot(book, 1, missile.id, false),
    "longRest",
  );
  assert.equal(rested.slots.find((slot) => slot.level === 1).remaining, 4);
  assert.equal(rested.preparationRequired, true);

  await build({
    entryPoints: [path.resolve("src/store/useGameStore.ts")],
    outfile: storeOutfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    logLevel: "silent",
  });
  const { useGameStore } = await import(`${pathToFileURL(storeOutfile).href}?t=${Date.now()}`);
  const integrationCharacter = { ...character, niveau: 1 };
  const integrationBook = spells.createInitialSpellbook(integrationCharacter, spells.initialSpellTemplates);
  const initialStore = useGameStore.getState();
  useGameStore.setState({
    characters: [integrationCharacter],
    campaign: { ...initialStore.campaign, characters: [integrationCharacter] },
    selectedCharacterId: integrationCharacter.id,
    spellTemplates: spells.initialSpellTemplates,
    spellbooks: [integrationBook],
    pendingActionIntents: [],
    itemInstances: [],
  });
  assert.equal(useGameStore.getState().addSpellIntent("spell-arcane-armor", 1), true);
  useGameStore.getState().sendPlayerMessage("");
  const integratedState = useGameStore.getState();
  assert.equal(integratedState.spellbooks[0].slots[0].remaining, 1, "L'envoi doit dépenser un emplacement.");
  assert.equal(integratedState.messages.at(-1).actions[0].kind, "castSpell");

  console.log("spell-system: ok");
} finally {
  await rm(directory, { recursive: true, force: true });
}

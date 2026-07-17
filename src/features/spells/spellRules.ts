import type {
  Character,
  CharacterSpellbook,
  CharacterStats,
  Combatant,
  GameActionTemplate,
  ItemEffectRef,
  ItemInstance,
  ItemTemplate,
  SpellLevel,
  SpellSlotProgression,
  SpellSlotState,
  SpellTemplate,
  SpellcastingClassId,
} from "../../app/types";
import { resolveGameActionEffects } from "../actions/actionRules";

export interface SpellcastingClassProfile {
  id: SpellcastingClassId;
  label: string;
  aliases: string[];
  castingAbility: keyof CharacterStats;
  progression: SpellSlotProgression;
  preparationMode: CharacterSpellbook["preparationMode"];
  slotRecovery: CharacterSpellbook["slotRecovery"];
  preparationLevelMultiplier: number;
}

export interface SpellMaterialConsumption {
  itemId: string;
  quantity: number;
  label: string;
}

export interface SpellCastCheck {
  canCast: boolean;
  reasons: string[];
  consumptions: SpellMaterialConsumption[];
}

const fullCasterSlots: number[][] = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export const spellcastingClassProfiles: SpellcastingClassProfile[] = [
  { id: "wizard", label: "Magicien", aliases: ["magicien", "mage", "wizard", "arcaniste"], castingAbility: "intelligence", progression: "full", preparationMode: "prepared", slotRecovery: "longRest", preparationLevelMultiplier: 1 },
  { id: "cleric", label: "Prêtre", aliases: ["pretre", "prêtre", "clerc", "cleric"], castingAbility: "sagesse", progression: "full", preparationMode: "prepared", slotRecovery: "longRest", preparationLevelMultiplier: 1 },
  { id: "bard", label: "Barde", aliases: ["barde", "bard", "menestrel", "ménestrel"], castingAbility: "charisme", progression: "full", preparationMode: "known", slotRecovery: "longRest", preparationLevelMultiplier: 1 },
  { id: "druid", label: "Druide", aliases: ["druide", "druid"], castingAbility: "sagesse", progression: "full", preparationMode: "prepared", slotRecovery: "longRest", preparationLevelMultiplier: 1 },
  { id: "sorcerer", label: "Ensorceleur", aliases: ["ensorceleur", "sorcerer", "mage inne", "mage inné"], castingAbility: "charisme", progression: "full", preparationMode: "known", slotRecovery: "longRest", preparationLevelMultiplier: 1 },
  { id: "warlock", label: "Occultiste", aliases: ["occultiste", "sorcier", "warlock"], castingAbility: "charisme", progression: "pact", preparationMode: "known", slotRecovery: "shortRest", preparationLevelMultiplier: 1 },
  { id: "paladin", label: "Paladin", aliases: ["paladin", "chevalier sacre", "chevalier sacré"], castingAbility: "charisme", progression: "half", preparationMode: "prepared", slotRecovery: "longRest", preparationLevelMultiplier: 0.5 },
  { id: "ranger", label: "Rôdeur", aliases: ["rodeur", "rôdeur", "ranger", "eclaireur", "éclaireur"], castingAbility: "sagesse", progression: "half", preparationMode: "known", slotRecovery: "longRest", preparationLevelMultiplier: 0.5 },
];

const focusTags = new Set([
  "components",
  "catalyst",
  "spell-focus",
  "arcane-focus",
  "divine-focus",
  "druidic-focus",
  "instrument",
]);

const verbalBlockers = new Set(["silenced", "unconscious", "stunned", "paralyzed"]);
const somaticBlockers = new Set(["unconscious", "stunned", "paralyzed", "petrified"]);

export function getSpellcastingProfile(className: string | null | undefined): SpellcastingClassProfile | null {
  const normalized = normalizeText(className ?? "");
  if (!normalized) return null;
  return spellcastingClassProfiles.find((profile) =>
    profile.aliases.some((alias) => normalized.includes(normalizeText(alias)))) ?? null;
}

export function getSpellcastingProfileById(classId: SpellcastingClassId): SpellcastingClassProfile {
  const profile = spellcastingClassProfiles.find((candidate) => candidate.id === classId);
  if (!profile) throw new Error(`Classe d'incantation inconnue : ${classId}`);
  return profile;
}

export function createSpellSlots(progression: SpellSlotProgression, characterLevel: number): SpellSlotState[] {
  const level = clampLevel(characterLevel);

  if (progression === "pact") {
    if (level < 1) return [];
    const slotLevel = Math.min(5, Math.max(1, Math.ceil(level / 2))) as Exclude<SpellLevel, 0>;
    const max = level >= 17 ? 4 : level >= 11 ? 3 : level >= 2 ? 2 : 1;
    return [{ level: slotLevel, max, remaining: max }];
  }

  const casterLevel = progression === "half" ? Math.floor(level / 2) : level;
  if (casterLevel <= 0) return [];

  return (fullCasterSlots[casterLevel] ?? []).map((max, index) => ({
    level: (index + 1) as Exclude<SpellLevel, 0>,
    max,
    remaining: max,
  }));
}

export function createInitialSpellbook(
  character: Character,
  templates: SpellTemplate[],
): CharacterSpellbook | null {
  const profile = getSpellcastingProfile(character.classe);
  if (!profile) return null;

  const slots = createSpellSlots(profile.progression, character.niveau);
  const eligible = getEligibleClassSpells(profile.id, slots, templates);
  const cantrips = eligible
    .filter((template) => template.minimumSlotLevel === 0)
    .slice(0, getCantripLimit(profile.id, character.niveau));
  const leveled = eligible.filter((template) => template.minimumSlotLevel > 0);
  const knownLeveled = profile.preparationMode === "known" || profile.id === "wizard"
    ? leveled.slice(0, getKnownSpellLimit(profile.id, character.niveau))
    : leveled;
  const knownSpellIds = [...cantrips, ...knownLeveled].map((template) => template.id);
  const preparationLimit = getSpellPreparationLimit(character, profile);
  const preparedSpellIds = profile.preparationMode === "prepared"
    ? [...cantrips.map((template) => template.id), ...knownLeveled.slice(0, preparationLimit).map((template) => template.id)]
    : [...knownSpellIds];

  return {
    characterId: character.id,
    classId: profile.id,
    castingAbility: profile.castingAbility,
    progression: profile.progression,
    preparationMode: profile.preparationMode,
    slotRecovery: profile.slotRecovery,
    knownSpellIds,
    preparedSpellIds,
    slots,
    preparationRequired: false,
    updatedAt: Date.now(),
  };
}

export function createInitialSpellbooks(
  characters: Character[],
  templates: SpellTemplate[],
): CharacterSpellbook[] {
  return characters.flatMap((character) => {
    const spellbook = createInitialSpellbook(character, templates);
    return spellbook ? [spellbook] : [];
  });
}

export function synchronizeSpellbook(
  book: CharacterSpellbook,
  character: Character,
  templates: SpellTemplate[],
): CharacterSpellbook {
  const profile = getSpellcastingProfile(character.classe);
  if (!profile || profile.id !== book.classId) {
    return createInitialSpellbook(character, templates) ?? book;
  }

  const expectedSlots = createSpellSlots(profile.progression, character.niveau);
  const slots = expectedSlots.map((slot) => {
    const previous = book.slots.find((candidate) => candidate.level === slot.level);
    if (!previous) return slot;
    const spent = Math.max(0, previous.max - previous.remaining);
    return { ...slot, remaining: Math.max(0, slot.max - spent) };
  });
  const eligible = getEligibleClassSpells(profile.id, slots, templates);
  const eligibleIds = new Set(eligible.map((template) => template.id));
  const cantrips = eligible
    .filter((template) => template.minimumSlotLevel === 0)
    .slice(0, getCantripLimit(profile.id, character.niveau));
  const retained = book.knownSpellIds.filter((id) => eligibleIds.has(id));
  const desiredKnownCount = profile.preparationMode === "known" || profile.id === "wizard"
    ? getKnownSpellLimit(profile.id, character.niveau) + cantrips.length
    : eligible.length;
  const knownSpellIds = [...new Set([
    ...cantrips.map((template) => template.id),
    ...retained,
    ...eligible.map((template) => template.id),
  ])].slice(0, desiredKnownCount);
  const preparedLimit = getSpellPreparationLimit(character, profile);
  const cantripIds = new Set(cantrips.map((template) => template.id));
  const preparedLeveled = book.preparedSpellIds
    .filter((id) => knownSpellIds.includes(id) && !cantripIds.has(id))
    .slice(0, preparedLimit);

  return {
    ...book,
    castingAbility: profile.castingAbility,
    progression: profile.progression,
    preparationMode: profile.preparationMode,
    slotRecovery: profile.slotRecovery,
    knownSpellIds,
    preparedSpellIds: profile.preparationMode === "prepared"
      ? [...cantripIds, ...preparedLeveled]
      : [...knownSpellIds],
    slots,
    updatedAt: Date.now(),
  };
}

export function synchronizeSpellbooks(
  books: CharacterSpellbook[],
  characters: Character[],
  templates: SpellTemplate[],
): CharacterSpellbook[] {
  const byCharacter = new Map(books.map((book) => [book.characterId, book]));
  return characters.flatMap((character) => {
    const existing = byCharacter.get(character.id);
    const next = existing
      ? synchronizeSpellbook(existing, character, templates)
      : createInitialSpellbook(character, templates);
    return next ? [next] : [];
  });
}

export function getSpellPreparationLimit(
  character: Character,
  profile = getSpellcastingProfile(character.classe),
): number {
  if (!profile || profile.preparationMode !== "prepared") return 0;
  const modifier = Math.floor((character.stats[profile.castingAbility] - 10) / 2);
  return Math.max(1, Math.floor(character.niveau * profile.preparationLevelMultiplier) + modifier);
}

export function isSpellPrepared(book: CharacterSpellbook, spell: SpellTemplate): boolean {
  if (spell.minimumSlotLevel === 0) return book.knownSpellIds.includes(spell.id);
  if (book.preparationMode === "known") return book.knownSpellIds.includes(spell.id);
  return !book.preparationRequired && book.preparedSpellIds.includes(spell.id);
}

export function getAvailableSlotLevels(
  book: CharacterSpellbook,
  spell: SpellTemplate,
): SpellLevel[] {
  if (spell.minimumSlotLevel === 0) return [0];
  return book.slots
    .filter((slot) => slot.level >= spell.minimumSlotLevel && slot.remaining > 0)
    .map((slot) => slot.level);
}

export function checkSpellCast(input: {
  character: Character;
  book: CharacterSpellbook;
  spell: SpellTemplate;
  slotLevel: SpellLevel;
  itemInstances: ItemInstance[];
  itemTemplates: ItemTemplate[];
  combatant?: Combatant;
}): SpellCastCheck {
  const { character, book, spell, slotLevel, itemInstances, itemTemplates, combatant } = input;
  const reasons: string[] = [];

  if (book.characterId !== character.id) reasons.push("Ce grimoire n'appartient pas au personnage.");
  if (!spell.classes.includes(book.classId)) reasons.push("Ce sort ne fait pas partie de la liste de cette classe.");
  if (!book.knownSpellIds.includes(spell.id)) reasons.push("Ce sort n'est pas connu.");
  if (book.preparationRequired && book.preparationMode === "prepared") {
    reasons.push("La préparation des sorts doit être validée après le repos long.");
  } else if (!isSpellPrepared(book, spell)) {
    reasons.push("Ce sort n'est pas préparé.");
  }

  if (spell.minimumSlotLevel === 0) {
    if (slotLevel !== 0) reasons.push("Un tour mineur se lance sans emplacement.");
  } else if (slotLevel < spell.minimumSlotLevel) {
    reasons.push(`Un emplacement de niveau ${spell.minimumSlotLevel} minimum est requis.`);
  } else {
    const slot = book.slots.find((candidate) => candidate.level === slotLevel);
    if (!slot || slot.remaining <= 0) reasons.push(`Aucun emplacement de niveau ${slotLevel} disponible.`);
  }

  const conditions = new Set(combatant?.conditions ?? []);
  if (spell.components.verbal && [...conditions].some((conditionId) => verbalBlockers.has(conditionId))) {
    reasons.push("La composante verbale est impossible dans l'état actuel.");
  }
  if (spell.components.somatic && [...conditions].some((conditionId) => somaticBlockers.has(conditionId))) {
    reasons.push("La composante somatique est impossible dans l'état actuel.");
  }

  const materialCheck = checkSpellMaterials(character.id, spell, itemInstances, itemTemplates);
  reasons.push(...materialCheck.reasons);

  return {
    canCast: reasons.length === 0,
    reasons,
    consumptions: materialCheck.consumptions,
  };
}

export function checkSpellMaterials(
  characterId: string,
  spell: SpellTemplate,
  itemInstances: ItemInstance[],
  itemTemplates: ItemTemplate[],
): Pick<SpellCastCheck, "reasons" | "consumptions"> {
  const materialComponent = spell.components.material;
  if (!materialComponent) return { reasons: [], consumptions: [] };

  const templatesById = new Map(itemTemplates.map((template) => [template.id, template]));
  const ownedItems = itemInstances
    .filter((item) => item.location.parent === characterId && item.quantity > 0)
    .map((item) => ({ item, template: templatesById.get(item.templateId) }))
    .filter((entry): entry is { item: ItemInstance; template: ItemTemplate } => Boolean(entry.template));
  const hasFocus = materialComponent.focusAllowed && ownedItems.some(({ template }) =>
    template.tags.some((tag) => focusTags.has(tag)));

  if (materialComponent.requirements.length === 0) {
    return hasFocus
      ? { reasons: [], consumptions: [] }
      : { reasons: [`Composante matérielle manquante : ${materialComponent.description}.`], consumptions: [] };
  }

  const consumptions: SpellMaterialConsumption[] = [];
  const reasons: string[] = [];

  materialComponent.requirements.forEach((requirement) => {
    let missing = requirement.quantity;
    const matches = ownedItems.filter(({ template }) =>
      (requirement.itemTemplateId && template.id === requirement.itemTemplateId) ||
      (requirement.itemTag && template.tags.includes(requirement.itemTag)));
    const available = matches.reduce((total, { item }) => total + item.quantity, 0);

    if (available < requirement.quantity) {
      if (!hasFocus) reasons.push(`Composante matérielle manquante : ${requirement.name} ×${requirement.quantity}.`);
      return;
    }

    if (!requirement.consumed) return;
    matches.forEach(({ item, template }) => {
      if (missing <= 0) return;
      const quantity = Math.min(missing, item.quantity);
      consumptions.push({ itemId: item.id, quantity, label: template.name });
      missing -= quantity;
    });
  });

  return { reasons, consumptions };
}

export function consumeSpellMaterials(
  items: ItemInstance[],
  consumptions: SpellMaterialConsumption[],
): ItemInstance[] {
  const byId = new Map(consumptions.map((entry) => [entry.itemId, entry.quantity]));
  return items.flatMap((item) => {
    const quantity = byId.get(item.id) ?? 0;
    if (quantity <= 0) return [item];
    if (item.quantity <= quantity) return [];
    return [{ ...item, quantity: item.quantity - quantity }];
  });
}

export function spendSpellSlot(
  book: CharacterSpellbook,
  level: SpellLevel,
  spellId: string,
  concentration: boolean,
): CharacterSpellbook {
  const slots = level === 0
    ? book.slots
    : book.slots.map((slot) => slot.level === level
      ? { ...slot, remaining: Math.max(0, slot.remaining - 1) }
      : slot);
  return {
    ...book,
    slots,
    ...(concentration
      ? { concentration: { spellId, castAt: Date.now() } }
      : {}),
    updatedAt: Date.now(),
  };
}

export function restoreSpellSlots(
  book: CharacterSpellbook,
  rest: "shortRest" | "longRest",
): CharacterSpellbook {
  const shouldRestore = rest === "longRest" || book.slotRecovery === "shortRest";
  return {
    ...book,
    slots: shouldRestore ? book.slots.map((slot) => ({ ...slot, remaining: slot.max })) : book.slots,
    preparationRequired: rest === "longRest" && book.preparationMode === "prepared"
      ? true
      : book.preparationRequired,
    ...(rest === "longRest" ? { concentration: undefined } : {}),
    updatedAt: Date.now(),
  };
}

export function applyPreparedSpells(
  book: CharacterSpellbook,
  character: Character,
  spellIds: string[],
  templates: SpellTemplate[],
): CharacterSpellbook | null {
  if (book.preparationMode !== "prepared") return null;
  const known = new Set(book.knownSpellIds);
  const cantrips = templates
    .filter((spell) => spell.minimumSlotLevel === 0 && known.has(spell.id))
    .map((spell) => spell.id);
  const requested = [...new Set(spellIds)].filter((id) => known.has(id) && !cantrips.includes(id));
  const limit = getSpellPreparationLimit(character, getSpellcastingProfileById(book.classId));
  if (requested.length > limit) return null;

  return {
    ...book,
    preparedSpellIds: [...cantrips, ...requested],
    preparationRequired: false,
    updatedAt: Date.now(),
  };
}

export function resolveSpellEffects(
  spell: SpellTemplate,
  action: GameActionTemplate,
  slotLevel: SpellLevel,
  castingAbility?: keyof CharacterStats,
  characterLevel = 1,
): ItemEffectRef[] {
  return resolveGameActionEffects(action, {
    slotLevel,
    characterLevel,
    castingAbility,
    displayLevel: slotLevel,
    baseLevel: spell.minimumSlotLevel,
  });
}

export function formatSpellComponents(spell: SpellTemplate): string {
  const components = [
    spell.components.verbal ? "V" : "",
    spell.components.somatic ? "S" : "",
    spell.components.material ? "M" : "",
  ].filter(Boolean);
  return components.join(" · ") || "Aucune";
}

export function formatSpellLevel(level: SpellLevel): string {
  return level === 0 ? "Tour mineur" : `Niveau ${level}`;
}

function getEligibleClassSpells(
  classId: SpellcastingClassId,
  slots: SpellSlotState[],
  templates: SpellTemplate[],
): SpellTemplate[] {
  const maxLevel = slots.reduce<SpellLevel>((maximum, slot) =>
    slot.level > maximum ? slot.level : maximum, 0);
  return templates.filter((template) =>
    template.classes.includes(classId) &&
    (template.minimumSlotLevel === 0 || template.minimumSlotLevel <= maxLevel));
}

function getCantripLimit(classId: SpellcastingClassId, level: number): number {
  if (classId === "paladin" || classId === "ranger") return 0;
  if (classId === "warlock") return level >= 10 ? 4 : level >= 4 ? 3 : 2;
  return level >= 10 ? 5 : level >= 4 ? 4 : 3;
}

function getKnownSpellLimit(classId: SpellcastingClassId, level: number): number {
  if (classId === "wizard") return 6 + Math.max(0, level - 1) * 2;
  if (classId === "bard") return Math.min(22, 3 + level);
  if (classId === "sorcerer") return Math.min(15, 1 + level);
  if (classId === "warlock") return Math.min(15, 1 + level);
  if (classId === "ranger") return level < 2 ? 0 : Math.min(11, 1 + Math.ceil(level / 2));
  return 99;
}

function clampLevel(level: number): number {
  return Math.max(1, Math.min(20, Math.floor(Number.isFinite(level) ? level : 1)));
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

import type { Character, CharacterDerivedScores, DiceRoll, ItemInstance, ItemTemplate } from "../../app/types";
import type { AiDirectorCommand, ImprovisedDifficulty, ImprovisedOutcomeHints, ImprovisedResourceCost } from "./types";

export type CharacterStatKey = keyof Character["stats"];

export interface ImprovisedCheckResult {
  status: "success" | "error";
  message: string;
  command: string;
}

interface CheckDefinition {
  actorId: string;
  action: string;
  stat: CharacterStatKey;
  skill?: string;
  dc: number;
  difficulty: ImprovisedDifficulty;
  stakes?: string;
  costs: ImprovisedResourceCost[];
  outcomes?: ImprovisedOutcomeHints;
  visibility: "public" | "gmOnly" | "hidden" | "summary";
}

const difficultyClass: Record<ImprovisedDifficulty, number> = {
  routine: 5,
  plausible: 10,
  difficult: 15,
  extreme: 22,
  legendary: 28,
};

const skillStats: Record<string, CharacterStatKey> = {
  acrobaties: "dexterite",
  arcanes: "intelligence",
  athletisme: "force",
  discretion: "dexterite",
  dressage: "sagesse",
  escamotage: "dexterite",
  histoire: "intelligence",
  intimidation: "charisme",
  intuition: "sagesse",
  investigation: "intelligence",
  medecine: "sagesse",
  nature: "intelligence",
  perception: "sagesse",
  persuasion: "charisme",
  religion: "intelligence",
  representation: "charisme",
  survie: "sagesse",
  tromperie: "charisme",
};

const statLabels: Record<CharacterStatKey, string> = {
  force: "FOR",
  dexterite: "DEX",
  constitution: "CON",
  intelligence: "INT",
  sagesse: "SAG",
  charisme: "CHA",
};

/**
 * Résout tous les tests improvisés selon le même pipeline. L'IA choisit le
 * cadre du test, mais le moteur calcule le bonus, lance le dé et tranche.
 */
export function executeImprovisedCheck(
  command: Extract<AiDirectorCommand, { type: "abilityCheck" | "skillCheck" | "resolveGameAction" }>,
  context: {
    characters: Character[];
    selectedCharacterId: string;
    derivedScores: Record<string, CharacterDerivedScores>;
    itemInstances: ItemInstance[];
    itemTemplates: ItemTemplate[];
    rollFormula: (formula: string, visibility?: "public" | "gmOnly" | "hidden" | "summary", reason?: string) => DiceRoll;
    spendItemQuantity: (itemId: string, quantity: number) => boolean;
    recordCampaignEvent: (entry: string) => void;
  },
): ImprovisedCheckResult {
  const definition = createCheckDefinition(command, context.selectedCharacterId);
  const character = context.characters.find((candidate) => candidate.id === definition.actorId);

  if (!character) {
    return {
      status: "error",
      message: "Le test n'a pas été lancé : le personnage concerné est introuvable.",
      command: command.type,
    };
  }

  const derived = context.derivedScores[character.id];
  const abilityModifier = derived?.modifiers[definition.stat]
    ?? Math.floor((character.stats[definition.stat] - 10) / 2);
  const hasProficiency = definition.skill
    ? character.competences.some((skill) => normalize(skill) === normalize(definition.skill ?? ""))
    : false;
  const proficiency = hasProficiency ? derived?.proficiencyBonus ?? 0 : 0;
  const modifier = abilityModifier + proficiency;
  const formula = `1d20${modifier === 0 ? "" : modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`}`;
  const checkLabel = definition.skill
    ? `${definition.skill} (${statLabels[definition.stat]})`
    : statLabels[definition.stat];
  const costs = aggregateCosts(definition.costs);
  if (!hasAvailableCosts(costs, context.itemInstances)) {
    return {
      status: "error",
      message: "La tentative est annulée : les composantes déclarées ne sont pas disponibles en quantité suffisante.",
      command: command.type,
    };
  }
  const attemptCosts = costs.filter((cost) => cost.timing !== "success");
  if (!spendCosts(attemptCosts, context.spendItemQuantity)) {
    return {
      status: "error",
      message: "La tentative est annulée : une ressource engagée n'est plus disponible.",
      command: command.type,
    };
  }

  const roll = context.rollFormula(formula, definition.visibility, `${checkLabel} · ${definition.action}`);
  const naturalRoll = roll.rolls[0] ?? roll.result - modifier;
  let degree = getDegreeOfSuccess(naturalRoll, roll.result, definition.dc);
  let miracleText = "";

  if (definition.difficulty === "legendary" && naturalRoll === 20 && roll.result < definition.dc) {
    const confirmation = context.rollFormula("1d20", definition.visibility, `Confirmation légendaire · ${definition.action}`);
    const confirmationNatural = confirmation.rolls[0] ?? confirmation.result;
    degree = confirmationNatural === 20 ? "critical" : "partial";
    miracleText = ` · confirmation légendaire ${confirmationNatural}/20`;
  }

  const outcome = getOutcomeText(degree, definition.outcomes);
  const successCosts = degree === "critical" || degree === "success"
    ? costs.filter((cost) => cost.timing === "success")
    : [];
  if (!spendCosts(successCosts, context.spendItemQuantity)) {
    return {
      status: "error",
      message: "Le test a été lancé, mais une ressource conditionnelle n'a pas pu être consommée; la conséquence reste suspendue.",
      command: command.type,
    };
  }

  const stakes = definition.stakes ? ` Enjeu : ${definition.stakes}.` : "";
  const outcomeText = outcome ? ` Conséquence prévue : ${outcome}.` : "";
  const committedCosts = [...attemptCosts, ...successCosts];
  const costText = committedCosts.length
    ? ` Ressources consommées : ${formatCosts(committedCosts, context.itemInstances, context.itemTemplates)}.`
    : "";
  const message = `${character.name} tente « ${definition.action} ». Test de ${checkLabel} : ${formula} = ${roll.result} contre DD ${definition.dc}${miracleText} — ${formatDegree(degree)}.${outcomeText}${stakes}${costText}`;

  context.recordCampaignEvent(
    `${character.name} — ${definition.action} : ${formatDegree(degree)} (${roll.result} contre DD ${definition.dc}).${outcome ? ` ${outcome}` : ""}`,
  );

  return { status: "success", message, command: command.type };
}

export function resolveDifficultyClass(difficulty?: ImprovisedDifficulty, explicitDc?: number): number {
  if (typeof explicitDc === "number" && Number.isFinite(explicitDc)) {
    return Math.max(5, Math.min(35, Math.round(explicitDc)));
  }

  return difficultyClass[difficulty ?? "difficult"];
}

export function resolveCharacterStat(stat?: string, skill?: string, action = ""): CharacterStatKey {
  const normalizedStat = normalize(stat ?? "");
  const aliases: Record<string, CharacterStatKey> = {
    for: "force",
    force: "force",
    dex: "dexterite",
    dexterite: "dexterite",
    con: "constitution",
    constitution: "constitution",
    int: "intelligence",
    intelligence: "intelligence",
    sag: "sagesse",
    sagesse: "sagesse",
    cha: "charisme",
    charisme: "charisme",
  };

  if (aliases[normalizedStat]) return aliases[normalizedStat];

  const skillStat = skillStats[normalize(skill ?? "")];
  if (skillStat) return skillStat;

  const normalizedAction = normalize(action);
  if (/rituel|magie|rune|analyse|etud|connai|souvenir/u.test(normalizedAction)) return "intelligence";
  if (/vole|derob|discret|faufil|esquive|agile/u.test(normalizedAction)) return "dexterite";
  if (/convain|persuad|ment|intimid|sedui|negoci/u.test(normalizedAction)) return "charisme";
  if (/resist|endur|souffle|poison|fatigue/u.test(normalizedAction)) return "constitution";
  if (/observe|ecoute|pressent|piste|survie|soigne/u.test(normalizedAction)) return "sagesse";
  if (/force|brise|soulev|frappe|grimpe|nage/u.test(normalizedAction)) return "force";
  return "sagesse";
}

function createCheckDefinition(
  command: Extract<AiDirectorCommand, { type: "abilityCheck" | "skillCheck" | "resolveGameAction" }>,
  selectedCharacterId: string,
): CheckDefinition {
  if (command.type === "abilityCheck") {
    return {
      actorId: resolveActorId(command.characterId, selectedCharacterId),
      action: command.reason ?? `Test de ${command.skill ?? command.stat}`,
      stat: resolveCharacterStat(command.stat, command.skill, command.reason),
      skill: command.skill,
      dc: resolveDifficultyClass(undefined, command.dc),
      difficulty: "difficult",
      costs: [],
      visibility: command.visibility ?? "public",
    };
  }

  if (command.type === "skillCheck") {
    return {
      actorId: resolveActorId(command.characterId, selectedCharacterId),
      action: command.reason ?? `Test de ${command.skill}`,
      stat: resolveCharacterStat(command.stat, command.skill, command.reason),
      skill: command.skill,
      dc: resolveDifficultyClass(undefined, command.dc),
      difficulty: "difficult",
      costs: [],
      visibility: command.visibility ?? "public",
    };
  }

  return {
    actorId: resolveActorId(command.actorId, selectedCharacterId),
    action: command.action,
    stat: resolveCharacterStat(command.stat, command.skill, `${command.action} ${command.method ?? ""}`),
    skill: command.skill,
    dc: resolveDifficultyClass(command.difficulty, command.dc),
    difficulty: command.difficulty ?? "difficult",
    stakes: command.stakes,
    costs: command.costs ?? [],
    outcomes: command.outcomes,
    visibility: command.visibility ?? "public",
  };
}

function aggregateCosts(costs: ImprovisedResourceCost[]): ImprovisedResourceCost[] {
  const totals = new Map<string, ImprovisedResourceCost>();
  costs.forEach((cost) => {
    const timing = cost.timing ?? "attempt";
    const key = `${cost.itemId}:${timing}`;
    const current = totals.get(key);
    totals.set(key, {
      itemId: cost.itemId,
      timing,
      quantity: (current?.quantity ?? 0) + Math.max(1, Math.round(cost.quantity)),
    });
  });
  return [...totals.values()];
}

function spendCosts(
  costs: ImprovisedResourceCost[],
  spendItemQuantity: (itemId: string, quantity: number) => boolean,
): boolean {
  return costs.every((cost) => spendItemQuantity(cost.itemId, cost.quantity));
}

function hasAvailableCosts(costs: ImprovisedResourceCost[], instances: ItemInstance[]): boolean {
  const requiredByItem = new Map<string, number>();
  costs.forEach((cost) => requiredByItem.set(cost.itemId, (requiredByItem.get(cost.itemId) ?? 0) + cost.quantity));
  return [...requiredByItem].every(([itemId, quantity]) =>
    (instances.find((instance) => instance.id === itemId)?.quantity ?? 0) >= quantity);
}

function formatCosts(costs: ImprovisedResourceCost[], instances: ItemInstance[], templates: ItemTemplate[]): string {
  return costs.map((cost) => {
    const instance = instances.find((candidate) => candidate.id === cost.itemId);
    const template = instance ? templates.find((candidate) => candidate.id === instance.templateId) : undefined;
    const name = String(instance?.overrides.name ?? template?.name ?? cost.itemId);
    return `${name} x${cost.quantity}`;
  }).join(", ");
}

function getDegreeOfSuccess(naturalRoll: number, total: number, dc: number): keyof ImprovisedOutcomeHints {
  if (naturalRoll === 20) return "critical";
  if (naturalRoll === 1) return "failure";
  if (total >= dc) return "success";
  if (total >= dc - 3) return "partial";
  return "failure";
}

function getOutcomeText(degree: keyof ImprovisedOutcomeHints, outcomes?: ImprovisedOutcomeHints): string | undefined {
  if (!outcomes) return undefined;
  if (degree === "critical") return outcomes.critical ?? outcomes.success;
  return outcomes[degree];
}

function formatDegree(degree: keyof ImprovisedOutcomeHints): string {
  if (degree === "critical") return "réussite critique";
  if (degree === "success") return "réussite";
  if (degree === "partial") return "réussite partielle";
  return "échec avec conséquence";
}

function resolveActorId(actorId: string | undefined, selectedCharacterId: string): string {
  return !actorId || actorId === "selected" ? selectedCharacterId : actorId;
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .trim();
}

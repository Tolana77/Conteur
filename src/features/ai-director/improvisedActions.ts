import type {
  Character,
  CharacterDerivedScores,
  DiceRoll,
  ItemInstance,
  ItemTemplate,
  PlayerCheckDegree,
  PlayerCheckNarrationContext,
  PlayerCheckRequest,
  PlayerCheckRequestInput,
  PlayerCheckResolution,
  PlayerCheckResourceCost,
} from "../../app/types";
import type {
  AiDirectorCommand,
  ImprovisedDifficulty,
  ImprovisedOutcomeHints,
} from "./types";

export type CharacterStatKey = keyof Character["stats"];
type CheckCommand = Extract<AiDirectorCommand, { type: "abilityCheck" | "skillCheck" | "resolveGameAction" }>;

export type ImprovisedCheckPreparation =
  | { status: "ready"; request: PlayerCheckRequestInput; message: string }
  | { status: "noRoll"; message: string }
  | { status: "error"; message: string };

export type PlayerCheckExecutionResult =
  | { status: "success"; message: string; resolution: PlayerCheckResolution }
  | { status: "error"; message: string };

interface CheckDefinition {
  actorId: string;
  action: string;
  method?: string;
  desiredOutcome?: string;
  stat: CharacterStatKey;
  skill?: string;
  dc: number;
  difficulty: ImprovisedDifficulty;
  stakes?: string;
  costs: PlayerCheckResourceCost[];
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

const canonicalSkills = {
  acrobaties: { label: "Acrobaties", stat: "dexterite" },
  arcanes: { label: "Arcanes", stat: "intelligence" },
  athletisme: { label: "Athlétisme", stat: "force" },
  discretion: { label: "Discrétion", stat: "dexterite" },
  dressage: { label: "Dressage", stat: "sagesse" },
  escamotage: { label: "Escamotage", stat: "dexterite" },
  histoire: { label: "Histoire", stat: "intelligence" },
  intimidation: { label: "Intimidation", stat: "charisme" },
  intuition: { label: "Intuition", stat: "sagesse" },
  investigation: { label: "Investigation", stat: "intelligence" },
  medecine: { label: "Médecine", stat: "sagesse" },
  nature: { label: "Nature", stat: "intelligence" },
  perception: { label: "Perception", stat: "sagesse" },
  persuasion: { label: "Persuasion", stat: "charisme" },
  religion: { label: "Religion", stat: "intelligence" },
  representation: { label: "Représentation", stat: "charisme" },
  survie: { label: "Survie", stat: "sagesse" },
  tromperie: { label: "Tromperie", stat: "charisme" },
} as const satisfies Record<string, { label: string; stat: CharacterStatKey }>;

const statLabels: Record<CharacterStatKey, string> = {
  force: "FOR",
  dexterite: "DEX",
  constitution: "CON",
  intelligence: "INT",
  sagesse: "SAG",
  charisme: "CHA",
};

/** Prépare un test, mais ne lance jamais le dé. */
export function prepareImprovisedCheck(
  command: CheckCommand,
  context: {
    characters: Character[];
    selectedCharacterId: string;
    derivedScores: Record<string, CharacterDerivedScores>;
  },
): ImprovisedCheckPreparation {
  if (shouldResolveWithoutRoll(command)) {
    return {
      status: "noRoll",
      message: "Aucun jet requis : l'action est ordinaire et ne présente pas encore d'incertitude aux conséquences intéressantes.",
    };
  }

  const definition = createCheckDefinition(command, context.selectedCharacterId);
  const character = context.characters.find((candidate) => candidate.id === definition.actorId);
  if (!character) return { status: "error", message: "Le personnage concerné est introuvable." };
  if (command.skill && !definition.skill) {
    return {
      status: "error",
      message: `Le test n'est pas proposé : « ${command.skill} » n'est pas une compétence reconnue. La méthode doit être précisée.`,
    };
  }

  const modifierPreview = getCheckModifier(character, definition, context.derivedScores);
  const label = getPlayerCheckLabel(definition.skill, definition.stat);
  return {
    status: "ready",
    request: {
      characterId: character.id,
      action: definition.action,
      method: definition.method,
      desiredOutcome: definition.desiredOutcome,
      stat: definition.stat,
      skill: definition.skill,
      modifierPreview,
      dc: definition.dc,
      difficulty: definition.difficulty,
      stakes: definition.stakes,
      costs: aggregateCosts(definition.costs),
      outcomes: definition.outcomes,
      // Un test demandé au joueur est toujours visible. Les jets secrets du MJ
      // devront passer plus tard par un pipeline distinct, sans bouton joueur.
      visibility: "public",
    },
    message: `Jet demandé au joueur : ${label}. Aucun dé n'a encore été lancé.`,
  };
}

/** Résout uniquement une requête explicitement déclenchée par le joueur. */
export function resolvePlayerCheckRequest(
  request: PlayerCheckRequest,
  context: {
    characters: Character[];
    derivedScores: Record<string, CharacterDerivedScores>;
    itemInstances: ItemInstance[];
    itemTemplates: ItemTemplate[];
    rollFormula: (formula: string, visibility?: "public" | "gmOnly" | "hidden" | "summary", reason?: string) => DiceRoll;
    spendItemQuantity: (itemId: string, quantity: number) => boolean;
    recordCampaignEvent: (entry: string) => void;
    now?: () => number;
  },
): PlayerCheckExecutionResult {
  if (request.status !== "pending") return { status: "error", message: "Ce jet a déjà été traité." };
  const character = context.characters.find((candidate) => candidate.id === request.characterId);
  if (!character) return { status: "error", message: "Le personnage concerné est introuvable." };

  const costs = aggregateCosts(request.costs);
  if (!hasAvailableCosts(costs, context.itemInstances)) {
    return { status: "error", message: "Les ressources nécessaires ne sont plus disponibles." };
  }
  const attemptCosts = costs.filter((cost) => cost.timing !== "success");
  if (!spendCosts(attemptCosts, context.spendItemQuantity)) {
    return { status: "error", message: "Une ressource engagée n'a pas pu être consommée." };
  }

  const definition: CheckDefinition = {
    actorId: request.characterId,
    action: request.action,
    method: request.method,
    desiredOutcome: request.desiredOutcome,
    stat: request.stat,
    skill: request.skill,
    dc: request.dc,
    difficulty: request.difficulty,
    stakes: request.stakes,
    costs,
    outcomes: request.outcomes,
    visibility: request.visibility,
  };
  const modifier = getCheckModifier(character, definition, context.derivedScores);
  const formula = formatCheckFormula(modifier);
  const checkLabel = getPlayerCheckLabel(request.skill, request.stat);
  const roll = context.rollFormula(formula, request.visibility, `${checkLabel} · ${request.action}`);
  const naturalRoll = roll.rolls[0] ?? roll.result - modifier;
  let degree = getDegreeOfSuccess(naturalRoll, roll.result, request.dc);
  let miracleText = "";
  const rollIds = [roll.id];

  if (request.difficulty === "legendary" && naturalRoll === 20 && roll.result < request.dc) {
    const confirmation = context.rollFormula("1d20", request.visibility, `Confirmation légendaire · ${request.action}`);
    rollIds.push(confirmation.id);
    const confirmationNatural = confirmation.rolls[0] ?? confirmation.result;
    degree = confirmationNatural === 20 ? "critical" : "partial";
    miracleText = ` · confirmation légendaire ${confirmationNatural}/20`;
  }

  const outcome = getOutcomeText(degree, request.outcomes);
  const successCosts = degree === "critical" || degree === "success"
    ? costs.filter((cost) => cost.timing === "success")
    : [];
  if (!spendCosts(successCosts, context.spendItemQuantity)) {
    return { status: "error", message: "Une ressource conditionnelle n'a pas pu être consommée." };
  }

  const stakes = request.stakes ? ` Enjeu : ${request.stakes}.` : "";
  const outcomeText = outcome ? ` Conséquence prévue : ${outcome}.` : "";
  const committedCosts = [...attemptCosts, ...successCosts];
  const costText = committedCosts.length
    ? ` Ressources consommées : ${formatCosts(committedCosts, context.itemInstances, context.itemTemplates)}.`
    : "";
  const message = `${character.name} tente « ${request.action} ». Test de ${checkLabel} : ${formula} = ${roll.result}${miracleText} : ${formatDegree(degree)}.${outcomeText}${stakes}${costText}`;

  context.recordCampaignEvent(
    `${character.name} : ${request.action}, ${formatDegree(degree)} (résultat ${roll.result}).${outcome ? ` ${outcome}` : ""}`,
  );

  return {
    status: "success",
    message,
    resolution: {
      rollIds,
      formula,
      naturalRoll,
      result: roll.result,
      degree,
      message,
      resolvedAt: context.now?.() ?? Date.now(),
    },
  };
}

/** Expose au Narrateur uniquement les éléments diégétiques d'un test. Le DD
 * reste une donnée privée du moteur et ne traverse jamais ce contrat. */
export function createPlayerCheckNarrationContext(
  request: PlayerCheckRequest,
): PlayerCheckNarrationContext | null {
  const common = {
    requestId: request.id,
    action: request.action,
    ...(request.method ? { method: request.method } : {}),
    checkLabel: getPlayerCheckLabel(request.skill, request.stat),
  };

  if (request.status === "pending") {
    return {
      ...common,
      stage: "pending",
      challengeCue: getNarrativeChallengeCue(request.difficulty),
    };
  }

  if (request.status !== "resolved" || !request.resolution) return null;
  const outcome = getOutcomeText(request.resolution.degree, request.outcomes);
  return {
    ...common,
    stage: "resolved",
    formula: request.resolution.formula,
    result: request.resolution.result,
    degree: request.resolution.degree,
    ...(outcome ? { outcome } : {}),
    ...(request.stakes ? { stakes: request.stakes } : {}),
  };
}

function getNarrativeChallengeCue(difficulty: ImprovisedDifficulty): string {
  if (difficulty === "plausible") return "l'issue paraît incertaine";
  if (difficulty === "difficult") return "cela semble difficile";
  if (difficulty === "extreme") return "la tentative paraît particulièrement périlleuse";
  if (difficulty === "legendary") return "la réussite semble presque impossible";
  return "le geste demande de l'attention";
}

export function resolveDifficultyClass(difficulty?: ImprovisedDifficulty, explicitDc?: number): number {
  if (typeof explicitDc === "number" && Number.isFinite(explicitDc)) {
    return Math.max(5, Math.min(35, Math.round(explicitDc)));
  }
  return difficultyClass[difficulty ?? "difficult"];
}

export function resolveCharacterStat(stat?: string, skill?: string, action = ""): CharacterStatKey {
  const canonicalSkill = canonicalizeSkill(skill);
  if (canonicalSkill) return getSkillStat(canonicalSkill);

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

  const inferredSkill = inferSkill(action);
  if (inferredSkill) return getSkillStat(inferredSkill);
  const normalizedAction = normalize(action);
  if (/resist|endur|souffle|poison|fatigue/u.test(normalizedAction)) return "constitution";
  return "sagesse";
}

export function resolveCheckSkill(skill?: string, action = "", method = ""): string | undefined {
  const methodSkill = inferSkill(method);
  if (methodSkill) return methodSkill;
  const actionSkill = inferSkill(action);
  if (actionSkill) return actionSkill;

  const canonical = canonicalizeSkill(skill);
  const genericSearch = /\b(cherch|trouv|localis|rep[eè]r)\w*\b/u.test(normalize(action));
  if (genericSearch && canonical && !["Investigation", "Perception", "Persuasion", "Survie"].includes(canonical)) {
    return undefined;
  }
  return canonical;
}

export function getPlayerCheckLabel(skill: string | undefined, stat: CharacterStatKey): string {
  return skill ? `${skill} (${statLabels[stat]})` : statLabels[stat];
}

export function formatCheckFormula(modifier: number): string {
  return `1d20${modifier === 0 ? "" : modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`}`;
}

function createCheckDefinition(command: CheckCommand, selectedCharacterId: string): CheckDefinition {
  const action = command.type === "resolveGameAction"
    ? command.action
    : command.reason ?? `Test de ${command.type === "skillCheck" ? command.skill : command.skill ?? command.stat}`;
  const method = command.type === "resolveGameAction" ? command.method : undefined;
  const explicitSkill = command.skill;
  // Une caractéristique explicitement fournie sans compétence demande un test
  // brut : le moteur n'ajoute alors jamais le bonus de maîtrise.
  const requestsRawAbility = !explicitSkill && (
    command.type === "abilityCheck" ||
    (command.type === "resolveGameAction" && Boolean(command.stat?.trim()))
  );
  const skill = requestsRawAbility
    ? undefined
    : resolveCheckSkill(explicitSkill, action, method);
  const stat = skill
    ? getSkillStat(skill)
    : resolveCharacterStat(command.stat, undefined, `${action} ${method ?? ""}`);

  if (command.type === "abilityCheck") {
    return {
      actorId: resolveActorId(command.characterId, selectedCharacterId),
      action,
      stat,
      skill,
      dc: resolveDifficultyClass(undefined, command.dc),
      difficulty: "difficult",
      costs: [],
      visibility: command.visibility ?? "public",
    };
  }
  if (command.type === "skillCheck") {
    return {
      actorId: resolveActorId(command.characterId, selectedCharacterId),
      action,
      stat,
      skill,
      dc: resolveDifficultyClass(undefined, command.dc),
      difficulty: "difficult",
      costs: [],
      visibility: command.visibility ?? "public",
    };
  }
  return {
    actorId: resolveActorId(command.actorId, selectedCharacterId),
    action,
    method,
    desiredOutcome: command.desiredOutcome,
    stat,
    skill,
    dc: resolveDifficultyClass(command.difficulty, command.dc),
    difficulty: command.difficulty ?? "difficult",
    stakes: command.stakes,
    costs: command.costs ?? [],
    outcomes: command.outcomes,
    visibility: command.visibility ?? "public",
  };
}

function shouldResolveWithoutRoll(command: CheckCommand): boolean {
  const action = normalize(command.type === "resolveGameAction" ? command.action : command.reason ?? "");
  const method = normalize(command.type === "resolveGameAction" ? command.method ?? "" : "");
  const stakes = normalize(command.type === "resolveGameAction" ? command.stakes ?? "" : "");
  const hasRisk = Boolean(stakes) || /danger|urgence|poursuiv|cache|secret|interdit|piege|hostile|menace/u.test(`${action} ${method}`);
  if (command.type === "resolveGameAction" && (command.difficulty === "routine" || (command.dc ?? 10) <= 5)) return true;
  if (hasRisk) return false;
  if (/\b(taverne|auberge|march[eé]|boutique|fontaine|place|temple)\b/u.test(action) && /cherch|trouv|demand|rep[eè]r/u.test(`${action} ${method}`)) return true;
  if (/\b(regarde|observe)\b.{0,20}\b(autour|alentours|piece|salle|rue)\b/u.test(action)) return true;
  if (/\b(demande|questionne|interroge)\b.{0,35}\b(chemin|direction|ou se trouve|taverne|auberge)\b/u.test(`${action} ${method}`)) return true;
  return false;
}

function inferSkill(value: string): string | undefined {
  const text = normalize(value);
  if (!text) return undefined;
  if (/grimp|nage|saut|soulev|enfonc|lutte|bras de fer/u.test(text)) return "Athlétisme";
  if (/equilibr|roulade|acrob|retombe|contors/u.test(text)) return "Acrobaties";
  if (/pickpocket|poche|subtilis|derob|vole discr[eè]tement|escamot/u.test(text)) return "Escamotage";
  if (/faufil|cache|sans etre vu|silenc|discret/u.test(text)) return "Discrétion";
  if (/inspect|fouille|analyse|dedui|mecanisme|archives|plan|indices?/u.test(text)) return "Investigation";
  if (/observe|scrute|ecoute|regarde|enseignes?|se promene|arpente|parcourt les rues/u.test(text)) return "Perception";
  if (/piste|traces?|orientation|foret|nature sauvage|campement/u.test(text)) return "Survie";
  if (/demande|interroge|questionne|renseignement|convain|negoci/u.test(text)) return "Persuasion";
  if (/mens|bluff|tromp|dissimule la verite/u.test(text)) return "Tromperie";
  if (/menace|intimid/u.test(text)) return "Intimidation";
  if (/intention|mensonge|attitude|motivation|pressent/u.test(text)) return "Intuition";
  if (/rituel|rune|sort|magie|arcane/u.test(text)) return "Arcanes";
  if (/culte|dieu|divin|religio/u.test(text)) return "Religion";
  if (/chronique|ancien|histor|royaume/u.test(text)) return "Histoire";
  if (/animal|monture|dress/u.test(text)) return "Dressage";
  if (/soigne|blessure|diagnostic|medec/u.test(text)) return "Médecine";
  if (/plante|faune|nature/u.test(text)) return "Nature";
  if (/chante|danse|joue de|spectacle|represent/u.test(text)) return "Représentation";
  return undefined;
}

function canonicalizeSkill(skill?: string): string | undefined {
  const entry = canonicalSkills[normalize(skill ?? "") as keyof typeof canonicalSkills];
  return entry?.label;
}

function getSkillStat(skill: string): CharacterStatKey {
  return canonicalSkills[normalize(skill) as keyof typeof canonicalSkills]?.stat ?? "sagesse";
}

function getCheckModifier(
  character: Character,
  definition: Pick<CheckDefinition, "stat" | "skill">,
  derivedScores: Record<string, CharacterDerivedScores>,
): number {
  const derived = derivedScores[character.id];
  const abilityModifier = derived?.modifiers[definition.stat]
    ?? Math.floor((character.stats[definition.stat] - 10) / 2);
  const hasProficiency = definition.skill
    ? character.competences.some((skill) => normalize(skill) === normalize(definition.skill ?? ""))
    : false;
  return abilityModifier + (hasProficiency ? derived?.proficiencyBonus ?? 0 : 0);
}

function aggregateCosts(costs: PlayerCheckResourceCost[]): PlayerCheckResourceCost[] {
  const totals = new Map<string, PlayerCheckResourceCost>();
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
  costs: PlayerCheckResourceCost[],
  spendItemQuantity: (itemId: string, quantity: number) => boolean,
): boolean {
  return costs.every((cost) => spendItemQuantity(cost.itemId, cost.quantity));
}

function hasAvailableCosts(costs: PlayerCheckResourceCost[], instances: ItemInstance[]): boolean {
  const requiredByItem = new Map<string, number>();
  costs.forEach((cost) => requiredByItem.set(cost.itemId, (requiredByItem.get(cost.itemId) ?? 0) + cost.quantity));
  return [...requiredByItem].every(([itemId, quantity]) =>
    (instances.find((instance) => instance.id === itemId)?.quantity ?? 0) >= quantity);
}

function formatCosts(costs: PlayerCheckResourceCost[], instances: ItemInstance[], templates: ItemTemplate[]): string {
  return costs.map((cost) => {
    const instance = instances.find((candidate) => candidate.id === cost.itemId);
    const template = instance ? templates.find((candidate) => candidate.id === instance.templateId) : undefined;
    const name = String(instance?.overrides.name ?? template?.name ?? cost.itemId);
    return `${name} x${cost.quantity}`;
  }).join(", ");
}

function getDegreeOfSuccess(naturalRoll: number, total: number, dc: number): PlayerCheckDegree {
  if (naturalRoll === 20) return "critical";
  if (naturalRoll === 1) return "failure";
  if (total >= dc) return "success";
  if (total >= dc - 3) return "partial";
  return "failure";
}

function getOutcomeText(degree: PlayerCheckDegree, outcomes?: ImprovisedOutcomeHints): string | undefined {
  if (!outcomes) return undefined;
  if (degree === "critical") return outcomes.critical ?? outcomes.success;
  return outcomes[degree];
}

function formatDegree(degree: PlayerCheckDegree): string {
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
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[’']/gu, " ")
    .trim();
}

import type { GameState } from "../../store/useGameStore";
import type { AiAgentId } from "./types";

export type AutomaticDomainAgent = Extract<
  AiAgentId,
  "characterManager" | "actionManager" | "combatManager" | "worldManager"
>;

export interface AutomaticRoute {
  agents: AutomaticDomainAgent[];
  needsClassifier: boolean;
  needsSafetyReview: boolean;
  reason: string;
}

const DOMAIN_PRIORITY: AutomaticDomainAgent[] = [
  "combatManager",
  "characterManager",
  "actionManager",
  "worldManager",
];

/** Routeur local : aucun token n'est dépensé pour choisir les agents. */
export function routePlayerInput(playerInput: string, state: GameState): AutomaticRoute {
  const text = normalize(playerInput);
  const scores = new Map<AutomaticDomainAgent, number>();
  const add = (agent: AutomaticDomainAgent, score: number) => scores.set(agent, (scores.get(agent) ?? 0) + score);
  const combatIntent = matches(text, /\b(attaque|attaquer|frappe|tirer|tire|combat|ennemi|cible|portee|deplace|deplacement|desengage|reaction|initiative)\b/u);
  const characterIntent = matches(text, /\b(inventaire|sac|objet|potion|fiole|parchemin|equipe|desequipe|consomme|bois|utilise|lance|sort|capacite|charge|stat|pv|soigne|soin)\b/u);
  const actionIntent = matches(text, /\b(jet|d20|d4|d6|d8|d10|d12|test|sauvegarde|difficulte|forcer|escalader|convaincre|discretion|perception|athletisme)\b/u);
  const worldIntent = matches(text, /\b(regarde|observe|fouille|cherche|inspecte|examine|ecoute|explore|entre|ouvre|ramasse|prends|parle|discute|demande|interroge|approche|suis|lieu|pnj|rumeur|qui est|qu est ce|ou est|pourquoi)\b/u);
  const explicitWorldSubject = matches(text, /\b(lieu|pnj|rumeur|ville|village|foret|route|piece|salle|personne|homme|femme|creature|qui est|ou est)\b/u);
  const latestPlayerMessage = getLatestPlayerMessage(state);
  const structuredActions = latestPlayerMessage?.actions ?? [];
  const executedKinds = new Set(latestPlayerMessage?.actionReceipt?.actions.map((action) => action.kind) ?? []);
  const hasExecutedCombatAction = executedKinds.has("attack");
  const hasExecutedCharacterAction = executedKinds.has("useItem") || executedKinds.has("useAbility");

  if (!hasExecutedCombatAction && structuredActions.some((action) => action.kind === "attack")) add("combatManager", 12);
  if (!hasExecutedCharacterAction && structuredActions.some((action) => action.kind === "useItem" || action.kind === "useAbility")) add("characterManager", 12);
  if (!hasExecutedCombatAction && state.combat.status === "active" && structuredActions.some((action) => action.target?.position)) add("combatManager", 9);

  if (combatIntent && !hasExecutedCombatAction) {
    add("combatManager", 8);
  }
  if (
    state.combat.status === "active" &&
    !hasExecutedCombatAction &&
    !hasExecutedCharacterAction &&
    matches(text, /\b(action|bouge|avance|recule|vise|arme|sort|capacite)\b/u)
  ) {
    add("combatManager", 6);
  }

  if (characterIntent && !hasExecutedCharacterAction) {
    add("characterManager", 7);
  }

  // Les jets explicitement tactiques restent dans Combat.
  if (actionIntent && !combatIntent) {
    add("actionManager", 7);
  }

  // "Ouvre mon sac" ou "regarde mon inventaire" ne concerne pas le monde.
  if (worldIntent && (!characterIntent || explicitWorldSubject)) {
    add("worldManager", 6);
  }

  // Une action d'objet pendant le combat peut réellement croiser deux domaines.
  if (state.combat.status === "active" && scores.has("characterManager") && scores.has("combatManager")) {
    scores.set("characterManager", (scores.get("characterManager") ?? 0) + 2);
  }

  const agents = DOMAIN_PRIORITY
    .filter((agent) => scores.has(agent))
    .sort((left, right) => (scores.get(right) ?? 0) - (scores.get(left) ?? 0))
    .slice(0, 2);

  const needsSafetyReview = matches(text, /\b(suicide|me tuer|mutil|torture|violer|ignore les instructions|ignore instructions|prompt systeme)\b/u);
  const isSmallTalk = /^(bonjour|bonsoir|salut|coucou|merci|au revoir|bonne nuit|ca va)[!.?\s]*$/u.test(text.trim());
  const needsClassifier = agents.length === 0 && !needsSafetyReview && !isSmallTalk && text.trim().length > 3;

  return {
    agents,
    needsClassifier,
    needsSafetyReview,
    reason: agents.length ? `Domaines détectés: ${agents.join(", ")}` : "Réponse narrative directe",
  };
}

function getLatestPlayerMessage(state: GameState) {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (message?.sender === "player") return message;
  }
  return undefined;
}

function matches(text: string, expression: RegExp): boolean {
  return expression.test(text);
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ");
}

import type { NarrativeMomentum } from "../../app/types";
import type { GameState } from "../../store/useGameStore";

/**
 * Mesure localement l'éloignement de l'intrigue. Cette gravité ne bloque
 * jamais une action : elle suggère seulement au Narrateur une reconnexion
 * de plus en plus visible avec une accroche existante.
 */
export function advanceNarrativeMomentum(playerInput: string, state: GameState): NarrativeMomentum {
  const hooks = state.campaign.world.hooks ?? [];
  const current = state.narrativeMomentum;
  if (!hooks.length || !looksLikeAction(playerInput)) return current;

  const activeHook = hooks.find((hook) => hook.id === current.activeHookId)
    ?? [...hooks].sort((left, right) => scoreHook(right, playerInput, state) - scoreHook(left, playerInput, state))[0];
  if (!activeHook) return current;

  const connected = scoreHook(activeHook, playerInput, state) > 0;
  const offTrackActions = connected ? 0 : Math.min(6, current.offTrackActions + 1);

  return {
    activeHookId: activeHook.id,
    offTrackActions,
    guidance: offTrackActions >= 4
      ? "consequence"
      : offTrackActions === 3
        ? "clear"
        : offTrackActions === 2
          ? "subtle"
          : "none",
    updatedAt: Date.now(),
  };
}

function scoreHook(hook: NonNullable<GameState["campaign"]["world"]["hooks"]>[number], input: string, state: GameState): number {
  const relatedNames = [
    ...state.campaign.world.entities.npcs,
    ...state.campaign.world.entities.locations,
    ...state.campaign.world.entities.items,
  ]
    .filter((entity) => hook.relatedIds.includes(entity.id))
    .map((entity) => entity.name);
  const corpus = tokenize(`${hook.title} ${hook.premise} ${hook.urgency} ${relatedNames.join(" ")}`);
  const inputWords = tokenize(input);
  return [...inputWords].reduce((total, word) => total + (corpus.has(word) ? 1 : 0), 0);
}

function looksLikeAction(value: string): boolean {
  const normalized = normalize(value);
  return /^(?:je|j|nous|on)\s/u.test(normalized) ||
    /\b(tente|essaie|veux|voudrais|fais|regarde|cherche|parle|attaque|utilise|prends|vais)\b/u.test(normalized);
}

function tokenize(value: string): Set<string> {
  return new Set(normalize(value).split(/\W+/u).filter((word) => word.length >= 4));
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ");
}

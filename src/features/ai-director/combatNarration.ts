import type { CombatNarrationCue } from "../../app/types";
import { useGameStore } from "../../store/useGameStore";
import { runAgentOverHttp } from "./httpAiGateway";
import { parseAiDirectorResponse } from "./responseParser";
import {
  buildCombatNarrationPrompt,
  isNarratedCombatText,
} from "./combatNarrationPolicy";

export interface CombatNarrationResult {
  delivered: boolean;
  reason: "delivered" | "stale" | "invalid";
}

/**
 * Les conséquences sont déjà appliquées par le moteur. Le Narrateur ne reçoit
 * qu'une poignée de faits immuables et ne peut exécuter aucune commande.
 */
export async function runCombatNarrationBatch(
  cues: CombatNarrationCue[],
  shouldCommit: () => boolean = () => true,
): Promise<CombatNarrationResult> {
  if (cues.length === 0) return { delivered: false, reason: "invalid" };

  const initialState = useGameStore.getState();
  const cueIds = cues.map((cue) => cue.id);
  const initialMessageId = initialState.messages.at(-1)?.id ?? null;

  if (!shouldCommit() || !containsAllCues(initialState.combatNarrationQueue, cueIds)) {
    return { delivered: false, reason: "stale" };
  }

  const raw = await runAgentOverHttp(
    "narrationManager",
    buildCombatNarrationPrompt(cues, initialState.messages),
  );
  const parsed = parseAiDirectorResponse(raw);
  const response = parsed.response;
  const narration = response?.narration.trim() ?? "";

  if (
    !response ||
    response.commands.length > 0 ||
    response.agentRequests.length > 0 ||
    !isNarratedCombatText(narration, cues)
  ) {
    return { delivered: false, reason: "invalid" };
  }

  const currentState = useGameStore.getState();
  if (
    !shouldCommit() ||
    currentState.messages.at(-1)?.id !== initialMessageId ||
    !containsAllCues(currentState.combatNarrationQueue, cueIds)
  ) {
    return { delivered: false, reason: "stale" };
  }

  currentState.addGmMessage(narration);
  useGameStore.getState().recordNarratedBeat(narration);
  useGameStore.getState().consumeCombatNarrationCues(cueIds);
  return { delivered: true, reason: "delivered" };
}

function containsAllCues(queue: CombatNarrationCue[], cueIds: string[]): boolean {
  const queuedIds = new Set(queue.map((cue) => cue.id));
  return cueIds.every((id) => queuedIds.has(id));
}

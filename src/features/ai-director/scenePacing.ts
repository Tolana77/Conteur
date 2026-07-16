import { useGameStore } from "../../store/useGameStore";
import { runAgentOverHttp } from "./httpAiGateway";
import { parseAiDirectorResponse } from "./responseParser";
import {
  buildScenePacingPrompt,
  isGroundedScenePacingNarration,
  isSameScenePacingOpportunity,
  sanitizeScenePacingPatch,
  type ScenePacingOpportunity,
} from "./scenePacingPolicy";

export interface ScenePacingInterventionResult {
  delivered: boolean;
  reason: "delivered" | "stale" | "invalid";
}

/**
 * Une relance proactive n'exécute aucune commande de jeu. Le Narrateur reçoit
 * seulement la scène et doit fournir un patch minimal, ensuite borné localement.
 */
export async function runScenePacingIntervention(
  opportunity: ScenePacingOpportunity,
  shouldCommit: () => boolean = () => true,
): Promise<ScenePacingInterventionResult> {
  const initialState = useGameStore.getState();
  const initialMessageId = initialState.messages.at(-1)?.id ?? null;

  if (!shouldCommit() || !isSameScenePacingOpportunity(opportunity, initialState)) {
    return { delivered: false, reason: "stale" };
  }

  const raw = await runAgentOverHttp(
    "narrationManager",
    buildScenePacingPrompt(initialState, opportunity),
  );
  const parsed = parseAiDirectorResponse(raw);
  const response = parsed.response;

  if (
    !response ||
    response.commands.length > 0 ||
    response.agentRequests.length > 0 ||
    !isGroundedScenePacingNarration(response.narration, opportunity)
  ) {
    return { delivered: false, reason: "invalid" };
  }

  const sanitizedPatch = response.draftPatch?.scenePatches
    ?.map((patch) => sanitizeScenePacingPatch(initialState, opportunity, patch))
    .find((patch) => patch !== null) ?? null;
  if (!sanitizedPatch) return { delivered: false, reason: "invalid" };

  const currentState = useGameStore.getState();
  if (
    !shouldCommit() ||
    currentState.messages.at(-1)?.id !== initialMessageId ||
    !isSameScenePacingOpportunity(opportunity, currentState)
  ) {
    return { delivered: false, reason: "stale" };
  }

  currentState.applyNarrativeScenePatch(sanitizedPatch);
  useGameStore.getState().addGmMessage(response.narration.trim());
  useGameStore.getState().recordNarratedBeat(response.narration, opportunity.key);

  return { delivered: true, reason: "delivered" };
}

export type { ScenePacingOpportunity } from "./scenePacingPolicy";
export {
  SCENE_PACING_DELAYS_MS,
  selectScenePacingOpportunity,
} from "./scenePacingPolicy";

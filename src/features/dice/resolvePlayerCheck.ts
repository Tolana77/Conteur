import { useGameStore } from "../../store/useGameStore";
import { continueAfterPlayerCheck } from "../ai-director/automatedDirector";
import { resolvePlayerCheckRequest } from "../ai-director/improvisedActions";

export async function resolveAndNarratePlayerCheck(requestId: string): Promise<boolean> {
  const state = useGameStore.getState();
  const request = state.playerCheckRequests.find(
    (candidate) => candidate.id === requestId && candidate.status === "pending",
  );
  if (!request) throw new Error("Le jet demandé n'est plus disponible.");

  const result = resolvePlayerCheckRequest(request, {
    characters: state.characters,
    derivedScores: state.characterDerivedScores,
    itemInstances: state.itemInstances,
    itemTemplates: state.itemTemplates,
    rollFormula: state.rollFormula,
    spendItemQuantity: state.spendItemQuantity,
    recordCampaignEvent: state.recordCampaignEvent,
  });

  if (result.status !== "success") {
    useGameStore.getState().failPlayerCheck(request.id, result.message);
    throw new Error(result.message);
  }

  const completed = useGameStore.getState().completePlayerCheck(request.id, result.resolution);
  if (completed) await continueAfterPlayerCheck(request.id);
  return completed;
}

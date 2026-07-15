import { useState } from "react";
import type { PlayerCheckRequest } from "../../app/types";
import { useGameStore } from "../../store/useGameStore";
import { HighlightedGameText } from "../../ui/gameTerms";
import {
  formatCheckFormula,
  getPlayerCheckLabel,
  resolvePlayerCheckRequest,
} from "../ai-director/improvisedActions";

export function PlayerCheckCard({ request }: { request: PlayerCheckRequest }) {
  const [isResolving, setIsResolving] = useState(false);
  const formula = formatCheckFormula(request.modifierPreview);
  const label = getPlayerCheckLabel(request.skill, request.stat);

  const handleRoll = () => {
    if (isResolving || request.status !== "pending") return;
    setIsResolving(true);

    const state = useGameStore.getState();
    const liveRequest = state.playerCheckRequests.find((candidate) => candidate.id === request.id);
    if (!liveRequest || liveRequest.status !== "pending") {
      setIsResolving(false);
      return;
    }

    const result = resolvePlayerCheckRequest(liveRequest, {
      characters: state.characters,
      derivedScores: state.characterDerivedScores,
      itemInstances: state.itemInstances,
      itemTemplates: state.itemTemplates,
      rollFormula: state.rollFormula,
      spendItemQuantity: state.spendItemQuantity,
      recordCampaignEvent: state.recordCampaignEvent,
    });

    if (result.status === "success") {
      const completed = useGameStore.getState().completePlayerCheck(request.id, result.resolution);
      if (completed) useGameStore.getState().addGmMessage(result.message);
    } else {
      useGameStore.getState().failPlayerCheck(request.id, result.message);
    }
    setIsResolving(false);
  };

  return (
    <article className="flex justify-start">
      <section className="w-full max-w-[560px] border border-[#9C7A2E]/55 bg-[#221E29] px-4 py-3 text-[#E4D8BE]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="rune-label text-[0.68rem] text-[#9C7A2E]">Jet demandé</p>
            <h3 className="ink-heading mt-0.5 text-base font-semibold">
              <HighlightedGameText text={request.action} />
            </h3>
          </div>
          <span className="border border-[#9C7A2E]/45 bg-[#15121A] px-2 py-1 text-xs text-[#D6C9AE]">
            DD {request.dc}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <strong className="font-semibold text-[#E4D8BE]">
            <HighlightedGameText text={label} />
          </strong>
          <span className="font-mono text-[#D6C9AE]">{formula}</span>
        </div>
        {request.method ? <p className="mt-1 text-xs text-[#BFB39E]">Méthode : {request.method}</p> : null}
        {request.stakes ? <p className="mt-1 text-xs text-[#BFB39E]">Enjeu : {request.stakes}</p> : null}

        {request.status === "pending" ? (
          <div className="mt-3">
            <button
              className="w-full border border-[#9C7A2E] bg-[#5A2233] px-3 py-2 text-sm font-semibold text-[#E4D8BE] transition-colors hover:bg-[#6B2B3E] disabled:cursor-wait disabled:opacity-60"
              disabled={isResolving}
              onClick={handleRoll}
              type="button"
            >
              {isResolving ? "Lancer en cours…" : "Lancer le d20"}
            </button>
            {request.error ? <p className="mt-2 text-xs text-[#D78A82]">{request.error}</p> : null}
          </div>
        ) : request.resolution ? (
          <p className="mt-3 border-t border-[#9C7A2E]/25 pt-2 text-sm text-[#BFB39E]">
            Résultat enregistré : <strong className="text-[#E4D8BE]">{request.resolution.result}</strong>
          </p>
        ) : null}
      </section>
    </article>
  );
}

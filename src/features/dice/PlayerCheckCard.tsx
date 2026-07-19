import { useState } from "react";
import type { PlayerCheckRequest } from "../../app/types";
import { useGameStore } from "../../store/useGameStore";
import { HighlightedGameText } from "../../ui/gameTerms";
import {
  formatCheckFormula,
  getPlayerCheckLabel,
} from "../ai-director/improvisedActions";
import { useMultiplayerStore } from "../multiplayer/useMultiplayerStore";
import { resolveAndNarratePlayerCheck } from "./resolvePlayerCheck";

export function PlayerCheckCard({
  request,
  onBusyChange,
}: {
  request: PlayerCheckRequest;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [isResolving, setIsResolving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const formula = formatCheckFormula(request.modifierPreview);
  const label = getPlayerCheckLabel(request.skill, request.stat);
  const multiplayerRoom = useMultiplayerStore((state) => state.room);
  const multiplayerSelf = useMultiplayerStore((state) => state.self);
  const pendingMultiplayerTurn = useMultiplayerStore((state) => state.pendingTurn);
  const submitPlayerCheck = useMultiplayerStore((state) => state.submitPlayerCheck);
  const isRemotePlayer = Boolean(multiplayerRoom && multiplayerSelf?.role === "player");

  const handleRoll = async () => {
    if (isResolving || request.status !== "pending") return;
    setIsResolving(true);
    setLocalError(null);
    onBusyChange?.(true);

    try {
      if (isRemotePlayer) await submitPlayerCheck(request.id);
      else await resolveAndNarratePlayerCheck(request.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "erreur inconnue";
      if (isRemotePlayer) setLocalError(reason);
      else {
        useGameStore.getState().addGmMessage(
          `Le résultat du jet est enregistré, mais le Conteur ne parvient pas encore à en poursuivre le récit : ${reason}`,
          { kind: "checkResult", relatedCheckId: request.id },
        );
      }
    } finally {
      setIsResolving(false);
      onBusyChange?.(false);
    }
  };

  return (
    <article className="flex justify-start">
      <section className="w-full max-w-[560px] border border-[#9C7A2E]/55 bg-[#221E29] px-4 py-3 text-[#E4D8BE]">
        <div className="min-w-0">
          <p className="rune-label text-[0.68rem] text-[#9C7A2E]">Jet demandé</p>
          <h3 className="ink-heading mt-0.5 text-base font-semibold">
            <HighlightedGameText mode="narrative" text={request.action} />
          </h3>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <strong className="font-semibold text-[#E4D8BE]">
            <HighlightedGameText mode="mechanical" text={label} />
          </strong>
          <span className="font-mono text-[#D6C9AE]">{formula}</span>
        </div>
        {request.method ? <p className="mt-1 text-xs text-[#BFB39E]">Méthode : {request.method}</p> : null}
        {request.stakes ? <p className="mt-1 text-xs text-[#BFB39E]">Enjeu : {request.stakes}</p> : null}

        {request.status === "pending" ? (
          <div className="mt-3">
            <button
              className="w-full border border-[#9C7A2E] bg-[#5A2233] px-3 py-2 text-sm font-semibold text-[#E4D8BE] transition-colors hover:bg-[#6B2B3E] disabled:cursor-wait disabled:opacity-60"
              disabled={isResolving || Boolean(pendingMultiplayerTurn)}
              onClick={handleRoll}
              type="button"
            >
              {pendingMultiplayerTurn
                ? "En attente du MJ"
                : isResolving
                  ? "Lancer en cours…"
                  : "Lancer le d20"}
            </button>
            {request.error || localError ? (
              <p className="mt-2 text-xs text-[#D78A82]">{request.error ?? localError}</p>
            ) : null}
          </div>
        ) : isResolving ? (
          <p className="mt-3 border-t border-[#9C7A2E]/25 pt-2 text-sm text-[#D6C9AE]">
            Le Conteur interprète le résultat…
          </p>
        ) : request.resolution ? (
          <p className="mt-3 border-t border-[#9C7A2E]/25 pt-2 text-sm text-[#BFB39E]">
            Résultat enregistré : <strong className="text-[#E4D8BE]">{request.resolution.result}</strong>
          </p>
        ) : null}
      </section>
    </article>
  );
}

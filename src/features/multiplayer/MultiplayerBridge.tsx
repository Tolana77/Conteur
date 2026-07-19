import { useEffect, useRef } from "react";
import { runAutomatedDirector } from "../ai-director/automatedDirector";
import { useGameStore } from "../../store/useGameStore";
import { useMultiplayerStore } from "./useMultiplayerStore";
import { resolveAndNarratePlayerCheck } from "../dice/resolvePlayerCheck";

const STATE_PUBLISH_DELAY_MS = 450;

/** Relie le store local au transport réseau. Le MJ demeure l'unique autorité :
 * les clients distants ne font que soumettre une intention. */
export function MultiplayerBridge() {
  const initialize = useMultiplayerStore((state) => state.initialize);
  const room = useMultiplayerStore((state) => state.room);
  const self = useMultiplayerStore((state) => state.self);
  const incomingTurn = useMultiplayerStore((state) => state.incomingTurns[0] ?? null);
  const beginTurn = useMultiplayerStore((state) => state.beginTurn);
  const finishTurn = useMultiplayerStore((state) => state.finishTurn);
  const publishStateNow = useMultiplayerStore((state) => state.publishStateNow);
  const processingTurnIdRef = useRef<string | null>(null);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!room || self?.role !== "host") return undefined;
    let timer: number | null = null;
    const unsubscribe = useGameStore.subscribe(() => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void publishStateNow();
      }, STATE_PUBLISH_DELAY_MS);
    });
    void publishStateNow();

    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [publishStateNow, room, self?.role]);

  useEffect(() => {
    if (!incomingTurn || self?.role !== "host" || processingTurnIdRef.current) return;
    processingTurnIdRef.current = incomingTurn.id;

    void (async () => {
      const accepted = await beginTurn(incomingTurn.id);
      if (!accepted) {
        processingTurnIdRef.current = null;
        return;
      }

      const gameState = useGameStore.getState();
      const characterExists = gameState.characters.some(
        (character) => character.id === incomingTurn.characterId,
      );
      if (!characterExists) {
        await finishTurn(incomingTurn.id, "Le personnage attribué n'existe plus dans cette campagne.");
        processingTurnIdRef.current = null;
        return;
      }

      const previousCharacterId = gameState.selectedCharacterId;
      try {
        useGameStore.setState({
          selectedCharacterId: incomingTurn.characterId,
          pendingActionIntents: incomingTurn.actions,
        });
        if (incomingTurn.kind === "playerCheck") {
          if (!incomingTurn.checkRequestId) throw new Error("Référence de jet absente.");
          await resolveAndNarratePlayerCheck(incomingTurn.checkRequestId);
        } else {
          useGameStore.getState().sendPlayerMessage(incomingTurn.content, {
            authorId: incomingTurn.userId,
            authorName: incomingTurn.displayName,
            characterId: incomingTurn.characterId,
          });
          await runAutomatedDirector(
            incomingTurn.content || "Le joueur confirme les actions préparées dans son intention.",
          );
        }
        await publishStateNow();
        await finishTurn(incomingTurn.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur inconnue pendant le tour.";
        await publishStateNow();
        await finishTurn(incomingTurn.id, message);
      } finally {
        if (useGameStore.getState().characters.some((character) => character.id === previousCharacterId)) {
          useGameStore.setState({ selectedCharacterId: previousCharacterId });
        }
        processingTurnIdRef.current = null;
      }
    })();
  }, [beginTurn, finishTurn, incomingTurn, publishStateNow, self?.role]);

  return null;
}

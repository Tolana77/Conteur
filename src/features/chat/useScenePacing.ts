import { useCallback, useEffect, useRef } from "react";
import { useGameStore } from "../../store/useGameStore";
import {
  runScenePacingIntervention,
  selectScenePacingOpportunity,
} from "../ai-director/scenePacing";

export function useScenePacing(enabled: boolean): { markPlayerActivity: () => void } {
  const enabledRef = useRef(enabled);
  const mountedRef = useRef(true);
  const timeoutRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const activityRevisionRef = useRef(0);
  const attemptedKeyRef = useRef("");
  const sceneRevision = useGameStore((state) => state.narrativeScene.revision);
  const latestMessageId = useGameStore((state) => state.messages.at(-1)?.id ?? "");
  const combatStatus = useGameStore((state) => state.combat.status);
  const pendingDecisionId = useGameStore((state) => state.pendingGameDecision?.id ?? "");
  const pendingIntentCount = useGameStore((state) => state.pendingActionIntents.length);
  const pendingCheckCount = useGameStore((state) =>
    state.playerCheckRequests.filter((request) => request.status === "pending").length);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const schedule = useCallback(() => {
    clearTimer();
    if (
      !mountedRef.current ||
      !enabledRef.current ||
      document.visibilityState !== "visible" ||
      inFlightRef.current
    ) {
      return;
    }

    const opportunity = selectScenePacingOpportunity(useGameStore.getState());
    if (!opportunity || attemptedKeyRef.current === opportunity.key) return;

    timeoutRef.current = window.setTimeout(async () => {
      timeoutRef.current = null;
      const current = selectScenePacingOpportunity(useGameStore.getState());
      if (
        !current ||
        current.key !== opportunity.key ||
        !mountedRef.current ||
        !enabledRef.current ||
        document.visibilityState !== "visible" ||
        inFlightRef.current
      ) {
        schedule();
        return;
      }

      const activityRevision = activityRevisionRef.current;
      attemptedKeyRef.current = current.key;
      inFlightRef.current = true;

      try {
        await runScenePacingIntervention(current, () =>
          mountedRef.current &&
          enabledRef.current &&
          document.visibilityState === "visible" &&
          activityRevisionRef.current === activityRevision);
      } catch {
        // Une relance est facultative : une indisponibilité réseau reste silencieuse.
      } finally {
        inFlightRef.current = false;
        schedule();
      }
    }, opportunity.delayMs);
  }, [clearTimer]);

  const markPlayerActivity = useCallback(() => {
    activityRevisionRef.current += 1;
    attemptedKeyRef.current = "";
    schedule();
  }, [schedule]);

  useEffect(() => {
    enabledRef.current = enabled;
    activityRevisionRef.current += 1;
    schedule();
  }, [enabled, schedule]);

  useEffect(() => {
    schedule();
  }, [
    combatStatus,
    latestMessageId,
    pendingCheckCount,
    pendingDecisionId,
    pendingIntentCount,
    sceneRevision,
    schedule,
  ]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      activityRevisionRef.current += 1;
      if (document.visibilityState === "visible") attemptedKeyRef.current = "";
      schedule();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [schedule]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      enabledRef.current = false;
      activityRevisionRef.current += 1;
      clearTimer();
    };
  }, [clearTimer]);

  return { markPlayerActivity };
}

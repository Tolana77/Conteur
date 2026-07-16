import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../../store/useGameStore";
import { runCombatNarrationBatch } from "../ai-director/combatNarration";

const COMBAT_NARRATION_DEBOUNCE_MS = 500;

export function useCombatNarration(enabled: boolean): void {
  const queue = useGameStore((state) => state.combatNarrationQueue);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const attemptedKeyRef = useRef("");
  const activityRevisionRef = useRef(0);
  const [scheduleRevision, setScheduleRevision] = useState(0);
  const queueKey = queue.map((cue) => cue.id).join("|");

  useEffect(() => {
    activityRevisionRef.current += 1;
    if (enabled) attemptedKeyRef.current = "";
  }, [enabled]);

  useEffect(() => {
    if (
      !enabled ||
      !queueKey ||
      inFlightRef.current ||
      attemptedKeyRef.current === queueKey ||
      document.visibilityState !== "visible"
    ) {
      return;
    }

    const cues = queue;
    const activityRevision = activityRevisionRef.current;
    const timeout = window.setTimeout(async () => {
      if (!mountedRef.current || !enabled || document.visibilityState !== "visible") return;
      attemptedKeyRef.current = queueKey;
      inFlightRef.current = true;

      try {
        await runCombatNarrationBatch(cues, () =>
          mountedRef.current &&
          enabled &&
          document.visibilityState === "visible" &&
          activityRevisionRef.current === activityRevision);
      } catch {
        // Le journal tactique conserve les faits; une panne IA ne doit jamais
        // faire réapparaître une ligne de console dans la conversation.
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setScheduleRevision((revision) => revision + 1);
      }
    }, COMBAT_NARRATION_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [enabled, queue, queueKey, scheduleRevision]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      activityRevisionRef.current += 1;
      if (document.visibilityState === "visible") {
        attemptedKeyRef.current = "";
        setScheduleRevision((revision) => revision + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activityRevisionRef.current += 1;
    };
  }, []);
}

import type {
  CombatLogEntry,
  CombatNarrationCue,
  CombatScene,
  Message,
} from "../../app/types";

const MAX_COMBAT_NARRATION_CUES = 12;

/** Le journal technique reste dans Combat; seuls ces faits alimentent la narration du chat. */
export function collectNewNarratableCombatEntries(
  before: CombatScene,
  after: CombatScene,
): CombatNarrationCue["entries"] {
  const previousIds = new Set(before.log.map((entry) => entry.id));

  return after.log
    .filter((entry) => !previousIds.has(entry.id) && entry.type !== "system" && entry.type !== "turn")
    .reverse()
    .map(({ type, text }) => ({ type, text }));
}

export function createCombatNarrationCue(
  kind: CombatNarrationCue["kind"],
  round: number,
  entries: CombatNarrationCue["entries"],
): CombatNarrationCue {
  return {
    id: `combat-narration-${crypto.randomUUID()}`,
    kind,
    round,
    entries,
    createdAt: Date.now(),
  };
}

export function appendCombatNarrationCue(
  queue: CombatNarrationCue[],
  cue: CombatNarrationCue,
): CombatNarrationCue[] {
  if (cue.entries.length === 0) return queue;
  return [...queue, cue].slice(-MAX_COMBAT_NARRATION_CUES);
}

export function normalizeCombatNarrationQueue(value: unknown): CombatNarrationCue[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate): CombatNarrationCue[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const cue = candidate as Partial<CombatNarrationCue>;
    if (
      typeof cue.id !== "string" ||
      !["transition", "movement", "action", "enemyTurn"].includes(String(cue.kind)) ||
      !Number.isFinite(cue.round) ||
      !Number.isFinite(cue.createdAt) ||
      !Array.isArray(cue.entries)
    ) {
      return [];
    }

    const entries = cue.entries.flatMap((entry): CombatNarrationCue["entries"] => {
      if (!entry || typeof entry !== "object") return [];
      const value = entry as Partial<Pick<CombatLogEntry, "type" | "text">>;
      if (
        typeof value.text !== "string" ||
        !["system", "turn", "move", "action", "damage", "heal", "condition"].includes(String(value.type))
      ) {
        return [];
      }
      return [{ type: value.type as CombatLogEntry["type"], text: value.text.slice(0, 500) }];
    });

    if (entries.length === 0) return [];
    return [{
      id: cue.id,
      kind: cue.kind as CombatNarrationCue["kind"],
      round: Math.max(1, Math.floor(Number(cue.round))),
      entries,
      createdAt: Number(cue.createdAt),
    }];
  }).slice(-MAX_COMBAT_NARRATION_CUES);
}

export function isLegacyTechnicalCombatMessage(message: Message): boolean {
  if (message.sender !== "gm") return false;
  return /^message-gm-(?:combat|turn|reaction)-/u.test(message.id) ||
    /^Résumé combat\s*:/iu.test(message.content.trim());
}

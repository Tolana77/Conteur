import type { CombatNarrationCue, Message } from "../../app/types";
import { isLegacyTechnicalCombatMessage } from "../combat/combatNarration";

const MAX_CONTEXT_LENGTH = 240;
const MAX_EVENT_LENGTH = 280;

export function buildCombatNarrationPrompt(
  cues: CombatNarrationCue[],
  messages: Message[],
): string {
  const previousNarration = [...messages]
    .reverse()
    .find((message) => message.sender === "gm" && !isLegacyTechnicalCombatMessage(message))
    ?.content.trim()
    .slice(0, MAX_CONTEXT_LENGTH);
  const events = cues.flatMap((cue) =>
    cue.entries.map((entry) => `[${entry.type}] ${entry.text.slice(0, MAX_EVENT_LENGTH)}`),
  );
  const asksForReaction = events.some((event) => /peut utiliser .+ en réaction/iu.test(event));

  return [
    "Rôle: Conteur d'un jeu de rôle. Transforme les faits moteur ci-dessous en narration de combat française.",
    "Les faits sont déjà résolus: respecte strictement succès, échecs, blessures, états et ordre; n'ajoute aucune action ni aucun jet.",
    "Écris un court passage immersif de 1 à 3 phrases. Montre les conséquences au lieu de réciter les chiffres.",
    "Interdit: langage de console, résumé technique, coordonnées, mètres consommés, PV, DEF, round, tour de jeu ou liste à puces.",
    asksForReaction
      ? "Une réaction est disponible: termine par une question naturelle demandant au joueur s'il utilise la capacité nommée."
      : "Ne pose pas de question sauf si les faits moteur signalent une réaction disponible.",
    previousNarration ? `Dernière narration (continuité seulement): ${previousNarration}` : "",
    "Faits moteur:",
    ...events,
    'Réponds uniquement par {"narration":"...","commands":[],"agentRequests":[]}.',
  ].filter(Boolean).join("\n");
}

export function isNarratedCombatText(
  narration: string,
  cues: CombatNarrationCue[],
): boolean {
  const text = narration.trim();
  if (text.length < 20 || text.length > 1_200) return false;
  if (/^(?:Résumé combat|Tour de)\s*:/iu.test(text)) return false;
  if (/\b(?:console|combat-log|journal de combat|round|mètres? consommés?|points? de vie|\bDEF\b)\b/iu.test(text)) {
    return false;
  }

  const rawEvents = cues.flatMap((cue) => cue.entries.map((entry) => entry.text.trim()));
  if (rawEvents.some((event) => event === text)) return false;

  const reactionExpected = rawEvents.some((event) => /peut utiliser .+ en réaction/iu.test(event));
  if (reactionExpected && !/[?？]\s*$/u.test(text)) return false;

  return true;
}

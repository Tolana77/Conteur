import type { Character, CommunicationPayload, Message } from "../../app/types";
import {
  cloneDefaultPerception,
  createCommunicationPayload,
  normalizeCharacterPerception,
  resolveCommunicationForObserver,
} from "../../core/game-engine/perception";

/** Extrait le contenu explicitement placé entre guillemets. Le canal oral ou
 * écrit est porté séparément afin de ne jamais confondre les deux maîtrises. */
export function extractQuotedCommunication(content: string): string {
  const utterances: string[] = [];
  const quotePattern = /«\s*([^»\n]{1,600}?)\s*»|“\s*([^”\n]{1,600}?)\s*”|"\s*([^"\n]{1,600}?)\s*"/gu;
  for (const match of content.matchAll(quotePattern)) {
    const utterance = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (utterance) utterances.push(utterance);
  }
  return utterances.join(" ").slice(0, 1200);
}

/** Alias conservé pour les anciens appels et les sauvegardes déjà persistées. */
export const extractSpokenDialogue = extractQuotedCommunication;

export function projectMessagesForRecipient(
  messages: Message[],
  recipientUserId: string,
  canSeePrivateIntentions: boolean,
  characters: Character[] = [],
  recipientCharacterId: string | null = null,
  recipientPerceptionOverride?: Character["perception"],
): Message[] {
  const recipient = characters.find((character) => character.id === recipientCharacterId);
  const observerPerception = normalizeCharacterPerception(
    recipientPerceptionOverride ?? recipient?.perception,
  );

  return messages.flatMap((message) => {
    if (message.sender === "gm" || canSeePrivateIntentions || message.authorId === recipientUserId) {
      return [message];
    }

    const communication = resolveMessageCommunication(message, characters);
    if (!communication) return [];
    const resolved = resolveCommunicationForObserver(
      communication,
      observerPerception,
      `${message.id}:${recipientUserId}`,
    );
    if (!resolved.content) return [];
    const safeCommunication: CommunicationPayload = {
      ...communication,
      content: resolved.content,
      languageId: resolved.perception.languageId,
      languageName: resolved.perception.languageName ?? "Langue inconnue",
      producerMastery: resolved.perception.mastery,
    };

    return [{
      ...message,
      content: resolved.content,
      spokenContent: communication.channel === "oral" ? resolved.content : undefined,
      communication: safeCommunication,
      communicationPerception: resolved.perception,
      actions: undefined,
      actionReceipt: undefined,
    }];
  });
}

function resolveMessageCommunication(
  message: Message,
  characters: Character[],
): CommunicationPayload | null {
  if (message.communication) return message.communication;
  const spokenContent = message.spokenContent ?? extractSpokenDialogue(message.content);
  if (!spokenContent) return null;
  const producer = characters.find((character) => character.id === message.characterId);
  return createCommunicationPayload(
    spokenContent,
    "oral",
    "commun",
    producer ? normalizeCharacterPerception(producer.perception) : cloneDefaultPerception(),
  );
}

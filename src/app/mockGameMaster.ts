import type { Campaign, Character, Message } from "./types";

const fallbackAnswers = [
  "Le vent tourne et quelque chose semble bouger hors de vue.",
  "Tu sens que ce choix peut changer l'equilibre de la scene.",
  "Un detail inattendu attire ton attention.",
  "La situation reste ouverte, mais le monde reagit deja.",
];

export function createMockGmResponse(
  playerMessage: Message,
  campaign: Campaign,
  character?: Character,
): string {
  const actor = character ? character.name : "Le groupe";
  const context = campaign.world.facts[0] ?? campaign.world.lore;
  const fallbackIndex = playerMessage.content.length % fallbackAnswers.length;

  return `${actor}, le MJ observe: "${playerMessage.content}". ${fallbackAnswers[fallbackIndex]} Contexte actif: ${context}`;
}

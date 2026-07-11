import type { Character } from "../../core/models";

export const exampleCharacter: Character = {
  id: "character-nainsupportable",
  name: "Nainsupportable",
  espece: "Nain",
  classe: "Voleur",
  niveau: 1,
  stats: {
    force: 10,
    dexterite: 15,
    constitution: 12,
    intelligence: 11,
    sagesse: 14,
    charisme: 9,
  },
  pv: 10,
  maxPv: 10,
  inventaire: [
    {
      id: "inventory-arc-court",
      name: "Arc court",
      description: "Un arc fiable en bois d'if.",
      quantity: 1,
    },
    {
      id: "inventory-rations",
      name: "Rations",
      description: "Vivres pour une journee de marche.",
      quantity: 3,
    },
  ],
  competences: ["Sprint", "Attaque Sournoise"],
};

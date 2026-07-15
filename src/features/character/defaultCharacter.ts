import type { Character } from "../../core/models";

export const defaultCharacter: Character = {
  id: "character-player",
  name: "Aventurier",
  espece: "À définir",
  classe: "Sans classe",
  niveau: 1,
  stats: {
    force: 10,
    dexterite: 10,
    constitution: 10,
    intelligence: 10,
    sagesse: 10,
    charisme: 10,
  },
  pv: 10,
  maxPv: 10,
  inventaire: [],
  competences: [],
};

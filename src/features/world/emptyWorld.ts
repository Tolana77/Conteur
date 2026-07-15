import type { World } from "../../core/models";

export const emptyWorld: World = {
  name: "Monde à créer",
  pitch: "Créez une campagne depuis l’Atelier des mondes.",
  lore: "",
  facts: [],
  entities: {
    npcs: [],
    locations: [],
    items: [],
  },
  factions: [],
  conflicts: [],
  secrets: [],
  hooks: [],
  timeline: [],
  openingScene: "Décrivez le monde que vous souhaitez explorer.",
};

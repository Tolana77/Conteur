import type { World } from "../../core/models";

export const exampleWorld: World = {
  lore:
    "Les Marches d'Argelune sont une frontière ancienne où les routes marchandes croisent des ruines éveillées.",
  facts: [
    "La brume se lève chaque soir depuis les marais du nord.",
    "Les serments prononcés dans les ruines ont parfois des conséquences réelles.",
    "La ville de Clairval protège la dernière route sûre vers les collines.",
  ],
  entities: {
    npcs: [
      {
        id: "npc-sera-velan",
        name: "Sera Velan",
        type: "npc",
        description: "Cartographe prudente qui connaît les anciennes bornes elfiques.",
      },
    ],
    locations: [
      {
        id: "location-clairval",
        name: "Clairval",
        type: "location",
        description: "Bourg fortifié bâti autour d'un pont de pierre blanche.",
      },
    ],
    items: [
      {
        id: "item-lanterne-bleue",
        name: "Lanterne bleue",
        type: "item",
        description: "Une lanterne froide qui révèle les inscriptions invisibles.",
      },
    ],
  },
};

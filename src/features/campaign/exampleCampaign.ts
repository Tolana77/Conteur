import type { Campaign } from "../../core/models";
import { exampleCharacter } from "../character/exampleCharacter";
import { exampleWorld } from "../world/exampleWorld";

export const exampleCampaign: Campaign = {
  id: "campaign-marches-argelune",
  name: "Les Marches d'Argelune",
  style: "Fantasy aventureuse, exploration et mystere",
  level: 1,
  world: exampleWorld,
  characters: [exampleCharacter],
  history: ["La campagne commence aux portes de Clairval."],
  createdAt: 1_735_689_600_000,
};

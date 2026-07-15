import type { Campaign } from "../../core/models";
import { defaultCharacter } from "../character/defaultCharacter";
import { emptyWorld } from "../world/emptyWorld";

export const defaultCampaign: Campaign = {
  id: "campaign-empty",
  name: "Nouvelle campagne",
  style: "À définir",
  level: 1,
  world: emptyWorld,
  characters: [defaultCharacter],
  history: [],
  createdAt: 0,
};

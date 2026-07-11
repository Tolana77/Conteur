import type { Character } from "./character";
import type { World } from "./world";

export interface Campaign {
  id: string;
  name: string;
  style: string;
  level: number;
  world: World;
  characters: Character[];
  history: string[];
  createdAt: number;
}

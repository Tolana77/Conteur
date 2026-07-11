import type { Entity } from "./entity";

export interface WorldEntities {
  npcs: Entity[];
  locations: Entity[];
  items: Entity[];
}

export interface World {
  lore: string;
  facts: string[];
  entities: WorldEntities;
}

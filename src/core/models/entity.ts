export type EntityType = "npc" | "location" | "item";

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  description: string;
}

export type EntityType = "npc" | "location" | "item";

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  description: string;
  details?: {
    role?: string;
    desire?: string;
    fear?: string;
    secret?: string;
    importance?: string;
    connections?: string[];
    tags?: string[];
  };
}

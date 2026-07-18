export type EntityType = "npc" | "location" | "item";
export type EntityDataValue = string | number | boolean | null | EntityDataValue[] | { [key: string]: EntityDataValue };

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
    aliases?: string[];
    ownerId?: string;
    socialRank?: "outsider" | "commoner" | "notable" | "noble" | "highNoble" | "sovereign";
    access?: "open" | "guarded" | "restricted";
    disposition?: string;
    protocol?: string;
    attentionRule?: string;
    delegatesTo?: string[];
    knownFacts?: string[];
    enemyTemplateId?: string;
    /** Données narratives libres conservées lors de l'import d'un monde. Le
     * moteur ne leur attribue aucune sémantique implicite. */
    data?: Record<string, EntityDataValue>;
  };
}

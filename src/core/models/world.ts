import type { Entity } from "./entity";

export interface WorldEntities {
  npcs: Entity[];
  locations: Entity[];
  items: Entity[];
}

export interface WorldFaction {
  id: string;
  name: string;
  goal: string;
  method: string;
  resource: string;
  relationship: string;
}

export interface WorldConflict {
  id: string;
  title: string;
  description: string;
  stakes: string;
  participants: string[];
  escalation: string[];
}

export interface WorldSecret {
  id: string;
  truth: string;
  clues: string[];
  relatedIds: string[];
}

export interface WorldHook {
  id: string;
  title: string;
  premise: string;
  urgency: string;
  relatedIds: string[];
}

export interface WorldTimelineEvent {
  id: string;
  event: string;
  trigger: string;
}

export interface WorldCharacterCreationGuidance {
  playerRole: string;
  partyConcept: string;
  startingEquipment: string;
  /** Résumé public figé au chargement, sans secrets réservés au Conteur. */
  publicContext?: string[];
}

export interface World {
  name?: string;
  pitch?: string;
  tone?: string;
  themes?: string[];
  rules?: string[];
  lore: string;
  facts: string[];
  entities: WorldEntities;
  factions?: WorldFaction[];
  conflicts?: WorldConflict[];
  secrets?: WorldSecret[];
  hooks?: WorldHook[];
  timeline?: WorldTimelineEvent[];
  openingScene?: string;
  characterCreation?: WorldCharacterCreationGuidance;
}

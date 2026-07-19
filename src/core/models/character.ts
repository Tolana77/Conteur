import type { InventoryItem } from "./inventory";
import type { CharacterPerception } from "./perception";

export interface CharacterStats {
  force: number;
  dexterite: number;
  constitution: number;
  intelligence: number;
  sagesse: number;
  charisme: number;
}

export interface Character {
  id: string;
  campaignId: string;
  name: string;
  title?: string;
  description?: string;
  origin?: string;
  espece: string;
  classe: string;
  niveau: number;
  stats: CharacterStats;
  pv: number;
  maxPv: number;
  inventaire: InventoryItem[];
  competences: string[];
  perception: CharacterPerception;
  history?: string[];
}

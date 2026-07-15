import type { InventoryItem } from "./inventory";

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
  name: string;
  espece: string;
  classe: string;
  niveau: number;
  stats: CharacterStats;
  pv: number;
  maxPv: number;
  inventaire: InventoryItem[];
  competences: string[];
  history?: string[];
}

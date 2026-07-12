import type { CombatPosition } from "../../app/types";

export type AiAgentId =
  | "requestAnalyzer"
  | "characterManager"
  | "actionManager"
  | "combatManager"
  | "combatSetupManager"
  | "tacticalTemplateManager"
  | "assetTemplateManager"
  | "worldManager"
  | "narrationManager"
  | "rulesValidator";

export interface AiAgentDefinition {
  id: AiAgentId;
  name: string;
  role: string;
  whenToUse: string[];
  forbiddenTasks: string[];
}

export interface AiAgentRequest {
  agent: AiAgentId;
  reason: string;
  input?: unknown;
}

export type AiDirectorCommand =
  | { type: "sendNarration"; content: string }
  | { type: "adminCommand"; command: string; reason?: string }
  | { type: "dealDamage"; characterId: string; amount: number; damageType?: string }
  | { type: "heal"; characterId: string; amount: number }
  | { type: "useItem"; characterId: string; itemId: string; targetId?: string }
  | { type: "giveItem"; characterId: string; templateId: string; quantity?: number }
  | { type: "createItem"; templateId?: string; template?: Record<string, unknown>; instance?: Record<string, unknown>; reason?: string }
  | { type: "destroyItem"; itemId: string; reason?: string }
  | { type: "modifyItem"; itemId: string; path: string; value: string | number | boolean; reason?: string }
  | { type: "changeCharacterStat"; characterId: string; stat: string; value: number; mode: "add" | "set"; reason?: string }
  | { type: "updateCharacterHistory"; characterId: string; entry: string; visibility?: AiResolutionVisibility }
  | { type: "abilityCheck"; characterId: string; stat: string; dc?: number; skill?: string; visibility?: "public" | "gmOnly" | "hidden" | "summary"; reason?: string }
  | { type: "skillCheck"; characterId: string; skill: string; stat?: string; dc?: number; visibility?: "public" | "gmOnly" | "hidden" | "summary"; reason?: string }
  | { type: "contestCheck"; actorId: string; targetId: string; actorFormula: string; targetFormula: string; reason?: string }
  | { type: "resolveGameAction"; actorId?: string; action: string; difficulty?: string; proposedCheck?: string; stakes?: string }
  | { type: "calculateHazardDamage"; hazard: string; formula: string; damageType?: string; save?: { stat: string; dc: number; halfOnSuccess?: boolean } }
  | { type: "createCombatScene"; scene: Record<string, unknown>; reason?: string }
  | { type: "createCombatTerrain"; terrain: Record<string, unknown>; reason?: string }
  | { type: "addEnemyToScene"; enemyTemplateId?: string; enemy?: Record<string, unknown>; position?: CombatPosition; reason?: string }
  | { type: "createEnemyTemplate"; template: Record<string, unknown>; reason?: string }
  | { type: "createTacticalElementTemplate"; template: Record<string, unknown>; reason?: string }
  | { type: "createTerrainTemplate"; template: Record<string, unknown>; reason?: string }
  | { type: "createItemTemplate"; template: Record<string, unknown>; reason?: string }
  | { type: "createEffectTemplate"; template: Record<string, unknown>; reason?: string }
  | { type: "createAbilityTemplate"; template: Record<string, unknown>; reason?: string }
  | { type: "moveCombatant"; combatantId: string; to: CombatPosition }
  | { type: "revealMapDetail"; detailId: string }
  | { type: "hideMapDetail"; detailId: string }
  | { type: "roll"; formula: string; visibility?: "public" | "gmOnly" | "hidden" | "summary"; reason?: string }
  | { type: "startCombat" }
  | { type: "endCombat" }
  | { type: "nextCombatTurn" };

export type AiResolutionVisibility = "playerVisible" | "gmOnly" | "requiresCheck" | "hidden";

export interface AiResolutionIntention {
  id?: string;
  type: string;
  text: string;
  requiresResolution?: boolean;
  confidence?: number;
}

export interface AiResolutionFact {
  id?: string;
  source: AiAgentId | string;
  kind: string;
  content: string;
  visibility?: AiResolutionVisibility;
  suggestedCheck?: string;
  relatedIds?: string[];
}

export interface AiNarrationInput {
  id?: string;
  source: AiAgentId | string;
  content: string;
  priority?: "low" | "normal" | "high";
  visibility?: AiResolutionVisibility;
}

export type AiSafetyCategory =
  | "none"
  | "ordinaryFantasyViolence"
  | "ritualSelfInjury"
  | "selfHarmIntent"
  | "harmToOthers"
  | "coercionOrAbuse"
  | "ambiguousDarkIntent";

export type AiSafetyLevel = "normal" | "graveButPlayable" | "redirectRequired" | "hardStop";

export interface AiSafetyAssessment {
  category: AiSafetyCategory;
  level: AiSafetyLevel;
  guidance: string;
  confidence?: number;
}

export interface AiResolutionDraft {
  intentions: AiResolutionIntention[];
  facts: AiResolutionFact[];
  suggestedAgents: AiAgentRequest[];
  proposedCommands: AiDirectorCommand[];
  narrationInputs: AiNarrationInput[];
  safety: AiSafetyAssessment[];
  warnings: string[];
  questions: string[];
}

export type AiResolutionDraftPatch = Partial<AiResolutionDraft>;

export interface AiDirectorResponse {
  narration: string;
  commands: AiDirectorCommand[];
  agentRequests: AiAgentRequest[];
  draftPatch?: AiResolutionDraftPatch;
  notes?: string[];
}

export interface AiParsedResponse {
  response: AiDirectorResponse | null;
  errors: string[];
  rawJson?: string;
}

export interface AiApiTrace {
  id: string;
  agentId: AiAgentId;
  timestamp: number;
  durationMs: number;
  status: number;
  prompt: string;
  response: string;
  error?: string;
}

export type {
  Campaign,
  Character,
  CharacterLanguageMastery,
  CharacterPerception,
  CharacterStats,
  CommunicationPayload,
  CommunicationPerception,
  Entity,
  LanguageChannel,
  LanguageMasteryLevel,
  SenseCapability,
  World,
  WorldCharacterCreationGuidance,
} from "../core/models";
import type {
  CharacterStats,
  CommunicationPayload,
  CommunicationPerception,
} from "../core/models";

export type MessageSender = "player" | "gm";
export type ChatMessageKind = "standard" | "checkSetup" | "checkResult";

export interface Message {
  id: string;
  sender: MessageSender;
  content: string;
  timestamp: number;
  authorId?: string;
  authorName?: string;
  authorColor?: string;
  characterId?: string;
  spokenContent?: string;
  communication?: CommunicationPayload;
  communicationPerception?: CommunicationPerception;
  kind?: ChatMessageKind;
  relatedCheckId?: string;
  actions?: ChatActionIntent[];
  actionReceipt?: GameActionReceipt;
}

export interface PendingGameDecision {
  id: string;
  originalInput: string;
  question: string;
  createdAt: number;
}

export interface NarrativeMomentum {
  activeHookId?: string;
  offTrackActions: number;
  guidance: "none" | "subtle" | "clear" | "consequence";
  updatedAt: number;
}

export type NarrativeAlertLevel = 0 | 1 | 2 | 3 | 4;

export interface NarrativeSceneEvent {
  id: string;
  description: string;
  stage: string;
  turnsRemaining: number;
  urgency: "background" | "rising" | "immediate";
  relatedEntityIds: string[];
}

export interface NarrativeSceneState {
  id: string;
  revision: number;
  turn: number;
  elapsedMinutes: number;
  locationId: string | null;
  locationLabel: string;
  playerPosition: string;
  presentEntityIds: string[];
  socialTension: number;
  alertLevel: NarrativeAlertLevel;
  activeEvents: NarrativeSceneEvent[];
  recentConsequences: string[];
  lastPlayerAction: string;
  lastNarratedBeat: string;
  lastProactiveBeatAt: number;
  lastProactiveTurn: number | null;
  lastProactiveKey: string;
}

export interface NarrativeScenePatch {
  locationId?: string | null;
  locationLabel?: string;
  playerPosition?: string;
  presentEntityIds?: string[];
  elapsedMinutes?: number;
  socialTensionDelta?: number;
  alertLevel?: NarrativeAlertLevel;
  upsertEvents?: NarrativeSceneEvent[];
  resolveEventIds?: string[];
  consequences?: string[];
}

export interface GameActionReceipt {
  id: string;
  timestamp: number;
  actions: Array<{
    kind: ChatActionIntentKind;
    sourceId: string;
    sourceLabel: string;
    target?: { id: string; label: string; kind: ActionTargetKind };
  }>;
  changes: Array<{
    kind: "hp" | "quantity" | "charges" | "condition" | "position" | "resource";
    entityId: string;
    label: string;
    before: number | string;
    after: number | string;
    delta?: number;
  }>;
  rolls: Array<{
    formula: string;
    result: number;
    reason?: string;
    visibility: DiceVisibility;
  }>;
}

export type ChatActionIntentKind = "useItem" | "useAbility" | "castSpell" | "attack";
export type ActionTargetKind = "self" | "character" | "entity" | "item" | "position" | "free";

export interface ActionTarget {
  kind: ActionTargetKind;
  id: string;
  label: string;
  source?: "default" | "selected" | "free";
  position?: CombatPosition;
}

export type AimKind = "self" | "entity" | "position" | "direction" | "item";
export type AreaShape = "none" | "circle" | "cone" | "line" | "selfAura";
export type AffectKind = "self" | "living" | "enemy" | "ally" | "object" | "position";
export type SuggestedTargetSide = "self" | "ally" | "enemy" | "neutral";

export interface AimRule {
  allowed: AimKind[];
  required?: boolean;
  range?: number | string;
  lineOfSight?: boolean;
  label?: "cible" | "destination";
}

export interface AreaRule {
  shape: AreaShape;
  radius?: number | string;
  length?: number | string;
  width?: number | string;
}

export interface AffectRule {
  allowed: AffectKind[];
  maxTargets?: number;
  requiresLiving?: boolean;
  includeSelf?: boolean;
}

export interface ActionTargeting {
  aim: AimRule;
  area?: AreaRule;
  affects: AffectRule;
  defaultPriority?: Array<"self" | "nearestEnemy" | "farthestPointAhead" | "none">;
  suggestedSides?: SuggestedTargetSide[];
}

export interface ChatActionIntent {
  id: string;
  kind: ChatActionIntentKind;
  targetId: string;
  label: string;
  command: string;
  targeting?: ActionTargeting;
  target?: ActionTarget;
  spellLevel?: SpellLevel;
  createdAt: number;
}

export type DiceKind = "d20" | "d6" | "custom";
export type DiceVisibility = "public" | "gmOnly" | "hidden" | "summary";

export interface DiceRollTerm {
  kind: "die" | "modifier";
  label: string;
  value: number;
  sides?: number;
  color?: string;
}

export interface DiceRoll {
  id: string;
  kind: DiceKind;
  formula: string;
  sides: number;
  rolls: number[];
  modifier: number;
  terms: DiceRollTerm[];
  result: number;
  visibility: DiceVisibility;
  reason?: string;
  timestamp: number;
}

export type PlayerCheckDifficulty = "routine" | "plausible" | "difficult" | "extreme" | "legendary";
export type PlayerCheckDegree = "critical" | "success" | "partial" | "failure";

export interface PlayerCheckOutcomeHints {
  critical?: string;
  success?: string;
  partial?: string;
  failure?: string;
}

export interface PlayerCheckResourceCost {
  itemId: string;
  quantity: number;
  timing?: "attempt" | "success";
}

export interface PlayerCheckResolution {
  rollIds: string[];
  formula: string;
  naturalRoll: number;
  result: number;
  degree: PlayerCheckDegree;
  message: string;
  resolvedAt: number;
}

export type PlayerCheckNarrationContext =
  | {
      stage: "pending";
      requestId: string;
      action: string;
      method?: string;
      checkLabel: string;
      challengeCue: string;
    }
  | {
      stage: "resolved";
      requestId: string;
      action: string;
      method?: string;
      checkLabel: string;
      formula: string;
      result: number;
      degree: PlayerCheckDegree;
      outcome?: string;
      stakes?: string;
    };

export interface PlayerCheckRequest {
  id: string;
  characterId: string;
  action: string;
  method?: string;
  desiredOutcome?: string;
  stat: keyof CharacterStats;
  skill?: string;
  modifierPreview: number;
  dc: number;
  difficulty: PlayerCheckDifficulty;
  stakes?: string;
  costs: PlayerCheckResourceCost[];
  outcomes?: PlayerCheckOutcomeHints;
  visibility: DiceVisibility;
  createdAt: number;
  status: "pending" | "resolved" | "cancelled";
  resolution?: PlayerCheckResolution;
  error?: string;
}

export type PlayerCheckRequestInput = Omit<
  PlayerCheckRequest,
  "id" | "createdAt" | "status" | "resolution" | "error"
>;

export interface CharacterDerivedScores {
  modifiers: CharacterStats;
  proficiencyBonus: number;
  defense: number;
  initiative: number;
  speed: number;
  mana: number;
  attacks: {
    melee: number;
    ranged: number;
    magic: number;
  };
  updatedAt: number;
}

export type ItemLocationType = "inventory" | "equipped" | "world";

export interface ItemEffectRef {
  effectId: string;
  nom?: string;
  variables?: Record<string, number | string | boolean>;
}

export type EffectOperationId =
  | "applyCondition"
  | "createZone"
  | "damage"
  | "dispel"
  | "grantAbility"
  | "heal"
  | "inventoryInteraction"
  | "modifyResource"
  | "modifyStat"
  | "move"
  | "preventUnequip"
  | "randomDamage"
  | "reduceDamage"
  | "removeCondition"
  | "summon"
  | "teleport";

export interface EffectTemplateAction {
  operation: EffectOperationId;
  variables: Record<string, number | string | boolean>;
}

export interface EffectTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  actions: EffectTemplateAction[];
}

export type ItemModuleValue = number | string | boolean | Array<number | string | boolean>;

export type ItemRarity =
  | "mundane"
  | "common"
  | "uncommon"
  | "rare"
  | "veryRare"
  | "legendary"
  | "artifact";

export interface ItemTemplate {
  id: string;
  type: string;
  types: string[];
  tags: string[];
  aliases?: string[];
  name: string;
  description: string;
  rarity: ItemRarity;
  requiresAttunement?: boolean;
  base: Record<string, number | string | boolean>;
  effects: ItemEffectRef[];
  attacks?: ItemAttackProfile[];
  attackModifiers?: ItemAttackModifierProfile[];
  targeting?: ActionTargeting;
  modules: Record<string, Record<string, ItemModuleValue>>;
}

export interface ItemAttackProfile {
  id: string;
  name: string;
  label: string;
  range: number | string;
  damage: number | string;
  damageType: string;
  attackKind?: "melee" | "ranged" | "magic";
  cost?: "action" | "bonus" | "reaction";
  targeting?: ActionTargeting;
}

export interface ItemAttackModifierProfile {
  id: string;
  name: string;
  appliesToTags?: string[];
  appliesToAttackKinds?: Array<"melee" | "ranged" | "magic">;
  rangeModifier?: number | string;
  damageModifier?: number | string;
  damageType?: string;
  consumeOnUse?: boolean;
}

export interface ItemInstance {
  id: string;
  templateId: string;
  quantity: number;
  overrides: Record<string, number | string | boolean>;
  current: Record<string, number | string | boolean>;
  data: Record<string, number | string | boolean>;
  effects: ItemEffectRef[];
  location: {
    type: ItemLocationType;
    parent: string | null;
  };
}

export type AbilityRechargeTrigger = "shortRest" | "longRest" | "encounter" | "manual" | "never";
export type AbilityCombatRole = "attack" | "support" | "movement" | "utility" | "passive";
export type AbilityScalingMode = "abilityLevel" | "characterLevel" | "slotLevel" | "itemLevel" | "fixed";
export type AbilityRequirement =
  | { type: "equippedItemTag"; tag: string }
  | { type: "equippedItemType"; itemType: string }
  | { type: "resource"; resource: string; min: number | string }
  | { type: "state"; condition: string; expected?: boolean }
  | { type: "targetCondition"; condition: string }
  | { type: "combatStatus"; status: "active" | "inactive" | "any" };
export type AbilityDuration =
  | { type: "instant" }
  | { type: "rounds"; value: number | string }
  | { type: "untilRest"; rest: "short" | "long" }
  | { type: "concentration"; maxRounds?: number | string }
  | { type: "permanent" };

export interface AbilityScalingRule {
  level: number | string;
  mode: AbilityScalingMode;
  maxLevel?: number | string;
  notes?: string;
}

export interface GameActionScalingRule {
  effectIndex: number;
  variable: string;
  mode: Exclude<AbilityScalingMode, "fixed">;
  baseLevel: number;
  addPerStep: number | string;
  every?: number;
  thresholds?: number[];
  maxLevel?: number;
}

export interface AbilityResourceCost {
  type: "charge" | "mana" | "action" | "custom";
  resource?: string;
  amount: number | string;
}

export interface AbilityChargeRule {
  max: number;
  initial?: number;
  recharge: AbilityRechargeTrigger[];
  rechargeAmount?: number | "full";
}

export interface GameActionTemplate {
  id: string;
  name: string;
  description: string;
  types: string[];
  tags: string[];
  combatRole?: AbilityCombatRole;
  activation: {
    timing: "action" | "bonus" | "reaction" | "free" | "passive";
    cost?: {
      resource: string;
      amount: number | string;
    };
  };
  targeting: ActionTargeting;
  duration?: AbilityDuration;
  effects: ItemEffectRef[];
  scaling?: GameActionScalingRule[];
}

export interface AbilityTemplate {
  id: string;
  actionId: string;
  resourceCost?: AbilityResourceCost;
  charges?: AbilityChargeRule;
  requirements?: AbilityRequirement[];
  modules: Record<string, Record<string, ItemModuleValue>>;
}

export interface AbilityInstance {
  id: string;
  templateId: string;
  ownerId: string;
  grantedByItemId?: string;
  overrides: Record<string, number | string | boolean>;
  current: {
    charges?: number;
    cooldown?: number;
  };
  data: Record<string, number | string | boolean>;
  effects: ItemEffectRef[];
}

export type SpellLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type SpellcastingClassId =
  | "wizard"
  | "cleric"
  | "bard"
  | "druid"
  | "sorcerer"
  | "warlock"
  | "paladin"
  | "ranger";
export type SpellSchool =
  | "abjuration"
  | "conjuration"
  | "divination"
  | "enchantment"
  | "evocation"
  | "illusion"
  | "necromancy"
  | "transmutation";
export type SpellPreparationMode = "prepared" | "known";
export type SpellSlotProgression = "full" | "half" | "pact";

export interface SpellMaterialRequirement {
  name: string;
  quantity: number;
  consumed: boolean;
  itemTemplateId?: string;
  itemTag?: string;
}

export interface SpellComponents {
  verbal: boolean;
  somatic: boolean;
  material?: {
    description: string;
    focusAllowed: boolean;
    requirements: SpellMaterialRequirement[];
  };
}

export interface SpellTemplate {
  id: string;
  actionId: string;
  minimumSlotLevel: SpellLevel;
  school: SpellSchool;
  classes: SpellcastingClassId[];
  tags: string[];
  components: SpellComponents;
  concentration: boolean;
  ritual: boolean;
}

export interface SpellSlotState {
  level: Exclude<SpellLevel, 0>;
  max: number;
  remaining: number;
}

export interface CharacterSpellbook {
  characterId: string;
  classId: SpellcastingClassId;
  castingAbility: keyof CharacterStats;
  progression: SpellSlotProgression;
  preparationMode: SpellPreparationMode;
  slotRecovery: "shortRest" | "longRest";
  knownSpellIds: string[];
  preparedSpellIds: string[];
  slots: SpellSlotState[];
  preparationRequired: boolean;
  concentration?: {
    spellId: string;
    castAt: number;
  };
  updatedAt: number;
}

export interface EnemyAttackTemplate {
  id: string;
  name: string;
  attackKind: "melee" | "ranged" | "magic";
  attackBonus: number;
  damage: number | string;
  damageType: string;
  range: number;
  cost: "action" | "bonus" | "reaction";
  tags: string[];
}

export interface EnemyBehaviorTemplate {
  role: "artillery" | "controller" | "skirmisher" | "soldier" | "support" | "brute";
  aggression: number;
  preferredRange: number;
  retreatBelowHpPercent?: number;
  priorities: string[];
}

export interface EnemyTemplate {
  id: string;
  name: string;
  description: string;
  level: number;
  category: string;
  tags: string[];
  hp: number | string;
  defense: number;
  initiative: number;
  speed: number;
  reach: number;
  attacks: EnemyAttackTemplate[];
  abilityTemplateIds: string[];
  behavior: EnemyBehaviorTemplate;
  resistances: string[];
  vulnerabilities: string[];
  immunities: string[];
}

export interface CombatPosition {
  x: number;
  y: number;
}

export interface CombatObstacle {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  blocksMovement: boolean;
  blocksLineOfSight: boolean;
}

export type CombatMapElementKind =
  | "hazard"
  | "terrain"
  | "water"
  | "lava"
  | "cover"
  | "light"
  | "darkness"
  | "trigger"
  | "objective"
  | "resource";

export interface CombatMapElement {
  id: string;
  name: string;
  kind: CombatMapElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  cells?: CombatPosition[];
  description: string;
  rule: string;
  color: string;
  blocksMovement?: boolean;
  blocksLineOfSight?: boolean;
  effects?: CombatMapElementEffect[];
  state?: {
    used?: boolean;
    active?: boolean;
  };
}

export interface CombatMapDetail {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  kind: "looseObject" | "clue" | "resource" | "decoration" | "mechanism";
  tags: string[];
  quantity?: number;
  visible?: boolean;
  interactable?: boolean;
  usableAs?: string[];
  rule?: string;
}

export type CombatMapElementEffectTrigger = "startTurn" | "enter" | "passive" | "interact";
export type CombatMapElementEffectType =
  | "damage"
  | "heal"
  | "condition"
  | "removeCondition"
  | "stopMovement"
  | "movementCost"
  | "cover"
  | "lineOfSightBlock"
  | "revealHidden"
  | "alert"
  | "objective";

export interface CombatMapElementEffect {
  trigger: CombatMapElementEffectTrigger;
  type: CombatMapElementEffectType;
  value?: number | string;
  damageType?: string;
  condition?: string;
  label?: string;
  radius?: number | string;
  savingThrow?: {
    stat: keyof CharacterStats;
    dc: number;
    success?: "half" | "none";
  };
  oncePerCombat?: boolean;
}

export type CombatConditionKind = "harmful" | "beneficial" | "neutral";

export interface CombatConditionTemplate {
  id: string;
  name: string;
  kind: CombatConditionKind;
  description: string;
  aliases?: string[];
  color?: string;
  icon?: string;
  tags?: string[];
  rules?: string[];
}

export interface Combatant {
  id: string;
  sourceType: "character" | "entity" | "summon" | "hazard";
  sourceId: string;
  name: string;
  side: "players" | "allies" | "enemies" | "neutral";
  hp: number;
  maxHp: number;
  defense: number;
  initiative: number;
  speed: number;
  position: CombatPosition;
  conditions: string[];
  resources: {
    action: number;
    bonus: number;
    reaction: number;
    movement: number;
    disengaged: boolean;
  };
  reach: number;
  attackRange: number;
  attackDamage: number;
  enemyTemplateId?: string;
  attacks?: EnemyAttackTemplate[];
  abilityTemplateIds?: string[];
  behavior?: EnemyBehaviorTemplate;
  resistances?: string[];
  vulnerabilities?: string[];
  immunities?: string[];
}

export interface CombatLogEntry {
  id: string;
  type: "system" | "turn" | "move" | "action" | "damage" | "heal" | "condition";
  text: string;
  actorId?: string;
  targetIds?: string[];
  timestamp: number;
}

export interface CombatNarrationCue {
  id: string;
  kind: "transition" | "movement" | "action" | "enemyTurn";
  round: number;
  entries: Array<Pick<CombatLogEntry, "type" | "text">>;
  createdAt: number;
}

export interface CombatScene {
  id: string;
  status: "inactive" | "setup" | "active" | "ended";
  round: number;
  turnIndex: number;
  map: {
    width: number;
    height: number;
    unit: "meter";
    cellSize: number;
    obstacles: CombatObstacle[];
    elements: CombatMapElement[];
    details?: CombatMapDetail[];
  };
  combatants: Combatant[];
  log: CombatLogEntry[];
}

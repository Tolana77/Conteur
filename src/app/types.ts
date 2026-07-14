export type { Campaign, Character, CharacterStats, Entity, World } from "../core/models";
import type { CharacterStats } from "../core/models";

export type MessageSender = "player" | "gm";

export interface Message {
  id: string;
  sender: MessageSender;
  content: string;
  timestamp: number;
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

export type ChatActionIntentKind = "useItem" | "useAbility" | "attack";
export type ActionTargetKind = "self" | "character" | "entity" | "item" | "position" | "free";

export interface ActionTarget {
  kind: ActionTargetKind;
  id: string;
  label: string;
  source?: "default" | "selected" | "free";
  position?: CombatPosition;
}

export interface ActionTargetingRule {
  allowed: ActionTargetKind[];
  required?: boolean;
  defaultPriority?: Array<"self" | "nearestEnemy" | "farthestPointAhead" | "none">;
  range?: number | string;
  label?: "cible" | "destination";
  lineOfSight?: boolean;
  suggestedSides?: SuggestedTargetSide[];
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
}

export interface ActionTargetingV2 {
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
  targeting?: ActionTargetingRule;
  target?: ActionTarget;
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

export type ItemModuleValue = number | string | boolean | Array<number | string | boolean>;

export interface ItemTemplate {
  id: string;
  type: string;
  types: string[];
  tags: string[];
  aliases?: string[];
  name: string;
  description: string;
  base: Record<string, number | string | boolean>;
  effects: ItemEffectRef[];
  attacks?: ItemAttackProfile[];
  attackModifiers?: ItemAttackModifierProfile[];
  targeting?: ActionTargetingRule;
  targetingV2?: ActionTargetingV2;
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
  targetingV2?: ActionTargetingV2;
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

export interface AbilityTemplate {
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
  resourceCost?: AbilityResourceCost;
  targeting: ActionTargetingRule;
  targetingV2?: ActionTargetingV2;
  charges?: AbilityChargeRule;
  scaling?: AbilityScalingRule;
  requirements?: AbilityRequirement[];
  duration?: AbilityDuration;
  effects: ItemEffectRef[];
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
}

export interface CombatLogEntry {
  id: string;
  type: "system" | "turn" | "move" | "action" | "damage" | "heal" | "condition";
  text: string;
  actorId?: string;
  targetIds?: string[];
  timestamp: number;
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

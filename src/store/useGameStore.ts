import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  cloneCampaignStartSnapshot,
  createCampaignStartSnapshot,
  defaultCampaign,
  normalizeCampaignStartSnapshot,
  type CampaignStartSnapshot,
} from "../features/campaign";
import { rollDiceFormula } from "../features/dice";
import {
  createInitialNarrativeScene,
  normalizeNarrativeScene,
} from "../core/game-engine/narrativeScene";
import {
  createLocalGameRuntimeAdapter,
  normalizeCharacterPerception,
  type GameActorRole,
  type GameCommand,
  type GameCommandInput,
  type GameCommandResult,
  type GameEvent,
  type GameRuntimeSnapshot,
} from "../core/game-engine";
import {
  canUseAbility,
  createAbilityInstance,
  initialAbilityTemplates,
  rechargeAbility as rechargeAbilityCharge,
  setAbilityCharges as setAbilityChargeCount,
  useAbilityCharge,
} from "../features/abilities";
import {
  getGameActionTemplate,
  initialGameActionTemplates,
  resolveGameActionEffects,
} from "../features/actions";
import {
  applyPreparedSpells,
  checkSpellCast,
  consumeSpellMaterials,
  createInitialSpellbooks,
  initialSpellTemplates,
  resolveSpellEffects,
  restoreSpellSlots,
  spendSpellSlot,
  synchronizeSpellbooks,
} from "../features/spells";
import {
  deprecatedBuiltInItemTemplateReplacements,
  initialItemTemplates,
  isItemEquipable,
  isItemUsable,
  normalizeItemRarity,
  preventsUnequip,
} from "../features/items";
import {
  cloneContentTemplate,
  createEmptyDisabledContentTemplateIds,
  getContentTemplateDependencies,
  initialEffectTemplates,
  initialEnemyTemplates,
  isBuiltInContentTemplate,
  isContentTemplateActive,
  resolveEffectReferences,
  type ContentAuditEntry,
  type ContentDeletionResult,
  type ContentMutationMeta,
  type ContentTemplate,
  type ContentTemplateKind,
  type DisabledContentTemplateIds,
  type EnemySpawnInput,
  type ItemInstanceInput,
} from "../features/content";
import {
  canAffectCombatant,
  getSelectableTargetKinds,
  hasLineOfSight,
  isActionTargetAllowed,
  isSuggestedCombatant,
  normalizeActionTargeting,
  resolveActionTargets,
} from "../features/combat/targeting";
import { getCombatConditionTemplate } from "../features/combat/conditionTemplates";
import {
  appendCombatNarrationCue,
  collectNewNarratableCombatEntries,
  createCombatNarrationCue,
  isLegacyTechnicalCombatMessage,
  normalizeCombatNarrationQueue,
} from "../features/combat/combatNarration";
import { resolveEffectValue, type ValueExpressionContext } from "../features/items/valueExpressions";
import type {
  Campaign,
  ActionTarget,
  ActionTargeting,
  AbilityInstance,
  AbilityRechargeTrigger,
  AbilityTemplate,
  Character,
  CharacterSpellbook,
  CharacterDerivedScores,
  ChatActionIntent,
  ChatActionIntentKind,
  Combatant,
  CombatLogEntry,
  CombatNarrationCue,
  CombatMapElementEffect,
  CombatMapElementKind,
  CombatScene,
  CombatPosition,
  DiceRoll,
  DiceVisibility,
  EffectTemplate,
  EnemyTemplate,
  Entity,
  GameActionTemplate,
  GameActionReceipt,
  ItemInstance,
  ItemTemplate,
  Message,
  NarrativeMomentum,
  NarrativeScenePatch,
  NarrativeSceneState,
  PendingGameDecision,
  PlayerCheckRequest,
  PlayerCheckRequestInput,
  PlayerCheckResolution,
  SpellLevel,
  SpellTemplate,
  CharacterStats,
} from "../app/types";
import type { AiApiTrace } from "../features/ai-director/types";
import {
  validateCharacterCreationPackage,
  type CharacterCreationPackage,
} from "../features/character/characterCreation";
import {
  createCharacterInstallBundle,
  createMultiplayerCharacterContext,
  rebaseCharacterCreationPackage,
} from "../features/multiplayer/characterOnboarding";

export const GAME_STORAGE_KEY = "le-conteur:game-state";
export const GAME_STORAGE_VERSION = 38;
export const LEGACY_CAMPAIGNS_STORAGE_KEY = "le-conteur:campaigns";
export const MAX_PLAYER_ACTION_INTENTS = 2;

const diceStatColors = {
  FOR: "#661309",
  DEX: "#5FA85A",
  CON: "#E0792A",
  INT: "#C7007E",
  SAG: "#5B4FCB",
  CHA: "#F5D24A",
} as const;

interface UiSettings {
  showItemTags: boolean;
}

export interface GameState {
  storageVersion: number;
  gameRevision: number;
  gameEvents: GameEvent[];
  campaign: Campaign;
  characters: Character[];
  selectedCharacterId: string;
  messages: Message[];
  narrativeMomentum: NarrativeMomentum;
  pendingGameDecision: PendingGameDecision | null;
  pendingActionIntents: ChatActionIntent[];
  diceRolls: DiceRoll[];
  playerCheckRequests: PlayerCheckRequest[];
  characterPortraits: Record<string, string>;
  uiSettings: UiSettings;
  characterDerivedScores: Record<string, CharacterDerivedScores>;
  itemTemplates: ItemTemplate[];
  itemInstances: ItemInstance[];
  abilityTemplates: AbilityTemplate[];
  abilityInstances: AbilityInstance[];
  gameActionTemplates: GameActionTemplate[];
  spellTemplates: SpellTemplate[];
  spellbooks: CharacterSpellbook[];
  effectTemplates: EffectTemplate[];
  enemyTemplates: EnemyTemplate[];
  disabledContentTemplateIds: DisabledContentTemplateIds;
  contentAuditLog: ContentAuditEntry[];
  combat: CombatScene;
  combatNarrationQueue: CombatNarrationCue[];
  aiApiTraces: AiApiTrace[];
  campaignStartSnapshot: CampaignStartSnapshot;
  narrativeScene: NarrativeSceneState;
  dispatchGameCommand: (command: GameCommand) => GameCommandResult;
  selectCharacter: (characterId: string) => void;
  setCharacterPortrait: (characterId: string, portrait: string) => void;
  dealDamage: (characterId: string, amount: number, damageType?: string) => void;
  healCharacter: (characterId: string, amount: number) => void;
  setCharacterPv: (characterId: string, pv: number) => void;
  changeCharacterStat: (
    characterId: string,
    stat: keyof Character["stats"],
    value: number,
    mode: "add" | "set",
  ) => void;
  equipItem: (itemId: string) => void;
  unequipItem: (itemId: string) => void;
  moveItemToBag: (itemId: string) => void;
  giveItem: (characterId: string, templateId: string, quantity?: number) => ItemInstance | null;
  pickupItem: (itemId: string, characterId: string) => boolean;
  removeItem: (itemId: string) => void;
  modifyItemField: (itemId: string, path: string, value: string | number | boolean) => boolean;
  spendItemQuantity: (itemId: string, quantity: number) => boolean;
  useItem: (itemId: string) => void;
  useAbility: (abilityId: string) => boolean;
  rechargeAbility: (abilityId: string) => void;
  setAbilityCharges: (abilityId: string, charges: number) => void;
  learnSpell: (characterId: string, spellId: string) => boolean;
  prepareSpells: (characterId: string, spellIds: string[]) => boolean;
  registerEffectTemplate: (template: EffectTemplate, mode?: "create" | "replace", meta?: ContentMutationMeta) => boolean;
  registerItemTemplate: (template: ItemTemplate, mode?: "create" | "replace", meta?: ContentMutationMeta) => boolean;
  registerGameActionTemplate: (template: GameActionTemplate, mode?: "create" | "replace") => boolean;
  registerAbilityTemplate: (template: AbilityTemplate, mode?: "create" | "replace", meta?: ContentMutationMeta) => boolean;
  registerEnemyTemplate: (template: EnemyTemplate, mode?: "create" | "replace", meta?: ContentMutationMeta) => boolean;
  setContentTemplateActive: (kind: ContentTemplateKind, templateId: string, active: boolean) => boolean;
  deleteContentTemplate: (kind: ContentTemplateKind, templateId: string) => ContentDeletionResult;
  clearContentAuditLog: () => void;
  createItemInstance: (input: ItemInstanceInput) => ItemInstance | null;
  grantAbilityToCharacter: (characterId: string, templateId: string) => AbilityInstance | null;
  appendCharacterHistory: (characterId: string, entry: string) => boolean;
  spawnEnemyFromTemplate: (templateId: string, input: EnemySpawnInput) => string | null;
  rest: (characterId: string, type: "short" | "long") => void;
  startEncounter: (characterId: string) => void;
  startCombat: () => void;
  endCombat: () => void;
  addCharacterToCombat: (characterId: string) => void;
  addEntityToCombat: (entityId: string, side?: Combatant["side"]) => void;
  revealMapDetail: (detailId: string) => void;
  hideMapDetail: (detailId: string) => void;
  moveCombatant: (combatantId: string, position: CombatPosition) => void;
  disengageCombatant: (combatantId: string) => void;
  nextCombatTurn: () => void;
  attackCombatant: (attackerId: string, targetId: string, weaponName: string, damage: number) => void;
  consumeCombatNarrationCues: (cueIds: string[]) => void;
  addAttackIntent: (weaponId: string, label: string, target?: ActionTarget) => boolean;
  addSpellIntent: (spellId: string, slotLevel: SpellLevel, target?: ActionTarget) => boolean;
  addActionIntent: (kind: ChatActionIntentKind, targetId: string, label: string, target?: ActionTarget) => boolean;
  updateActionIntentTarget: (intentId: string, target: ActionTarget) => void;
  removeActionIntent: (intentId: string) => void;
  clearActionIntents: () => void;
  moveItemBefore: (itemId: string, beforeItemId: string) => void;
  setShowItemTags: (showItemTags: boolean) => void;
  clearCharacterPortraits: () => void;
  resetGameState: () => void;
  startCampaign: (snapshot: CampaignStartSnapshot) => void;
  addCharacterFromPackage: (setup: CharacterCreationPackage) => Character | null;
  restartCampaign: () => void;
  advanceNarrativeScene: (playerAction: string) => void;
  applyNarrativeScenePatch: (patch: NarrativeScenePatch) => void;
  recordNarratedBeat: (narration: string, proactiveKey?: string) => void;
  addGmMessage: (
    content: string,
    metadata?: Pick<Message, "kind" | "relatedCheckId">,
  ) => void;
  sendPlayerMessage: (
    content: string,
    author?: Pick<Message, "authorId" | "authorName" | "authorColor" | "characterId" | "spokenContent" | "communication">,
  ) => void;
  setPendingGameDecision: (decision: PendingGameDecision | null) => void;
  setNarrativeMomentum: (momentum: NarrativeMomentum) => void;
  recordCampaignEvent: (entry: string) => void;
  roll: (sides: number) => DiceRoll;
  rollFormula: (formula: string, visibility?: DiceVisibility, reason?: string) => DiceRoll;
  queuePlayerCheck: (request: PlayerCheckRequestInput) => PlayerCheckRequest | null;
  completePlayerCheck: (requestId: string, resolution: PlayerCheckResolution) => boolean;
  failPlayerCheck: (requestId: string, error: string) => void;
  updateWorldFact: (index: number, value: string) => void;
  addWorldFact: (value: string) => void;
  removeWorldFact: (index: number) => void;
  updateEntity: (entity: Entity) => void;
  addAiApiTrace: (trace: AiApiTrace) => void;
  clearAiApiTraces: () => void;
}

const initialMessages: Message[] = [
  {
    id: "message-gm-intro",
    sender: "gm",
    content: "Créez un monde depuis l’Atelier, puis commencez votre aventure.",
    timestamp: 1_735_689_601_000,
  },
];

function createInitialCombatScene(): CombatScene {
  return {
    id: "combat-initial",
    status: "inactive",
    round: 1,
    turnIndex: 0,
    map: {
      width: 30,
      height: 20,
      unit: "meter",
      cellSize: 0.5,
      obstacles: [
        {
          id: "obstacle-ruined-wall",
          name: "Muret écroulé",
          x: 13,
          y: 7,
          width: 4,
          height: 1.2,
          blocksMovement: true,
          blocksLineOfSight: true,
        },
        {
          id: "obstacle-stone-pillar",
          name: "Pilier",
          x: 21,
          y: 13,
          width: 2,
          height: 2,
          blocksMovement: true,
          blocksLineOfSight: true,
        },
      ],
      details: [
        {
          id: "detail-heavy-stones",
          name: "Pierres lourdes",
          description: "Des pierres détachées du muret, assez massives pour être lancées à deux mains.",
          x: 12.2,
          y: 8.8,
          kind: "looseObject",
          tags: ["stone", "heavy", "throwable", "improvised-weapon"],
          quantity: 4,
          visible: false,
          interactable: true,
          usableAs: ["projectile", "cover-wedge"],
          rule: "Peut servir de projectile improvisé si le Conteur valide l'action.",
        },
        {
          id: "detail-glass-shards",
          name: "Éclats de verre",
          description: "Un tapis de petits éclats translucides près d'une ancienne vitrine.",
          x: 18.5,
          y: 4.5,
          kind: "looseObject",
          tags: ["glass", "sharp", "fragile", "improvised-trap"],
          quantity: 1,
          visible: false,
          interactable: true,
          usableAs: ["distraction", "trap-component"],
          rule: "Peut être ramassé ou dispersé pour créer un danger mineur.",
        },
        {
          id: "detail-rope-coil",
          name: "Corde poussiéreuse",
          description: "Une corde rêche enroulée près d'un pilier.",
          x: 22.8,
          y: 12.2,
          kind: "resource",
          tags: ["rope", "tool", "binding", "climb"],
          quantity: 1,
          visible: false,
          interactable: true,
          usableAs: ["tool", "restraint"],
          rule: "Peut aider à grimper, lier ou tirer un objet léger.",
        },
        {
          id: "detail-dusty-tracks",
          name: "Traces dans la poussière",
          description: "Des marques récentes contournent le nuage de fumée.",
          x: 14,
          y: 15.5,
          kind: "clue",
          tags: ["tracks", "clue", "recent", "investigation"],
          visible: false,
          interactable: false,
          usableAs: ["clue"],
          rule: "Peut apparaître après une recherche ou un jet de Perception/Investigation.",
        },
      ],
      elements: [
        {
          id: "element-burning-ground",
          name: "Sol enflammé",
          kind: "hazard",
          x: 8,
          y: 12,
          width: 3,
          height: 2,
          cells: [
            { x: 8, y: 12 },
            { x: 8.5, y: 12 },
            { x: 9, y: 12 },
            { x: 9.5, y: 12 },
            { x: 8.5, y: 12.5 },
            { x: 9, y: 12.5 },
            { x: 9.5, y: 12.5 },
            { x: 10, y: 12.5 },
            { x: 9, y: 13 },
            { x: 9.5, y: 13 },
          ],
          description: "Des braises courent entre les dalles et lèchent les bottes de ceux qui s'y attardent.",
          rule: "Début de tour : 1d6 dégâts de feu à toute créature dans la zone.",
          color: "#7A1F2E",
          effects: [
            { trigger: "startTurn", type: "damage", value: "1d6", damageType: "feu", label: "Brûlure" },
            { trigger: "enter", type: "damage", value: 2, damageType: "feu", label: "Contact brûlant" },
          ],
        },
        {
          id: "element-acid-puddle",
          name: "Flaque acide",
          kind: "hazard",
          x: 6.5,
          y: 7.5,
          width: 2,
          height: 1,
          cells: [
            { x: 6.5, y: 7.5 },
            { x: 7, y: 7.5 },
            { x: 7.5, y: 7.5 },
            { x: 8, y: 8 },
          ],
          description: "Une flaque verdâtre fume lentement et attaque le cuir comme le métal.",
          rule: "Entrée ou début de tour : 1d4 dégâts d'acide.",
          color: "#3F5641",
          effects: [
            { trigger: "startTurn", type: "damage", value: "1d4", damageType: "acide", label: "Acide" },
            { trigger: "enter", type: "damage", value: "1d4", damageType: "acide", label: "Acide" },
          ],
        },
        {
          id: "element-caltrops",
          name: "Chausse-trappes",
          kind: "hazard",
          x: 4,
          y: 13,
          width: 3,
          height: 2,
          description: "De petites pointes noires sont dispersées au sol.",
          rule: "Entrer dans la zone arrête le mouvement. DEX DD 12 pour éviter 1 dégât perforant. Traverser coûte +1 m par mètre.",
          color: "#5C5566",
          effects: [
            { trigger: "enter", type: "stopMovement", label: "Sol piégé" },
            { trigger: "enter", type: "damage", value: 1, damageType: "perforant", label: "Pointes", savingThrow: { stat: "dexterite", dc: 12, success: "none" } },
            { trigger: "passive", type: "movementCost", value: 2, label: "Sol piégé" },
          ],
        },
        {
          id: "element-difficult-rubble",
          name: "Décombres instables",
          kind: "terrain",
          x: 12,
          y: 10,
          width: 5,
          height: 2,
          cells: [
            { x: 12, y: 10 },
            { x: 12.5, y: 10 },
            { x: 13, y: 10 },
            { x: 14, y: 10 },
            { x: 15, y: 10 },
            { x: 16, y: 10 },
            { x: 13, y: 10.5 },
            { x: 13.5, y: 10.5 },
            { x: 14, y: 10.5 },
            { x: 15.5, y: 10.5 },
            { x: 16, y: 10.5 },
            { x: 14.5, y: 11 },
            { x: 15, y: 11 },
          ],
          description: "Pierres, poutres fendues et poussière rendent les appuis incertains.",
          rule: "Terrain difficile : le déplacement coûte le double.",
          color: "#6E5A3C",
          effects: [
            { trigger: "passive", type: "movementCost", value: 2, label: "Terrain difficile" },
          ],
        },
        {
          id: "element-oil-slick",
          name: "Huile répandue",
          kind: "terrain",
          x: 6,
          y: 7,
          width: 3,
          height: 2,
          description: "Une couche huileuse reflète faiblement l'or des torches.",
          rule: "Risque de chute lors d'une course ou d'un déplacement brutal. Devient Sol enflammé si exposée au feu.",
          color: "#8C3F73",
          effects: [
            { trigger: "enter", type: "condition", condition: "slippery-footing", label: "Huile" },
            { trigger: "passive", type: "movementCost", value: 1.5, label: "Sol glissant" },
          ],
        },
        {
          id: "element-low-cover",
          name: "Barricade basse",
          kind: "cover",
          x: 19,
          y: 8,
          width: 3,
          height: 1,
          description: "Des planches clouées à la hâte offrent une protection partielle.",
          rule: "Couvert partiel contre les attaques venant de l'autre côté.",
          color: "#2F5C7A",
          effects: [
            { trigger: "passive", type: "cover", value: 2, label: "Couvert partiel" },
          ],
        },
        {
          id: "element-high-ground",
          name: "Estrade surélevée",
          kind: "terrain",
          x: 2,
          y: 3,
          width: 5,
          height: 3,
          description: "Une estrade fissurée domine légèrement la salle.",
          rule: "Avantage narratif pour observer, tirer ou intimider depuis la zone.",
          color: "#9C7A2E",
          effects: [
            { trigger: "startTurn", type: "condition", condition: "high-ground", label: "Hauteur" },
          ],
        },
        {
          id: "element-smoke-cloud",
          name: "Nuage de fumée",
          kind: "darkness",
          x: 15,
          y: 14,
          width: 4,
          height: 3,
          cells: [
            { x: 15.5, y: 14 },
            { x: 16, y: 14 },
            { x: 16.5, y: 14 },
            { x: 17, y: 14.5 },
            { x: 18, y: 14.5 },
            { x: 15, y: 15 },
            { x: 15.5, y: 15 },
            { x: 16, y: 15 },
            { x: 17, y: 15 },
            { x: 17.5, y: 15 },
            { x: 18.5, y: 15 },
            { x: 16, y: 15.5 },
            { x: 16.5, y: 15.5 },
            { x: 17, y: 16 },
          ],
          description: "Une fumée grasse roule entre les silhouettes.",
          rule: "La zone bloque fortement la visibilité mais pas le déplacement.",
          color: "#6B4A5C",
          blocksLineOfSight: true,
          effects: [
            { trigger: "passive", type: "lineOfSightBlock", label: "Fumée opaque" },
            { trigger: "startTurn", type: "condition", condition: "hidden", label: "Fumée" },
          ],
        },
        {
          id: "element-bright-lantern",
          name: "Lanterne vive",
          kind: "light",
          x: 24,
          y: 3,
          width: 2,
          height: 2,
          description: "Une lanterne suspendue projette un cercle de lumière stable.",
          rule: "Révèle les créatures cachées dans ou près de la zone.",
          color: "#F5D24A",
          effects: [
            { trigger: "startTurn", type: "revealHidden", label: "Lumière vive" },
          ],
        },
        {
          id: "element-shadowed-alcove",
          name: "Alcôve obscure",
          kind: "darkness",
          x: 25,
          y: 15,
          width: 3,
          height: 3,
          description: "Les angles de pierre avalent presque toute la lumière.",
          rule: "Facilite la discrétion et peut masquer une menace immobile.",
          color: "#4B3B66",
          effects: [
            { trigger: "startTurn", type: "condition", condition: "hidden", label: "Obscurité" },
          ],
        },
        {
          id: "element-alarm-rune",
          name: "Rune d'alarme",
          kind: "trigger",
          x: 10,
          y: 4,
          width: 1.5,
          height: 1.5,
          description: "Une marque anguleuse pulse à peine sous la poussière.",
          rule: "Déclenchement : attire les ennemis proches ou renforce l'initiative ennemie.",
          color: "#C7007E",
          effects: [
            { trigger: "enter", type: "alert", condition: "alert", label: "Rune d'alarme", oncePerCombat: true },
          ],
        },
        {
          id: "element-healing-circle",
          name: "Cercle sanctifié",
          kind: "resource",
          x: 3,
          y: 17,
          width: 3,
          height: 2,
          description: "Des lignes d'or terni dessinent une géométrie protectrice.",
          rule: "Une fois par combat : une créature dans la zone récupère 1d6 PV.",
          color: "#9C7A2E",
          effects: [
            { trigger: "startTurn", type: "heal", value: "1d6", label: "Cercle sanctifié", oncePerCombat: true },
          ],
        },
        {
          id: "element-objective-gate",
          name: "Levier de herse",
          kind: "objective",
          x: 27,
          y: 9,
          width: 1,
          height: 2,
          description: "Un levier rouillé contrôle un mécanisme derrière le mur.",
          rule: "Action principale : ouvrir ou fermer la herse de la scène.",
          color: "#9C7A2E",
          effects: [
            { trigger: "interact", type: "objective", label: "Levier de herse" },
          ],
        },
        {
          id: "element-ice-sheet",
          name: "Plaque de givre",
          kind: "terrain",
          x: 11,
          y: 2,
          width: 4,
          height: 2,
          description: "Une peau de glace mince rend le sol traître.",
          rule: "Déplacement rapide : risque de glissade. Les poussées déplacent plus loin.",
          color: "#3F6C8A",
          effects: [
            { trigger: "enter", type: "condition", condition: "fragile-balance", label: "Givre" },
            { trigger: "passive", type: "movementCost", value: 1.5, label: "Sol glissant" },
          ],
        },
        {
          id: "element-shallow-water",
          name: "Eau peu profonde",
          kind: "water",
          x: 17,
          y: 2,
          width: 4,
          height: 3,
          cells: [
            { x: 17, y: 2 },
            { x: 17.5, y: 2 },
            { x: 18, y: 2 },
            { x: 18.5, y: 2 },
            { x: 19, y: 2.5 },
            { x: 19.5, y: 2.5 },
            { x: 20, y: 2.5 },
            { x: 17.5, y: 3 },
            { x: 18, y: 3 },
            { x: 18.5, y: 3 },
            { x: 19, y: 3 },
            { x: 20, y: 3.5 },
            { x: 18, y: 4 },
            { x: 18.5, y: 4 },
            { x: 19, y: 4 },
          ],
          description: "Une nappe d'eau sombre couvre les dalles et ralentit les appuis.",
          rule: "Terrain aquatique : le déplacement coûte le double. Entrer dans la zone arrête le mouvement et impose l'état Submergé.",
          color: "#2F5C7A",
          effects: [
            { trigger: "enter", type: "stopMovement", label: "Eau profonde" },
            { trigger: "enter", type: "condition", condition: "submerged", label: "Submersion" },
            { trigger: "passive", type: "movementCost", value: 2, label: "Eau peu profonde" },
          ],
        },
        {
          id: "element-lava-flow",
          name: "Coulée de lave",
          kind: "lava",
          x: 23,
          y: 16,
          width: 3,
          height: 2,
          cells: [
            { x: 23, y: 16 },
            { x: 23.5, y: 16 },
            { x: 24, y: 16 },
            { x: 24.5, y: 16.5 },
            { x: 25, y: 16.5 },
            { x: 23.5, y: 17 },
            { x: 24, y: 17 },
            { x: 24.5, y: 17 },
          ],
          description: "La pierre fendue laisse couler une lave lente et suffocante.",
          rule: "Entrée : 6d6 dégâts de feu, DEX DD 15 pour moitié. Début de tour : 10d6 dégâts de feu. Le mouvement s'arrête dans la lave.",
          color: "#B5612A",
          effects: [
            { trigger: "enter", type: "stopMovement", label: "Lave" },
            { trigger: "enter", type: "damage", value: "6d6", damageType: "feu", label: "Lave", savingThrow: { stat: "dexterite", dc: 15, success: "half" } },
            { trigger: "startTurn", type: "damage", value: "10d6", damageType: "feu", label: "Lave" },
            { trigger: "enter", type: "condition", condition: "burning", label: "Lave" },
            { trigger: "passive", type: "movementCost", value: 2, label: "Roche en fusion" },
          ],
        },
      ],
    },
    combatants: [createHazardCombatant({
      id: "combatant-hazard-explosive-barrel",
      sourceId: "hazard-explosive-barrel",
      name: "Baril instable",
      hp: 8,
      defense: 10,
      position: { x: 21.5, y: 6.5 },
      attackDamage: 0,
    })],
    log: [],
  };
}

function createEmptyCombatScene(): CombatScene {
  const base = createInitialCombatScene();
  return {
    ...base,
    id: `combat-${crypto.randomUUID()}`,
    status: "inactive",
    round: 1,
    turnIndex: 0,
    map: {
      ...base.map,
      obstacles: [],
      elements: [],
      details: [],
    },
    combatants: [],
    log: [],
  };
}


type GameDataState = Pick<
  GameState,
  | "storageVersion"
  | "gameRevision"
  | "gameEvents"
  | "campaign"
  | "characters"
  | "selectedCharacterId"
  | "messages"
  | "narrativeMomentum"
  | "pendingGameDecision"
  | "pendingActionIntents"
  | "diceRolls"
  | "playerCheckRequests"
  | "characterPortraits"
  | "uiSettings"
  | "characterDerivedScores"
  | "itemTemplates"
  | "itemInstances"
  | "abilityTemplates"
  | "abilityInstances"
  | "gameActionTemplates"
  | "spellTemplates"
  | "spellbooks"
  | "effectTemplates"
  | "enemyTemplates"
  | "disabledContentTemplateIds"
  | "contentAuditLog"
  | "combat"
  | "combatNarrationQueue"
  | "aiApiTraces"
  | "campaignStartSnapshot"
  | "narrativeScene"
>;

const localGameRuntime = createLocalGameRuntimeAdapter();
const LOCAL_GAME_EVENT_LIMIT = 200;

function toGameRuntimeSnapshot(state: GameDataState): GameRuntimeSnapshot {
  return {
    revision: state.gameRevision,
    campaign: state.campaign,
    characters: state.characters,
    messages: state.messages,
    narrativeScene: state.narrativeScene,
    processedCommandIds: [...new Set(state.gameEvents.map((event) => event.commandId))],
  };
}

function createStoreGameCommand(
  state: GameDataState,
  input: GameCommandInput,
  actorRole: GameActorRole = "system",
): GameCommand {
  const actorId = actorRole === "player"
    ? state.selectedCharacterId || "local-player"
    : actorRole === "gm"
      ? "local-gm"
      : "local-system";
  return localGameRuntime.createCommand(
    toGameRuntimeSnapshot(state),
    input,
    { id: actorId, role: actorRole },
  );
}

function createInitialState(): GameDataState {
  const characterId = defaultCampaign.characters[0]?.id ?? "";
  const itemInstances: ItemInstance[] = [];
  const abilityInstances: AbilityInstance[] = [];
  const spellbooks = createInitialSpellbooks(defaultCampaign.characters, initialSpellTemplates);
  const narrativeScene = createInitialNarrativeScene(defaultCampaign);
  const campaignStartSnapshot = createCampaignStartSnapshot({
    campaign: defaultCampaign,
    characters: defaultCampaign.characters,
    selectedCharacterId: characterId,
    openingScene: defaultCampaign.world.openingScene
      ?? initialMessages[0]?.content
      ?? "Créez un monde depuis l’Atelier.",
    itemTemplates: initialItemTemplates,
    itemInstances,
    abilityTemplates: initialAbilityTemplates,
    abilityInstances,
    gameActionTemplates: initialGameActionTemplates,
    spellTemplates: initialSpellTemplates,
    spellbooks,
    effectTemplates: initialEffectTemplates,
    enemyTemplates: initialEnemyTemplates,
    narrativeScene,
  });

  return {
    storageVersion: GAME_STORAGE_VERSION,
    gameRevision: 0,
    gameEvents: [],
    campaign: defaultCampaign,
    characters: defaultCampaign.characters,
    selectedCharacterId: characterId,
    messages: initialMessages,
    narrativeMomentum: createInitialNarrativeMomentum(),
    pendingGameDecision: null,
    pendingActionIntents: [],
    diceRolls: [],
    playerCheckRequests: [],
    characterPortraits: {},
    uiSettings: {
      showItemTags: true,
    },
    itemTemplates: initialItemTemplates,
    itemInstances,
    abilityTemplates: initialAbilityTemplates,
    abilityInstances,
    gameActionTemplates: initialGameActionTemplates,
    spellTemplates: initialSpellTemplates,
    spellbooks,
    effectTemplates: initialEffectTemplates,
    enemyTemplates: initialEnemyTemplates,
    disabledContentTemplateIds: createEmptyDisabledContentTemplateIds(),
    contentAuditLog: [],
    combat: createEmptyCombatScene(),
    combatNarrationQueue: [],
    aiApiTraces: [],
    campaignStartSnapshot,
    narrativeScene,
    characterDerivedScores: createCharacterDerivedScores(
      defaultCampaign.characters,
      itemInstances,
      initialItemTemplates,
      initialEffectTemplates,
    ),
  };
}

function createCampaignRuntimeState(snapshot: CampaignStartSnapshot): Partial<GameDataState> {
  const start = cloneCampaignStartSnapshot(snapshot);
  const characters = start.characters;
  const itemTemplates = start.itemTemplates;
  const itemInstances = start.itemInstances;

  return {
    storageVersion: GAME_STORAGE_VERSION,
    gameRevision: 0,
    gameEvents: [],
    campaign: { ...start.campaign, characters },
    characters,
    selectedCharacterId: characters.some((character) => character.id === start.selectedCharacterId)
      ? start.selectedCharacterId
      : characters[0]?.id ?? "",
    messages: [createMessage("gm", start.openingScene)],
    narrativeMomentum: createInitialNarrativeMomentum(),
    pendingGameDecision: null,
    pendingActionIntents: [],
    diceRolls: [],
    playerCheckRequests: [],
    itemTemplates,
    itemInstances,
    abilityTemplates: start.abilityTemplates,
    abilityInstances: start.abilityInstances,
    gameActionTemplates: start.gameActionTemplates,
    spellTemplates: start.spellTemplates,
    spellbooks: synchronizeSpellbooks(start.spellbooks, characters, start.spellTemplates),
    effectTemplates: start.effectTemplates,
    enemyTemplates: start.enemyTemplates,
    disabledContentTemplateIds: createEmptyDisabledContentTemplateIds(),
    contentAuditLog: [],
    combat: createEmptyCombatScene(),
    combatNarrationQueue: [],
    aiApiTraces: [],
    campaignStartSnapshot: start,
    narrativeScene: normalizeNarrativeScene(start.narrativeScene, start.campaign),
    characterDerivedScores: createCharacterDerivedScores(
      characters,
      itemInstances,
      itemTemplates,
      start.effectTemplates,
    ),
  };
}

function hasConflictingTemplateIds<T extends { id: string }>(additions: T[], existing: T[]): boolean {
  return additions.some((template) => {
    const current = existing.find((candidate) => candidate.id === template.id);
    return current !== undefined && JSON.stringify(current) !== JSON.stringify(template);
  });
}

function normalizePendingActionIntents(value: unknown): ChatActionIntent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const intent = entry as ChatActionIntent & { targetingV2?: unknown };
    if (
      typeof intent.id !== "string" ||
      typeof intent.kind !== "string" ||
      typeof intent.targetId !== "string" ||
      typeof intent.label !== "string"
    ) {
      return [];
    }

    const {
      targeting: persistedTargeting,
      targetingV2: legacyTargeting,
      ...intentWithoutLegacyTargeting
    } = intent;
    const targeting = normalizeActionTargeting(persistedTargeting ?? legacyTargeting);

    return [{
      ...intentWithoutLegacyTargeting,
      ...(targeting ? { targeting } : {}),
    }];
  });
}

function normalizePersistedState(persistedState: unknown): ReturnType<typeof createInitialState> {
  const initialState = createInitialState();

  if (!persistedState || typeof persistedState !== "object") {
    return initialState;
  }

  const candidate = persistedState as Partial<GameState>;
  if (candidate.campaign?.id === "campaign-marches-argelune") {
    return {
      ...initialState,
      uiSettings: normalizeUiSettings(candidate.uiSettings, initialState.uiSettings),
      aiApiTraces: normalizeAiApiTraces(candidate.aiApiTraces),
    };
  }
  const hasCurrentCharacterModel =
    Array.isArray(candidate.characters) &&
    candidate.characters.every(
      (character) =>
        character &&
        typeof character.id === "string" &&
        "espece" in character &&
        "classe" in character &&
        "pv" in character &&
        "maxPv" in character,
    );

  if (!hasCurrentCharacterModel) {
    return {
      ...initialState,
      messages: Array.isArray(candidate.messages)
        ? candidate.messages.filter((message) => !isLegacyTechnicalCombatMessage(message))
        : initialState.messages,
      narrativeMomentum: normalizeNarrativeMomentum(candidate.narrativeMomentum),
      pendingGameDecision: normalizePendingGameDecision(candidate.pendingGameDecision),
      pendingActionIntents: normalizePendingActionIntents(candidate.pendingActionIntents),
      diceRolls: Array.isArray(candidate.diceRolls) ? candidate.diceRolls : [],
      playerCheckRequests: normalizePlayerCheckRequests(candidate.playerCheckRequests),
      characterPortraits:
        candidate.characterPortraits && typeof candidate.characterPortraits === "object"
          ? candidate.characterPortraits
          : {},
      uiSettings: normalizeUiSettings(candidate.uiSettings, initialState.uiSettings),
      itemTemplates: Array.isArray(candidate.itemTemplates)
        ? mergeItemTemplates(candidate.itemTemplates, initialState.itemTemplates)
        : initialState.itemTemplates,
      itemInstances: Array.isArray(candidate.itemInstances)
        ? migrateDeprecatedItemInstances(
            mergeById(candidate.itemInstances, initialState.itemInstances),
            Array.isArray(candidate.itemTemplates) ? candidate.itemTemplates : [],
          )
        : initialState.itemInstances,
      abilityTemplates: Array.isArray(candidate.abilityTemplates)
        ? mergeAbilityTemplates(candidate.abilityTemplates, initialState.abilityTemplates)
        : initialState.abilityTemplates,
      abilityInstances: Array.isArray(candidate.abilityInstances)
        ? mergeById(candidate.abilityInstances, initialState.abilityInstances)
        : initialState.abilityInstances,
      gameActionTemplates: Array.isArray(candidate.gameActionTemplates)
        ? mergeBuiltInCatalog(candidate.gameActionTemplates, initialState.gameActionTemplates)
        : initialState.gameActionTemplates,
      spellTemplates: Array.isArray(candidate.spellTemplates)
        ? mergeBuiltInCatalog(candidate.spellTemplates, initialState.spellTemplates)
        : initialState.spellTemplates,
      spellbooks: initialState.spellbooks,
      effectTemplates: Array.isArray(candidate.effectTemplates)
        ? mergeBuiltInCatalog(candidate.effectTemplates, initialState.effectTemplates)
        : initialState.effectTemplates,
      enemyTemplates: Array.isArray(candidate.enemyTemplates)
        ? mergeBuiltInCatalog(candidate.enemyTemplates, initialState.enemyTemplates)
        : initialState.enemyTemplates,
      disabledContentTemplateIds: normalizeDisabledContentTemplateIds(candidate.disabledContentTemplateIds),
      contentAuditLog: normalizeContentAuditLog(candidate.contentAuditLog),
      combat: normalizeCombatScene(candidate.combat, initialState.combat),
      combatNarrationQueue: normalizeCombatNarrationQueue(candidate.combatNarrationQueue),
      aiApiTraces: normalizeAiApiTraces(candidate.aiApiTraces),
      campaignStartSnapshot: initialState.campaignStartSnapshot,
      characterDerivedScores: createCharacterDerivedScores(
        initialState.characters,
        Array.isArray(candidate.itemInstances)
          ? migrateDeprecatedItemInstances(
              mergeById(candidate.itemInstances, initialState.itemInstances),
              Array.isArray(candidate.itemTemplates) ? candidate.itemTemplates : [],
            )
          : initialState.itemInstances,
        Array.isArray(candidate.itemTemplates)
          ? mergeItemTemplates(candidate.itemTemplates, initialState.itemTemplates)
          : initialState.itemTemplates,
        Array.isArray(candidate.effectTemplates)
          ? mergeBuiltInCatalog(candidate.effectTemplates, initialState.effectTemplates)
          : initialState.effectTemplates,
      ),
    };
  }

  const campaignSource = candidate.campaign ?? initialState.campaign;
  const characters = (candidate.characters ?? initialState.characters).map((character) => ({
    ...character,
    campaignId: campaignSource.id,
    perception: normalizeCharacterPerception(character.perception),
  }));
  const selectedCharacterExists = characters.some(
    (character) => character.id === candidate.selectedCharacterId,
  );
  const persistedItemTemplates = Array.isArray(candidate.itemTemplates)
    ? candidate.itemTemplates
    : [];
  const itemTemplates = persistedItemTemplates.length
    ? mergeItemTemplates(persistedItemTemplates, initialState.itemTemplates)
    : initialState.itemTemplates;
  const itemInstances = migrateDeprecatedItemInstances(
    Array.isArray(candidate.itemInstances)
      ? mergeById(candidate.itemInstances, initialState.itemInstances)
      : initialState.itemInstances,
    persistedItemTemplates,
  );
  const selectedCharacterId = selectedCharacterExists
    ? candidate.selectedCharacterId ?? initialState.selectedCharacterId
    : characters[0]?.id ?? initialState.selectedCharacterId;
  const campaign = {
    ...campaignSource,
    characters,
  };
  const abilityTemplates = Array.isArray(candidate.abilityTemplates)
    ? mergeAbilityTemplates(candidate.abilityTemplates, initialState.abilityTemplates)
    : initialState.abilityTemplates;
  const abilityInstances = Array.isArray(candidate.abilityInstances)
    ? mergeById(candidate.abilityInstances, initialState.abilityInstances)
    : initialState.abilityInstances;
  const gameActionTemplates = Array.isArray(candidate.gameActionTemplates)
    ? mergeBuiltInCatalog(candidate.gameActionTemplates, initialState.gameActionTemplates)
    : initialState.gameActionTemplates;
  const spellTemplates = Array.isArray(candidate.spellTemplates)
    ? mergeBuiltInCatalog(candidate.spellTemplates, initialState.spellTemplates)
    : initialState.spellTemplates;
  const spellbooks = synchronizeSpellbooks(
    Array.isArray(candidate.spellbooks) ? candidate.spellbooks : [],
    characters,
    spellTemplates,
  );
  const effectTemplates = Array.isArray(candidate.effectTemplates)
    ? mergeBuiltInCatalog(candidate.effectTemplates, initialState.effectTemplates)
    : initialState.effectTemplates;
  const enemyTemplates = Array.isArray(candidate.enemyTemplates)
    ? mergeBuiltInCatalog(candidate.enemyTemplates, initialState.enemyTemplates)
    : initialState.enemyTemplates;
  const narrativeScene = normalizeNarrativeScene(candidate.narrativeScene, campaign);
  const gameEvents = normalizeGameEvents(candidate.gameEvents, campaign.id);
  const gameRevision = normalizeGameRevision(candidate.gameRevision, gameEvents);
  const normalizedCampaignStartSnapshot = normalizeCampaignStartSnapshot(candidate.campaignStartSnapshot);
  const campaignStartSnapshot = normalizedCampaignStartSnapshot
    ? createCampaignStartSnapshot({
        ...cloneCampaignStartSnapshot(normalizedCampaignStartSnapshot),
        itemTemplates: mergeItemTemplates(
          normalizedCampaignStartSnapshot.itemTemplates,
          initialState.itemTemplates,
        ),
        itemInstances: migrateDeprecatedItemInstances(
          normalizedCampaignStartSnapshot.itemInstances,
          normalizedCampaignStartSnapshot.itemTemplates,
        ),
        abilityTemplates: mergeAbilityTemplates(
          normalizedCampaignStartSnapshot.abilityTemplates,
          initialState.abilityTemplates,
        ),
        gameActionTemplates: mergeBuiltInCatalog(
          normalizedCampaignStartSnapshot.gameActionTemplates,
          initialState.gameActionTemplates,
        ),
        spellTemplates: mergeBuiltInCatalog(
          normalizedCampaignStartSnapshot.spellTemplates,
          initialState.spellTemplates,
        ),
        spellbooks: synchronizeSpellbooks(
          normalizedCampaignStartSnapshot.spellbooks,
          normalizedCampaignStartSnapshot.characters,
          mergeBuiltInCatalog(
            normalizedCampaignStartSnapshot.spellTemplates,
            initialState.spellTemplates,
          ),
        ),
        effectTemplates: mergeBuiltInCatalog(
          normalizedCampaignStartSnapshot.effectTemplates,
          initialState.effectTemplates,
        ),
        enemyTemplates: mergeBuiltInCatalog(
          normalizedCampaignStartSnapshot.enemyTemplates,
          initialState.enemyTemplates,
        ),
      })
    : createCampaignStartSnapshot({
        campaign,
        characters,
        selectedCharacterId,
        openingScene: campaign.world.openingScene
          ?? candidate.messages?.find((message) => message.sender === "gm")?.content
          ?? `Début de ${campaign.name}.`,
        itemTemplates,
        itemInstances,
        abilityTemplates,
        abilityInstances,
        gameActionTemplates,
        spellTemplates,
        spellbooks,
        effectTemplates,
        enemyTemplates,
        narrativeScene,
      });

  return {
    ...initialState,
    gameRevision,
    gameEvents,
    campaign,
    characters,
    selectedCharacterId,
    messages: Array.isArray(candidate.messages)
      ? candidate.messages.filter((message) => !isLegacyTechnicalCombatMessage(message))
      : initialState.messages,
    narrativeMomentum: normalizeNarrativeMomentum(candidate.narrativeMomentum),
    pendingGameDecision: normalizePendingGameDecision(candidate.pendingGameDecision),
    pendingActionIntents: normalizePendingActionIntents(candidate.pendingActionIntents),
    diceRolls: Array.isArray(candidate.diceRolls) ? candidate.diceRolls : [],
    playerCheckRequests: normalizePlayerCheckRequests(candidate.playerCheckRequests),
    characterPortraits:
      candidate.characterPortraits && typeof candidate.characterPortraits === "object"
        ? candidate.characterPortraits
        : {},
    uiSettings: normalizeUiSettings(candidate.uiSettings, initialState.uiSettings),
    itemTemplates,
    itemInstances,
    abilityTemplates,
    abilityInstances,
    gameActionTemplates,
    spellTemplates,
    spellbooks,
    effectTemplates,
    enemyTemplates,
    disabledContentTemplateIds: normalizeDisabledContentTemplateIds(candidate.disabledContentTemplateIds),
    contentAuditLog: normalizeContentAuditLog(candidate.contentAuditLog),
    combat: normalizeCombatScene(candidate.combat, initialState.combat),
    combatNarrationQueue: normalizeCombatNarrationQueue(candidate.combatNarrationQueue),
    aiApiTraces: normalizeAiApiTraces(candidate.aiApiTraces),
    campaignStartSnapshot,
    narrativeScene,
    characterDerivedScores: createCharacterDerivedScores(
      characters,
      itemInstances,
      itemTemplates,
      effectTemplates,
    ),
  };
}

function normalizeGameEvents(value: unknown, campaignId: string): GameEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is GameEvent => {
    if (!candidate || typeof candidate !== "object") return false;
    const event = candidate as Partial<GameEvent>;
    return event.protocolVersion === 1 &&
      typeof event.id === "string" &&
      typeof event.commandId === "string" &&
      event.campaignId === campaignId &&
      typeof event.actorId === "string" &&
      Number.isInteger(event.revision) &&
      Number(event.revision) >= 0 &&
      Number.isFinite(event.occurredAt) &&
      typeof event.type === "string";
  }).slice(-200);
}

function normalizeGameRevision(value: unknown, events: GameEvent[]): number {
  const persistedRevision = typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
  return events.reduce((maximum, event) => Math.max(maximum, event.revision), persistedRevision);
}

function normalizePlayerCheckRequests(value: unknown): PlayerCheckRequest[] {
  if (!Array.isArray(value)) return [];

  const stats = new Set<keyof CharacterStats>([
    "force",
    "dexterite",
    "constitution",
    "intelligence",
    "sagesse",
    "charisme",
  ]);
  const difficulties = new Set(["routine", "plausible", "difficult", "extreme", "legendary"]);
  const visibilities = new Set<DiceVisibility>(["public", "gmOnly", "hidden", "summary"]);

  return value.flatMap((candidate): PlayerCheckRequest[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const request = candidate as Partial<PlayerCheckRequest>;
    if (
      typeof request.id !== "string" ||
      typeof request.characterId !== "string" ||
      typeof request.action !== "string" ||
      !stats.has(request.stat as keyof CharacterStats) ||
      !Number.isFinite(request.modifierPreview) ||
      !Number.isFinite(request.dc) ||
      !difficulties.has(String(request.difficulty)) ||
      !visibilities.has(request.visibility as DiceVisibility) ||
      !Number.isFinite(request.createdAt) ||
      !["pending", "resolved", "cancelled"].includes(String(request.status))
    ) {
      return [];
    }

    const costs = Array.isArray(request.costs)
      ? request.costs.filter((cost) =>
          Boolean(cost) &&
          typeof cost.itemId === "string" &&
          Number.isFinite(cost.quantity) &&
          cost.quantity > 0)
      : [];

    return [{
      ...request,
      action: request.action.trim(),
      modifierPreview: Math.round(request.modifierPreview as number),
      dc: Math.max(5, Math.min(35, Math.round(request.dc as number))),
      costs,
    } as PlayerCheckRequest];
  }).slice(-30);
}

function normalizeDisabledContentTemplateIds(value: unknown): DisabledContentTemplateIds {
  const fallback = createEmptyDisabledContentTemplateIds();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<Record<ContentTemplateKind, unknown>>;
  const normalizeIds = (ids: unknown) => Array.isArray(ids)
    ? [...new Set(ids.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))]
    : [];
  return {
    effect: normalizeIds(candidate.effect),
    ability: normalizeIds(candidate.ability),
    item: normalizeIds(candidate.item),
    enemy: normalizeIds(candidate.enemy),
  };
}

function normalizeContentAuditLog(value: unknown): ContentAuditEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ContentAuditEntry => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as Partial<ContentAuditEntry>;
    return typeof candidate.id === "string" &&
      typeof candidate.timestamp === "number" &&
      typeof candidate.templateId === "string" &&
      typeof candidate.templateName === "string" &&
      (candidate.kind === "effect" || candidate.kind === "ability" || candidate.kind === "item" || candidate.kind === "enemy") &&
      (candidate.source === "ai" || candidate.source === "admin" || candidate.source === "system") &&
      (candidate.action === "create" || candidate.action === "replace" || candidate.action === "duplicate" ||
        candidate.action === "activate" || candidate.action === "deactivate" || candidate.action === "delete" ||
        candidate.action === "restore");
  }).slice(0, 100);
}

function normalizeAiApiTraces(value: unknown): AiApiTrace[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((trace): trace is AiApiTrace =>
    trace &&
    typeof trace === "object" &&
    typeof trace.id === "string" &&
    typeof trace.agentId === "string" &&
    typeof trace.timestamp === "number" &&
    typeof trace.durationMs === "number" &&
    typeof trace.status === "number" &&
    typeof trace.prompt === "string" &&
    typeof trace.response === "string",
  ).map((trace) => {
    const candidate = trace as AiApiTrace;
    const usage = candidate.tokenUsage;
    return {
      ...candidate,
      ...(usage && typeof usage.inputTokens === "number" && typeof usage.outputTokens === "number" && typeof usage.totalTokens === "number"
        ? { tokenUsage: usage }
        : { tokenUsage: undefined }),
    };
  }).slice(0, 30);
}

function normalizePendingGameDecision(value: unknown): PendingGameDecision | null {
  if (!value || typeof value !== "object") return null;
  const decision = value as Partial<PendingGameDecision>;

  return typeof decision.id === "string" &&
    typeof decision.originalInput === "string" &&
    typeof decision.question === "string" &&
    typeof decision.createdAt === "number"
    ? {
        id: decision.id,
        originalInput: decision.originalInput,
        question: decision.question,
        createdAt: decision.createdAt,
      }
    : null;
}

function createInitialNarrativeMomentum(): NarrativeMomentum {
  return { offTrackActions: 0, guidance: "none", updatedAt: 0 };
}

function normalizeNarrativeMomentum(value: unknown): NarrativeMomentum {
  if (!value || typeof value !== "object") return createInitialNarrativeMomentum();
  const momentum = value as Partial<NarrativeMomentum>;
  const guidance = momentum.guidance === "subtle" || momentum.guidance === "clear" || momentum.guidance === "consequence"
    ? momentum.guidance
    : "none";

  return {
    activeHookId: typeof momentum.activeHookId === "string" ? momentum.activeHookId : undefined,
    offTrackActions: typeof momentum.offTrackActions === "number"
      ? Math.max(0, Math.min(6, Math.round(momentum.offTrackActions)))
      : 0,
    guidance,
    updatedAt: typeof momentum.updatedAt === "number" ? momentum.updatedAt : 0,
  };
}

function normalizeCombatScene(
  combat: CombatScene | undefined,
  fallback: CombatScene,
): CombatScene {
  if (!combat || typeof combat !== "object" || !Array.isArray(combat.combatants)) {
    return fallback;
  }

  return {
    ...fallback,
    ...combat,
    map: {
      ...fallback.map,
      ...(combat.map ?? {}),
      obstacles: Array.isArray(combat.map?.obstacles) ? combat.map.obstacles : fallback.map.obstacles,
      elements: Array.isArray(combat.map?.elements)
        ? mergeCombatMapElements(combat.map.elements, fallback.map.elements)
        : fallback.map.elements,
      details: Array.isArray(combat.map?.details)
        ? mergeById(combat.map.details, fallback.map.details ?? [])
        : fallback.map.details,
    },
    combatants: mergeCombatants(combat.combatants, fallback.combatants).map(normalizeCombatant),
    log: Array.isArray(combat.log) ? combat.log : [],
  };
}

function mergeCombatMapElements(
  currentElements: CombatScene["map"]["elements"],
  defaultElements: CombatScene["map"]["elements"],
): CombatScene["map"]["elements"] {
  const deprecatedElementIds = new Set([
    "element-shadow-over-oil",
    "element-cracked-sanctum-floor",
    "element-explosive-barrel",
  ]);
  const forcedDefaultGeometryIds = new Set(["element-acid-puddle"]);
  const forcedDefaultEffectIds = new Set(["element-caltrops"]);
  const currentById = new Map(currentElements.map((element) => [element.id, element]));
  const defaultIds = new Set(defaultElements.map((element) => element.id));
  const mergedDefaults = defaultElements.map((defaultElement) => {
    const currentElement = currentById.get(defaultElement.id);

    if (!currentElement) {
      return defaultElement;
    }

    const mergedElement = {
      ...defaultElement,
      ...currentElement,
      cells: Array.isArray(currentElement.cells) && currentElement.cells.length > 0
        ? currentElement.cells
        : defaultElement.cells,
      effects: Array.isArray(currentElement.effects) && currentElement.effects.length > 0
        ? currentElement.effects
        : defaultElement.effects,
      state: {
        ...(defaultElement.state ?? {}),
        ...(currentElement.state ?? {}),
      },
    };
    const mergedWithEffects = forcedDefaultEffectIds.has(defaultElement.id)
      ? {
          ...mergedElement,
          effects: defaultElement.effects,
        }
      : mergedElement;

    return forcedDefaultGeometryIds.has(defaultElement.id)
      ? {
          ...mergedWithEffects,
          x: defaultElement.x,
          y: defaultElement.y,
          width: defaultElement.width,
          height: defaultElement.height,
          cells: defaultElement.cells,
        }
      : mergedWithEffects;
  });
  const customElements = currentElements.filter(
    (element) => !defaultIds.has(element.id) && !deprecatedElementIds.has(element.id),
  );

  return [...mergedDefaults, ...customElements];
}

function normalizeCombatant(combatant: Combatant): Combatant {
  return {
    ...combatant,
    reach: typeof combatant.reach === "number" ? combatant.reach : 1.5,
    resources: {
      ...getDefaultCombatResources(combatant.speed),
      ...(combatant.resources ?? {}),
      disengaged: typeof combatant.resources?.disengaged === "boolean"
        ? combatant.resources.disengaged
        : false,
    },
  };
}

function normalizeUiSettings(
  settings: Partial<UiSettings> | undefined,
  fallback: UiSettings,
): UiSettings {
  return {
    ...fallback,
    ...(settings && typeof settings === "object" ? settings : {}),
    showItemTags:
      typeof settings?.showItemTags === "boolean" ? settings.showItemTags : fallback.showItemTags,
  };
}

function mergeById<T extends { id: string }>(currentItems: T[], defaultItems: T[]): T[] {
  const currentIds = new Set(currentItems.map((item) => item.id));
  const missingDefaults = defaultItems.filter((item) => !currentIds.has(item.id));

  return [...currentItems, ...missingDefaults];
}

function mergeBuiltInCatalog<T extends { id: string }>(currentItems: T[], defaultItems: T[]): T[] {
  const defaultIds = new Set(defaultItems.map((item) => item.id));
  const customItems = currentItems.filter((item) => !defaultIds.has(item.id));
  return [...defaultItems, ...customItems];
}

function migrateDeprecatedItemInstances(
  instances: ItemInstance[],
  legacyTemplates: ItemTemplate[],
): ItemInstance[] {
  const legacyById = new Map(legacyTemplates.map((template) => [template.id, template]));
  const deprecatedIds = new Set(Object.keys(deprecatedBuiltInItemTemplateReplacements));

  return instances.map((instance) => {
    const replacementTemplateId = deprecatedBuiltInItemTemplateReplacements[instance.templateId];
    if (!replacementTemplateId) return instance;

    const legacyTemplate = legacyById.get(instance.templateId);
    const inheritedEffects = (legacyTemplate?.effects ?? []).filter((effect) => {
      if (effect.effectId !== "inventoryInteraction") return true;
      const requiredId = effect.variables?.requiredTemplateId;
      const addedId = effect.variables?.addTemplateId;
      return !(typeof requiredId === "string" && deprecatedIds.has(requiredId))
        && !(typeof addedId === "string" && deprecatedIds.has(addedId));
    });

    return {
      ...instance,
      templateId: replacementTemplateId,
      overrides: {
        ...(legacyTemplate?.name ? { name: legacyTemplate.name } : {}),
        ...(legacyTemplate?.description ? { description: legacyTemplate.description } : {}),
        ...instance.overrides,
      },
      effects: [...inheritedEffects, ...instance.effects],
    };
  });
}

function upsertCatalogEntry<T extends { id: string }>(
  entries: T[],
  entry: T,
  mode: "create" | "replace" = "create",
): T[] | null {
  const index = entries.findIndex((candidate) => candidate.id === entry.id);

  if (index >= 0 && mode === "create") return null;
  if (index < 0) return [...entries, entry];

  return entries.map((candidate, candidateIndex) =>
    candidateIndex === index ? entry : candidate);
}

function getContentTemplateFromState(
  state: Pick<GameDataState, "effectTemplates" | "abilityTemplates" | "itemTemplates" | "enemyTemplates">,
  kind: ContentTemplateKind,
  templateId: string,
): ContentTemplate | undefined {
  if (kind === "effect") return state.effectTemplates.find((template) => template.id === templateId);
  if (kind === "ability") return state.abilityTemplates.find((template) => template.id === templateId);
  if (kind === "item") return state.itemTemplates.find((template) => template.id === templateId);
  return state.enemyTemplates.find((template) => template.id === templateId);
}

function createContentAuditEntry(
  kind: ContentTemplateKind,
  action: ContentAuditEntry["action"],
  template: ContentTemplate,
  options: {
    source?: ContentAuditEntry["source"];
    before?: ContentTemplate;
    after?: ContentTemplate;
    note?: string;
    name?: string;
  } = {},
): ContentAuditEntry {
  return {
    id: `content-audit-${crypto.randomUUID()}`,
    timestamp: Date.now(),
    source: options.source ?? "system",
    action,
    kind,
    templateId: template.id,
    templateName: options.name ?? ("name" in template ? String(template.name) : template.id),
    ...(options.before ? { before: cloneContentTemplate(options.before) } : {}),
    ...(options.after ? { after: cloneContentTemplate(options.after) } : {}),
    ...(options.note ? { note: options.note } : {}),
  };
}

function appendContentAuditEntry(entries: ContentAuditEntry[], entry: ContentAuditEntry): ContentAuditEntry[] {
  return [entry, ...entries].slice(0, 100);
}

function createContentDependencyContext(state: GameDataState) {
  return {
    effectTemplates: state.effectTemplates,
    abilityTemplates: state.abilityTemplates,
    gameActionTemplates: state.gameActionTemplates,
    itemTemplates: state.itemTemplates,
    enemyTemplates: state.enemyTemplates,
    itemInstances: state.itemInstances,
    abilityInstances: state.abilityInstances,
    combat: state.combat,
    worldEntities: [
      ...state.campaign.world.entities.npcs,
      ...state.campaign.world.entities.locations,
      ...state.campaign.world.entities.items,
    ],
  };
}

function mergeCombatants(currentCombatants: Combatant[], defaultCombatants: Combatant[]): Combatant[] {
  const deprecatedCombatantIds = new Set<string>();
  const currentIds = new Set(currentCombatants.map((combatant) => combatant.id));
  const missingDefaults = defaultCombatants.filter((combatant) => !currentIds.has(combatant.id));

  return [
    ...currentCombatants.filter((combatant) => !deprecatedCombatantIds.has(combatant.id)),
    ...missingDefaults,
  ];
}

function mergeItemTemplates(
  currentTemplates: ItemTemplate[],
  defaultTemplates: ItemTemplate[],
): ItemTemplate[] {
  const mergedTemplates = currentTemplates
    .filter((template) => !(template.id in deprecatedBuiltInItemTemplateReplacements))
    .map((template) => {
    const defaultTemplate = defaultTemplates.find((item) => item.id === template.id);
    const normalizedTemplate = normalizeItemTemplateModules(template);

    if (!defaultTemplate) {
      return normalizedTemplate;
    }

    const currentModules = normalizedTemplate.modules;
    const defaultModules = normalizeItemTemplateModules(defaultTemplate).modules;

    return {
      ...normalizedTemplate,
      type: defaultTemplate.type,
      types: defaultTemplate.types,
      tags: defaultTemplate.tags,
      name: defaultTemplate.name,
      description: defaultTemplate.description,
      rarity: defaultTemplate.rarity,
      requiresAttunement: defaultTemplate.requiresAttunement,
      aliases: defaultTemplate.aliases ?? template.aliases,
      base: defaultTemplate.base,
      effects: defaultTemplate.effects,
      attacks: defaultTemplate.attacks,
      attackModifiers: defaultTemplate.attackModifiers,
      targeting: defaultTemplate.targeting,
      modules: {
        ...defaultModules,
        ...currentModules,
        item: {
          ...currentModules.item,
          ...defaultModules.item,
        },
      },
    };
    });

  return mergeById(mergedTemplates, defaultTemplates);
}

function mergeAbilityTemplates(
  currentTemplates: AbilityTemplate[],
  defaultTemplates: AbilityTemplate[],
): AbilityTemplate[] {
  return mergeBuiltInCatalog(
    currentTemplates.filter((template) => typeof template.actionId === "string"),
    defaultTemplates,
  );
}

function normalizeItemTemplateModules(template: ItemTemplate): ItemTemplate {
  const source = template as ItemTemplate & { targetingV2?: unknown };
  const {
    targeting: persistedTargeting,
    targetingV2: legacyTargeting,
    ...templateWithoutLegacyTargeting
  } = source;
  const { equipment: _equipment, ...modules } = source.modules;
  const { role: _role, roles: _roles, ...item } = modules.item ?? {};
  const normalizedTypes = getTemplateTypes(source);
  const normalizedTags = getTemplateMetadataTags(source, normalizedTypes);
  const targeting = normalizeActionTargeting(persistedTargeting ?? legacyTargeting);
  const attacks = source.attacks?.map((attack) => {
    const attackSource = attack as typeof attack & { targetingV2?: unknown };
    const {
      targeting: persistedAttackTargeting,
      targetingV2: legacyAttackTargeting,
      ...attackWithoutLegacyTargeting
    } = attackSource;
    const attackTargeting = normalizeActionTargeting(persistedAttackTargeting ?? legacyAttackTargeting);

    return {
      ...attackWithoutLegacyTargeting,
      ...(attackTargeting ? { targeting: attackTargeting } : {}),
    };
  });

  return {
    ...templateWithoutLegacyTargeting,
    rarity: normalizeItemRarity(source.rarity),
    types: normalizedTypes,
    tags: normalizedTags,
    ...(attacks ? { attacks } : {}),
    ...(targeting ? { targeting } : {}),
    modules: {
      ...modules,
      item,
    },
  };
}

function createMessage(
  sender: Message["sender"],
  content: string,
  actions: ChatActionIntent[] = [],
  actionReceipt?: GameActionReceipt,
  author?: Pick<Message, "authorId" | "authorName" | "authorColor" | "characterId" | "spokenContent" | "communication">,
): Message {
  return {
    id: `message-${crypto.randomUUID()}`,
    sender,
    content,
    timestamp: Date.now(),
    ...author,
    ...(actions.length > 0 ? { actions } : {}),
    ...(actionReceipt ? { actionReceipt } : {}),
  };
}

function createActionIntent(
  kind: ChatActionIntentKind,
  targetId: string,
  label: string,
  targeting: ActionTargeting | undefined,
  target: ActionTarget | undefined,
  spellLevel?: SpellLevel,
): ChatActionIntent {
  return {
    id: `intent-${crypto.randomUUID()}`,
    kind,
    targetId,
    label,
    command: `${kind} ${targetId}${spellLevel === undefined ? "" : ` ${spellLevel}`}`,
    ...(targeting ? { targeting } : {}),
    ...(target ? { target } : {}),
    ...(spellLevel === undefined ? {} : { spellLevel }),
    createdAt: Date.now(),
  };
}

function createSelfTargeting(required = false): ActionTargeting {
  return {
    aim: { allowed: ["self"], required, range: 0, lineOfSight: false },
    area: { shape: "none" },
    affects: { allowed: ["self"], maxTargets: 1 },
    defaultPriority: ["self"],
    suggestedSides: ["self"],
  };
}

function createAttackTargeting(range: number | string): ActionTargeting {
  return {
    aim: { allowed: ["entity", "position"], required: true, range, lineOfSight: true },
    area: { shape: "none" },
    affects: { allowed: ["living", "object"], maxTargets: 1, includeSelf: false },
    defaultPriority: ["nearestEnemy"],
    suggestedSides: ["enemy"],
  };
}

function getActionTargeting(
  state: GameDataState,
  kind: ChatActionIntentKind,
  targetId: string,
): ActionTargeting | undefined {
  if (kind === "useItem") {
    const item = state.itemInstances.find((candidate) => candidate.id === targetId);
    const template = item
      ? state.itemTemplates.find((candidate) => candidate.id === item.templateId)
      : undefined;

    return template?.targeting ?? createSelfTargeting(false);
  }

  if (kind === "attack") {
    const weapon = getEquippedWeaponData(
      state.itemInstances,
      state.itemTemplates,
      state.selectedCharacterId,
      targetId,
    );

    return weapon?.targeting ?? (weapon ? createAttackTargeting(weapon.range) : undefined);
  }

  if (kind === "castSpell") {
    const spell = state.spellTemplates.find((candidate) => candidate.id === targetId);
    return getGameActionTemplate(state.gameActionTemplates, spell?.actionId)?.targeting;
  }

  const ability = state.abilityInstances.find((candidate) => candidate.id === targetId);
  const template = ability
    ? getAbilityTemplate(state.abilityTemplates, ability.templateId)
    : undefined;

  return getGameActionTemplate(state.gameActionTemplates, template?.actionId)?.targeting;
}

function createSelfTarget(state: GameDataState): ActionTarget | undefined {
  const character = state.characters.find((candidate) => candidate.id === state.selectedCharacterId);

  return character
    ? { kind: "self", id: character.id, label: character.name, source: "default" }
    : undefined;
}

function createNearestEnemyTarget(state: GameDataState): ActionTarget | undefined {
  const npc = state.campaign.world.entities.npcs[0];

  return npc
    ? { kind: "entity", id: npc.id, label: npc.name, source: "default" }
    : undefined;
}

function createFallbackPositionTarget(): ActionTarget {
  return {
    kind: "position",
    id: "position:farthest-point-ahead",
    label: "Position libre",
    source: "default",
  };
}

function createDefaultActionTarget(
  state: GameDataState,
  targeting: ActionTargeting | undefined,
  intent?: Pick<ChatActionIntent, "kind" | "targetId" | "targeting">,
): ActionTarget | undefined {
  const allowed = getSelectableTargetKinds(targeting);

  if (!targeting || allowed.length === 0) {
    return undefined;
  }

  const actor = state.combat.combatants.find(
    (combatant) =>
      combatant.sourceType === "character" && combatant.sourceId === state.selectedCharacterId,
  );

  if (state.combat.status === "active" && actor && intent) {
    const priorities = targeting.defaultPriority ?? ["self"];

    if (priorities.includes("self") && allowed.includes("self")) {
      const target = createSelfTarget(state);

      if (target) {
        return target;
      }
    }

    const candidates = state.combat.combatants
      .filter((combatant) => {
        if (combatant.id === actor.id) {
          return (
            allowed.includes("self") &&
            isSuggestedCombatant(actor, combatant, targeting)
          );
        }

        if (!isSuggestedCombatant(actor, combatant, targeting)) {
          return false;
        }

        if (combatant.sourceType === "character") {
          return allowed.includes("character") && canAffectCombatant(actor, combatant, targeting);
        }

        if (combatant.sourceType === "entity" || combatant.sourceType === "hazard") {
          return allowed.includes("entity") && canAffectCombatant(actor, combatant, targeting);
        }

        return false;
      })
      .map((combatant) => ({
        combatant,
        distance: getDistance(actor.position, combatant.position),
        valid: !resolveActionTargets({
          actor,
          combat: state.combat,
          fallbackCharacterId: state.selectedCharacterId,
          targeting,
          target: {
            kind: combatant.sourceType === "character" ? "character" : combatant.id === actor.id ? "self" : "entity",
            id: combatant.sourceId,
            label: combatant.name,
          },
        }).invalidReason,
      }))
      .filter((candidate) => candidate.valid)
      .sort((a, b) => {
        const aEnemy = a.combatant.side === "enemies" ? 0 : 1;
        const bEnemy = b.combatant.side === "enemies" ? 0 : 1;

        return aEnemy - bEnemy || a.distance - b.distance;
      });

    const best = candidates[0]?.combatant;

    if (best) {
      if (best.id === actor.id) {
        return { kind: "self", id: best.sourceId, label: best.name, source: "default" };
      }

      return {
        kind: best.sourceType === "character" ? "character" : "entity",
        id: best.sourceId,
        label: best.name,
        source: "default",
      };
    }
  }

  const priorities = targeting.defaultPriority ?? ["self"];

  for (const priority of priorities) {
    if (priority === "self" && allowed.includes("self")) {
      const target = createSelfTarget(state);

      if (target) {
        return target;
      }
    }

    if (priority === "nearestEnemy" && allowed.includes("entity")) {
      const target = createNearestEnemyTarget(state);

      if (target) {
        return target;
      }
    }

    if (priority === "farthestPointAhead" && allowed.includes("position")) {
      return createFallbackPositionTarget();
    }
  }

  if (allowed.includes("self")) {
    return createSelfTarget(state);
  }

  if (allowed.includes("position")) {
    return createFallbackPositionTarget();
  }

  return undefined;
}

function updateCharacter(
  characters: Character[],
  characterId: string,
  updater: (character: Character) => Character,
): Character[] {
  return characters.map((character) => (character.id === characterId ? updater(character) : character));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function updateItem(
  itemInstances: ItemInstance[],
  itemId: string,
  updater: (item: ItemInstance) => ItemInstance,
): ItemInstance[] {
  return itemInstances.map((item) => (item.id === itemId ? updater(item) : item));
}

function modifyItemInstanceField(
  item: ItemInstance,
  path: string,
  value: string | number | boolean,
): ItemInstance | null {
  const normalizedPath = path.trim();

  if (normalizedPath === "quantity") {
    return typeof value === "number" && Number.isFinite(value) && value >= 1
      ? { ...item, quantity: Math.round(value) }
      : null;
  }

  if (normalizedPath === "name" || normalizedPath === "description" || normalizedPath.startsWith("base.")) {
    return {
      ...item,
      overrides: { ...item.overrides, [normalizedPath]: value },
    };
  }

  const [root, ...segments] = normalizedPath.split(".");
  const attribute = segments.join(".");
  if (!attribute || (root !== "overrides" && root !== "current" && root !== "data")) return null;

  return {
    ...item,
    [root]: { ...item[root], [attribute]: value },
  };
}

function updateAbility(
  abilityInstances: AbilityInstance[],
  abilityId: string,
  updater: (ability: AbilityInstance) => AbilityInstance,
): AbilityInstance[] {
  return abilityInstances.map((ability) => (ability.id === abilityId ? updater(ability) : ability));
}

function updateSpellbook(
  spellbooks: CharacterSpellbook[],
  characterId: string,
  updater: (book: CharacterSpellbook) => CharacterSpellbook,
): CharacterSpellbook[] {
  return spellbooks.map((book) => book.characterId === characterId ? updater(book) : book);
}

function getAbilityTemplate(
  abilityTemplates: AbilityTemplate[],
  templateId: string,
): AbilityTemplate | undefined {
  return abilityTemplates.find((template) => template.id === templateId);
}

function rechargeCharacterAbilities(
  abilityInstances: AbilityInstance[],
  abilityTemplates: AbilityTemplate[],
  characterId: string,
  trigger: AbilityRechargeTrigger,
): AbilityInstance[] {
  return abilityInstances.map((ability) => {
    if (ability.ownerId !== characterId) {
      return ability;
    }

    return rechargeAbilityCharge(ability, getAbilityTemplate(abilityTemplates, ability.templateId), trigger);
  });
}

function getEffectNumber(value: number | string | boolean | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getEffectString(value: number | string | boolean | undefined, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function createValueExpressionContext(
  character: Character,
  itemInstances: ItemInstance[] = [],
  itemTemplates: ItemTemplate[] = [],
  effectTemplates: EffectTemplate[] = [],
): ValueExpressionContext {
  const stats = { ...character.stats };

  getEquippedEffects(itemInstances, itemTemplates, character.id, effectTemplates).forEach((effect) => {
    if (effect.effectId !== "modifyStat") {
      return;
    }

    const stat = effect.variables?.stat;

    if (
      stat !== "force" &&
      stat !== "dexterite" &&
      stat !== "constitution" &&
      stat !== "intelligence" &&
      stat !== "sagesse" &&
      stat !== "charisme"
    ) {
      return;
    }

    stats[stat] += getEffectNumber(effect.variables?.value);
  });

  return {
    level: character.niveau,
    stats,
    modifiers: createStatModifiers(stats),
  };
}

function createStatModifiers(stats: Character["stats"]): Character["stats"] {
  return {
    force: getStatModifier(stats.force),
    dexterite: getStatModifier(stats.dexterite),
    constitution: getStatModifier(stats.constitution),
    intelligence: getStatModifier(stats.intelligence),
    sagesse: getStatModifier(stats.sagesse),
    charisme: getStatModifier(stats.charisme),
  };
}

type DiceFormulaVariableMap = Record<string, number | { value: number; color?: string }>;

function createDiceFormulaVariables(character: Character | undefined): DiceFormulaVariableMap {
  if (!character) {
    return {};
  }

  const modifiers = createStatModifiers(character.stats);

  return {
    FOR: { value: modifiers.force, color: diceStatColors.FOR },
    DEX: { value: modifiers.dexterite, color: diceStatColors.DEX },
    CON: { value: modifiers.constitution, color: diceStatColors.CON },
    INT: { value: modifiers.intelligence, color: diceStatColors.INT },
    SAG: { value: modifiers.sagesse, color: diceStatColors.SAG },
    CHA: { value: modifiers.charisme, color: diceStatColors.CHA },
    NIV: character.niveau,
  };
}

function createDiceFormulaVariablesFromContext(context: ValueExpressionContext): DiceFormulaVariableMap {
  return {
    FOR: { value: context.modifiers.force, color: diceStatColors.FOR },
    DEX: { value: context.modifiers.dexterite, color: diceStatColors.DEX },
    CON: { value: context.modifiers.constitution, color: diceStatColors.CON },
    INT: { value: context.modifiers.intelligence, color: diceStatColors.INT },
    SAG: { value: context.modifiers.sagesse, color: diceStatColors.SAG },
    CHA: { value: context.modifiers.charisme, color: diceStatColors.CHA },
    NIV: context.level,
  };
}

function getProficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

type WeaponAttackKind = "melee" | "ranged" | "magic";

function combineDamageValues(
  baseDamage: number | string | boolean | undefined,
  modifierDamage: number | string | boolean | undefined,
): number | string | undefined {
  return formatDamageFormula([baseDamage, modifierDamage]);
}

function formatDamageFormula(parts: Array<number | string | boolean | undefined>): string | undefined {
  const tokens = parts.flatMap((part) => tokenizeDamageFormula(part));

  if (tokens.length === 0) {
    return undefined;
  }

  const dice = tokens
    .filter((token) => /^\d*d\d+$/i.test(token))
    .sort((a, b) => Number(b.toLowerCase().split("d")[1]) - Number(a.toLowerCase().split("d")[1]));
  const variables = tokens.filter((token) => ["FOR", "DEX", "CON", "INT", "SAG", "CHA", "NIV"].includes(token.toUpperCase()));
  const fixed = tokens
    .filter((token) => !dice.includes(token) && !variables.includes(token) && Number.isFinite(Number(token)))
    .sort((a, b) => Number(a) - Number(b));
  const others = tokens.filter((token) => !dice.includes(token) && !variables.includes(token) && !fixed.includes(token));

  return [...dice, ...variables.map((token) => token.toUpperCase()), ...fixed, ...others].join(" + ");
}

function tokenizeDamageFormula(value: number | string | boolean | undefined): string[] {
  if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
    return [String(value)];
  }

  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  return value
    .replace(/\b(niv|niveau|level|lvl)\b/gi, "NIV")
    .replace(/\b(for|force)\b/gi, "FOR")
    .replace(/\b(dex|dextérité|dexterite)\b/gi, "DEX")
    .replace(/\b(con|constitution)\b/gi, "CON")
    .replace(/\b(int|intelligence)\b/gi, "INT")
    .replace(/\b(sag|sagesse)\b/gi, "SAG")
    .replace(/\b(cha|charisme)\b/gi, "CHA")
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
}

function getDefaultDamageModifier(
  attackKind: WeaponAttackKind,
  weaponTemplate: ItemTemplate,
  context: ValueExpressionContext | null,
): string | undefined {
  if (attackKind !== "melee") {
    return undefined;
  }

  if (!context) {
    return weaponTemplate.tags.includes("finesse") || weaponTemplate.tags.includes("light") ? "DEX" : "FOR";
  }

  if (
    (weaponTemplate.tags.includes("finesse") || weaponTemplate.tags.includes("light")) &&
    context.modifiers.dexterite > context.modifiers.force
  ) {
    return "DEX";
  }

  return "FOR";
}

function createCharacterDerivedScore(
  character: Character,
  itemInstances: ItemInstance[],
  itemTemplates: ItemTemplate[],
  effectTemplates: EffectTemplate[] = [],
): CharacterDerivedScores {
  const context = createValueExpressionContext(
    character,
    itemInstances,
    itemTemplates,
    effectTemplates,
  );
  const proficiencyBonus = getProficiencyBonus(context.level);
  const defense = getEquippedDefense(
    character,
    context.modifiers.dexterite,
    itemInstances,
    itemTemplates,
  );

  return {
    modifiers: context.modifiers,
    proficiencyBonus,
    defense,
    initiative: context.modifiers.dexterite,
    speed: character.espece.toLowerCase().includes("nain") ? 7.5 : 9,
    mana: Math.max(0, context.modifiers.charisme + character.niveau),
    attacks: {
      melee: context.modifiers.force + proficiencyBonus,
      ranged: context.modifiers.dexterite + proficiencyBonus,
      magic: Math.max(context.modifiers.intelligence, context.modifiers.sagesse, context.modifiers.charisme) + proficiencyBonus,
    },
    updatedAt: Date.now(),
  };
}

function getEquippedDefense(
  character: Character,
  dexterityModifier: number,
  itemInstances: ItemInstance[],
  itemTemplates: ItemTemplate[],
): number {
  const equipped = itemInstances.flatMap((item) => {
    if (item.location.type !== "equipped" || item.location.parent !== character.id) return [];
    const template = itemTemplates.find((candidate) => candidate.id === item.templateId);
    return template ? [{ item, template }] : [];
  });
  const armorValues = equipped.flatMap(({ item, template }) => {
    const defenseBase = getItemBaseNumber(item, template, "defenseBase");
    if (defenseBase === null) return [];
    const minDexBonus = getItemBaseNumber(item, template, "minDexBonus") ?? Number.NEGATIVE_INFINITY;
    const maxDexBonus = getItemBaseNumber(item, template, "maxDexBonus") ?? 99;
    const appliedDexterity = Math.max(minDexBonus, Math.min(dexterityModifier, maxDexBonus));
    return [defenseBase + appliedDexterity];
  });
  const bestArmor = armorValues.length > 0
    ? Math.max(...armorValues)
    : 10 + dexterityModifier;
  const bestDefenseBonus = Math.max(0, ...equipped.map(({ item, template }) =>
    getItemBaseNumber(item, template, "defenseBonus") ?? 0));
  return bestArmor + bestDefenseBonus;
}

function getItemBaseNumber(
  item: ItemInstance,
  template: ItemTemplate,
  key: string,
): number | null {
  const value = item.overrides[`base.${key}`] ?? template.base[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function createCharacterDerivedScores(
  characters: Character[],
  itemInstances: ItemInstance[],
  itemTemplates: ItemTemplate[],
  effectTemplates: EffectTemplate[] = [],
): Record<string, CharacterDerivedScores> {
  return Object.fromEntries(
    characters.map((character) => [
      character.id,
      createCharacterDerivedScore(character, itemInstances, itemTemplates, effectTemplates),
    ]),
  );
}

function withCharacterDerivedScores(
  state: Pick<GameState, "characters" | "itemInstances" | "itemTemplates" | "effectTemplates">,
): { characterDerivedScores: Record<string, CharacterDerivedScores> } {
  return {
    characterDerivedScores: createCharacterDerivedScores(
      state.characters,
      state.itemInstances,
      state.itemTemplates,
      state.effectTemplates,
    ),
  };
}

function getCharacterAttackScore(
  scores: Record<string, CharacterDerivedScores>,
  characterId: string | undefined,
  attackKind: WeaponAttackKind,
): number | null {
  return characterId ? scores[characterId]?.attacks[attackKind] ?? null : null;
}

function getWeaponAttackModifier(
  character: Character | undefined,
  itemInstances: ItemInstance[],
  itemTemplates: ItemTemplate[],
  attackKind: WeaponAttackKind,
  effectTemplates: EffectTemplate[] = [],
): number {
  if (!character) {
    return 0;
  }

  const context = createValueExpressionContext(
    character,
    itemInstances,
    itemTemplates,
    effectTemplates,
  );
  const proficiency = getProficiencyBonus(context.level);

  if (attackKind === "ranged") {
    return context.modifiers.dexterite + proficiency;
  }

  if (attackKind === "magic") {
    return Math.max(context.modifiers.intelligence, context.modifiers.sagesse, context.modifiers.charisme) + proficiency;
  }

  return context.modifiers.force + proficiency;
}

function formatRollModifier(value: number): string {
  return value >= 0 ? `+ ${value}` : `- ${Math.abs(value)}`;
}

function createEffectDiceRoll(
  effect: ItemInstance["effects"][number],
  contextCharacter: Character | undefined,
  sourceLabel?: string,
): DiceRoll | null {
  const value = effect.variables?.value;

  if (typeof value !== "string" || !/\d*d\d+/i.test(value)) {
    return null;
  }

  try {
    const roll = rollDiceFormula(value, {
      visibility: "public",
      reason: sourceLabel ?? getEffectString(effect.variables?.source, "Jet du joueur"),
      variables: createDiceFormulaVariables(contextCharacter),
    });
    const level = Math.max(1, getEffectNumber(effect.variables?.level) || 1);
    const baseLevel = Math.max(1, getEffectNumber(effect.variables?.baseLevel) || 1);
    const perLevel = getEffectNumber(effect.variables?.perLevel);
    const levelBonus = Math.max(0, level - baseLevel) * perLevel;

    if (levelBonus <= 0) {
      return roll;
    }

    return {
      ...roll,
      modifier: roll.modifier + levelBonus,
      terms: [
        ...roll.terms,
        {
          kind: "modifier",
          label: `Niv.${level}`,
          value: levelBonus,
        },
      ],
      result: roll.result + levelBonus,
    };
  } catch {
    return null;
  }
}

function getStatModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function createCombatLog(type: CombatScene["log"][number]["type"], text: string): CombatLogEntry {
  return {
    id: `combat-log-${crypto.randomUUID()}`,
    type,
    text,
    timestamp: Date.now(),
  };
}

function getDefaultCombatResources(speed: number): Combatant["resources"] {
  return {
    action: 1,
    bonus: 1,
    reaction: 1,
    movement: speed,
    disengaged: false,
  };
}

function resetCombatantTurnResources(combatant: Combatant): Combatant {
  return {
    ...combatant,
    resources: getDefaultCombatResources(combatant.speed),
  };
}

function createCharacterCombatant(
  character: Character,
  index: number,
): Combatant {
  const dexterityModifier = getStatModifier(character.stats.dexterite);
  const speed = character.espece.toLowerCase().includes("nain") ? 7.5 : 9;

  return {
    id: `combatant-character-${character.id}`,
    sourceType: "character",
    sourceId: character.id,
    name: character.name,
    side: "players",
    hp: character.pv,
    maxHp: character.maxPv,
    defense: 10 + dexterityModifier,
    initiative: dexterityModifier,
    speed,
    position: {
      x: 5,
      y: 5 + index * 3,
    },
    conditions: [],
    resources: getDefaultCombatResources(speed),
    reach: 1.5,
    attackRange: 18,
    attackDamage: 3,
  };
}

function createEntityCombatant(
  entity: Entity,
  side: Combatant["side"],
  index: number,
  enemyTemplate?: EnemyTemplate,
): Combatant {
  const rolledHp = enemyTemplate
    ? rollNumericValue(enemyTemplate.hp, Math.max(1, enemyTemplate.level * 6))
    : side === "enemies" ? 8 : 6;
  const maxHp = Math.max(1, Math.round(rolledHp));
  const speed = enemyTemplate?.speed ?? 9;
  const primaryAttack = enemyTemplate?.attacks[0];

  return {
    id: `combatant-entity-${entity.id}`,
    sourceType: "entity",
    sourceId: entity.id,
    name: entity.name,
    side,
    hp: maxHp,
    maxHp,
    defense: enemyTemplate?.defense ?? (side === "enemies" ? 12 : 10),
    initiative: enemyTemplate?.initiative ?? (side === "enemies" ? 1 : 0),
    speed,
    position: {
      x: side === "enemies" ? 23 : 15,
      y: 5 + index * 4,
    },
    conditions: [],
    resources: getDefaultCombatResources(speed),
    reach: enemyTemplate?.reach ?? 1.5,
    attackRange: primaryAttack?.range ?? (side === "enemies" ? 12 : 3),
    attackDamage: primaryAttack ? estimateFormulaValue(primaryAttack.damage, 2) : side === "enemies" ? 2 : 1,
    ...(enemyTemplate ? {
      enemyTemplateId: enemyTemplate.id,
      attacks: enemyTemplate.attacks,
      abilityTemplateIds: enemyTemplate.abilityTemplateIds,
      behavior: enemyTemplate.behavior,
      resistances: enemyTemplate.resistances,
      vulnerabilities: enemyTemplate.vulnerabilities,
      immunities: enemyTemplate.immunities,
    } : {}),
  };
}

function rollNumericValue(value: number | string, fallback: number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;

  try {
    return rollDiceFormula(value, { visibility: "hidden" }).result;
  } catch {
    return fallback;
  }
}

function estimateFormulaValue(value: number | string, fallback: number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const parts = value.match(/(\d*)d(\d+)|[+-]?\s*\d+/gi);
  if (!parts) return fallback;
  const estimate = parts.reduce((total, part) => {
    const dice = part.match(/(\d*)d(\d+)/i);
    if (dice) return total + Number(dice[1] || 1) * (Number(dice[2]) + 1) / 2;
    return total + Number(part.replace(/\s/g, ""));
  }, 0);
  return Number.isFinite(estimate) ? Math.max(1, Math.round(estimate)) : fallback;
}

function createHazardCombatant(options: {
  id: string;
  sourceId: string;
  name: string;
  hp: number;
  defense: number;
  position: CombatPosition;
  attackDamage?: number;
}): Combatant {
  return {
    id: options.id,
    sourceType: "hazard",
    sourceId: options.sourceId,
    name: options.name,
    side: "neutral",
    hp: options.hp,
    maxHp: options.hp,
    defense: options.defense,
    initiative: -99,
    speed: 0,
    position: options.position,
    conditions: [],
    resources: getDefaultCombatResources(0),
    reach: 0,
    attackRange: 0,
    attackDamage: options.attackDamage ?? 0,
  };
}

function clampCombatPosition(position: CombatPosition, combat: CombatScene): CombatPosition {
  return {
    x: clamp(position.x, 0, combat.map.width),
    y: clamp(position.y, 0, combat.map.height),
  };
}

function getDistance(a: CombatPosition, b: CombatPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isPointInsideObstacle(
  point: CombatPosition,
  obstacle: CombatScene["map"]["obstacles"][number],
): boolean {
  return (
    point.x >= obstacle.x &&
    point.x <= obstacle.x + obstacle.width &&
    point.y >= obstacle.y &&
    point.y <= obstacle.y + obstacle.height
  );
}

function getCombatMapElementCells(
  element: CombatScene["map"]["elements"][number],
  cellSize: number,
): Array<{ x: number; y: number; width: number; height: number }> {
  if (Array.isArray(element.cells) && element.cells.length > 0) {
    return element.cells.map((cell) => ({
      x: cell.x,
      y: cell.y,
      width: cellSize,
      height: cellSize,
    }));
  }

  return [{ x: element.x, y: element.y, width: element.width, height: element.height }];
}

function isPointInsideMapElement(
  point: CombatPosition,
  element: CombatScene["map"]["elements"][number],
  cellSize: number,
): boolean {
  return getCombatMapElementCells(element, cellSize).some(
    (cell) =>
      point.x >= cell.x &&
      point.x <= cell.x + cell.width &&
      point.y >= cell.y &&
      point.y <= cell.y + cell.height,
  );
}

function doesSegmentHitMapElement(
  from: CombatPosition,
  to: CombatPosition,
  element: CombatScene["map"]["elements"][number],
  cellSize: number,
): boolean {
  const steps = Math.max(8, Math.ceil(getDistance(from, to) * 2));

  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    const point = {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
    };

    if (isPointInsideMapElement(point, element, cellSize)) {
      return true;
    }
  }

  return false;
}

function doesSegmentHitObstacle(
  from: CombatPosition,
  to: CombatPosition,
  obstacle: CombatScene["map"]["obstacles"][number],
  mode: "lineOfSight" | "movement" = "lineOfSight",
): boolean {
  if (mode === "lineOfSight" && !obstacle.blocksLineOfSight) {
    return false;
  }

  if (mode === "movement" && !obstacle.blocksMovement) {
    return false;
  }

  const steps = Math.max(8, Math.ceil(getDistance(from, to) * 2));

  for (let index = 1; index < steps; index += 1) {
    const ratio = index / steps;
    const point = {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
    };

    if (isPointInsideObstacle(point, obstacle)) {
      return true;
    }
  }

  return false;
}

function hasMovementPath(combat: CombatScene, from: CombatPosition, to: CombatPosition): boolean {
  const cellSize = Math.max(0.1, combat.map.cellSize || 0.5);

  return (
    !combat.map.obstacles.some((obstacle) => doesSegmentHitObstacle(from, to, obstacle, "movement")) &&
    !combat.map.elements.some(
      (element) => element.blocksMovement && doesSegmentHitMapElement(from, to, element, cellSize),
    )
  );
}

function hasStopMovementEffect(element: CombatScene["map"]["elements"][number]): boolean {
  return element.effects?.some((effect) => effect.type === "stopMovement") ?? false;
}

function getFirstStopMovementPoint(
  combat: CombatScene,
  from: CombatPosition,
  to: CombatPosition,
): CombatPosition | null {
  const distance = getDistance(from, to);

  if (distance <= 0) {
    return null;
  }

  const cellSize = Math.max(0.1, combat.map.cellSize || 0.5);
  const stopElements = combat.map.elements.filter(hasStopMovementEffect);
  const steps = Math.max(8, Math.ceil(distance / cellSize) * 2);

  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps;
    const point = {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
    };
    const entersStopElement = stopElements.some((element) =>
      !isPointInsideMapElement(from, element, cellSize) && isPointInsideMapElement(point, element, cellSize),
    );

    if (entersStopElement) {
      return clampCombatPosition(point, combat);
    }
  }

  return null;
}

function clampPositionToFirstStopMovement(
  combat: CombatScene,
  from: CombatPosition,
  requestedPosition: CombatPosition,
): CombatPosition {
  return getFirstStopMovementPoint(combat, from, requestedPosition) ?? requestedPosition;
}

function getTargetCombatantFromActionTarget(
  combat: CombatScene,
  target: ActionTarget | undefined,
  fallbackCharacterId: string,
): Combatant | undefined {
  if (!target) {
    return combat.combatants.find(
      (combatant) => combatant.sourceType === "character" && combatant.sourceId === fallbackCharacterId,
    );
  }

  if (target.kind === "self" || target.kind === "character") {
    return combat.combatants.find(
      (combatant) => combatant.sourceType === "character" && combatant.sourceId === target.id,
    );
  }

  if (target.kind === "entity") {
    return combat.combatants.find(
      (combatant) =>
        (combatant.sourceType === "entity" || combatant.sourceType === "hazard") &&
        combatant.sourceId === target.id,
    );
  }

  return undefined;
}

function syncCharacterCombatant(combat: CombatScene, character: Character | undefined): CombatScene {
  if (!character) {
    return combat;
  }

  return {
    ...combat,
    combatants: combat.combatants.map((combatant) =>
      combatant.sourceType === "character" && combatant.sourceId === character.id
        ? {
            ...normalizeCombatantAfterHpChange(combatant, character.pv),
            maxHp: character.maxPv,
          }
        : combatant,
    ),
  };
}

function normalizeCombatantAfterHpChange(combatant: Combatant, hp: number): Combatant {
  const reviveLabels = new Set([
    "hors de combat",
    "hors d'etat de nuire",
    "hors d'état de nuire",
    "inconscient",
    "inconsciente",
    "ko",
  ]);
  const nextConditions = hp > 0
    ? combatant.conditions.filter((condition) => !reviveLabels.has(condition.toLowerCase().trim()))
    : combatant.conditions;

  return {
    ...combatant,
    hp,
    conditions: nextConditions,
  };
}

function updateCombatantHp(
  combat: CombatScene,
  combatantId: string | undefined,
  updater: (hp: number, maxHp: number) => number,
): CombatScene {
  if (!combatantId) {
    return combat;
  }

  return {
    ...combat,
    combatants: combat.combatants.map((combatant) => {
      if (combatant.id !== combatantId) {
        return combatant;
      }

      const hp = clamp(updater(combatant.hp, combatant.maxHp), 0, combatant.maxHp);
      return normalizeCombatantAfterHpChange(combatant, hp);
    }),
  };
}

function rollCombatMapEffectValue(
  element: CombatScene["map"]["elements"][number],
  effect: NonNullable<CombatScene["map"]["elements"][number]["effects"]>[number],
): { value: number; diceRoll?: DiceRoll } {
  if (typeof effect.value === "string" && /\d*d\d+/i.test(effect.value)) {
    const diceRoll = rollDiceFormula(effect.value, {
      visibility: "public",
      reason: element.name,
    });

    return { value: diceRoll.result, diceRoll };
  }

  if (typeof effect.value === "number") {
    return { value: effect.value };
  }

  return { value: 0 };
}

const savingThrowLabels: Record<keyof CharacterStats, string> = {
  force: "FOR",
  dexterite: "DEX",
  constitution: "CON",
  intelligence: "INT",
  sagesse: "SAG",
  charisme: "CHA",
};

function getCombatantSavingThrowModifier(
  combatant: Combatant,
  characters: Character[],
  stat: keyof CharacterStats,
): number {
  if (combatant.sourceType !== "character") {
    return 0;
  }

  const character = characters.find((candidate) => candidate.id === combatant.sourceId);

  if (!character) {
    return 0;
  }

  return getStatModifier(character.stats[stat]);
}

function applyCombatMapEffectSavingThrow({
  effect,
  combatant,
  characters,
  rawValue,
  reason,
}: {
  effect: NonNullable<CombatScene["map"]["elements"][number]["effects"]>[number];
  combatant: Combatant;
  characters: Character[];
  rawValue: number;
  reason: string;
}): { value: number; diceRoll?: DiceRoll; logSuffix: string } {
  if (!effect.savingThrow || rawValue <= 0) {
    return { value: rawValue, logSuffix: "" };
  }

  const statLabel = savingThrowLabels[effect.savingThrow.stat];
  const modifier = getCombatantSavingThrowModifier(combatant, characters, effect.savingThrow.stat);
  const diceRoll = rollDiceFormula(`1d20 ${formatRollModifier(modifier)}`, {
    visibility: "public",
    reason: `${reason} · sauvegarde ${statLabel}`,
  });
  const success = diceRoll.result >= effect.savingThrow.dc;
  const adjustedValue = success
    ? effect.savingThrow.success === "none"
      ? 0
      : Math.floor(rawValue / 2)
    : rawValue;

  return {
    value: adjustedValue,
    diceRoll,
    logSuffix: success
      ? ` Sauvegarde ${statLabel} réussie (${diceRoll.result} >= ${effect.savingThrow.dc}).`
      : ` Sauvegarde ${statLabel} ratée (${diceRoll.result} < ${effect.savingThrow.dc}).`,
  };
}

function addCombatantCondition(combatant: Combatant, condition: string): Combatant {
  const canonicalCondition = getCombatConditionTemplate(condition)?.id ?? condition.trim();

  if (
    !canonicalCondition ||
    combatant.conditions.some((item) => (getCombatConditionTemplate(item)?.id ?? item.trim()).toLowerCase() === canonicalCondition.toLowerCase())
  ) {
    return combatant;
  }

  return {
    ...combatant,
    conditions: [...combatant.conditions, canonicalCondition],
  };
}

function removeCombatantConditions(combatant: Combatant, conditions: string[]): Combatant {
  const normalized = new Set(
    conditions.map((condition) => (getCombatConditionTemplate(condition)?.id ?? condition.trim()).toLowerCase()),
  );

  return {
    ...combatant,
    conditions: combatant.conditions.filter((condition) =>
      !normalized.has((getCombatConditionTemplate(condition)?.id ?? condition.trim()).toLowerCase()),
    ),
  };
}

function updateCharactersFromCombatantHp(characters: Character[], combatant: Combatant): Character[] {
  if (combatant.sourceType !== "character") {
    return characters;
  }

  return updateCharacter(characters, combatant.sourceId, (character) => ({
    ...character,
    pv: clamp(combatant.hp, 0, character.maxPv),
  }));
}

function applyHazardDestructionEffects({
  combat,
  characters,
  hazardId,
}: {
  combat: CombatScene;
  characters: Character[];
  hazardId: string;
}): { combat: CombatScene; characters: Character[]; diceRolls: DiceRoll[] } {
  const hazard = combat.combatants.find((combatant) => combatant.id === hazardId);

  if (!hazard || hazard.sourceType !== "hazard" || hazard.hp > 0 || hazard.conditions.includes("destroyed")) {
    return { combat, characters, diceRolls: [] };
  }

  if (hazard.sourceId !== "hazard-explosive-barrel") {
    return {
      combat: {
        ...combat,
        combatants: combat.combatants.map((combatant) =>
          combatant.id === hazard.id ? addCombatantCondition(combatant, "destroyed") : combatant,
        ),
      },
      characters,
      diceRolls: [],
    };
  }

  const damageRoll = rollDiceFormula("2d6", {
    visibility: "public",
    reason: `${hazard.name} · explosion`,
  });
  const radius = 2;
  let nextCharacters = characters;
  const diceRolls: DiceRoll[] = [damageRoll];
  const saveLogs: string[] = [];
  let nextCombat = {
    ...combat,
    combatants: combat.combatants.map((combatant) =>
      combatant.id === hazard.id ? addCombatantCondition(combatant, "destroyed") : combatant,
    ),
  };

  nextCombat.combatants
    .filter((combatant) => combatant.id !== hazard.id && combatant.hp > 0)
    .filter((combatant) => getDistance(combatant.position, hazard.position) <= radius)
    .forEach((target) => {
      const save = applyCombatMapEffectSavingThrow({
        effect: {
          trigger: "interact",
          type: "damage",
          value: "2d6",
          damageType: "feu",
          savingThrow: { stat: "dexterite", dc: 13, success: "half" },
        },
        combatant: target,
        characters: nextCharacters,
        rawValue: damageRoll.result,
        reason: `${hazard.name} · explosion`,
      });
      const nextHp = clamp(target.hp - save.value, 0, target.maxHp);
      const nextTarget = normalizeCombatantAfterHpChange(target, nextHp);

      if (save.diceRoll) {
        diceRolls.push(save.diceRoll);
      }
      saveLogs.push(`${target.name} subit ${save.value} dégâts.${save.logSuffix}`);
      nextCombat = {
        ...nextCombat,
        combatants: nextCombat.combatants.map((combatant) =>
          combatant.id === target.id ? nextTarget : combatant,
        ),
      };
      nextCharacters = updateCharactersFromCombatantHp(nextCharacters, nextTarget);
    });

  return {
    combat: {
      ...nextCombat,
      log: [
        createCombatLog(
          "damage",
          `${hazard.name} explose : ${damageRoll.result} dégâts de feu dans un rayon de ${radius} m, DEX DD 13 pour moitié.${saveLogs.length > 0 ? ` ${saveLogs.join(" ")}` : ""}`,
        ),
        ...nextCombat.log,
      ].slice(0, 30),
    },
    characters: nextCharacters,
    diceRolls,
  };
}

function applyCombatMapElementEffects({
  combat,
  characters,
  combatantId,
  trigger,
  from,
  to,
}: {
  combat: CombatScene;
  characters: Character[];
  combatantId: string;
  trigger: "startTurn" | "enter";
  from?: CombatPosition;
  to?: CombatPosition;
}): { combat: CombatScene; characters: Character[]; diceRolls: DiceRoll[] } {
  const cellSize = Math.max(0.1, combat.map.cellSize || 0.5);
  let nextCombat = combat;
  let nextCharacters = characters;
  const diceRolls: DiceRoll[] = [];
  const logs: CombatLogEntry[] = [];
  const combatant = nextCombat.combatants.find((candidate) => candidate.id === combatantId);

  if (!combatant || combatant.hp <= 0) {
    return { combat, characters, diceRolls };
  }

  nextCombat.map.elements.forEach((element) => {
    const effects = element.effects?.filter((effect) => effect.trigger === trigger) ?? [];

    if (effects.length === 0) {
      return;
    }

    const affectsCombatant =
      trigger === "startTurn"
        ? isPointInsideMapElement(combatant.position, element, cellSize)
        : from && to
          ? !isPointInsideMapElement(from, element, cellSize) && doesSegmentHitMapElement(from, to, element, cellSize)
          : false;

    if (!affectsCombatant) {
      return;
    }

    effects.forEach((effect) => {
      if (effect.oncePerCombat && element.state?.used) {
        return;
      }

      const currentCombatant = nextCombat.combatants.find((candidate) => candidate.id === combatantId);

      if (!currentCombatant || currentCombatant.hp <= 0) {
        return;
      }

      if (effect.type === "damage" || effect.type === "heal") {
        const rolled = rollCombatMapEffectValue(element, effect);
        const resolved = effect.type === "damage"
          ? applyCombatMapEffectSavingThrow({
              effect,
              combatant: currentCombatant,
              characters: nextCharacters,
              rawValue: Math.abs(rolled.value),
              reason: element.name,
            })
          : { value: Math.abs(rolled.value), logSuffix: "", diceRoll: undefined };
        const signedValue = effect.type === "heal" ? Math.abs(resolved.value) : -Math.abs(resolved.value);
        const nextHp = clamp(currentCombatant.hp + signedValue, 0, currentCombatant.maxHp);
        const nextCombatant = normalizeCombatantAfterHpChange(currentCombatant, nextHp);

        if (rolled.diceRoll) {
          diceRolls.push(rolled.diceRoll);
        }
        if (resolved.diceRoll) {
          diceRolls.push(resolved.diceRoll);
        }

        nextCombat = {
          ...nextCombat,
          combatants: nextCombat.combatants.map((candidate) =>
            candidate.id === combatantId ? nextCombatant : candidate,
          ),
        };
        nextCharacters = updateCharactersFromCombatantHp(nextCharacters, nextCombatant);
        logs.push(createCombatLog(
          effect.type === "heal" ? "heal" : "damage",
          effect.type === "heal"
            ? `${currentCombatant.name} profite de ${element.name} et récupère ${Math.abs(resolved.value)} PV.`
            : `${currentCombatant.name} subit ${Math.abs(resolved.value)} dégâts${effect.damageType ? ` ${effect.damageType}` : ""} à cause de ${element.name}.${resolved.logSuffix}`,
        ));
      }

      if (effect.type === "condition" && effect.condition) {
        nextCombat = {
          ...nextCombat,
          combatants: nextCombat.combatants.map((candidate) =>
            candidate.id === combatantId ? addCombatantCondition(candidate, effect.condition ?? "") : candidate,
          ),
        };
        logs.push(createCombatLog("condition", `${currentCombatant.name} subit l'état ${effect.condition} (${element.name}).`));
      }

      if (effect.type === "removeCondition" && effect.condition) {
        nextCombat = {
          ...nextCombat,
          combatants: nextCombat.combatants.map((candidate) =>
            candidate.id === combatantId ? removeCombatantConditions(candidate, [effect.condition ?? ""]) : candidate,
          ),
        };
      }

      if (effect.type === "stopMovement") {
        logs.push(createCombatLog("move", `${element.name} arrête le déplacement de ${currentCombatant.name}.`));
      }

      if (effect.type === "revealHidden") {
        nextCombat = {
          ...nextCombat,
          combatants: nextCombat.combatants.map((candidate) =>
            candidate.id === combatantId
              ? removeCombatantConditions(candidate, ["hidden", "Dissimulé", "Dans l'ombre", "Caché", "Invisible"])
              : candidate,
          ),
        };
        logs.push(createCombatLog("condition", `${element.name} révèle ${currentCombatant.name}.`));
      }

      if (effect.type === "alert") {
        nextCombat = {
          ...nextCombat,
          combatants: nextCombat.combatants.map((candidate) =>
            candidate.side === "enemies" ? addCombatantCondition(candidate, effect.condition ?? "alert") : candidate,
          ),
        };
        logs.push(createCombatLog("system", `${element.name} se déclenche : les ennemis sont alertés.`));
      }

      if (effect.oncePerCombat) {
        nextCombat = {
          ...nextCombat,
          map: {
            ...nextCombat.map,
            elements: nextCombat.map.elements.map((candidate) =>
              candidate.id === element.id
                ? { ...candidate, state: { ...(candidate.state ?? {}), used: true } }
                : candidate,
            ),
          },
        };
      }
    });
  });

  return {
    combat: logs.length > 0
      ? {
          ...nextCombat,
          log: [...logs, ...nextCombat.log].slice(0, 30),
        }
      : nextCombat,
    characters: nextCharacters,
    diceRolls,
  };
}

function applyCombatMapInteractionEffects({
  combat,
  characters,
  position,
}: {
  combat: CombatScene;
  characters: Character[];
  position: CombatPosition;
}): { combat: CombatScene; characters: Character[]; diceRolls: DiceRoll[]; applied: boolean } {
  const cellSize = Math.max(0.1, combat.map.cellSize || 0.5);
  let nextCombat = combat;
  let nextCharacters = characters;
  const diceRolls: DiceRoll[] = [];
  const logs: CombatLogEntry[] = [];
  let applied = false;

  combat.map.elements.forEach((element) => {
    if (!isPointInsideMapElement(position, element, cellSize)) {
      return;
    }

    const effects = element.effects?.filter((effect) => effect.trigger === "interact") ?? [];

    effects.forEach((effect) => {
      if (effect.oncePerCombat && element.state?.used) {
        return;
      }

      if (effect.type === "damage" || effect.type === "heal") {
        const rolled = rollCombatMapEffectValue(element, effect);
        const radius = typeof effect.radius === "number" ? effect.radius : Number(effect.radius ?? 0);
        const cells = getCombatMapElementCells(element, cellSize);
        const center = cells.reduce(
          (accumulator, cell, _index, cells) => ({
            x: accumulator.x + (cell.x + cell.width / 2) / cells.length,
            y: accumulator.y + (cell.y + cell.height / 2) / cells.length,
          }),
          { x: 0, y: 0 },
        );
        const targets = nextCombat.combatants.filter(
          (combatant) =>
            combatant.hp > 0 &&
            (radius <= 0
              ? isPointInsideMapElement(combatant.position, element, cellSize)
              : getDistance(combatant.position, center) <= radius),
        );

        if (rolled.diceRoll) {
          diceRolls.push(rolled.diceRoll);
        }

        targets.forEach((target) => {
          const resolved = effect.type === "damage"
            ? applyCombatMapEffectSavingThrow({
                effect,
                combatant: target,
                characters: nextCharacters,
                rawValue: Math.abs(rolled.value),
                reason: element.name,
              })
            : { value: Math.abs(rolled.value), logSuffix: "", diceRoll: undefined };
          const signedValue = effect.type === "heal" ? Math.abs(resolved.value) : -Math.abs(resolved.value);
          const nextHp = clamp(target.hp + signedValue, 0, target.maxHp);
          const nextTarget = normalizeCombatantAfterHpChange(target, nextHp);

          if (resolved.diceRoll) {
            diceRolls.push(resolved.diceRoll);
          }
          nextCombat = {
            ...nextCombat,
            combatants: nextCombat.combatants.map((candidate) =>
              candidate.id === target.id ? nextTarget : candidate,
            ),
          };
          nextCharacters = updateCharactersFromCombatantHp(nextCharacters, nextTarget);
        });

        logs.push(createCombatLog(
          effect.type === "heal" ? "heal" : "damage",
          `${element.name} se déclenche${targets.length > 0 ? ` sur ${targets.length} cible(s)` : ""}.`,
        ));
        applied = true;
      }

      if (effect.type === "objective") {
        logs.push(createCombatLog("action", `${element.name} est activé.`));
        applied = true;
      }

      if (effect.oncePerCombat) {
        nextCombat = {
          ...nextCombat,
          map: {
            ...nextCombat.map,
            elements: nextCombat.map.elements.map((candidate) =>
              candidate.id === element.id
                ? { ...candidate, state: { ...(candidate.state ?? {}), used: true } }
                : candidate,
            ),
          },
        };
      }
    });
  });

  return {
    combat: logs.length > 0
      ? {
          ...nextCombat,
          log: [...logs, ...nextCombat.log].slice(0, 30),
        }
      : nextCombat,
    characters: nextCharacters,
    diceRolls,
    applied,
  };
}

function getMovementCostMultiplierAtPoint(combat: CombatScene, point: CombatPosition): number {
  const cellSize = Math.max(0.1, combat.map.cellSize || 0.5);
  const multipliers = combat.map.elements.flatMap((element) => {
    if (!isPointInsideMapElement(point, element, cellSize)) {
      return [];
    }

    return (element.effects ?? [])
      .filter((effect) => effect.type === "movementCost")
      .map((effect) => (typeof effect.value === "number" ? effect.value : Number(effect.value ?? 1)))
      .filter((value) => Number.isFinite(value) && value > 0);
  });

  return Math.max(0.25, multipliers.reduce((total, multiplier) => total * multiplier, 1));
}

function calculateMovementCost(combat: CombatScene, from: CombatPosition, to: CombatPosition): number {
  const distance = getDistance(from, to);

  if (distance <= 0) {
    return 0;
  }

  const steps = Math.max(1, Math.ceil(distance / Math.max(0.1, combat.map.cellSize || 0.5)));
  let cost = 0;

  for (let index = 0; index < steps; index += 1) {
    const startRatio = index / steps;
    const endRatio = (index + 1) / steps;
    const middleRatio = (startRatio + endRatio) / 2;
    const point = {
      x: from.x + (to.x - from.x) * middleRatio,
      y: from.y + (to.y - from.y) * middleRatio,
    };

    cost += distance / steps * getMovementCostMultiplierAtPoint(combat, point);
  }

  return cost;
}

function clampPositionToMovementBudget(
  combat: CombatScene,
  from: CombatPosition,
  requestedPosition: CombatPosition,
  movementBudget: number,
): CombatPosition {
  const stoppedRequestedPosition = clampPositionToFirstStopMovement(combat, from, requestedPosition);

  if (movementBudget <= 0 || getDistance(from, requestedPosition) <= 0) {
    return from;
  }

  if (
    calculateMovementCost(combat, from, stoppedRequestedPosition) <= movementBudget &&
    hasMovementPath(combat, from, stoppedRequestedPosition)
  ) {
    return stoppedRequestedPosition;
  }

  let low = 0;
  let high = 1;
  let best = from;

  for (let index = 0; index < 16; index += 1) {
    const ratio = (low + high) / 2;
    const candidate = clampCombatPosition(
      {
        x: from.x + (stoppedRequestedPosition.x - from.x) * ratio,
        y: from.y + (stoppedRequestedPosition.y - from.y) * ratio,
      },
      combat,
    );

    if (hasMovementPath(combat, from, candidate) && calculateMovementCost(combat, from, candidate) <= movementBudget) {
      best = candidate;
      low = ratio;
    } else {
      high = ratio;
    }
  }

  return best;
}

function moveCombatantBy(
  combat: CombatScene,
  combatantId: string | undefined,
  distance: number,
): CombatScene {
  if (!combatantId || distance <= 0) {
    return combat;
  }

  return {
    ...combat,
    combatants: combat.combatants.map((combatant) =>
      combatant.id === combatantId
        ? {
            ...combatant,
            position: clampCombatPosition(
              {
                x: combatant.position.x + distance,
                y: combatant.position.y,
              },
              combat,
            ),
          }
        : combatant,
    ),
  };
}

function moveCombatantTo(
  combat: CombatScene,
  combatantId: string | undefined,
  position: CombatPosition | undefined,
): CombatScene {
  if (!combatantId || !position) {
    return combat;
  }

  return {
    ...combat,
    combatants: combat.combatants.map((combatant) =>
      combatant.id === combatantId
        ? {
            ...combatant,
            position: clampCombatPosition(position, combat),
          }
        : combatant,
    ),
  };
}

function getIntentCombatCost(
  state: GameDataState,
  intent: ChatActionIntent,
): "action" | "bonus" | "reaction" {
  if (intent.kind === "castSpell") {
    const spell = state.spellTemplates.find((candidate) => candidate.id === intent.targetId);
    const timing = getGameActionTemplate(state.gameActionTemplates, spell?.actionId)?.activation.timing;
    return timing === "bonus" ? "bonus" : timing === "reaction" ? "reaction" : "action";
  }

  if (intent.kind === "useAbility") {
    const ability = state.abilityInstances.find((candidate) => candidate.id === intent.targetId);
    const template = ability
      ? getAbilityTemplate(state.abilityTemplates, ability.templateId)
      : undefined;
    const action = getGameActionTemplate(state.gameActionTemplates, template?.actionId);

    if (action?.activation.timing === "bonus") {
      return "bonus";
    }

    if (action?.activation.timing === "reaction") {
      return "reaction";
    }

    if (action?.combatRole === "attack") {
      return "action";
    }
  }

  return "action";
}

function canSpendCombatCost(combatant: Combatant, cost: "action" | "bonus" | "reaction"): boolean {
  return combatant.resources[cost] > 0;
}

function canCombatantTakeTurn(combatant: Combatant | undefined): boolean {
  return Boolean(combatant && combatant.hp > 0 && combatant.sourceType !== "hazard");
}

function areHostileCombatants(a: Combatant, b: Combatant): boolean {
  const aTeam = a.side === "players" || a.side === "allies" ? "players" : a.side;
  const bTeam = b.side === "players" || b.side === "allies" ? "players" : b.side;

  return aTeam !== bTeam && aTeam !== "neutral" && bTeam !== "neutral";
}

function canCombatActionReachTarget(
  state: GameDataState,
  combat: CombatScene,
  actor: Combatant,
  intent: ChatActionIntent,
): boolean {
  const targeting = intent.targeting ?? getActionTargeting(state, intent.kind, intent.targetId);
  const resolved = resolveActionTargets({
    actor,
    combat,
    fallbackCharacterId: state.selectedCharacterId,
    target: intent.target,
    targeting,
  });

  return !resolved.invalidReason;
}

function spendCombatAction(
  combat: CombatScene,
  combatantId: string,
  cost: "action" | "bonus" | "reaction",
): CombatScene {
  return {
    ...combat,
    combatants: combat.combatants.map((combatant) =>
      combatant.id === combatantId
        ? {
            ...combatant,
            resources: {
              ...combatant.resources,
              [cost]: Math.max(0, combatant.resources[cost] - 1),
            },
          }
        : combatant,
    ),
  };
}

function hasEquippedItemTag(
  itemInstances: ItemInstance[],
  itemTemplates: ItemTemplate[],
  characterId: string,
  tag: string,
): boolean {
  return itemInstances.some((item) => {
    const template = itemTemplates.find((candidate) => candidate.id === item.templateId);

    if (!template || item.location.type !== "equipped" || item.location.parent !== characterId) {
      return false;
    }

    const types = getTemplateTypes(template);
    const tags = [...types, ...getTemplateMetadataTags(template, types)];

    return tags.some((value) => value.toLowerCase() === tag.toLowerCase());
  });
}

function applyVisibilityReactionTriggers({
  beforeCombat,
  afterCombat,
  abilityInstances,
  abilityTemplates,
  gameActionTemplates,
  itemInstances,
  itemTemplates,
  movedCombatantId,
}: {
  beforeCombat: CombatScene;
  afterCombat: CombatScene;
  abilityInstances: AbilityInstance[];
  abilityTemplates: AbilityTemplate[];
  gameActionTemplates: GameActionTemplate[];
  itemInstances: ItemInstance[];
  itemTemplates: ItemTemplate[];
  movedCombatantId: string;
}): { combat: CombatScene; pendingActionIntents: ChatActionIntent[] } {
  const movedBefore = beforeCombat.combatants.find((combatant) => combatant.id === movedCombatantId);
  const movedAfter = afterCombat.combatants.find((combatant) => combatant.id === movedCombatantId);

  if (!movedBefore || !movedAfter || movedAfter.hp <= 0) {
    return { combat: afterCombat, pendingActionIntents: [] };
  }

  const logs: CombatLogEntry[] = [];
  const pendingActionIntents: ChatActionIntent[] = [];

  afterCombat.combatants
    .filter((watcher) => watcher.side === "players" || watcher.side === "allies")
    .forEach((watcher) => {
      if (
        watcher.id === movedAfter.id ||
        watcher.hp <= 0 ||
        watcher.resources.reaction <= 0 ||
        !areHostileCombatants(watcher, movedAfter)
      ) {
        return;
      }

      const wasVisible = hasLineOfSight(beforeCombat, watcher.position, movedBefore.position);
      const isVisible = hasLineOfSight(afterCombat, watcher.position, movedAfter.position);

      if (wasVisible || !isVisible || watcher.sourceType !== "character") {
        return;
      }

      const ability = abilityInstances.find(
        (candidate) => candidate.ownerId === watcher.sourceId && candidate.templateId === "abl_quick_shot",
      );
      const template = ability ? getAbilityTemplate(abilityTemplates, ability.templateId) : undefined;
      const action = getGameActionTemplate(gameActionTemplates, template?.actionId);

      if (
        !ability ||
        !template ||
        !action ||
        !canUseAbility(ability, template) ||
        !hasEquippedItemTag(itemInstances, itemTemplates, watcher.sourceId, "ranged")
      ) {
        return;
      }

      const currentTarget = afterCombat.combatants.find((combatant) => combatant.id === movedAfter.id);

      if (!currentTarget || currentTarget.hp <= 0) {
        return;
      }

      const target: ActionTarget = {
        kind: currentTarget.sourceType === "character" ? "character" : "entity",
        id: currentTarget.sourceId,
        label: currentTarget.name,
        source: "selected",
      };
      const intent: ChatActionIntent = {
        id: `intent-${crypto.randomUUID()}`,
        kind: "useAbility",
        targetId: ability.id,
        label: `Utiliser ${action.name}`,
        command: `useAbility:${ability.id}`,
        targeting: action.targeting,
        target,
        createdAt: Date.now(),
      };

      pendingActionIntents.push(intent);
      logs.push(createCombatLog(
        "action",
        `${watcher.name} peut utiliser ${action.name} en réaction contre ${currentTarget.name}.`,
      ));
    });

  return {
    combat: logs.length > 0
      ? {
          ...afterCombat,
          log: [...logs, ...afterCombat.log].slice(0, 30),
        }
      : afterCombat,
    pendingActionIntents,
  };
}

function applyEnemyTurn(combat: CombatScene, enemyId: string): CombatScene {
  const enemy = combat.combatants.find((combatant) => combatant.id === enemyId);

  if (!enemy || enemy.side !== "enemies" || enemy.hp <= 0) {
    return combat;
  }

  const targets = combat.combatants.filter(
    (combatant) => (combatant.side === "players" || combatant.side === "allies") && combatant.hp > 0,
  );

  if (targets.length === 0) {
    return combat;
  }

  const visibleTargets = targets
    .filter((target) => hasLineOfSight(combat, enemy.position, target.position))
    .sort((a, b) => getDistance(enemy.position, a.position) - getDistance(enemy.position, b.position));
  const target = visibleTargets[0] ?? targets[0]!;
  const distance = getDistance(enemy.position, target.position);
  const availableAttack = enemy.attacks
    ?.filter((attack) => attack.cost === "action" && attack.range >= distance)
    .sort((a, b) => a.range - b.range)[0];
  const attackRange = availableAttack?.range ?? enemy.attackRange;

  if (visibleTargets.length > 0 && distance <= attackRange && enemy.resources.action > 0) {
    const attackRoll = rollNumericValue("1d20", 10) + (availableAttack?.attackBonus ?? 2);
    const hit = attackRoll >= target.defense;
    const rolledDamage = availableAttack
      ? Math.max(1, Math.round(rollNumericValue(availableAttack.damage, enemy.attackDamage)))
      : enemy.attackDamage;
    const damage = applyCombatantDamageAffinity(
      target,
      rolledDamage,
      availableAttack?.damageType ?? "force",
    );
    const damagedCombat = hit
      ? updateCombatantHp(combat, target.id, (hp) => hp - damage)
      : combat;

    return {
      ...spendCombatAction(damagedCombat, enemy.id, "action"),
      log: [
        createCombatLog(
          hit ? "damage" : "action",
          hit
            ? `${enemy.name} utilise ${availableAttack?.name ?? "son attaque"} contre ${target.name} et inflige ${damage} dégâts.`
            : `${enemy.name} utilise ${availableAttack?.name ?? "son attaque"} contre ${target.name}, mais rate (${attackRoll} contre DEF ${target.defense}).`,
        ),
        ...combat.log,
      ].slice(0, 30),
    };
  }

  const step = Math.min(enemy.resources.movement, Math.max(0, distance - Math.min(enemy.attackRange, 3)));
  const ratio = distance > 0 ? step / distance : 0;
  const nextPosition = clampCombatPosition(
    {
      x: enemy.position.x + (target.position.x - enemy.position.x) * ratio,
      y: enemy.position.y + (target.position.y - enemy.position.y) * ratio,
    },
    combat,
  );
  const movedDistance = getDistance(enemy.position, nextPosition);

  return {
    ...combat,
    combatants: combat.combatants.map((combatant) =>
      combatant.id === enemy.id
        ? {
            ...combatant,
            position: nextPosition,
            resources: {
              ...combatant.resources,
              movement: Math.max(0, combatant.resources.movement - movedDistance),
            },
          }
        : combatant,
    ),
    log: [
      createCombatLog("move", `${enemy.name} se déplace vers ${target.name}.`),
      ...combat.log,
    ].slice(0, 30),
  };
}

function applyCombatantDamageAffinity(
  target: Combatant,
  amount: number,
  damageType: string,
): number {
  if (target.immunities?.includes(damageType)) return 0;
  if (target.vulnerabilities?.includes(damageType)) return Math.max(1, amount * 2);
  if (target.resistances?.includes(damageType)) return Math.max(1, Math.floor(amount / 2));
  return Math.max(0, amount);
}

function getScaledEffectValue(
  effect: ItemInstance["effects"][number],
  context: ValueExpressionContext,
): number {
  const value = resolveEffectValue(effect.variables?.value, context);
  const level = Math.max(1, getEffectNumber(effect.variables?.level) || 1);
  const baseLevel = Math.max(1, getEffectNumber(effect.variables?.baseLevel) || 1);
  const perLevel = getEffectNumber(effect.variables?.perLevel);

  return value + Math.max(0, level - baseLevel) * perLevel;
}

function getCombinedItemEffects(
  item: ItemInstance,
  itemTemplates: ItemTemplate[],
  effectTemplates: EffectTemplate[] = [],
): ItemInstance["effects"] {
  const template = itemTemplates.find((candidate) => candidate.id === item.templateId);

  return resolveEffectReferences(
    [...(template?.effects ?? []), ...item.effects],
    effectTemplates,
  );
}

function getTemplateTypes(template: ItemTemplate): string[] {
  const maybeTypes = (template as Partial<ItemTemplate> & { types?: unknown }).types;

  if (Array.isArray(maybeTypes) && maybeTypes.length > 0) {
    return maybeTypes.filter((type): type is string => typeof type === "string");
  }

  const legacyTags = (template as Partial<ItemTemplate> & { tags?: unknown }).tags;

  if (Array.isArray(legacyTags) && legacyTags.length > 0) {
    return legacyTags.filter((tag): tag is string => typeof tag === "string");
  }

  const legacyRoles = template.modules.item?.roles;

  return Array.isArray(legacyRoles)
    ? legacyRoles.filter((role): role is string => typeof role === "string")
    : [];
}

function getTemplateMetadataTags(template: ItemTemplate, fallbackTypes: string[]): string[] {
  const maybeTags = (template as Partial<ItemTemplate> & { tags?: unknown }).tags;

  if (Array.isArray(maybeTags) && maybeTags.length > 0) {
    return maybeTags.filter((tag): tag is string => typeof tag === "string");
  }

  return fallbackTypes;
}

function getEquippedWeaponData(
  itemInstances: ItemInstance[],
  itemTemplates: ItemTemplate[],
  characterId: string,
  weaponId: string,
) {
  const [weaponToken = "", modifierToken] = weaponId.split("|");
  const [itemId, attackId = "default"] = weaponToken.split(":");
  const item = itemInstances.find(
    (candidate) =>
      candidate.id === itemId &&
      candidate.location.parent === characterId &&
      candidate.location.type === "equipped",
  );
  const template = item ? itemTemplates.find((candidate) => candidate.id === item.templateId) : undefined;

  if (!item || !template || !getTemplateTypes(template).includes("weapon")) {
    return null;
  }

  const fallbackAttack = {
    id: "default",
    name: String(item.overrides.name ?? template.name),
    range: item.overrides["base.range"] ?? template.base.range ?? 1.5,
    damage: item.overrides["base.damage"] ?? template.base.damage ?? template.base.attack ?? 1,
    damageType: item.overrides["base.damageType"] ?? template.base.damageType ?? "force",
    attackKind: Number(item.overrides["base.range"] ?? template.base.range ?? 1.5) > 1.5 ? "ranged" : "melee",
    targeting: template.targeting,
  };
  const attack = template.attacks?.find((candidate) => candidate.id === attackId) ?? fallbackAttack;
  const baseRange = getEffectNumber(attack.range) || 1.5;
  const attackKind: WeaponAttackKind =
    attack.attackKind === "ranged" || attack.attackKind === "magic" || attack.attackKind === "melee"
      ? attack.attackKind
      : baseRange > 1.5
        ? "ranged"
        : "melee";
  const modifierParts = modifierToken?.split(":") ?? [];
  const modifierItemId = modifierParts[0];
  const modifierId = modifierParts[1];
  const modifierItem = modifierItemId
    ? itemInstances.find(
        (candidate) =>
          candidate.id === modifierItemId &&
          candidate.location.parent === characterId &&
          candidate.location.type === "inventory" &&
          candidate.quantity > 0,
      )
    : undefined;
  const modifierTemplate = modifierItem
    ? itemTemplates.find((candidate) => candidate.id === modifierItem.templateId)
    : undefined;
  const modifier = modifierTemplate?.attackModifiers?.find((candidate) => candidate.id === modifierId);
  const canApplyModifier = modifier
    ? (!modifier.appliesToAttackKinds || modifier.appliesToAttackKinds.includes(attackKind)) &&
      (!modifier.appliesToTags || modifier.appliesToTags.some((tag) => template.tags.includes(tag)))
    : false;

  if (modifierToken && !canApplyModifier) {
    return null;
  }
  const range = Math.max(
    0.5,
    baseRange + (canApplyModifier ? getEffectNumber(modifier?.rangeModifier) : 0),
  );
  const damage = canApplyModifier
    ? combineDamageValues(attack.damage, modifier?.damageModifier)
    : attack.damage;
  const displayDamage = formatDamageFormula([
    damage,
    getDefaultDamageModifier(attackKind, template, null),
  ]) ?? damage;
  const targeting = attack.targeting
    ? attack.targeting
    : template.targeting
      ? {
          ...template.targeting,
          aim: {
            ...template.targeting.aim,
            range,
          },
        }
      : createAttackTargeting(range);

  return {
    item,
    template,
    name: template.attacks && template.attacks.length > 1
      ? `${String(item.overrides.name ?? template.name)} · ${attack.name}${canApplyModifier ? ` · ${modifier?.name}` : ""}`
      : `${String(item.overrides.name ?? template.name)}${canApplyModifier ? ` · ${modifier?.name}` : ""}`,
    range,
    damage: getEffectNumber(displayDamage) || 1,
    damageFormula: typeof displayDamage === "string" && displayDamage.trim() ? displayDamage : undefined,
    rawDamageFormula: typeof damage === "string" && damage.trim() ? damage : undefined,
    rawDamage: getEffectNumber(damage) || 1,
    damageType: getEffectString(canApplyModifier ? modifier?.damageType ?? attack.damageType : attack.damageType, "force"),
    attackKind,
    targeting,
    modifierItem: canApplyModifier && modifier?.consumeOnUse !== false ? modifierItem : undefined,
  };
}

function getEquippedEffects(
  itemInstances: ItemInstance[],
  itemTemplates: ItemTemplate[],
  characterId: string,
  effectTemplates: EffectTemplate[] = [],
): ItemInstance["effects"] {
  return itemInstances
    .filter((item) => item.location.parent === characterId && item.location.type === "equipped")
    .flatMap((item) => getCombinedItemEffects(item, itemTemplates, effectTemplates));
}

function getGrantedAbilityTemplateIds(
  item: ItemInstance,
  itemTemplates: ItemTemplate[],
  effectTemplates: EffectTemplate[] = [],
): string[] {
  return getCombinedItemEffects(item, itemTemplates, effectTemplates)
    .filter((effect) => effect.effectId === "grantAbility")
    .map((effect) => String(effect.variables?.abilityTemplateId ?? ""))
    .filter(Boolean);
}

function createGrantedAbilityInstanceId(itemId: string, abilityTemplateId: string): string {
  return `item-ability:${itemId}:${abilityTemplateId}`;
}

function addGrantedAbilitiesForItem(
  abilityInstances: AbilityInstance[],
  abilityTemplates: AbilityTemplate[],
  itemTemplates: ItemTemplate[],
  item: ItemInstance,
  effectTemplates: EffectTemplate[] = [],
): AbilityInstance[] {
  const ownerId = item.location.parent;

  if (!ownerId) {
    return abilityInstances;
  }

  return getGrantedAbilityTemplateIds(item, itemTemplates, effectTemplates).reduce((instances, abilityTemplateId) => {
    const id = createGrantedAbilityInstanceId(item.id, abilityTemplateId);

    if (
      !abilityTemplates.some((template) => template.id === abilityTemplateId) ||
      instances.some((ability) => ability.id === id)
    ) {
      return instances;
    }

    return [
      ...instances,
      createAbilityInstance(id, abilityTemplateId, ownerId, abilityTemplates, item.id),
    ];
  }, abilityInstances);
}

function removeGrantedAbilitiesForItem(
  abilityInstances: AbilityInstance[],
  itemId: string,
): AbilityInstance[] {
  return abilityInstances.filter((ability) => ability.grantedByItemId !== itemId);
}

function reconcileGrantedAbilities(
  abilityInstances: AbilityInstance[],
  abilityTemplates: AbilityTemplate[],
  itemTemplates: ItemTemplate[],
  itemInstances: ItemInstance[],
  effectTemplates: EffectTemplate[],
): AbilityInstance[] {
  const equippedItems = itemInstances.filter(
    (item) => item.location.type === "equipped" && Boolean(item.location.parent),
  );
  const equippedIds = new Set(equippedItems.map((item) => item.id));
  const expectedKeys = new Set(equippedItems.flatMap((item) =>
    getGrantedAbilityTemplateIds(item, itemTemplates, effectTemplates)
      .map((templateId) => `${item.id}:${templateId}`)));
  const retained = abilityInstances.filter((ability) =>
    !ability.grantedByItemId ||
    (equippedIds.has(ability.grantedByItemId) && expectedKeys.has(`${ability.grantedByItemId}:${ability.templateId}`)));

  return equippedItems.reduce(
    (instances, item) => addGrantedAbilitiesForItem(
      instances,
      abilityTemplates,
      itemTemplates,
      item,
      effectTemplates,
    ),
    retained,
  );
}

function isGrantedAbilityActive(ability: AbilityInstance, itemInstances: ItemInstance[]): boolean {
  if (!ability.grantedByItemId) {
    return true;
  }

  return itemInstances.some(
    (item) =>
      item.id === ability.grantedByItemId &&
      item.location.type === "equipped" &&
      item.location.parent === ability.ownerId,
  );
}

function getAbilitySourceItemLevel(
  ability: AbilityInstance,
  itemInstances: ItemInstance[],
  itemTemplates: ItemTemplate[],
): number {
  if (!ability.grantedByItemId) {
    return 1;
  }

  const item = itemInstances.find((candidate) => candidate.id === ability.grantedByItemId);
  const template = item
    ? itemTemplates.find((candidate) => candidate.id === item.templateId)
    : undefined;
  const rawLevel = item
    ? item.current.level
      ?? item.data.level
      ?? item.overrides["base.level"]
      ?? template?.base.level
      ?? 1
    : 1;
  const level = Number(rawLevel);

  return Number.isFinite(level) ? Math.max(1, level) : 1;
}

function applyDamageReductions(
  characters: Character[],
  amount: number,
  damageType: string,
  itemInstances: ItemInstance[],
  itemTemplates: ItemTemplate[],
  characterId: string,
  effectTemplates: EffectTemplate[] = [],
): number {
  if (amount <= 0) {
    return 0;
  }

  const effects = getEquippedEffects(itemInstances, itemTemplates, characterId, effectTemplates);
  const character = characters.find((candidate) => candidate.id === characterId);
  const context = character
    ? createValueExpressionContext(character, itemInstances, itemTemplates, effectTemplates)
    : null;
  const reduction = effects.reduce((total, effect) => {
    if (effect.effectId !== "reduceDamage") {
      return total;
    }

    const reducedType = getEffectString(effect.variables?.damageType, "all");

    if (reducedType !== "all" && reducedType !== damageType) {
      return total;
    }

    return total + (context ? resolveEffectValue(effect.variables?.value, context) : getEffectNumber(effect.variables?.value));
  }, 0);
  const minDamage = effects.reduce((minimum, effect) => {
    if (effect.effectId !== "reduceDamage") {
      return minimum;
    }

    const reducedType = getEffectString(effect.variables?.damageType, "all");

    if (reducedType !== "all" && reducedType !== damageType) {
      return minimum;
    }

    return Math.max(minimum, getEffectNumber(effect.variables?.minDamage) || 1);
  }, 1);

  return Math.max(minDamage, amount - reduction);
}

function applyDamageToCharacters(
  characters: Character[],
  characterId: string,
  amount: number,
  damageType: string,
  itemInstances: ItemInstance[],
  itemTemplates: ItemTemplate[],
  effectTemplates: EffectTemplate[] = [],
): Character[] {
  const finalDamage = applyDamageReductions(
    characters,
    amount,
    damageType,
    itemInstances,
    itemTemplates,
    characterId,
    effectTemplates,
  );

  return updateCharacter(characters, characterId, (character) => ({
    ...character,
    pv: clamp(character.pv - finalDamage, 0, character.maxPv),
  }));
}

function getRandomDamageType(effect: ItemInstance["effects"][number]): string {
  const damageTypes = getEffectString(effect.variables?.damageTypes, "force")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return damageTypes[Math.floor(Math.random() * damageTypes.length)] ?? "force";
}

function toCombatMapElementKind(value: string): CombatMapElementKind {
  const kinds: CombatMapElementKind[] = [
    "hazard",
    "terrain",
    "water",
    "lava",
    "cover",
    "light",
    "darkness",
    "trigger",
    "objective",
    "resource",
  ];
  return kinds.includes(value as CombatMapElementKind) ? value as CombatMapElementKind : "hazard";
}

function createCircularZoneCells(
  center: CombatPosition,
  radius: number,
  cellSize: number,
  combat: CombatScene,
): CombatPosition[] {
  const cells: CombatPosition[] = [];
  const minX = Math.floor((center.x - radius) / cellSize) * cellSize;
  const maxX = Math.ceil((center.x + radius) / cellSize) * cellSize;
  const minY = Math.floor((center.y - radius) / cellSize) * cellSize;
  const maxY = Math.ceil((center.y + radius) / cellSize) * cellSize;

  for (let x = minX; x <= maxX; x += cellSize) {
    for (let y = minY; y <= maxY; y += cellSize) {
      const cellCenter = { x: x + cellSize / 2, y: y + cellSize / 2 };
      if (
        x >= 0 &&
        y >= 0 &&
        x < combat.map.width &&
        y < combat.map.height &&
        getDistance(center, cellCenter) <= radius
      ) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function createZoneRuntimeEffects(effect: ItemInstance["effects"][number]): CombatMapElementEffect[] {
  const runtimeEffects: CombatMapElementEffect[] = [];
  const damage = effect.variables?.damage;
  const condition = getEffectString(effect.variables?.condition);
  const triggerValue = getEffectString(effect.variables?.trigger, "startTurn");
  const trigger = triggerValue === "enter" || triggerValue === "interact" || triggerValue === "passive"
    ? triggerValue
    : "startTurn";

  if (typeof damage === "number" || typeof damage === "string") {
    runtimeEffects.push({
      trigger,
      type: "damage",
      value: damage,
      damageType: getEffectString(effect.variables?.damageType, "force"),
    });
  }
  if (condition) runtimeEffects.push({ trigger, type: "condition", condition });
  return runtimeEffects;
}

function createNewItemInstance(
  characterId: string,
  templateId: string,
  quantity: number,
): ItemInstance {
  return {
    id: `item-${crypto.randomUUID()}`,
    templateId,
    quantity,
    overrides: {},
    current: {},
    data: {},
    effects: [],
    location: {
      type: "inventory",
      parent: characterId,
    },
  };
}

function addItemInstance(
  itemInstances: ItemInstance[],
  characterId: string,
  templateId: string,
  quantity: number,
): ItemInstance[] {
  const item = createNewItemInstance(characterId, templateId, quantity);

  return [
    ...itemInstances,
    {
      ...item,
      data: {
        ...item.data,
        inventoryOrder: itemInstances.length,
      },
    },
  ];
}

function applyUsableEffects(
  state: Pick<
    GameDataState,
    | "characters"
    | "itemInstances"
    | "itemTemplates"
    | "effectTemplates"
    | "enemyTemplates"
    | "disabledContentTemplateIds"
    | "combat"
  >,
  actorCharacterId: string,
  target: ActionTarget | undefined,
  effects: ItemInstance["effects"],
  sourceItemId?: string,
  resolvedTargets?: ActionTarget[],
  sourceLabel?: string,
  valueContextCharacterId?: string,
): Pick<GameDataState, "characters" | "itemInstances" | "combat"> & { diceRolls: DiceRoll[] } {
  let characters = state.characters;
  let itemInstances = state.itemInstances;
  let combat = state.combat;
  const diceRolls: DiceRoll[] = [];
  const effectTargets = resolvedTargets && resolvedTargets.length > 0 ? resolvedTargets : [target];
  const executableEffects = resolveEffectReferences(effects, state.effectTemplates);

  executableEffects.forEach((effect) => {
    const actorCharacter = characters.find((character) => character.id === actorCharacterId);
    const firstTarget = effectTargets[0];
    const firstCombatant = getTargetCombatantFromActionTarget(combat, firstTarget, actorCharacterId);
    const firstTargetCharacterId =
      firstTarget?.kind === "self" || firstTarget?.kind === "character"
        ? firstTarget.id
        : firstCombatant?.sourceType === "character"
          ? firstCombatant.sourceId
          : undefined;
    const contextCharacter = characters.find((character) => character.id === firstTargetCharacterId) ?? actorCharacter;
    const valueContextCharacter = characters.find((character) => character.id === valueContextCharacterId)
      ?? contextCharacter;
    const diceRoll = createEffectDiceRoll(effect, valueContextCharacter, sourceLabel);
    const value = diceRoll
      ? diceRoll.result
      : valueContextCharacter
        ? getScaledEffectValue(
            effect,
            createValueExpressionContext(
              valueContextCharacter,
              itemInstances,
              state.itemTemplates,
              state.effectTemplates,
            ),
          )
        : 0;

    if (diceRoll) {
      diceRolls.push(diceRoll);
    }

    if (effect.effectId === "heal") {
      effectTargets.forEach((effectTarget) => {
        const targetCombatant = getTargetCombatantFromActionTarget(combat, effectTarget, actorCharacterId);
        const targetCharacterId =
          effectTarget?.kind === "self" || effectTarget?.kind === "character"
            ? effectTarget.id
            : targetCombatant?.sourceType === "character"
              ? targetCombatant.sourceId
              : undefined;
        const targetCharacter = targetCharacterId
          ? characters.find((character) => character.id === targetCharacterId)
          : undefined;

        if (targetCharacter) {
          characters = updateCharacter(characters, targetCharacter.id, (character) => ({
            ...character,
            pv: clamp(character.pv + value, 0, character.maxPv),
          }));
          combat = syncCharacterCombatant(
            combat,
            characters.find((character) => character.id === targetCharacter.id),
          );
        } else {
          combat = updateCombatantHp(combat, targetCombatant?.id, (hp) => hp + value);
        }
      });
    }

    if (effect.effectId === "damage") {
      effectTargets.forEach((effectTarget) => {
        const targetCombatant = getTargetCombatantFromActionTarget(combat, effectTarget, actorCharacterId);
        const targetCharacterId =
          effectTarget?.kind === "self" || effectTarget?.kind === "character"
            ? effectTarget.id
            : targetCombatant?.sourceType === "character"
              ? targetCombatant.sourceId
              : undefined;
        const targetCharacter = targetCharacterId
          ? characters.find((character) => character.id === targetCharacterId)
          : undefined;

        if (targetCharacter) {
          characters = applyDamageToCharacters(
            characters,
            targetCharacter.id,
            value,
            getEffectString(effect.variables?.damageType, "force"),
            itemInstances,
            state.itemTemplates,
            state.effectTemplates,
          );
          combat = syncCharacterCombatant(
            combat,
            characters.find((character) => character.id === targetCharacter.id),
          );
        } else {
          combat = updateCombatantHp(combat, targetCombatant?.id, (hp) => hp - value);
          const hazardState = applyHazardDestructionEffects({
            combat,
            characters,
            hazardId: targetCombatant?.id ?? "",
          });
          combat = hazardState.combat;
          characters = hazardState.characters;
          diceRolls.push(...hazardState.diceRolls);
        }
      });
    }

    if (effect.effectId === "randomDamage") {
      effectTargets.forEach((effectTarget) => {
        const targetCombatant = getTargetCombatantFromActionTarget(combat, effectTarget, actorCharacterId);
        const targetCharacterId =
          effectTarget?.kind === "self" || effectTarget?.kind === "character"
            ? effectTarget.id
            : targetCombatant?.sourceType === "character"
              ? targetCombatant.sourceId
              : undefined;
        const targetCharacter = targetCharacterId
          ? characters.find((character) => character.id === targetCharacterId)
          : undefined;

        if (targetCharacter) {
          characters = applyDamageToCharacters(
            characters,
            targetCharacter.id,
            value,
            getRandomDamageType(effect),
            itemInstances,
            state.itemTemplates,
            state.effectTemplates,
          );
          combat = syncCharacterCombatant(
            combat,
            characters.find((character) => character.id === targetCharacter.id),
          );
        } else {
          combat = updateCombatantHp(combat, targetCombatant?.id, (hp) => hp - value);
          const hazardState = applyHazardDestructionEffects({
            combat,
            characters,
            hazardId: targetCombatant?.id ?? "",
          });
          combat = hazardState.combat;
          characters = hazardState.characters;
          diceRolls.push(...hazardState.diceRolls);
        }
      });
    }

    if (effect.effectId === "inventoryInteraction") {
      const requiredTemplateId = getEffectString(effect.variables?.requiredTemplateId);
      const target = itemInstances.find(
        (candidate) =>
          candidate.templateId === requiredTemplateId &&
          candidate.location.parent === actorCharacterId &&
          candidate.id !== sourceItemId,
      );

      if (!target) {
        return;
      }

      if (effect.variables?.consumeRequired === true) {
        itemInstances = consumeItemCharge(itemInstances, target.id);
      }

      const addTemplateId = getEffectString(effect.variables?.addTemplateId);

      if (
        addTemplateId &&
        state.itemTemplates.some((template) => template.id === addTemplateId) &&
        isContentTemplateActive(state.disabledContentTemplateIds, "item", addTemplateId)
      ) {
        itemInstances = addItemInstance(
          itemInstances,
          actorCharacterId,
          addTemplateId,
          Math.max(1, getEffectNumber(effect.variables?.quantity) || 1),
        );
      }
    }

    if (effect.effectId === "applyCondition") {
      const condition = getEffectString(effect.variables?.condition);

      if (!condition) {
        return;
      }

      effectTargets.forEach((effectTarget) => {
        const targetCombatant = getTargetCombatantFromActionTarget(combat, effectTarget, actorCharacterId);

        if (!targetCombatant) {
          return;
        }

        combat = {
          ...combat,
          combatants: combat.combatants.map((combatant) =>
            combatant.id === targetCombatant.id ? addCombatantCondition(combatant, condition) : combatant,
          ),
          log: [
            createCombatLog("condition", `${targetCombatant.name} subit l'état ${getCombatConditionTemplate(condition)?.name ?? condition}.`),
            ...combat.log,
          ].slice(0, 30),
        };
      });
    }

    if (effect.effectId === "removeCondition") {
      const condition = getEffectString(effect.variables?.condition);

      if (!condition) {
        return;
      }

      effectTargets.forEach((effectTarget) => {
        const targetCombatant = getTargetCombatantFromActionTarget(combat, effectTarget, actorCharacterId);

        if (!targetCombatant) {
          return;
        }

        combat = {
          ...combat,
          combatants: combat.combatants.map((combatant) =>
            combatant.id === targetCombatant.id ? removeCombatantConditions(combatant, [condition]) : combatant,
          ),
          log: [
            createCombatLog("condition", `${targetCombatant.name} perd l'état ${getCombatConditionTemplate(condition)?.name ?? condition}.`),
            ...combat.log,
          ].slice(0, 30),
        };
      });
    }

    if (effect.effectId === "teleport") {
      const actorCombatant = getTargetCombatantFromActionTarget(
        combat,
        { kind: "self", id: actorCharacterId, label: "Soi-même" },
        actorCharacterId,
      );
      const distance = getEffectNumber(effect.variables?.range) || getEffectNumber(effect.variables?.value);
      const explicitPosition = target?.kind === "position" ? target.position : undefined;

      combat = explicitPosition
        ? moveCombatantTo(combat, actorCombatant?.id, explicitPosition)
        : moveCombatantBy(combat, actorCombatant?.id, distance);
    }

    if (effect.effectId === "move") {
      const distance = Math.max(0, getEffectNumber(effect.variables?.distance));
      effectTargets.forEach((effectTarget) => {
        const targetCombatant = getTargetCombatantFromActionTarget(combat, effectTarget, actorCharacterId);
        const explicitPosition = target?.kind === "position" ? target.position : undefined;
        combat = explicitPosition
          ? moveCombatantTo(combat, targetCombatant?.id, explicitPosition)
          : moveCombatantBy(combat, targetCombatant?.id, distance);
      });
    }

    if (effect.effectId === "modifyResource") {
      const resource = getEffectString(effect.variables?.resource);
      const operation = getEffectString(effect.variables?.op, "add");
      const amount = getEffectNumber(effect.variables?.value);
      if (resource !== "action" && resource !== "bonus" && resource !== "reaction" && resource !== "movement") {
        return;
      }
      effectTargets.forEach((effectTarget) => {
        const targetCombatant = getTargetCombatantFromActionTarget(combat, effectTarget, actorCharacterId);
        if (!targetCombatant) return;
        combat = {
          ...combat,
          combatants: combat.combatants.map((combatant) => {
            if (combatant.id !== targetCombatant.id) return combatant;
            const currentValue = combatant.resources[resource];
            const nextValue = operation === "set"
              ? amount
              : operation === "subtract"
                ? currentValue - amount
                : currentValue + amount;
            return {
              ...combatant,
              resources: { ...combatant.resources, [resource]: Math.max(0, nextValue) },
            };
          }),
        };
      });
    }

    if (effect.effectId === "createZone") {
      const actorCombatant = getTargetCombatantFromActionTarget(
        combat,
        { kind: "self", id: actorCharacterId, label: "Soi-même" },
        actorCharacterId,
      );
      const position = target?.kind === "position" ? target.position : actorCombatant?.position;
      if (!position) return;
      const zoneKind = toCombatMapElementKind(getEffectString(effect.variables?.zoneKind, "hazard"));
      const radius = Math.max(combat.map.cellSize, getEffectNumber(effect.variables?.radius) || combat.map.cellSize);
      const zoneId = `zone-${crypto.randomUUID()}`;
      combat = {
        ...combat,
        map: {
          ...combat.map,
          elements: [...combat.map.elements, {
            id: zoneId,
            name: effect.nom ?? getEffectString(effect.variables?.name, "Zone temporaire"),
            kind: zoneKind,
            x: position.x - radius,
            y: position.y - radius,
            width: radius * 2,
            height: radius * 2,
            cells: createCircularZoneCells(position, radius, combat.map.cellSize, combat),
            description: getEffectString(effect.variables?.description, "Zone créée par un effet."),
            rule: getEffectString(effect.variables?.rule, "Effet temporaire."),
            color: getEffectString(effect.variables?.color, "#9C7A2E"),
            effects: createZoneRuntimeEffects(effect),
            state: { active: true },
          }],
        },
        log: [createCombatLog("action", `${effect.nom ?? "Une zone"} apparaît sur le terrain.`), ...combat.log].slice(0, 30),
      };
    }

    if (effect.effectId === "dispel") {
      const condition = getEffectString(effect.variables?.condition);
      const zoneKind = getEffectString(effect.variables?.zoneKind);
      effectTargets.forEach((effectTarget) => {
        const targetCombatant = getTargetCombatantFromActionTarget(combat, effectTarget, actorCharacterId);
        if (!targetCombatant || !condition) return;
        combat = {
          ...combat,
          combatants: combat.combatants.map((combatant) =>
            combatant.id === targetCombatant.id
              ? removeCombatantConditions(combatant, [condition])
              : combatant),
        };
      });
      if (zoneKind) {
        combat = {
          ...combat,
          map: {
            ...combat.map,
            elements: combat.map.elements.filter((element) =>
              element.id !== zoneKind && element.kind !== zoneKind && element.name !== zoneKind),
          },
        };
      }
    }

    if (effect.effectId === "summon") {
      const templateId = getEffectString(effect.variables?.enemyTemplateId);
      const template = state.enemyTemplates.find((candidate) => candidate.id === templateId);
      if (!template || !isContentTemplateActive(state.disabledContentTemplateIds, "enemy", templateId)) return;
      const count = clamp(Math.round(getEffectNumber(effect.variables?.count) || 1), 1, 8);
      const sideValue = getEffectString(effect.variables?.side, "allies");
      const side: Combatant["side"] =
        sideValue === "players" || sideValue === "enemies" || sideValue === "neutral"
          ? sideValue
          : "allies";
      const actorCombatant = getTargetCombatantFromActionTarget(
        combat,
        { kind: "self", id: actorCharacterId, label: "Soi-même" },
        actorCharacterId,
      );
      const origin = target?.kind === "position" && target.position
        ? target.position
        : actorCombatant?.position ?? { x: 0, y: 0 };
      const summons = Array.from({ length: count }, (_, index) => {
        const sourceId = `summon-${crypto.randomUUID()}`;
        const entity: Entity = {
          id: sourceId,
          name: count > 1 ? `${template.name} ${index + 1}` : template.name,
          type: "npc",
          description: template.description,
          details: { enemyTemplateId: template.id, tags: template.tags },
        };
        return {
          ...createEntityCombatant(entity, side, combat.combatants.length + index, template),
          id: `combatant-${sourceId}`,
          sourceType: "summon" as const,
          position: clampCombatPosition({
            x: origin.x + index * combat.map.cellSize,
            y: origin.y,
          }, combat),
        };
      });
      combat = {
        ...combat,
        combatants: [...combat.combatants, ...summons],
        log: [createCombatLog("action", `${summons.length} ${template.name} rejoint la scène.`), ...combat.log].slice(0, 30),
      };
    }
  });

  return { characters, itemInstances, combat, diceRolls };
}

function applyConsumableEffects(
  state: Pick<
    GameDataState,
    | "characters"
    | "itemInstances"
    | "itemTemplates"
    | "effectTemplates"
    | "enemyTemplates"
    | "disabledContentTemplateIds"
    | "combat"
  >,
  characterId: string,
  item: ItemInstance,
  template: ItemTemplate,
  target?: ActionTarget,
  resolvedTargets?: ActionTarget[],
): Pick<GameDataState, "characters" | "itemInstances" | "combat"> & { diceRolls: DiceRoll[] } {
  return applyUsableEffects(
    state,
    characterId,
    target ?? { kind: "self", id: characterId, label: "Soi-même" },
    [...template.effects, ...item.effects],
    item.id,
    resolvedTargets,
    String(item.overrides.name ?? template.name),
  );
}

function createActionTargetFromCombatant(combatant: Combatant, source: ActionTarget["source"] = "selected"): ActionTarget {
  return {
    kind: combatant.sourceType === "character" ? "character" : "entity",
    id: combatant.sourceId,
    label: combatant.name,
    source,
  };
}

function resolveIntentEffectTargets(
  state: GameDataState,
  combat: CombatScene,
  actor: Combatant | undefined,
  intent: ChatActionIntent,
): ActionTarget[] | undefined {
  const targeting = intent.targeting ?? getActionTargeting(state, intent.kind, intent.targetId);

  if (!targeting || combat.status !== "active" || !actor) {
    return undefined;
  }

  const resolved = resolveActionTargets({
    actor,
    combat,
    fallbackCharacterId: state.selectedCharacterId,
    target: intent.target,
    targeting,
  });

  if (resolved.invalidReason) {
    return [];
  }

  if (resolved.affectedCombatants.length > 0) {
    return resolved.affectedCombatants.map((combatant) => createActionTargetFromCombatant(combatant));
  }

  return undefined;
}

function consumeItemCharge(itemInstances: ItemInstance[], itemId: string): ItemInstance[] {
  return itemInstances.flatMap((item) => {
    if (item.id !== itemId) {
      return [item];
    }

    if (item.quantity <= 1) {
      return [];
    }

    return [
      {
        ...item,
        quantity: item.quantity - 1,
      },
    ];
  });
}

function executePlayerActionIntents(
  state: GameDataState,
  intents: ChatActionIntent[],
): Pick<GameDataState, "characters" | "campaign" | "itemInstances" | "abilityInstances" | "spellbooks"> & {
  executedIntents: ChatActionIntent[];
  combat: CombatScene;
  diceRolls: DiceRoll[];
} {
  let characters = state.characters;
  let itemInstances = state.itemInstances;
  let abilityInstances = state.abilityInstances;
  let spellbooks = state.spellbooks;
  let combat = state.combat;
  const diceRolls: DiceRoll[] = [];
  const executedIntents: ChatActionIntent[] = [];
  const selectedCharacterId = state.selectedCharacterId;

  intents.slice(0, MAX_PLAYER_ACTION_INTENTS).forEach((intent) => {
    if (!isActionTargetAllowed(intent.targeting, intent.target)) {
      return;
    }

    const actor = combat.combatants.find(
      (combatant) => combatant.sourceType === "character" && combatant.sourceId === selectedCharacterId,
    );
    const activeCombatant = combat.combatants[combat.turnIndex];
    const combatCost = getIntentCombatCost(state, intent);
    const isActorTurn = Boolean(actor && activeCombatant?.id === actor.id);
    const canUseCombatTiming = combatCost === "reaction" ? Boolean(actor) : isActorTurn;
    const shouldSpendCombatAction = combat.status === "active" && actor && canUseCombatTiming;

    if (combat.status === "active" && (!actor || !canUseCombatTiming || !canSpendCombatCost(actor, combatCost))) {
      return;
    }

    if (combat.status === "active" && actor && !canCombatActionReachTarget(state, combat, actor, intent)) {
      return;
    }

    if (intent.kind === "useItem") {
      const item = itemInstances.find((candidate) => candidate.id === intent.targetId);
      const template = item
        ? state.itemTemplates.find((candidate) => candidate.id === item.templateId)
        : undefined;

      if (
        !item ||
        item.quantity <= 0 ||
        item.location.parent !== selectedCharacterId ||
        !template ||
        !isItemUsable(getTemplateTypes(template))
      ) {
        return;
      }

      const resolvedState = applyConsumableEffects(
        {
          characters,
          itemInstances,
          itemTemplates: state.itemTemplates,
          effectTemplates: state.effectTemplates,
          enemyTemplates: state.enemyTemplates,
          disabledContentTemplateIds: state.disabledContentTemplateIds,
          combat,
        },
        selectedCharacterId,
        item,
        template,
        intent.target,
        resolveIntentEffectTargets(state, combat, actor, intent),
      );

      characters = resolvedState.characters;
      itemInstances = consumeItemCharge(resolvedState.itemInstances, item.id);
      combat = resolvedState.combat;
      diceRolls.push(...resolvedState.diceRolls);
      if (shouldSpendCombatAction && actor) {
        combat = spendCombatAction(combat, actor.id, combatCost);
      }
      executedIntents.push(intent);
      return;
    }

    if (intent.kind === "attack") {
      const weapon = getEquippedWeaponData(
        itemInstances,
        state.itemTemplates,
        selectedCharacterId,
        intent.targetId,
      );
      const targeting = intent.targeting ?? getActionTargeting(state, intent.kind, intent.targetId);
      const resolvedTargets = resolveActionTargets({
        actor,
        combat,
        fallbackCharacterId: selectedCharacterId,
        target: intent.target,
        targeting,
      });
      const target = resolvedTargets.affectedCombatants[0];

      if (!weapon || !actor || !canSpendCombatCost(actor, "action")) {
        return;
      }

      if (!target && (intent.target?.kind === "free" || intent.target?.kind === "position")) {
        const interaction = intent.target.position
          ? applyCombatMapInteractionEffects({
              combat,
              characters,
              position: intent.target.position,
            })
          : null;
        if (interaction?.applied) {
          characters = interaction.characters;
          combat = interaction.combat;
          diceRolls.push(...interaction.diceRolls);
          if (shouldSpendCombatAction && actor) {
            combat = spendCombatAction(combat, actor.id, "action");
          }
          if (weapon.modifierItem) {
            itemInstances = consumeItemCharge(itemInstances, weapon.modifierItem.id);
          }
          executedIntents.push(intent);
          return;
        }

        combat = {
          ...spendCombatAction(combat, actor.id, "action"),
          log: [
            createCombatLog("action", `${actor.name} tire avec ${weapon.name}, sans cible touchée.`),
            ...combat.log,
          ].slice(0, 30),
        };
        if (weapon.modifierItem) {
          itemInstances = consumeItemCharge(itemInstances, weapon.modifierItem.id);
        }
        executedIntents.push(intent);
        return;
      }

      if (!target) {
        return;
      }

      if (
        resolvedTargets.invalidReason ||
        !hasLineOfSight(combat, actor.position, target.position) ||
        getDistance(actor.position, target.position) > weapon.range
      ) {
        return;
      }

      const attackingCharacter = characters.find((character) => character.id === selectedCharacterId);
      const attackModifier =
        getCharacterAttackScore(state.characterDerivedScores, attackingCharacter?.id, weapon.attackKind) ??
        getWeaponAttackModifier(
          attackingCharacter,
          itemInstances,
          state.itemTemplates,
          weapon.attackKind,
          state.effectTemplates,
        );
      const attackRoll = rollDiceFormula(`1d20 ${formatRollModifier(attackModifier)}`, {
        visibility: "public",
        reason: `${weapon.name} · attaque`,
      });
      const isHit = attackRoll.result > target.defense;
      let damagedCombat = combat;
      let damageAmount = 0;

      diceRolls.push(attackRoll);

      if (isHit) {
        const context = attackingCharacter
          ? createValueExpressionContext(
              attackingCharacter,
              itemInstances,
              state.itemTemplates,
              state.effectTemplates,
            )
          : null;
        const damageFormula =
          formatDamageFormula([
            weapon.rawDamageFormula ?? String(weapon.rawDamage ?? weapon.damage),
            getDefaultDamageModifier(weapon.attackKind, weapon.template, context),
          ]) ?? String(weapon.damage);

        if (/\d*d\d+/i.test(damageFormula) && context) {
          const damageRoll = rollDiceFormula(damageFormula, {
            visibility: "public",
            reason: `${weapon.name} · dégâts`,
            variables: createDiceFormulaVariablesFromContext(context),
          });
          damageAmount = Math.max(0, damageRoll.result);
          diceRolls.push(damageRoll);
        } else {
          damageAmount = Math.max(0, weapon.damage);
        }

        if (target.sourceType === "character") {
          const finalDamage = applyDamageReductions(
            characters,
            damageAmount,
            weapon.damageType,
            itemInstances,
            state.itemTemplates,
            target.sourceId,
            state.effectTemplates,
          );
          const nextHp = clamp(target.hp - finalDamage, 0, target.maxHp);

          damageAmount = finalDamage;
          characters = updateCharacter(characters, target.sourceId, (character) => ({
            ...character,
            pv: clamp(nextHp, 0, character.maxPv),
          }));
          damagedCombat = updateCombatantHp(combat, target.id, () => nextHp);
        } else {
          damageAmount = applyCombatantDamageAffinity(target, damageAmount, weapon.damageType);
          damagedCombat = updateCombatantHp(combat, target.id, (hp) => hp - damageAmount);
          const hazardState = applyHazardDestructionEffects({
            combat: damagedCombat,
            characters,
            hazardId: target.id,
          });
          damagedCombat = hazardState.combat;
          characters = hazardState.characters;
          diceRolls.push(...hazardState.diceRolls);
        }
      }

      combat = {
        ...spendCombatAction(damagedCombat, actor.id, "action"),
        log: [
          createCombatLog(
            isHit ? "damage" : "action",
            isHit
              ? `${actor.name} touche ${target.name} avec ${weapon.name} (${attackRoll.result} > DEF ${target.defense}) et inflige ${damageAmount} dégâts ${weapon.damageType}.`
              : `${actor.name} attaque ${target.name} avec ${weapon.name}, mais rate (${attackRoll.result} <= DEF ${target.defense}).`,
          ),
          ...combat.log,
        ].slice(0, 30),
      };
      if (weapon.modifierItem) {
        itemInstances = consumeItemCharge(itemInstances, weapon.modifierItem.id);
      }
      executedIntents.push(intent);
      return;
    }

    if (intent.kind === "castSpell") {
      const character = characters.find((candidate) => candidate.id === selectedCharacterId);
      const book = spellbooks.find((candidate) => candidate.characterId === selectedCharacterId);
      const spell = state.spellTemplates.find((candidate) => candidate.id === intent.targetId);
      const action = getGameActionTemplate(state.gameActionTemplates, spell?.actionId);
      const slotLevel = intent.spellLevel ?? spell?.minimumSlotLevel;

      if (!character || !book || !spell || !action || slotLevel === undefined) {
        return;
      }

      const castCheck = checkSpellCast({
        character,
        book,
        spell,
        slotLevel,
        itemInstances,
        itemTemplates: state.itemTemplates,
        combatant: actor,
      });
      if (!castCheck.canCast) {
        return;
      }

      const resolvedState = applyUsableEffects(
        {
          characters,
          itemInstances,
          itemTemplates: state.itemTemplates,
          effectTemplates: state.effectTemplates,
          enemyTemplates: state.enemyTemplates,
          disabledContentTemplateIds: state.disabledContentTemplateIds,
          combat,
        },
        selectedCharacterId,
        intent.target,
        resolveSpellEffects(spell, action, slotLevel, book.castingAbility, character.niveau),
        undefined,
        resolveIntentEffectTargets(state, combat, actor, intent),
        action.name,
        selectedCharacterId,
      );

      characters = resolvedState.characters;
      itemInstances = consumeSpellMaterials(resolvedState.itemInstances, castCheck.consumptions);
      combat = resolvedState.combat;
      diceRolls.push(...resolvedState.diceRolls);
      spellbooks = updateSpellbook(spellbooks, selectedCharacterId, (current) =>
        spendSpellSlot(current, slotLevel, spell.id, spell.concentration));
      if (shouldSpendCombatAction && actor) {
        combat = spendCombatAction(combat, actor.id, combatCost);
      }
      if (combat.status === "active") {
        combat = {
          ...combat,
          log: [
            createCombatLog(
              "action",
              `${actor?.name ?? character.name} lance ${action.name}${slotLevel > 0 ? ` au niveau ${slotLevel}` : ""}.`,
            ),
            ...combat.log,
          ].slice(0, 30),
        };
      }
      executedIntents.push(intent);
      return;
    }

    if (intent.kind === "useAbility") {
      const ability = abilityInstances.find(
        (candidate) => candidate.id === intent.targetId && candidate.ownerId === selectedCharacterId,
      );
      const template = ability
        ? getAbilityTemplate(state.abilityTemplates, ability.templateId)
        : undefined;
      const action = getGameActionTemplate(state.gameActionTemplates, template?.actionId);

      if (
        !ability ||
        !isGrantedAbilityActive(ability, itemInstances) ||
        !template ||
        !action ||
        action.activation.timing === "passive"
      ) {
        return;
      }

      const nextAbility = useAbilityCharge(ability, template);

      if (nextAbility === ability) {
        return;
      }

      const resolvedState = applyUsableEffects(
        {
          characters,
          itemInstances,
          itemTemplates: state.itemTemplates,
          effectTemplates: state.effectTemplates,
          enemyTemplates: state.enemyTemplates,
          disabledContentTemplateIds: state.disabledContentTemplateIds,
          combat,
        },
        selectedCharacterId,
        intent.target,
        [
          ...resolveGameActionEffects(action, {
            characterLevel: characters.find((candidate) => candidate.id === ability.ownerId)?.niveau ?? 1,
            abilityLevel: Number(ability.data.level ?? 1),
            itemLevel: getAbilitySourceItemLevel(ability, itemInstances, state.itemTemplates),
          }),
          ...ability.effects,
        ],
        undefined,
        resolveIntentEffectTargets(state, combat, actor, intent),
        String(ability.overrides.name ?? action.name),
      );

      characters = resolvedState.characters;
      itemInstances = resolvedState.itemInstances;
      combat = resolvedState.combat;
      diceRolls.push(...resolvedState.diceRolls);
      abilityInstances = updateAbility(abilityInstances, ability.id, () => nextAbility);
      if (shouldSpendCombatAction && actor) {
        combat = spendCombatAction(combat, actor.id, combatCost);
      }
      executedIntents.push(intent);
    }
  });

  return {
    characters,
    campaign: { ...state.campaign, characters },
    itemInstances,
    abilityInstances,
    spellbooks,
    combat,
    executedIntents,
    diceRolls,
  };
}

function createGameActionReceipt(
  before: GameDataState,
  after: ReturnType<typeof executePlayerActionIntents>,
): GameActionReceipt | undefined {
  if (after.executedIntents.length === 0) return undefined;

  const changes: GameActionReceipt["changes"] = [];
  const afterCharacters = new Map(after.characters.map((character) => [character.id, character]));
  const afterItems = new Map(after.itemInstances.map((item) => [item.id, item]));
  const beforeItems = new Map(before.itemInstances.map((item) => [item.id, item]));
  const afterAbilities = new Map(after.abilityInstances.map((ability) => [ability.id, ability]));
  const afterSpellbooks = new Map(after.spellbooks.map((book) => [book.characterId, book]));
  const afterCombatants = new Map(after.combat.combatants.map((combatant) => [combatant.id, combatant]));

  before.characters.forEach((character) => {
    const current = afterCharacters.get(character.id);
    if (!current || current.pv === character.pv) return;
    changes.push({
      kind: "hp",
      entityId: character.id,
      label: character.name,
      before: character.pv,
      after: current.pv,
      delta: current.pv - character.pv,
    });
  });

  new Set([...beforeItems.keys(), ...afterItems.keys()]).forEach((itemId) => {
    const previous = beforeItems.get(itemId);
    const current = afterItems.get(itemId);
    const beforeQuantity = previous?.quantity ?? 0;
    const afterQuantity = current?.quantity ?? 0;
    if (beforeQuantity === afterQuantity) return;
    const item = previous ?? current;
    const template = item ? before.itemTemplates.find((candidate) => candidate.id === item.templateId) : undefined;
    changes.push({
      kind: "quantity",
      entityId: itemId,
      label: item ? String(item.overrides.name ?? template?.name ?? item.id) : itemId,
      before: beforeQuantity,
      after: afterQuantity,
      delta: afterQuantity - beforeQuantity,
    });
  });

  before.abilityInstances.forEach((ability) => {
    const current = afterAbilities.get(ability.id);
    const beforeCharges = Number(ability.current.charges ?? 0);
    const afterCharges = Number(current?.current.charges ?? 0);
    if (beforeCharges === afterCharges) return;
    const template = before.abilityTemplates.find((candidate) => candidate.id === ability.templateId);
    const action = template
      ? before.gameActionTemplates.find((candidate) => candidate.id === template.actionId)
      : undefined;
    changes.push({
      kind: "charges",
      entityId: ability.id,
      label: String(ability.overrides.name ?? action?.name ?? ability.id),
      before: beforeCharges,
      after: afterCharges,
      delta: afterCharges - beforeCharges,
    });
  });

  before.spellbooks.forEach((book) => {
    const current = afterSpellbooks.get(book.characterId);
    if (!current) return;
    book.slots.forEach((slot) => {
      const nextSlot = current.slots.find((candidate) => candidate.level === slot.level);
      if (!nextSlot || nextSlot.remaining === slot.remaining) return;
      changes.push({
        kind: "resource",
        entityId: book.characterId,
        label: `Emplacement de sort Niv.${slot.level}`,
        before: slot.remaining,
        after: nextSlot.remaining,
        delta: nextSlot.remaining - slot.remaining,
      });
    });
  });

  before.combat.combatants.forEach((combatant) => {
    const current = afterCombatants.get(combatant.id);
    if (!current) return;
    if (combatant.sourceType !== "character" && current.hp !== combatant.hp) {
      changes.push({
        kind: "hp",
        entityId: combatant.id,
        label: combatant.name,
        before: combatant.hp,
        after: current.hp,
        delta: current.hp - combatant.hp,
      });
    }
    const previousConditions = [...combatant.conditions].sort().join(", ");
    const currentConditions = [...current.conditions].sort().join(", ");
    if (previousConditions !== currentConditions) {
      changes.push({
        kind: "condition",
        entityId: combatant.id,
        label: combatant.name,
        before: previousConditions || "aucun",
        after: currentConditions || "aucun",
      });
    }
    if (combatant.position.x !== current.position.x || combatant.position.y !== current.position.y) {
      changes.push({
        kind: "position",
        entityId: combatant.id,
        label: combatant.name,
        before: `${combatant.position.x},${combatant.position.y}`,
        after: `${current.position.x},${current.position.y}`,
      });
    }
    (["action", "bonus", "reaction", "movement"] as const).forEach((resource) => {
      if (combatant.resources[resource] === current.resources[resource]) return;
      changes.push({
        kind: "resource",
        entityId: combatant.id,
        label: `${combatant.name} · ${resource}`,
        before: combatant.resources[resource],
        after: current.resources[resource],
        delta: current.resources[resource] - combatant.resources[resource],
      });
    });
  });

  return {
    id: `receipt-${crypto.randomUUID()}`,
    timestamp: Date.now(),
    actions: after.executedIntents.map((intent) => ({
      kind: intent.kind,
      sourceId: intent.targetId,
      sourceLabel: resolveReceiptSourceLabel(before, intent),
      ...(intent.target ? {
        target: { id: intent.target.id, label: intent.target.label, kind: intent.target.kind },
      } : {}),
    })),
    changes,
    rolls: after.diceRolls.map((roll) => ({
      formula: roll.formula,
      result: roll.result,
      reason: roll.reason,
      visibility: roll.visibility,
    })),
  };
}

function resolveReceiptSourceLabel(state: GameDataState, intent: ChatActionIntent): string {
  if (intent.kind === "castSpell") {
    const spell = state.spellTemplates.find((candidate) => candidate.id === intent.targetId);
    return spell
      ? state.gameActionTemplates.find((candidate) => candidate.id === spell.actionId)?.name ?? intent.label
      : intent.label;
  }
  const item = state.itemInstances.find((candidate) => candidate.id === intent.targetId);
  if (item) {
    const template = state.itemTemplates.find((candidate) => candidate.id === item.templateId);
    return String(item.overrides.name ?? template?.name ?? intent.label);
  }
  const ability = state.abilityInstances.find((candidate) => candidate.id === intent.targetId);
  if (ability) {
    const template = state.abilityTemplates.find((candidate) => candidate.id === ability.templateId);
    const action = template
      ? state.gameActionTemplates.find((candidate) => candidate.id === template.actionId)
      : undefined;
    return String(ability.overrides.name ?? action?.name ?? intent.label);
  }
  return intent.label;
}

function getInventoryOrder(item: ItemInstance, fallback: number): number {
  const order = Number(item.data.inventoryOrder);
  return Number.isFinite(order) ? order : fallback;
}

function moveItemBefore(
  itemInstances: ItemInstance[],
  itemId: string,
  beforeItemId: string,
): ItemInstance[] {
  const movedItem = itemInstances.find((item) => item.id === itemId);
  const beforeItem = itemInstances.find((item) => item.id === beforeItemId);

  if (
    !movedItem ||
    !beforeItem ||
    movedItem.id === beforeItem.id ||
    movedItem.location.parent !== beforeItem.location.parent ||
    movedItem.location.type !== beforeItem.location.type
  ) {
    return itemInstances;
  }

  const sectionItems = itemInstances
    .filter(
      (item) =>
        item.location.parent === movedItem.location.parent &&
        item.location.type === movedItem.location.type,
    )
    .sort((a, b) => getInventoryOrder(a, itemInstances.indexOf(a)) - getInventoryOrder(b, itemInstances.indexOf(b)));
  const withoutMoved = sectionItems.filter((item) => item.id !== itemId);
  const beforeIndex = withoutMoved.findIndex((item) => item.id === beforeItemId);

  if (beforeIndex < 0) {
    return itemInstances;
  }

  const reordered = [
    ...withoutMoved.slice(0, beforeIndex),
    movedItem,
    ...withoutMoved.slice(beforeIndex),
  ];
  const orderById = new Map(reordered.map((item, index) => [item.id, index]));

  return itemInstances.map((item) => {
    const order = orderById.get(item.id);

    if (order === undefined) {
      return item;
    }

    return {
      ...item,
      data: {
        ...item.data,
        inventoryOrder: order,
      },
    };
  });
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      ...createInitialState(),
      dispatchGameCommand: (command) => {
        const state = get();
        const result = localGameRuntime.execute(toGameRuntimeSnapshot(state), command);
        if (!result.ok) return result;

        set((current) => ({
          gameRevision: result.state.revision,
          gameEvents: [...current.gameEvents, ...result.events].slice(-LOCAL_GAME_EVENT_LIMIT),
          campaign: result.state.campaign,
          characters: result.state.characters,
          messages: result.state.messages,
          narrativeScene: result.state.narrativeScene,
          ...withCharacterDerivedScores({
            ...current,
            characters: result.state.characters,
          }),
        }));
        return result;
      },
      selectCharacter: (characterId) => set({ selectedCharacterId: characterId }),
      setCharacterPortrait: (characterId, portrait) => {
        set((state) => ({
          characterPortraits: {
            ...state.characterPortraits,
            [characterId]: portrait,
          },
        }));
      },
      dealDamage: (characterId, amount, damageType = "force") => {
        const state = get();
        const resolvedCharacters = applyDamageToCharacters(
          state.characters,
          characterId,
          amount,
          damageType,
          state.itemInstances,
          state.itemTemplates,
          state.effectTemplates,
        );
        const resolvedCharacter = resolvedCharacters.find((character) => character.id === characterId);
        if (!resolvedCharacter) return;
        get().dispatchGameCommand(createStoreGameCommand(state, {
          type: "character.setHp",
          payload: { characterId, hp: resolvedCharacter.pv, reason: `damage:${damageType}` },
        }));
      },
      healCharacter: (characterId, amount) => {
        const state = get();
        get().dispatchGameCommand(createStoreGameCommand(state, {
          type: "character.adjustHp",
          payload: { characterId, amount, reason: "heal" },
        }));
      },
      setCharacterPv: (characterId, pv) => {
        const state = get();
        get().dispatchGameCommand(createStoreGameCommand(state, {
          type: "character.setHp",
          payload: { characterId, hp: pv, reason: "manual" },
        }));
      },
      changeCharacterStat: (characterId, stat, value, mode) => {
        const state = get();
        get().dispatchGameCommand(createStoreGameCommand(state, {
          type: "character.changeStat",
          payload: { characterId, stat, value, mode },
        }));
      },
      equipItem: (itemId) => {
        set((state) => {
          const item = state.itemInstances.find((candidate) => candidate.id === itemId);
          const template = item
            ? state.itemTemplates.find((candidate) => candidate.id === item.templateId)
            : undefined;

          if (!item || !item.location.parent || !template || !isItemEquipable(getTemplateTypes(template))) {
            return state;
          }

          const equippedItem = {
            ...item,
            location: {
              type: "equipped" as const,
              parent: item.location.parent,
            },
          };

          const itemInstances = updateItem(state.itemInstances, itemId, (currentItem) => ({
            ...currentItem,
            location: {
              type: "equipped",
              parent: currentItem.location.parent,
            },
          }));

          return {
            itemInstances,
            ...withCharacterDerivedScores({ ...state, itemInstances }),
            abilityInstances: addGrantedAbilitiesForItem(
              state.abilityInstances,
              state.abilityTemplates,
              state.itemTemplates,
              equippedItem,
              state.effectTemplates,
            ),
          };
        });
      },
      unequipItem: (itemId) => {
        set((state) => {
          const item = state.itemInstances.find((candidate) => candidate.id === itemId);
          const effects = item
            ? getCombinedItemEffects(item, state.itemTemplates, state.effectTemplates)
            : [];

          if (!item || !item.location.parent || preventsUnequip(effects)) {
            return state;
          }

          const itemInstances = updateItem(state.itemInstances, itemId, (currentItem) => ({
              ...currentItem,
              location: {
                type: "inventory",
                parent: currentItem.location.parent,
              },
          }));

          return {
            itemInstances,
            ...withCharacterDerivedScores({ ...state, itemInstances }),
            abilityInstances: removeGrantedAbilitiesForItem(state.abilityInstances, itemId),
          };
        });
      },
      moveItemToBag: (itemId) => {
        get().unequipItem(itemId);
      },
      giveItem: (characterId, templateId, quantity = 1) => {
        const state = get();
        const templateExists = state.itemTemplates.some((template) => template.id === templateId);

        if (!templateExists || !isContentTemplateActive(state.disabledContentTemplateIds, "item", templateId)) {
          return null;
        }

        const item = {
          ...createNewItemInstance(characterId, templateId, quantity),
          data: {
            inventoryOrder: get().itemInstances.length,
          },
        };

        set((state) => {
          const itemInstances = [...state.itemInstances, item];

          return {
            itemInstances,
            ...withCharacterDerivedScores({ ...state, itemInstances }),
          };
        });

        return item;
      },
      pickupItem: (itemId, characterId) => {
        const state = get();
        const item = state.itemInstances.find((candidate) => candidate.id === itemId);
        const characterExists = state.characters.some((character) => character.id === characterId);

        if (!item || item.location.type !== "world" || !characterExists) {
          return false;
        }

        set((current) => {
          const itemInstances = current.itemInstances.map((candidate) => candidate.id === itemId
            ? {
                ...candidate,
                location: { type: "inventory" as const, parent: characterId },
                data: { ...candidate.data, inventoryOrder: current.itemInstances.length },
              }
            : candidate);

          return {
            itemInstances,
            ...withCharacterDerivedScores({ ...current, itemInstances }),
          };
        });

        return true;
      },
      removeItem: (itemId) => {
        set((state) => {
          const itemInstances = state.itemInstances.filter((item) => item.id !== itemId);

          return {
            itemInstances,
            ...withCharacterDerivedScores({ ...state, itemInstances }),
            abilityInstances: removeGrantedAbilitiesForItem(state.abilityInstances, itemId),
          };
        });
      },
      modifyItemField: (itemId, path, value) => {
        const state = get();
        const item = state.itemInstances.find((candidate) => candidate.id === itemId);
        if (!item || !modifyItemInstanceField(item, path, value)) return false;

        set((current) => {
          const itemInstances = current.itemInstances.map((candidate) => {
            if (candidate.id !== itemId) return candidate;
            return modifyItemInstanceField(candidate, path, value) ?? candidate;
          });
          return {
            itemInstances,
            ...withCharacterDerivedScores({ ...current, itemInstances }),
          };
        });
        return true;
      },
      spendItemQuantity: (itemId, quantity) => {
        const amount = Math.max(1, Math.round(quantity));
        const item = get().itemInstances.find((candidate) => candidate.id === itemId);
        if (!item || item.quantity < amount) return false;

        set((state) => {
          const removed = item.quantity === amount;
          const itemInstances = removed
            ? state.itemInstances.filter((candidate) => candidate.id !== itemId)
            : updateItem(state.itemInstances, itemId, (candidate) => ({
                ...candidate,
                quantity: candidate.quantity - amount,
              }));

          return {
            itemInstances,
            ...withCharacterDerivedScores({ ...state, itemInstances }),
            abilityInstances: removed
              ? removeGrantedAbilitiesForItem(state.abilityInstances, itemId)
              : state.abilityInstances,
          };
        });

        return true;
      },
      useItem: (itemId) => {
        set((state) => {
          const item = state.itemInstances.find((candidate) => candidate.id === itemId);
          const template = item
            ? state.itemTemplates.find((candidate) => candidate.id === item.templateId)
            : undefined;
          const characterId = item?.location.parent;

          if (!item || !template || !isItemUsable(getTemplateTypes(template)) || !characterId) {
            return state;
          }

          const resolvedState = applyConsumableEffects(
            {
              characters: state.characters,
              itemInstances: state.itemInstances,
              itemTemplates: state.itemTemplates,
              effectTemplates: state.effectTemplates,
              enemyTemplates: state.enemyTemplates,
              disabledContentTemplateIds: state.disabledContentTemplateIds,
              combat: state.combat,
            },
            characterId,
            item,
            template,
          );
          const itemInstances = consumeItemCharge(resolvedState.itemInstances, itemId);

          return {
            characters: resolvedState.characters,
            campaign: { ...state.campaign, characters: resolvedState.characters },
            itemInstances,
            combat: resolvedState.combat,
            diceRolls: [...resolvedState.diceRolls, ...state.diceRolls].slice(0, 8),
          };
        });
      },
      useAbility: (abilityId) => {
        const state = get();
        const ability = state.abilityInstances.find((candidate) => candidate.id === abilityId);

        if (!ability || !isGrantedAbilityActive(ability, state.itemInstances)) {
          return false;
        }

        const template = getAbilityTemplate(state.abilityTemplates, ability.templateId);
        const action = template
          ? getGameActionTemplate(state.gameActionTemplates, template.actionId)
          : undefined;
        if (!template || !action || action.activation.timing === "passive") {
          return false;
        }
        const nextAbility = useAbilityCharge(ability, template);

        if (nextAbility === ability) {
          return false;
        }

        const resolvedState = applyUsableEffects(
          {
            characters: state.characters,
            itemInstances: state.itemInstances,
            itemTemplates: state.itemTemplates,
            effectTemplates: state.effectTemplates,
            enemyTemplates: state.enemyTemplates,
            disabledContentTemplateIds: state.disabledContentTemplateIds,
            combat: state.combat,
          },
          ability.ownerId,
          { kind: "self", id: ability.ownerId, label: "Soi-même" },
          [
            ...resolveGameActionEffects(action, {
              characterLevel: state.characters.find((candidate) => candidate.id === ability.ownerId)?.niveau ?? 1,
              abilityLevel: Number(ability.data.level ?? 1),
              itemLevel: getAbilitySourceItemLevel(ability, state.itemInstances, state.itemTemplates),
            }),
            ...ability.effects,
          ],
        );

        set((currentState) => ({
          characters: resolvedState.characters,
          campaign: { ...currentState.campaign, characters: resolvedState.characters },
          itemInstances: resolvedState.itemInstances,
          abilityInstances: updateAbility(currentState.abilityInstances, abilityId, () => nextAbility),
          combat: resolvedState.combat,
          diceRolls: [...resolvedState.diceRolls, ...currentState.diceRolls].slice(0, 8),
        }));

        return true;
      },
      rechargeAbility: (abilityId) => {
        set((state) => ({
          abilityInstances: updateAbility(state.abilityInstances, abilityId, (ability) => {
            const template = getAbilityTemplate(state.abilityTemplates, ability.templateId);

            return setAbilityChargeCount(ability, template, template?.charges?.max ?? 0);
          }),
        }));
      },
      setAbilityCharges: (abilityId, charges) => {
        set((state) => ({
          abilityInstances: updateAbility(state.abilityInstances, abilityId, (ability) =>
            setAbilityChargeCount(
              ability,
              getAbilityTemplate(state.abilityTemplates, ability.templateId),
              charges,
            ),
          ),
        }));
      },
      learnSpell: (characterId, spellId) => {
        const state = get();
        const character = state.characters.find((candidate) => candidate.id === characterId);
        const book = state.spellbooks.find((candidate) => candidate.characterId === characterId);
        const spell = state.spellTemplates.find((candidate) => candidate.id === spellId);
        if (!character || !book || !spell || !spell.classes.includes(book.classId)) return false;
        if (book.knownSpellIds.includes(spellId)) return true;
        const maxSlotLevel = book.slots.reduce((maximum, slot) => Math.max(maximum, slot.level), 0);
        if (spell.minimumSlotLevel > 0 && spell.minimumSlotLevel > maxSlotLevel) return false;

        set((current) => ({
          spellbooks: updateSpellbook(current.spellbooks, characterId, (currentBook) => ({
            ...currentBook,
            knownSpellIds: [...currentBook.knownSpellIds, spellId],
            preparedSpellIds: currentBook.preparationMode === "known"
              ? [...currentBook.preparedSpellIds, spellId]
              : currentBook.preparedSpellIds,
            updatedAt: Date.now(),
          })),
        }));
        return true;
      },
      prepareSpells: (characterId, spellIds) => {
        const state = get();
        const character = state.characters.find((candidate) => candidate.id === characterId);
        const book = state.spellbooks.find((candidate) => candidate.characterId === characterId);
        if (!character || !book) return false;
        const prepared = applyPreparedSpells(book, character, spellIds, state.spellTemplates);
        if (!prepared) return false;
        set((current) => ({
          spellbooks: updateSpellbook(current.spellbooks, characterId, () => prepared),
        }));
        return true;
      },
      registerEffectTemplate: (template, mode = "create", meta = {}) => {
        const previous = get().effectTemplates.find((candidate) => candidate.id === template.id);
        const effectTemplates = upsertCatalogEntry(get().effectTemplates, template, mode);
        if (!effectTemplates) return false;
        const auditEntry = createContentAuditEntry(
          "effect",
          meta.action ?? (previous ? "replace" : "create"),
          template,
          { source: meta.source, before: previous, after: template, note: meta.note },
        );

        set((state) => ({
          effectTemplates,
          contentAuditLog: appendContentAuditEntry(state.contentAuditLog, auditEntry),
          ...withCharacterDerivedScores({ ...state, effectTemplates }),
          abilityInstances: reconcileGrantedAbilities(
            state.abilityInstances,
            state.abilityTemplates,
            state.itemTemplates,
            state.itemInstances,
            effectTemplates,
          ),
        }));
        return true;
      },
      registerItemTemplate: (template, mode = "create", meta = {}) => {
        const normalizedTemplate = normalizeItemTemplateModules(template);
        const previous = get().itemTemplates.find((candidate) => candidate.id === normalizedTemplate.id);
        const itemTemplates = upsertCatalogEntry(get().itemTemplates, normalizedTemplate, mode);
        if (!itemTemplates) return false;
        const auditEntry = createContentAuditEntry(
          "item",
          meta.action ?? (previous ? "replace" : "create"),
          normalizedTemplate,
          { source: meta.source, before: previous, after: normalizedTemplate, note: meta.note },
        );

        set((state) => ({
          itemTemplates,
          contentAuditLog: appendContentAuditEntry(state.contentAuditLog, auditEntry),
          ...withCharacterDerivedScores({ ...state, itemTemplates }),
          abilityInstances: reconcileGrantedAbilities(
            state.abilityInstances,
            state.abilityTemplates,
            itemTemplates,
            state.itemInstances,
            state.effectTemplates,
          ),
        }));
        return true;
      },
      registerGameActionTemplate: (template, mode = "create") => {
        const gameActionTemplates = upsertCatalogEntry(get().gameActionTemplates, template, mode);
        if (!gameActionTemplates) return false;
        set({ gameActionTemplates });
        return true;
      },
      registerAbilityTemplate: (template, mode = "create", meta = {}) => {
        const previous = get().abilityTemplates.find((candidate) => candidate.id === template.id);
        const abilityTemplates = upsertCatalogEntry(get().abilityTemplates, template, mode);
        if (!abilityTemplates) return false;
        const auditEntry = createContentAuditEntry(
          "ability",
          meta.action ?? (previous ? "replace" : "create"),
          template,
          {
            source: meta.source,
            before: previous,
            after: template,
            note: meta.note,
            name: getGameActionTemplate(get().gameActionTemplates, template.actionId)?.name,
          },
        );

        set((state) => {
          const adjustedInstances = state.abilityInstances.map((ability) => {
            if (ability.templateId !== template.id || !template.charges) return ability;
            const charges = ability.current.charges ?? template.charges.initial ?? template.charges.max;
            return {
              ...ability,
              current: {
                ...ability.current,
                charges: clamp(charges, 0, template.charges.max),
              },
            };
          });
          return {
            abilityTemplates,
            contentAuditLog: appendContentAuditEntry(state.contentAuditLog, auditEntry),
            abilityInstances: reconcileGrantedAbilities(
              adjustedInstances,
              abilityTemplates,
              state.itemTemplates,
              state.itemInstances,
              state.effectTemplates,
            ),
          };
        });
        return true;
      },
      registerEnemyTemplate: (template, mode = "create", meta = {}) => {
        const previous = get().enemyTemplates.find((candidate) => candidate.id === template.id);
        const enemyTemplates = upsertCatalogEntry(get().enemyTemplates, template, mode);
        if (!enemyTemplates) return false;
        const auditEntry = createContentAuditEntry(
          "enemy",
          meta.action ?? (previous ? "replace" : "create"),
          template,
          { source: meta.source, before: previous, after: template, note: meta.note },
        );
        set((state) => ({
          enemyTemplates,
          contentAuditLog: appendContentAuditEntry(state.contentAuditLog, auditEntry),
        }));
        return true;
      },
      setContentTemplateActive: (kind, templateId, active) => {
        const state = get();
        const template = getContentTemplateFromState(state, kind, templateId);
        if (!template || isContentTemplateActive(state.disabledContentTemplateIds, kind, templateId) === active) {
          return false;
        }
        const disabledIds = active
          ? state.disabledContentTemplateIds[kind].filter((id) => id !== templateId)
          : [...state.disabledContentTemplateIds[kind], templateId];
        const auditEntry = createContentAuditEntry(kind, active ? "activate" : "deactivate", template, {
          source: "admin",
          before: template,
          after: template,
          note: active
            ? "Template rendu disponible pour les nouvelles créations."
            : "Template masqué aux agents et interdit aux nouvelles instances.",
        });
        set((current) => ({
          disabledContentTemplateIds: {
            ...current.disabledContentTemplateIds,
            [kind]: disabledIds,
          },
          contentAuditLog: appendContentAuditEntry(current.contentAuditLog, auditEntry),
        }));
        return true;
      },
      deleteContentTemplate: (kind, templateId) => {
        const state = get();
        const template = getContentTemplateFromState(state, kind, templateId);
        if (!template) return { success: false, reasons: ["Template introuvable."] };
        if (isBuiltInContentTemplate(kind, templateId)) {
          return { success: false, reasons: ["Un template livré avec l'application ne peut pas être supprimé."] };
        }
        const dependencies = getContentTemplateDependencies(
          kind,
          templateId,
          createContentDependencyContext(state),
        );
        if (dependencies.length) {
          return {
            success: false,
            reasons: dependencies.map((dependency) => `${dependency.relationship} : ${dependency.label}`),
          };
        }
        const auditEntry = createContentAuditEntry(kind, "delete", template, {
          source: "admin",
          before: template,
          note: "Suppression depuis l'Atelier de contenu.",
        });

        set((current) => {
          const disabledContentTemplateIds = {
            ...current.disabledContentTemplateIds,
            [kind]: current.disabledContentTemplateIds[kind].filter((id) => id !== templateId),
          };
          const common = {
            disabledContentTemplateIds,
            contentAuditLog: appendContentAuditEntry(current.contentAuditLog, auditEntry),
          };
          if (kind === "effect") {
            const effectTemplates = current.effectTemplates.filter((candidate) => candidate.id !== templateId);
            return {
              ...common,
              effectTemplates,
              ...withCharacterDerivedScores({ ...current, effectTemplates }),
              abilityInstances: reconcileGrantedAbilities(
                current.abilityInstances,
                current.abilityTemplates,
                current.itemTemplates,
                current.itemInstances,
                effectTemplates,
              ),
            };
          }
          if (kind === "item") {
            const itemTemplates = current.itemTemplates.filter((candidate) => candidate.id !== templateId);
            return {
              ...common,
              itemTemplates,
              ...withCharacterDerivedScores({ ...current, itemTemplates }),
              abilityInstances: reconcileGrantedAbilities(
                current.abilityInstances,
                current.abilityTemplates,
                itemTemplates,
                current.itemInstances,
                current.effectTemplates,
              ),
            };
          }
          if (kind === "ability") {
            const abilityTemplates = current.abilityTemplates.filter((candidate) => candidate.id !== templateId);
            return {
              ...common,
              abilityTemplates,
              abilityInstances: reconcileGrantedAbilities(
                current.abilityInstances,
                abilityTemplates,
                current.itemTemplates,
                current.itemInstances,
                current.effectTemplates,
              ),
            };
          }
          return {
            ...common,
            enemyTemplates: current.enemyTemplates.filter((candidate) => candidate.id !== templateId),
          };
        });
        return { success: true, reasons: [] };
      },
      clearContentAuditLog: () => set({ contentAuditLog: [] }),
      createItemInstance: (input) => {
        const state = get();
        const template = state.itemTemplates.find((candidate) => candidate.id === input.templateId);
        const id = input.id ?? `item-${crypto.randomUUID()}`;
        const parentCharacter = input.location.parent
          ? state.characters.find((character) => character.id === input.location.parent)
          : undefined;

        if (
          !template ||
          !isContentTemplateActive(state.disabledContentTemplateIds, "item", input.templateId) ||
          state.itemInstances.some((item) => item.id === id) ||
          ((input.location.type === "inventory" || input.location.type === "equipped") && !parentCharacter) ||
          (input.location.type === "equipped" && !isItemEquipable(getTemplateTypes(template)))
        ) {
          return null;
        }

        const item: ItemInstance = {
          id,
          templateId: input.templateId,
          quantity: Math.max(1, Math.round(input.quantity)),
          overrides: { ...input.overrides },
          current: { ...input.current },
          data: {
            ...input.data,
            inventoryOrder: input.data.inventoryOrder ?? state.itemInstances.length,
          },
          effects: input.effects.map((effect) => ({
            ...effect,
            variables: { ...(effect.variables ?? {}) },
          })),
          location: { ...input.location },
        };

        set((current) => {
          const itemInstances = [...current.itemInstances, item];
          return {
            itemInstances,
            ...withCharacterDerivedScores({ ...current, itemInstances }),
            abilityInstances: item.location.type === "equipped"
              ? addGrantedAbilitiesForItem(
                  current.abilityInstances,
                  current.abilityTemplates,
                  current.itemTemplates,
                  item,
                  current.effectTemplates,
                )
              : current.abilityInstances,
          };
        });
        return item;
      },
      grantAbilityToCharacter: (characterId, templateId) => {
        const state = get();
        if (
          !state.characters.some((character) => character.id === characterId) ||
          !state.abilityTemplates.some((template) => template.id === templateId) ||
          !isContentTemplateActive(state.disabledContentTemplateIds, "ability", templateId)
        ) {
          return null;
        }

        const existing = state.abilityInstances.find(
          (ability) => ability.ownerId === characterId && ability.templateId === templateId && !ability.grantedByItemId,
        );
        if (existing) return existing;

        const ability = createAbilityInstance(
          `ability-${crypto.randomUUID()}`,
          templateId,
          characterId,
          state.abilityTemplates,
        );
        set((current) => ({ abilityInstances: [...current.abilityInstances, ability] }));
        return ability;
      },
      appendCharacterHistory: (characterId, entry) => {
        const state = get();
        return get().dispatchGameCommand(createStoreGameCommand(state, {
          type: "character.appendHistory",
          payload: { characterId, entry },
        })).ok;
      },
      spawnEnemyFromTemplate: (templateId, input) => {
        const state = get();
        const template = state.enemyTemplates.find((candidate) => candidate.id === templateId);
        const entityId = input.id ?? `npc-${crypto.randomUUID()}`;
        const allEntities = [
          ...state.campaign.world.entities.npcs,
          ...state.campaign.world.entities.locations,
          ...state.campaign.world.entities.items,
        ];
        if (
          !template ||
          !isContentTemplateActive(state.disabledContentTemplateIds, "enemy", templateId) ||
          allEntities.some((entity) => entity.id === entityId)
        ) return null;

        const entity: Entity = {
          id: entityId,
          name: input.name ?? template.name,
          type: "npc",
          description: template.description,
          details: {
            role: template.category,
            importance: "combatant",
            tags: template.tags,
            enemyTemplateId: template.id,
            ...(input.parent ? { connections: [input.parent] } : {}),
          },
        };
        const combatant = createEntityCombatant(
          entity,
          input.side,
          state.combat.combatants.length,
          template,
        );
        const positionedCombatant = {
          ...combatant,
          ...(input.position ? {
            position: clampCombatPosition(input.position, state.combat),
          } : {}),
        };

        set((current) => {
          const campaign = {
            ...current.campaign,
            world: {
              ...current.campaign.world,
              entities: {
                ...current.campaign.world.entities,
                npcs: [...current.campaign.world.entities.npcs, entity],
              },
            },
          };
          return {
            campaign,
            narrativeScene: {
              ...current.narrativeScene,
              revision: current.narrativeScene.revision + 1,
              presentEntityIds: Array.from(new Set([
                ...current.narrativeScene.presentEntityIds,
                entity.id,
              ])).slice(0, 24),
            },
            combat: {
              ...current.combat,
              status: current.combat.status === "inactive" ? "setup" : current.combat.status,
              combatants: [...current.combat.combatants, positionedCombatant],
              log: [
                createCombatLog("system", `${entity.name} rejoint la scène.`),
                ...current.combat.log,
              ].slice(0, 30),
            },
          };
        });
        return positionedCombatant.id;
      },
      rest: (characterId, type) => {
        set((state) => {
          const trigger = type === "short" ? "shortRest" : "longRest";
          const abilityInstances = rechargeCharacterAbilities(
            state.abilityInstances,
            state.abilityTemplates,
            characterId,
            trigger,
          );
          const spellbooks = state.spellbooks.map((book) =>
            book.characterId === characterId
              ? restoreSpellSlots(book, type === "short" ? "shortRest" : "longRest")
              : book);

          const characters =
            type === "long"
              ? updateCharacter(state.characters, characterId, (character) => ({
                  ...character,
                  pv: character.maxPv,
                }))
              : state.characters;

          return {
            abilityInstances,
            spellbooks,
            characters,
            campaign: { ...state.campaign, characters },
          };
        });
      },
      startEncounter: (characterId) => {
        set((state) => ({
          abilityInstances: rechargeCharacterAbilities(
            state.abilityInstances,
            state.abilityTemplates,
            characterId,
            "encounter",
          ),
        }));
      },
      startCombat: () => {
        set((state) => {
          const existingCombatants = state.combat.combatants;
          const characterCombatants = state.characters
            .filter(
              (character) =>
                !existingCombatants.some(
                  (combatant) =>
                    combatant.sourceType === "character" && combatant.sourceId === character.id,
                ),
            )
            .map((character, index) => createCharacterCombatant(character, index));
          const npcCombatants = state.campaign.world.entities.npcs
            .slice(0, 3)
            .filter(
              (entity) =>
                !existingCombatants.some(
                  (combatant) => combatant.sourceType === "entity" && combatant.sourceId === entity.id,
                ),
            )
            .map((entity, index) => createEntityCombatant(
              entity,
              "enemies",
              index,
              state.enemyTemplates.find((template) => template.id === entity.details?.enemyTemplateId),
            ));
          const combatants = [...existingCombatants, ...characterCombatants, ...npcCombatants]
            .map(resetCombatantTurnResources)
            .sort((a, b) => b.initiative - a.initiative);
          const openingLog = createCombatLog("system", "Le combat commence.");

          return {
            combat: {
              ...state.combat,
              status: "active",
              round: 1,
              turnIndex: 0,
              combatants,
              log: [
                openingLog,
                ...state.combat.log,
              ].slice(0, 30),
            },
            combatNarrationQueue: appendCombatNarrationCue(
              state.combatNarrationQueue,
              createCombatNarrationCue("transition", 1, [{ type: openingLog.type, text: openingLog.text }]),
            ),
          };
        });
      },
      endCombat: () => {
        set((state) => {
          const closingLog = createCombatLog("system", "Le combat se termine.");
          return {
            combat: {
              ...state.combat,
              status: "ended",
              log: [closingLog, ...state.combat.log].slice(0, 30),
            },
            combatNarrationQueue: appendCombatNarrationCue(
              state.combatNarrationQueue,
              createCombatNarrationCue(
                "transition",
                state.combat.round,
                [{ type: closingLog.type, text: closingLog.text }],
              ),
            ),
          };
        });
      },
      addCharacterToCombat: (characterId) => {
        set((state) => {
          const character = state.characters.find((candidate) => candidate.id === characterId);

          if (
            !character ||
            state.combat.combatants.some(
              (combatant) => combatant.sourceType === "character" && combatant.sourceId === character.id,
            )
          ) {
            return state;
          }

          return {
            combat: {
              ...state.combat,
              combatants: [
                ...state.combat.combatants,
                createCharacterCombatant(character, state.combat.combatants.length),
              ],
            },
          };
        });
      },
      addEntityToCombat: (entityId, side = "enemies") => {
        set((state) => {
          const allEntities = [
            ...state.campaign.world.entities.npcs,
            ...state.campaign.world.entities.items,
            ...state.campaign.world.entities.locations,
          ];
          const entity = allEntities.find((candidate) => candidate.id === entityId);

          if (
            !entity ||
            state.combat.combatants.some(
              (combatant) => combatant.sourceType === "entity" && combatant.sourceId === entity.id,
            )
          ) {
            return state;
          }

          return {
            combat: {
              ...state.combat,
              combatants: [
                ...state.combat.combatants,
                createEntityCombatant(
                  entity,
                  side,
                  state.combat.combatants.length,
                  state.enemyTemplates.find((template) => template.id === entity.details?.enemyTemplateId),
                ),
              ],
            },
          };
        });
      },
      revealMapDetail: (detailId) => {
        set((state) => ({
          combat: {
            ...state.combat,
            map: {
              ...state.combat.map,
              details: (state.combat.map.details ?? []).map((detail) =>
                detail.id === detailId ? { ...detail, visible: true } : detail,
              ),
            },
            log: [
              createCombatLog(
                "action",
                `${state.combat.map.details?.find((detail) => detail.id === detailId)?.name ?? detailId} est révélé sur la carte.`,
              ),
              ...state.combat.log,
            ].slice(0, 30),
          },
        }));
      },
      hideMapDetail: (detailId) => {
        set((state) => ({
          combat: {
            ...state.combat,
            map: {
              ...state.combat.map,
              details: (state.combat.map.details ?? []).map((detail) =>
                detail.id === detailId ? { ...detail, visible: false } : detail,
              ),
            },
          },
        }));
      },
      moveCombatant: (combatantId, position) => {
        set((state) => {
          const combatant = state.combat.combatants.find((candidate) => candidate.id === combatantId);
          const activeCombatant = state.combat.combatants[state.combat.turnIndex];

          if (!combatant || state.combat.status === "active" && activeCombatant?.id !== combatant.id) {
            return state;
          }

          const requestedPosition = clampCombatPosition(position, state.combat);
          const requestedDistance = getDistance(combatant.position, requestedPosition);
          const maxDistance =
            state.combat.status === "active" ? combatant.resources.movement : requestedDistance;
          const nextPosition =
            state.combat.status === "active"
              ? clampPositionToMovementBudget(state.combat, combatant.position, requestedPosition, maxDistance)
              : clampPositionToFirstStopMovement(state.combat, combatant.position, requestedPosition);

          if (!hasMovementPath(state.combat, combatant.position, nextPosition)) {
            return state;
          }

          const beforeCombat = state.combat;
          const distance = getDistance(combatant.position, nextPosition);
          const movementCost = calculateMovementCost(state.combat, combatant.position, nextPosition);
          const movement = Math.max(0, combatant.resources.movement - movementCost);
          let characters = state.characters;
          const opportunityAttackers =
            combatant.resources.disengaged || distance <= 0
              ? []
              : state.combat.combatants.filter((candidate) => {
                  if (
                    candidate.id === combatant.id ||
                    candidate.hp <= 0 ||
                    candidate.resources.reaction <= 0 ||
                    !areHostileCombatants(candidate, combatant)
                  ) {
                    return false;
                  }

                  const reach = Math.max(1.5, candidate.reach);

                  return (
                    getDistance(candidate.position, combatant.position) <= reach &&
                    getDistance(candidate.position, nextPosition) > reach
                  );
                });
          const opportunityDamage = opportunityAttackers.reduce(
            (total, attacker) => total + Math.max(0, attacker.attackDamage),
            0,
          );
          const nextTargetHp = clamp(combatant.hp - opportunityDamage, 0, combatant.maxHp);

          if (opportunityDamage > 0 && combatant.sourceType === "character") {
            characters = updateCharacter(characters, combatant.sourceId, (character) => ({
              ...character,
              pv: clamp(nextTargetHp, 0, character.maxPv),
            }));
          }

          let combat: CombatScene = {
            ...state.combat,
            combatants: state.combat.combatants.map((candidate) => {
              const opportunityAttacker = opportunityAttackers.find((attacker) => attacker.id === candidate.id);

              if (candidate.id === combatantId) {
                return normalizeCombatantAfterHpChange(
                  {
                    ...candidate,
                    position: nextPosition,
                    resources: {
                      ...candidate.resources,
                      movement,
                    },
                  },
                  nextTargetHp,
                );
              }

              if (opportunityAttacker) {
                return {
                  ...candidate,
                  resources: {
                    ...candidate.resources,
                    reaction: Math.max(0, candidate.resources.reaction - 1),
                  },
                };
              }

              return candidate;
            }),
            log: [
              ...opportunityAttackers.map((attacker) =>
                createCombatLog(
                  "damage",
                  `${combatant.name} quitte l'allonge de ${attacker.name} : attaque d'opportunité, ${attacker.attackDamage} dégâts.`,
                ),
              ),
              createCombatLog(
                "move",
                `${combatant.name} se déplace de ${distance.toFixed(1)} m${
                  Math.abs(movementCost - distance) > 0.05 ? ` (${movementCost.toFixed(1)} m consommés)` : ""
                }.`,
              ),
              ...state.combat.log,
            ].slice(0, 30),
          };
          const terrainState = applyCombatMapElementEffects({
            combat,
            characters,
            combatantId,
            trigger: "enter",
            from: combatant.position,
            to: nextPosition,
          });

          combat = terrainState.combat;
          characters = terrainState.characters;
          const reactionState = applyVisibilityReactionTriggers({
            beforeCombat,
            afterCombat: combat,
            abilityInstances: state.abilityInstances,
            abilityTemplates: state.abilityTemplates,
            gameActionTemplates: state.gameActionTemplates,
            itemInstances: state.itemInstances,
            itemTemplates: state.itemTemplates,
            movedCombatantId: combatantId,
          });

          combat = reactionState.combat;

          return {
            characters,
            campaign: { ...state.campaign, characters },
            combat,
            combatNarrationQueue: appendCombatNarrationCue(
              state.combatNarrationQueue,
              createCombatNarrationCue(
                "movement",
                combat.round,
                collectNewNarratableCombatEntries(beforeCombat, combat),
              ),
            ),
            pendingActionIntents: [
              ...reactionState.pendingActionIntents,
              ...state.pendingActionIntents,
            ].slice(0, MAX_PLAYER_ACTION_INTENTS),
            diceRolls: [...terrainState.diceRolls, ...state.diceRolls].slice(0, 8),
          };
        });
      },
      disengageCombatant: (combatantId) => {
        set((state) => {
          const combatant = state.combat.combatants.find((candidate) => candidate.id === combatantId);
          const activeCombatant = state.combat.combatants[state.combat.turnIndex];

          if (
            !combatant ||
            state.combat.status !== "active" ||
            activeCombatant?.id !== combatant.id ||
            combatant.resources.action <= 0
          ) {
            return state;
          }

          const actionLog = createCombatLog("action", `${combatant.name} se désengage et surveille ses retraits.`);
          const combat: CombatScene = {
            ...state.combat,
            combatants: state.combat.combatants.map((candidate) =>
              candidate.id === combatantId
                ? {
                    ...candidate,
                    resources: {
                      ...candidate.resources,
                      action: Math.max(0, candidate.resources.action - 1),
                      disengaged: true,
                    },
                  }
                : candidate,
            ),
            log: [actionLog, ...state.combat.log].slice(0, 30),
          };

          return {
            combat,
            combatNarrationQueue: appendCombatNarrationCue(
              state.combatNarrationQueue,
              createCombatNarrationCue("action", combat.round, [{ type: actionLog.type, text: actionLog.text }]),
            ),
          };
        });
      },
      nextCombatTurn: () => {
        set((state) => {
          if (state.combat.combatants.length === 0) {
            return state;
          }

          const beforeCombat = state.combat;
          let combat = state.combat;
          let characters = state.characters;
          const diceRolls: DiceRoll[] = [];
          const reactionIntents: ChatActionIntent[] = [];
          let guard = 0;

          do {
            const nextIndex = (combat.turnIndex + 1) % combat.combatants.length;
            const nextRound = nextIndex === 0 ? combat.round + 1 : combat.round;
            const activeCombatant = combat.combatants[nextIndex];

            combat = {
              ...combat,
              round: nextRound,
              turnIndex: nextIndex,
              combatants: combat.combatants.map((combatant, index) =>
                index === nextIndex ? resetCombatantTurnResources(combatant) : combatant,
              ),
              log: [
                createCombatLog(
                  "turn",
                  `Tour de ${activeCombatant?.name ?? "combattant inconnu"}${
                    nextIndex === 0 ? `, tour ${nextRound}` : ""
                  }.`,
                ),
                ...combat.log,
              ].slice(0, 30),
            };
            if (activeCombatant) {
              const terrainState = applyCombatMapElementEffects({
                combat,
                characters,
                combatantId: activeCombatant.id,
                trigger: "startTurn",
              });
              combat = terrainState.combat;
              characters = terrainState.characters;
              diceRolls.push(...terrainState.diceRolls);
            }

            if (activeCombatant?.side === "enemies") {
              const beforeEnemyTurnCombat = combat;
              combat = applyEnemyTurn(combat, activeCombatant.id);
              const reactionState = applyVisibilityReactionTriggers({
                beforeCombat: beforeEnemyTurnCombat,
                afterCombat: combat,
                abilityInstances: state.abilityInstances,
                abilityTemplates: state.abilityTemplates,
                gameActionTemplates: state.gameActionTemplates,
                itemInstances: state.itemInstances,
                itemTemplates: state.itemTemplates,
                movedCombatantId: activeCombatant.id,
              });
              combat = reactionState.combat;
              reactionIntents.push(...reactionState.pendingActionIntents);
            }

            guard += 1;
          } while (
            guard < combat.combatants.length &&
            (!canCombatantTakeTurn(combat.combatants[combat.turnIndex]) ||
              combat.combatants[combat.turnIndex]?.side === "enemies")
          );

          return {
            characters,
            campaign: { ...state.campaign, characters },
            combat,
            combatNarrationQueue: appendCombatNarrationCue(
              state.combatNarrationQueue,
              createCombatNarrationCue(
                "enemyTurn",
                combat.round,
                collectNewNarratableCombatEntries(beforeCombat, combat),
              ),
            ),
            pendingActionIntents: [
              ...reactionIntents,
              ...state.pendingActionIntents,
            ].slice(0, MAX_PLAYER_ACTION_INTENTS),
            diceRolls: [...diceRolls, ...state.diceRolls].slice(0, 8),
          };
        });
      },
      attackCombatant: (attackerId, targetId, weaponName, damage) => {
        set((state) => {
          const attacker = state.combat.combatants.find((combatant) => combatant.id === attackerId);
          const target = state.combat.combatants.find((combatant) => combatant.id === targetId);

          if (!attacker || !target || attacker.resources.action <= 0) {
            return state;
          }

          const nextHp = Math.max(0, target.hp - Math.max(0, damage));
          const combatants = state.combat.combatants.map((combatant) =>
            combatant.id === target.id
              ? {
                  ...combatant,
                  hp: nextHp,
                }
              : combatant,
          );
          let characters = state.characters;

          if (target.sourceType === "character") {
            characters = updateCharacter(characters, target.sourceId, (character) => ({
              ...character,
              pv: clamp(nextHp, 0, character.maxPv),
            }));
          }

          const damageLog = createCombatLog(
            "damage",
            `${attacker.name} attaque ${target.name} avec ${weaponName} et inflige ${damage} dégâts.`,
          );
          const combat: CombatScene = {
            ...spendCombatAction({ ...state.combat, combatants }, attacker.id, "action"),
            log: [damageLog, ...state.combat.log].slice(0, 30),
          };

          return {
            characters,
            campaign: { ...state.campaign, characters },
            combat,
            combatNarrationQueue: appendCombatNarrationCue(
              state.combatNarrationQueue,
              createCombatNarrationCue("action", combat.round, [{ type: damageLog.type, text: damageLog.text }]),
            ),
          };
        });
      },
      consumeCombatNarrationCues: (cueIds) => {
        if (cueIds.length === 0) return;
        const consumedIds = new Set(cueIds);
        set((state) => ({
          combatNarrationQueue: state.combatNarrationQueue.filter((cue) => !consumedIds.has(cue.id)),
        }));
      },
      addAttackIntent: (weaponId, label, target) => {
        const state = get();

        if (state.pendingActionIntents.length >= MAX_PLAYER_ACTION_INTENTS) {
          return false;
        }

        const weapon = getEquippedWeaponData(
          state.itemInstances,
          state.itemTemplates,
          state.selectedCharacterId,
          weaponId,
        );

        if (!weapon) {
          return false;
        }

        const targeting = weapon.targeting ?? createAttackTargeting(weapon.range);

        if (!isActionTargetAllowed(targeting, target)) {
          return false;
        }

        set((currentState) => ({
          pendingActionIntents: [
            ...currentState.pendingActionIntents,
            createActionIntent("attack", weaponId, label, targeting, target),
          ],
        }));

        return true;
      },
      addSpellIntent: (spellId, slotLevel, requestedTarget) => {
        const state = get();
        if (state.pendingActionIntents.length >= MAX_PLAYER_ACTION_INTENTS) return false;

        const character = state.characters.find((candidate) => candidate.id === state.selectedCharacterId);
        const book = state.spellbooks.find((candidate) => candidate.characterId === state.selectedCharacterId);
        const spell = state.spellTemplates.find((candidate) => candidate.id === spellId);
        const actor = state.combat.combatants.find(
          (combatant) => combatant.sourceType === "character" && combatant.sourceId === state.selectedCharacterId,
        );
        if (!character || !book || !spell) return false;
        const action = getGameActionTemplate(state.gameActionTemplates, spell.actionId);
        if (!action) return false;

        const castCheck = checkSpellCast({
          character,
          book,
          spell,
          slotLevel,
          itemInstances: state.itemInstances,
          itemTemplates: state.itemTemplates,
          combatant: actor,
        });
        if (!castCheck.canCast) return false;

        const intentDraft = { kind: "castSpell" as const, targetId: spellId, targeting: action.targeting };
        const target = requestedTarget ?? createDefaultActionTarget(state, action.targeting, intentDraft);
        if (!isActionTargetAllowed(action.targeting, target)) return false;

        set((current) => ({
          pendingActionIntents: [
            ...current.pendingActionIntents,
            createActionIntent(
              "castSpell",
              spell.id,
              `Lancer ${action.name} · ${slotLevel === 0 ? "tour mineur" : `Niv.${slotLevel}`}`,
              action.targeting,
              target,
              slotLevel,
            ),
          ],
        }));
        return true;
      },
      addActionIntent: (kind, targetId, label, requestedTarget) => {
        const state = get();

        if (state.pendingActionIntents.length >= MAX_PLAYER_ACTION_INTENTS) {
          return false;
        }

        if (kind === "useItem") {
          const item = state.itemInstances.find((candidate) => candidate.id === targetId);
          const template = item
            ? state.itemTemplates.find((candidate) => candidate.id === item.templateId)
            : undefined;

          if (
            !item ||
            item.quantity <= 0 ||
            item.location.parent !== state.selectedCharacterId ||
            !template ||
            !isItemUsable(getTemplateTypes(template))
          ) {
            return false;
          }
        }

        if (kind === "useAbility") {
          const ability = state.abilityInstances.find(
            (candidate) => candidate.id === targetId && candidate.ownerId === state.selectedCharacterId,
          );
          const template = ability
            ? getAbilityTemplate(state.abilityTemplates, ability.templateId)
            : undefined;
          const action = template
            ? getGameActionTemplate(state.gameActionTemplates, template.actionId)
            : undefined;
          const nextAbility = ability ? useAbilityCharge(ability, template) : null;

          if (
            !ability ||
            !isGrantedAbilityActive(ability, state.itemInstances) ||
            !action ||
            action.activation.timing === "passive" ||
            !nextAbility ||
            nextAbility === ability
          ) {
            return false;
          }
        }

        if (kind === "castSpell") {
          const spell = state.spellTemplates.find((candidate) => candidate.id === targetId);
          const book = state.spellbooks.find((candidate) => candidate.characterId === state.selectedCharacterId);
          const slotLevel = spell && book
            ? (spell.minimumSlotLevel === 0
              ? 0
              : book.slots.find((slot) => slot.level >= spell.minimumSlotLevel && slot.remaining > 0)?.level)
            : undefined;
          if (slotLevel === undefined) return false;
          return state.addSpellIntent(targetId, slotLevel, requestedTarget);
        }

        const targeting = getActionTargeting(state, kind, targetId);
        const intentDraft = { kind, targetId, targeting };
        const target = requestedTarget ?? createDefaultActionTarget(state, targeting, intentDraft);

        if (!isActionTargetAllowed(targeting, target)) {
          return false;
        }

        set((currentState) => ({
          pendingActionIntents: [
            ...currentState.pendingActionIntents,
            createActionIntent(kind, targetId, label, targeting, target),
          ],
        }));

        return true;
      },
      updateActionIntentTarget: (intentId, target) => {
        set((state) => ({
          pendingActionIntents: state.pendingActionIntents.map((intent) =>
            intent.id === intentId && isActionTargetAllowed(intent.targeting, target)
              ? {
                  ...intent,
                  target: {
                    ...target,
                    source: target.source ?? "selected",
                  },
                }
              : intent,
          ),
        }));
      },
      removeActionIntent: (intentId) => {
        set((state) => ({
          pendingActionIntents: state.pendingActionIntents.filter((intent) => intent.id !== intentId),
        }));
      },
      clearActionIntents: () => set({ pendingActionIntents: [] }),
      moveItemBefore: (itemId, beforeItemId) => {
        set((state) => ({
          itemInstances: moveItemBefore(state.itemInstances, itemId, beforeItemId),
        }));
      },
      setShowItemTags: (showItemTags) => {
        set((state) => ({
          uiSettings: {
            ...state.uiSettings,
            showItemTags,
          },
        }));
      },
      clearCharacterPortraits: () => set({ characterPortraits: {} }),
      resetGameState: () => set(createInitialState()),
      startCampaign: (snapshot) => set({
        ...createCampaignRuntimeState(snapshot),
        characterPortraits: {},
      }),
      addCharacterFromPackage: (sourceSetup) => {
        let createdCharacter: Character | null = null;
        set((state) => {
          const setup = rebaseCharacterCreationPackage(sourceSetup);
          const context = createMultiplayerCharacterContext(state);
          const hasTemplateConflict =
            hasConflictingTemplateIds(setup.abilityTemplates, state.abilityTemplates) ||
            hasConflictingTemplateIds(setup.gameActionTemplates, state.gameActionTemplates) ||
            hasConflictingTemplateIds(setup.effectTemplates, state.effectTemplates);
          if (hasTemplateConflict) return state;
          const reusableSetup = {
            ...setup,
            abilityTemplates: setup.abilityTemplates.filter((template) =>
              !state.abilityTemplates.some((existing) => existing.id === template.id)),
            gameActionTemplates: setup.gameActionTemplates.filter((template) =>
              !state.gameActionTemplates.some((existing) => existing.id === template.id)),
            effectTemplates: setup.effectTemplates.filter((template) =>
              !state.effectTemplates.some((existing) => existing.id === template.id)),
          };
          const validation = validateCharacterCreationPackage(reusableSetup, context);
          if (!validation.setup) return state;

          const bundle = createCharacterInstallBundle(state, validation.setup);
          const characters = [...state.characters, bundle.character];
          const itemInstances = [...state.itemInstances, ...bundle.itemInstances];
          const abilityInstances = [...state.abilityInstances, ...bundle.abilityInstances];
          const spellbooks = synchronizeSpellbooks(
            state.spellbooks,
            characters,
            state.spellTemplates,
          );
          const campaign = { ...state.campaign, characters };
          const start = state.campaignStartSnapshot;
          const startCharacters = [...start.characters, bundle.character];
          const startItemInstances = [...start.itemInstances, ...bundle.itemInstances];
          const startAbilityInstances = [...start.abilityInstances, ...bundle.abilityInstances];
          const campaignStartSnapshot = createCampaignStartSnapshot({
            ...start,
            campaign: { ...start.campaign, characters: startCharacters },
            characters: startCharacters,
            itemTemplates: bundle.itemTemplates,
            itemInstances: startItemInstances,
            abilityTemplates: bundle.abilityTemplates,
            abilityInstances: startAbilityInstances,
            gameActionTemplates: bundle.gameActionTemplates,
            effectTemplates: bundle.effectTemplates,
            spellbooks: synchronizeSpellbooks(start.spellbooks, startCharacters, start.spellTemplates),
          });
          createdCharacter = bundle.character;

          return {
            campaign,
            characters,
            itemTemplates: bundle.itemTemplates,
            itemInstances,
            abilityTemplates: bundle.abilityTemplates,
            abilityInstances,
            gameActionTemplates: bundle.gameActionTemplates,
            effectTemplates: bundle.effectTemplates,
            spellbooks,
            campaignStartSnapshot,
            characterDerivedScores: createCharacterDerivedScores(
              characters,
              itemInstances,
              bundle.itemTemplates,
              bundle.effectTemplates,
            ),
          };
        });
        return createdCharacter;
      },
      restartCampaign: () => {
        set((state) => {
          const runtime = createCampaignRuntimeState(state.campaignStartSnapshot);
          const characterIds = new Set(state.campaignStartSnapshot.characters.map((character) => character.id));
          return {
            ...runtime,
            characterPortraits: Object.fromEntries(
              Object.entries(state.characterPortraits).filter(([characterId]) => characterIds.has(characterId)),
            ),
          };
        });
      },
      advanceNarrativeScene: (playerAction) => {
        const state = get();
        get().dispatchGameCommand(createStoreGameCommand(state, {
          type: "narrative.advanceScene",
          payload: { playerAction },
        }));
      },
      applyNarrativeScenePatch: (patch) => {
        const state = get();
        get().dispatchGameCommand(createStoreGameCommand(state, {
          type: "narrative.patchScene",
          payload: { patch },
        }));
      },
      recordNarratedBeat: (narration, proactiveKey) => {
        const state = get();
        get().dispatchGameCommand(createStoreGameCommand(state, {
          type: "narrative.recordBeat",
          payload: { narration, ...(proactiveKey ? { proactiveKey } : {}) },
        }));
      },
      addGmMessage: (content, metadata) => {
        const state = get();
        get().dispatchGameCommand(createStoreGameCommand(state, {
          type: "chat.addGmMessage",
          payload: { content, ...metadata },
        }, "gm"));
      },
      sendPlayerMessage: (content, author) => {
        const state = get();
        const trimmedContent = content.trim();
        const resolvedActions = executePlayerActionIntents(state, state.pendingActionIntents);

        if (!trimmedContent && resolvedActions.executedIntents.length === 0) {
          return;
        }

        const actionReceipt = createGameActionReceipt(state, resolvedActions);
        const playerMessage = createMessage(
          "player",
          trimmedContent,
          resolvedActions.executedIntents,
          actionReceipt,
          author,
        );

        set({
          characters: resolvedActions.characters,
          campaign: resolvedActions.campaign,
          itemInstances: resolvedActions.itemInstances,
          abilityInstances: resolvedActions.abilityInstances,
          spellbooks: resolvedActions.spellbooks,
          combat: resolvedActions.combat,
          messages: [...state.messages, playerMessage],
          pendingActionIntents: [],
          diceRolls: [...resolvedActions.diceRolls, ...state.diceRolls].slice(0, 8),
        });
      },
      setPendingGameDecision: (decision) => set({ pendingGameDecision: decision }),
      setNarrativeMomentum: (momentum) => set({ narrativeMomentum: momentum }),
      recordCampaignEvent: (entry) => {
        const state = get();
        get().dispatchGameCommand(createStoreGameCommand(state, {
          type: "campaign.appendHistory",
          payload: { entry },
        }));
      },
      roll: (sides) => {
        const selectedCharacter = get().characters.find((character) => character.id === get().selectedCharacterId);
        const rollResult = rollDiceFormula(`1d${sides}`, {
          visibility: "public",
          reason: `Jet de D${sides}`,
          variables: createDiceFormulaVariables(selectedCharacter),
        });

        set((state) => ({
          diceRolls: [rollResult, ...state.diceRolls].slice(0, 8),
        }));

        return rollResult;
      },
      rollFormula: (formula, visibility = "public", reason) => {
        const selectedCharacter = get().characters.find((character) => character.id === get().selectedCharacterId);
        const rollResult = rollDiceFormula(formula, {
          visibility,
          reason,
          variables: createDiceFormulaVariables(selectedCharacter),
        });

        set((state) => ({
          diceRolls: [rollResult, ...state.diceRolls].slice(0, 8),
        }));

        return rollResult;
      },
      queuePlayerCheck: (input) => {
        const state = get();
        if (!state.characters.some((character) => character.id === input.characterId)) return null;

        const signature = `${input.characterId}:${input.stat}:${input.skill ?? ""}:${input.dc}:${input.action.trim().toLocaleLowerCase("fr-FR")}`;
        const existing = state.playerCheckRequests.find((request) =>
          request.status === "pending" &&
          `${request.characterId}:${request.stat}:${request.skill ?? ""}:${request.dc}:${request.action.trim().toLocaleLowerCase("fr-FR")}` === signature);
        if (existing) return existing;

        const request: PlayerCheckRequest = {
          ...input,
          id: `player-check-${crypto.randomUUID()}`,
          action: input.action.trim(),
          costs: input.costs.map((cost) => ({ ...cost })),
          createdAt: Date.now(),
          status: "pending",
        };
        set((current) => ({
          playerCheckRequests: [...current.playerCheckRequests, request].slice(-30),
        }));
        return request;
      },
      completePlayerCheck: (requestId, resolution) => {
        let completed = false;
        set((state) => ({
          playerCheckRequests: state.playerCheckRequests.map((request) => {
            if (request.id !== requestId || request.status !== "pending") return request;
            completed = true;
            return { ...request, status: "resolved", resolution, error: undefined };
          }),
        }));
        return completed;
      },
      failPlayerCheck: (requestId, errorMessage) => {
        set((state) => ({
          playerCheckRequests: state.playerCheckRequests.map((request) =>
            request.id === requestId && request.status === "pending"
              ? { ...request, error: errorMessage }
              : request),
        }));
      },
      updateWorldFact: (index, value) => {
        const state = get();
        get().dispatchGameCommand(createStoreGameCommand(state, {
          type: "world.updateFact",
          payload: { index, value },
        }, "gm"));
      },
      addWorldFact: (value) => {
        const state = get();
        get().dispatchGameCommand(createStoreGameCommand(state, {
          type: "world.addFact",
          payload: { value },
        }, "gm"));
      },
      removeWorldFact: (index) => {
        const state = get();
        get().dispatchGameCommand(createStoreGameCommand(state, {
          type: "world.removeFact",
          payload: { index },
        }, "gm"));
      },
      updateEntity: (entity) => {
        const state = get();
        get().dispatchGameCommand(createStoreGameCommand(state, {
          type: "world.upsertEntity",
          payload: { entity },
        }, "gm"));
      },
      addAiApiTrace: (trace) => {
        set((state) => ({
          aiApiTraces: [trace, ...state.aiApiTraces].slice(0, 30),
        }));
      },
      clearAiApiTraces: () => set({ aiApiTraces: [] }),
    }),
    {
      name: GAME_STORAGE_KEY,
      version: GAME_STORAGE_VERSION,
      migrate: (persistedState) => normalizePersistedState(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedState(persistedState),
      }),
      partialize: (state) => ({
        storageVersion: state.storageVersion,
        gameRevision: state.gameRevision,
        gameEvents: state.gameEvents,
        campaign: state.campaign,
        characters: state.characters,
        selectedCharacterId: state.selectedCharacterId,
        messages: state.messages,
        narrativeMomentum: state.narrativeMomentum,
        pendingGameDecision: state.pendingGameDecision,
        pendingActionIntents: state.pendingActionIntents,
        diceRolls: state.diceRolls,
        playerCheckRequests: state.playerCheckRequests,
        characterPortraits: state.characterPortraits,
        uiSettings: state.uiSettings,
        itemTemplates: state.itemTemplates,
        itemInstances: state.itemInstances,
        abilityTemplates: state.abilityTemplates,
        abilityInstances: state.abilityInstances,
        gameActionTemplates: state.gameActionTemplates,
        spellTemplates: state.spellTemplates,
        spellbooks: state.spellbooks,
        effectTemplates: state.effectTemplates,
        enemyTemplates: state.enemyTemplates,
        disabledContentTemplateIds: state.disabledContentTemplateIds,
        contentAuditLog: state.contentAuditLog,
        combat: state.combat,
        combatNarrationQueue: state.combatNarrationQueue,
        aiApiTraces: state.aiApiTraces,
        campaignStartSnapshot: state.campaignStartSnapshot,
        narrativeScene: state.narrativeScene,
      }),
    },
  ),
);

import { MouseEvent, PointerEvent as ReactPointerEvent, WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  AbilityInstance,
  AbilityTemplate,
  Character,
  CharacterDerivedScores,
  Combatant,
  CombatConditionTemplate,
  CombatMapDetail,
  CombatMapElement,
  CombatPosition,
  ItemAttackModifierProfile,
  ItemInstance,
  ItemTemplate,
} from "../../app/types";
import { canUseAbility, getAbilityCharges, getAbilityMaxCharges } from "../abilities";
import { getCombatConditionTemplate, isHarmfulCombatCondition } from "./conditionTemplates";
import { getSuggestedSide } from "./targeting";
import { useGameStore } from "../../store/useGameStore";
import { HighlightedGameText } from "../../ui/gameTerms";

function getSideLabel(side: Combatant["side"]): string {
  const labels: Record<Combatant["side"], string> = {
    players: "PJ",
    allies: "Allié",
    enemies: "Ennemi",
    neutral: "Neutre",
  };

  return labels[side];
}

function getSideColor(side: Combatant["side"]): string {
  const colors: Record<Combatant["side"], string> = {
    players: "#3F6C8A",
    allies: "#3F5641",
    enemies: "#7A1F2E",
    neutral: "#6B4A5C",
  };

  return colors[side];
}

function getMapElementKindLabel(kind: CombatMapElement["kind"]): string {
  const labels: Record<CombatMapElement["kind"], string> = {
    hazard: "Danger",
    terrain: "Terrain",
    water: "Eau",
    lava: "Lave",
    cover: "Couvert",
    light: "Lumière",
    darkness: "Obscurité",
    trigger: "Déclencheur",
    objective: "Objectif",
    resource: "Ressource",
  };

  return labels[kind];
}

function getMapElementPatternId(kind: CombatMapElement["kind"]): string {
  const patterns: Record<CombatMapElement["kind"], string> = {
    hazard: "map-element-hazard",
    terrain: "map-element-terrain",
    water: "map-element-water",
    lava: "map-element-lava",
    cover: "map-element-cover",
    light: "map-element-light",
    darkness: "map-element-darkness",
    trigger: "map-element-trigger",
    objective: "map-element-objective",
    resource: "map-element-resource",
  };

  return patterns[kind];
}

function getMapElementOpacity(kind: CombatMapElement["kind"]): number {
  const opacities: Record<CombatMapElement["kind"], number> = {
    hazard: 0.74,
    terrain: 0.5,
    water: 0.62,
    lava: 0.82,
    cover: 0.82,
    light: 0.46,
    darkness: 0.64,
    trigger: 0.78,
    objective: 0.82,
    resource: 0.6,
  };

  return opacities[kind];
}

function getMapDetailIcon(kind: CombatMapDetail["kind"]): string {
  const icons: Record<CombatMapDetail["kind"], string> = {
    clue: "?",
    decoration: "·",
    looseObject: "◆",
    mechanism: "!",
    resource: "+",
  };

  return icons[kind];
}

function getMapDetailColor(kind: CombatMapDetail["kind"]): string {
  const colors: Record<CombatMapDetail["kind"], string> = {
    clue: "#5B4FCB",
    decoration: "#5C5566",
    looseObject: "#9C7A2E",
    mechanism: "#C7007E",
    resource: "#3F5641",
  };

  return colors[kind];
}

function getMapElementCells(element: CombatMapElement, cellSize: number): Array<{ x: number; y: number; width: number; height: number }> {
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

function getMapElementCenter(element: CombatMapElement): CombatPosition {
  if (Array.isArray(element.cells) && element.cells.length > 0) {
    const total = element.cells.reduce(
      (accumulator, cell) => ({
        x: accumulator.x + cell.x,
        y: accumulator.y + cell.y,
      }),
      { x: 0, y: 0 },
    );

    return {
      x: total.x / element.cells.length,
      y: total.y / element.cells.length,
    };
  }

  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  };
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function getModifier(value: number): number {
  return Math.floor((value - 10) / 2);
}

function getProficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

type AttackKind = "melee" | "ranged" | "magic";

interface AttackBreakdown {
  kind: AttackKind;
  label: string;
  value: number;
  parts: Array<{ label: string; value: number }>;
}

interface CombatWeapon {
  id: string;
  itemId: string;
  attackId: string;
  name: string;
  itemName: string;
  range: number;
  damage: number;
  damageType: string;
  modifierName?: string;
  modifierQuantity?: number;
}

interface CombatAttackAbility {
  kind: "ability";
  id: string;
  name: string;
  range: number;
  damageLabel: string;
  charges: number | null;
  maxCharges: number | null;
}

type CombatAttackOption =
  | (CombatWeapon & { kind: "weapon"; damageLabel: string })
  | CombatAttackAbility;

interface RangePreviewCell {
  x: number;
  y: number;
  size: number;
}

const DEFAULT_GRID_CELL_SIZE = 0.5;
const RANGE_CLICK_MARGIN_IN_CELLS = 1.5;

function getMapCellSize(combat: ReturnType<typeof useGameStore.getState>["combat"]): number {
  return combat.map.cellSize > 0 ? combat.map.cellSize : DEFAULT_GRID_CELL_SIZE;
}

function createAttackBreakdowns(
  character: Character | undefined,
  combatant: Combatant,
  derivedScores?: CharacterDerivedScores,
): AttackBreakdown[] {
  const level = character?.niveau ?? 1;
  const stats = character?.stats;
  const proficiency = derivedScores?.proficiencyBonus ?? getProficiencyBonus(level);
  const strength = derivedScores?.modifiers.force ?? getModifier(stats?.force ?? 10);
  const dexterity = derivedScores?.modifiers.dexterite ?? getModifier(stats?.dexterite ?? 10);
  const magicStat =
    derivedScores
      ? Math.max(derivedScores.modifiers.intelligence, derivedScores.modifiers.sagesse, derivedScores.modifiers.charisme)
      : Math.max(getModifier(stats?.intelligence ?? 10), getModifier(stats?.sagesse ?? 10), getModifier(stats?.charisme ?? 10));

  const attacks: AttackBreakdown[] = [
    {
      kind: "melee",
      label: "Contact",
      value: derivedScores?.attacks.melee ?? strength + proficiency,
      parts: [
        { label: "FOR", value: strength },
        { label: "Maîtrise", value: proficiency },
      ],
    },
    {
      kind: "ranged",
      label: "Distance",
      value: derivedScores?.attacks.ranged ?? dexterity + proficiency,
      parts: [
        { label: "DEX", value: dexterity },
        { label: "Maîtrise", value: proficiency },
      ],
    },
    {
      kind: "magic",
      label: "Magique",
      value: derivedScores?.attacks.magic ?? magicStat + proficiency,
      parts: [
        { label: "Carac. magique", value: magicStat },
        { label: "Maîtrise", value: proficiency },
      ],
    },
  ];

  return attacks.filter((attack) => attack.kind !== "magic" || character?.classe.toLowerCase().includes("mage") || combatant.attackDamage > 0);
}

function getHealthStatus(combatant: Combatant) {
  const ratio = combatant.maxHp > 0 ? combatant.hp / combatant.maxHp : 0;

  if (combatant.hp <= 0) {
    return { color: "#5C5566", label: "Hors de combat", description: "L'entité ne semble plus en état d'agir." };
  }

  if (ratio <= 0.25) {
    return { color: "#7A1F2E", label: "Critique", description: "L'entité vacille et porte des blessures très visibles." };
  }

  if (ratio <= 0.55) {
    return { color: "#B5612A", label: "Blessé", description: "L'entité tient encore debout, mais ses mouvements sont moins assurés." };
  }

  return { color: "#3F5641", label: "Stable", description: "L'entité paraît encore capable de tenir le combat." };
}

function isPlayerCombatant(combatant: Combatant): boolean {
  return combatant.side === "players" && combatant.sourceType === "character";
}

function canShowExactHp(combatant: Combatant): boolean {
  return isPlayerCombatant(combatant);
}

function shouldAppearInTurnPanel(combatant: Combatant): boolean {
  return combatant.hp > 0 && combatant.sourceType !== "hazard" && (combatant.side === "players" || combatant.side === "enemies");
}

function getHarmfulCombatConditions(combatant: Combatant): Array<{ raw: string; template: CombatConditionTemplate }> {
  return combatant.conditions.flatMap((condition) => {
    const template = getCombatConditionTemplate(condition);

    return template && isHarmfulCombatCondition(condition) ? [{ raw: condition, template }] : [];
  });
}

function getCombatantDisplayName(combatant: Combatant): string {
  if (combatant.side === "enemies") {
    return "Ennemi aperçu";
  }

  return combatant.name;
}

function getCombatantMapTitle(combatant: Combatant): string {
  if (canShowExactHp(combatant)) {
    return `${combatant.name} · ${combatant.hp}/${combatant.maxHp} PV`;
  }

  return `${getCombatantDisplayName(combatant)} · ${getHealthStatus(combatant).label}`;
}

function getCombatantSubtitle(combatant: Combatant, characters: Character[]): string {
  if (combatant.sourceType === "character") {
    const character = characters.find((candidate) => candidate.id === combatant.sourceId);

    if (character) {
      return `${character.classe} · niveau ${character.niveau}`;
    }
  }

  if (combatant.side === "enemies") {
    return "Menace hostile";
  }

  return getSideLabel(combatant.side);
}

function resolveAbilityForCharacter(
  templates: AbilityTemplate[],
  instances: AbilityInstance[],
  characterId: string,
  templateId: string,
) {
  const instance = instances.find((candidate) => candidate.ownerId === characterId && candidate.templateId === templateId);
  const template = templates.find((candidate) => candidate.id === templateId);

  if (!instance || !template) {
    return null;
  }

  return {
    id: instance.id,
    name: template.name,
    targetingV2: template.targetingV2,
    charges: instance.current.charges ?? template.charges?.initial ?? template.charges?.max ?? 0,
    maxCharges: template.charges?.max ?? 0,
  };
}

function getItemNumber(value: number | string | boolean | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getItemString(value: number | string | boolean | undefined, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function formatDamageLabel(value: number | string | boolean | undefined, damageType: string): string {
  const damageValue = typeof value === "string" && value.trim() ? value : getItemNumber(value, 1);

  return `${damageValue} dégâts ${damageType}`;
}

function getAttackKindFromProfile(attack: { range: number | string | boolean; attackKind?: "melee" | "ranged" | "magic" }): "melee" | "ranged" | "magic" {
  if (attack.attackKind === "melee" || attack.attackKind === "ranged" || attack.attackKind === "magic") {
    return attack.attackKind;
  }

  return getItemNumber(attack.range, 1.5) > 1.5 ? "ranged" : "melee";
}

function canApplyAttackModifier(
  modifier: ItemAttackModifierProfile,
  weaponTemplate: ItemTemplate,
  attackKind: "melee" | "ranged" | "magic",
): boolean {
  return (
    (!modifier.appliesToAttackKinds || modifier.appliesToAttackKinds.includes(attackKind)) &&
    (!modifier.appliesToTags || modifier.appliesToTags.some((tag) => weaponTemplate.tags.includes(tag)))
  );
}

function combineDamageLabelValue(
  baseDamage: number | string | boolean | undefined,
  modifierDamage: number | string | boolean | undefined,
): number | string | undefined {
  return formatDamageFormulaLabel([baseDamage, modifierDamage]);
}

function formatDamageFormulaLabel(parts: Array<number | string | boolean | undefined>): string | undefined {
  const tokens = parts.flatMap((part) => tokenizeDamageFormulaLabel(part));

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

function tokenizeDamageFormulaLabel(value: number | string | boolean | undefined): string[] {
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

function getDefaultDamageModifierLabel(
  attackKind: "melee" | "ranged" | "magic",
  weaponTemplate: ItemTemplate,
): string | undefined {
  if (attackKind !== "melee") {
    return undefined;
  }

  return weaponTemplate.tags.includes("finesse") || weaponTemplate.tags.includes("light") ? "DEX" : "FOR";
}

function getEquippedWeapons(
  itemInstances: ItemInstance[],
  itemTemplates: ItemTemplate[],
  characterId: string | undefined,
): Array<CombatWeapon & { kind: "weapon"; damageLabel: string }> {
  if (!characterId) {
    return [];
  }

  return itemInstances
    .filter((item) => item.location.parent === characterId && item.location.type === "equipped")
    .flatMap((item) => {
      const template = itemTemplates.find((candidate) => candidate.id === item.templateId);

      if (!template || !template.types.includes("weapon")) {
        return [];
      }

      const itemName = String(item.overrides.name ?? template.name);
      const attacks = template.attacks && template.attacks.length > 0
        ? template.attacks
        : [
            {
              id: "default",
              name: itemName,
              label: "Attaquer",
              range: item.overrides["base.range"] ?? template.base.range ?? 1.5,
              damage: item.overrides["base.damage"] ?? template.base.damage ?? template.base.attack ?? 1,
              damageType: item.overrides["base.damageType"] ?? template.base.damageType ?? "force",
            },
          ];

      return attacks.flatMap((attack) => {
        const attackKind = getAttackKindFromProfile(attack);
        const baseWeapon = {
          kind: "weapon" as const,
          id: `${item.id}:${attack.id}`,
          itemId: item.id,
          attackId: attack.id,
          name: attacks.length > 1 ? `${itemName} · ${attack.name}` : itemName,
          itemName,
          range: getItemNumber(attack.range, 1.5),
          damage: getItemNumber(attack.damage, 1),
          damageType: getItemString(attack.damageType, "force"),
          damageLabel: formatDamageLabel(
            formatDamageFormulaLabel([attack.damage, getDefaultDamageModifierLabel(attackKind, template)]) ?? attack.damage,
            getItemString(attack.damageType, "force"),
          ),
        };
        const modifiers = itemInstances.flatMap((modifierItem) => {
          if (
            modifierItem.location.parent !== characterId ||
            modifierItem.location.type !== "inventory" ||
            modifierItem.quantity <= 0
          ) {
            return [];
          }

          const modifierTemplate = itemTemplates.find((candidate) => candidate.id === modifierItem.templateId);
          return (modifierTemplate?.attackModifiers ?? [])
            .filter((modifier) => canApplyAttackModifier(modifier, template, attackKind))
            .map((modifier) => {
              const range = Math.max(0.5, baseWeapon.range + getItemNumber(modifier.rangeModifier, 0));
              const damage = combineDamageLabelValue(attack.damage, modifier.damageModifier);
              const displayDamage = formatDamageFormulaLabel([
                damage,
                getDefaultDamageModifierLabel(attackKind, template),
              ]) ?? damage;
              const damageType = getItemString(modifier.damageType ?? attack.damageType, "force");

              return {
                ...baseWeapon,
                id: `${item.id}:${attack.id}|${modifierItem.id}:${modifier.id}`,
                name: `${baseWeapon.name} · ${modifier.name}`,
                range,
                damage: getItemNumber(displayDamage, baseWeapon.damage),
                damageType,
                damageLabel: formatDamageLabel(displayDamage, damageType),
                modifierName: modifier.name,
                modifierQuantity: modifierItem.quantity,
              };
            });
        });

        return [baseWeapon, ...modifiers];
      });
    });
}

function getCombatAttackAbilities(
  abilityTemplates: AbilityTemplate[],
  abilityInstances: AbilityInstance[],
  itemInstances: ItemInstance[],
  characterId: string | undefined,
): CombatAttackAbility[] {
  if (!characterId) {
    return [];
  }

  return abilityInstances.flatMap((ability) => {
    if (ability.ownerId !== characterId) {
      return [];
    }

    if (
      ability.grantedByItemId &&
      !itemInstances.some(
        (item) =>
          item.id === ability.grantedByItemId &&
          item.location.type === "equipped" &&
          item.location.parent === characterId,
      )
    ) {
      return [];
    }

    const template = abilityTemplates.find((candidate) => candidate.id === ability.templateId);

    if (!template || template.combatRole !== "attack" || template.activation.timing !== "action" || !canUseAbility(ability, template)) {
      return [];
    }

    return [{
      kind: "ability" as const,
      id: ability.id,
      name: template.name,
      range: getItemNumber(template.targetingV2?.aim.range ?? template.targeting.range, 1.5),
      damageLabel: formatAttackAbilityDamage(template),
      charges: getAbilityCharges(ability, template),
      maxCharges: getAbilityMaxCharges(template),
    }];
  });
}

function formatAttackAbilityDamage(template: AbilityTemplate): string {
  const damage = template.effects.find(
    (effect) => effect.effectId === "damage" || effect.effectId === "randomDamage",
  );

  if (!damage) {
    return "Effet offensif";
  }

  const value = String(damage.variables?.value ?? "");
  const damageType = String(damage.variables?.damageType ?? damage.variables?.damageTypes ?? "").trim();

  return `${value || damage.nom || "Dégâts"}${damageType ? ` dégâts ${damageType}` : ""}`;
}

function getReachableAttackTargets(combat: ReturnType<typeof useGameStore.getState>["combat"], actor: Combatant | undefined, range: number) {
  if (!actor) {
    return [];
  }

  return combat.combatants
    .filter((combatant) =>
      combatant.hp > 0 &&
      (combatant.side === "enemies" || combatant.sourceType === "hazard"),
    )
    .map((combatant) => ({
      combatant,
      distance: getDistance(actor.position, combatant.position),
      visible: hasLineOfSight(combat, actor.position, combatant.position),
    }))
    .filter((target) => target.visible && target.distance <= range)
    .sort((a, b) => {
      const aPriority = a.combatant.side === "enemies" ? 0 : 1;
      const bPriority = b.combatant.side === "enemies" ? 0 : 1;

      return aPriority - bPriority || a.distance - b.distance;
    });
}

function getDistance(a: CombatPosition, b: CombatPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clampMapPosition(position: CombatPosition, width: number, height: number): CombatPosition {
  return {
    x: Math.max(0, Math.min(width, position.x)),
    y: Math.max(0, Math.min(height, position.y)),
  };
}

function clampPositionToRange(
  origin: CombatPosition | undefined,
  position: CombatPosition,
  range: number,
  map: { width: number; height: number },
): CombatPosition {
  const safeRange = Math.max(0, range - 0.001);
  const mapPosition = clampMapPosition(position, map.width, map.height);

  if (!origin || safeRange <= 0) {
    return mapPosition;
  }

  const distance = getDistance(origin, mapPosition);

  if (distance <= safeRange || distance === 0) {
    return mapPosition;
  }

  const ratio = safeRange / distance;

  return clampMapPosition(
    {
      x: origin.x + (mapPosition.x - origin.x) * ratio,
      y: origin.y + (mapPosition.y - origin.y) * ratio,
    },
    map.width,
    map.height,
  );
}

function isPointInsideObstacle(point: CombatPosition, obstacle: { x: number; y: number; width: number; height: number }) {
  return point.x >= obstacle.x && point.x <= obstacle.x + obstacle.width && point.y >= obstacle.y && point.y <= obstacle.y + obstacle.height;
}

function isPointInsideMapElement(point: CombatPosition, element: CombatMapElement, cellSize: number): boolean {
  return getMapElementCells(element, cellSize).some(
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
  element: CombatMapElement,
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

function isPointInsideBlockingObstacle(
  combat: ReturnType<typeof useGameStore.getState>["combat"],
  point: CombatPosition,
) {
  const cellSize = getMapCellSize(combat);

  return (
    combat.map.obstacles.some(
      (obstacle) =>
        (obstacle.blocksMovement || obstacle.blocksLineOfSight) &&
        isPointInsideObstacle(point, obstacle),
    ) ||
    combat.map.elements.some(
      (element) =>
        element.blocksMovement &&
        isPointInsideMapElement(point, element, cellSize),
    )
  );
}

function hasLineOfSight(combat: ReturnType<typeof useGameStore.getState>["combat"], from: CombatPosition, to: CombatPosition): boolean {
  const blockedByObstacle = combat.map.obstacles.some((obstacle) => {
    if (!obstacle.blocksLineOfSight) {
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
  });

  if (blockedByObstacle) {
    return false;
  }

  const cellSize = getMapCellSize(combat);

  return !combat.map.elements.some((element) => {
    const blocksLineOfSight =
      element.blocksLineOfSight ||
      element.effects?.some((effect) => effect.type === "lineOfSightBlock");

    return blocksLineOfSight && doesSegmentHitMapElement(from, to, element, cellSize);
  });
}

function hasMovementPath(combat: ReturnType<typeof useGameStore.getState>["combat"], from: CombatPosition, to: CombatPosition): boolean {
  const blockedByObstacle = combat.map.obstacles.some((obstacle) => {
    if (!obstacle.blocksMovement) {
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
  });

  if (blockedByObstacle) {
    return false;
  }

  const cellSize = getMapCellSize(combat);

  return !combat.map.elements.some(
    (element) => element.blocksMovement && doesSegmentHitMapElement(from, to, element, cellSize),
  );
}

function hasStopMovementEffect(element: CombatMapElement): boolean {
  return element.effects?.some((effect) => effect.type === "stopMovement") ?? false;
}

function getFirstStopMovementPoint(
  combat: ReturnType<typeof useGameStore.getState>["combat"],
  from: CombatPosition,
  to: CombatPosition,
): CombatPosition | null {
  const distance = getDistance(from, to);

  if (distance <= 0) {
    return null;
  }

  const cellSize = getMapCellSize(combat);
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
      return clampMapPosition(point, combat.map.width, combat.map.height);
    }
  }

  return null;
}

function clampPositionToFirstStopMovement(
  combat: ReturnType<typeof useGameStore.getState>["combat"],
  from: CombatPosition,
  requestedPosition: CombatPosition,
): CombatPosition {
  return getFirstStopMovementPoint(combat, from, requestedPosition) ?? requestedPosition;
}

function isPointInLineOfSightObstacle(combat: ReturnType<typeof useGameStore.getState>["combat"], point: CombatPosition): boolean {
  const cellSize = getMapCellSize(combat);

  return (
    combat.map.obstacles.some((obstacle) => obstacle.blocksLineOfSight && isPointInsideObstacle(point, obstacle)) ||
    combat.map.elements.some((element) => {
      const blocksLineOfSight =
        element.blocksLineOfSight ||
        element.effects?.some((effect) => effect.type === "lineOfSightBlock");

      return blocksLineOfSight && isPointInsideMapElement(point, element, cellSize);
    })
  );
}

function getMovementCostMultiplierAtPoint(
  combat: ReturnType<typeof useGameStore.getState>["combat"],
  point: CombatPosition,
): number {
  const cellSize = getMapCellSize(combat);
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

function calculateMovementCost(
  combat: ReturnType<typeof useGameStore.getState>["combat"],
  from: CombatPosition,
  to: CombatPosition,
): number {
  const distance = getDistance(from, to);

  if (distance <= 0) {
    return 0;
  }

  const cellSize = getMapCellSize(combat);
  const steps = Math.max(1, Math.ceil(distance / cellSize));
  let cost = 0;

  for (let index = 0; index < steps; index += 1) {
    const middleRatio = (index + 0.5) / steps;
    const point = {
      x: from.x + (to.x - from.x) * middleRatio,
      y: from.y + (to.y - from.y) * middleRatio,
    };

    cost += distance / steps * getMovementCostMultiplierAtPoint(combat, point);
  }

  return cost;
}

function clampPositionToMovementBudget(
  combat: ReturnType<typeof useGameStore.getState>["combat"],
  from: CombatPosition,
  requestedPosition: CombatPosition,
  movementBudget: number,
): CombatPosition {
  const stoppedRequestedPosition = clampPositionToFirstStopMovement(combat, from, requestedPosition);

  if (movementBudget <= 0 || getDistance(from, requestedPosition) <= 0) {
    return from;
  }

  if (
    hasMovementPath(combat, from, stoppedRequestedPosition) &&
    calculateMovementCost(combat, from, stoppedRequestedPosition) <= movementBudget
  ) {
    return stoppedRequestedPosition;
  }

  let low = 0;
  let high = 1;
  let best = from;

  for (let index = 0; index < 16; index += 1) {
    const ratio = (low + high) / 2;
    const candidate = clampMapPosition(
      {
        x: from.x + (stoppedRequestedPosition.x - from.x) * ratio,
        y: from.y + (stoppedRequestedPosition.y - from.y) * ratio,
      },
      combat.map.width,
      combat.map.height,
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

function findNearestValidMapPosition({
  combat,
  origin,
  position,
  range,
  requiresMovementPath = false,
}: {
  combat: ReturnType<typeof useGameStore.getState>["combat"];
  origin: CombatPosition | undefined;
  position: CombatPosition;
  range: number;
  requiresMovementPath?: boolean;
}): CombatPosition | null {
  const cellSize = getMapCellSize(combat);
  const rangeMargin = cellSize * RANGE_CLICK_MARGIN_IN_CELLS;
  const mapPosition = clampMapPosition(position, combat.map.width, combat.map.height);

  if (origin && getDistance(origin, mapPosition) > range + rangeMargin) {
    return null;
  }

  const clampedPosition =
    requiresMovementPath && origin
      ? clampPositionToMovementBudget(combat, origin, mapPosition, range)
      : clampPositionToRange(origin, position, range, combat.map);

  if (
    !isPointInsideBlockingObstacle(combat, clampedPosition) &&
    (!requiresMovementPath ||
      !origin ||
      (hasMovementPath(combat, origin, clampedPosition) && calculateMovementCost(combat, origin, clampedPosition) <= range + 0.001))
  ) {
    return clampedPosition;
  }

  const fallbackRange = Math.max(cellSize, range);
  const minX = Math.max(0, Math.floor(((origin?.x ?? clampedPosition.x) - fallbackRange) / cellSize) * cellSize);
  const maxX = Math.min(combat.map.width - cellSize, Math.ceil(((origin?.x ?? clampedPosition.x) + fallbackRange) / cellSize) * cellSize);
  const minY = Math.max(0, Math.floor(((origin?.y ?? clampedPosition.y) - fallbackRange) / cellSize) * cellSize);
  const maxY = Math.min(combat.map.height - cellSize, Math.ceil(((origin?.y ?? clampedPosition.y) + fallbackRange) / cellSize) * cellSize);
  const candidates: CombatPosition[] = [];

  for (let y = minY; y <= maxY; y += cellSize) {
    for (let x = minX; x <= maxX; x += cellSize) {
      const center = { x: x + cellSize / 2, y: y + cellSize / 2 };

      if (origin && getDistance(origin, center) > fallbackRange + 0.001) {
        continue;
      }

      if (isPointInsideBlockingObstacle(combat, center)) {
        continue;
      }

      if (
        requiresMovementPath &&
        origin &&
        (!hasMovementPath(combat, origin, center) || calculateMovementCost(combat, origin, center) > range + 0.001)
      ) {
        continue;
      }

      candidates.push(center);
    }
  }

  return candidates.sort((a, b) => getDistance(a, clampedPosition) - getDistance(b, clampedPosition))[0] ?? origin ?? clampedPosition;
}

function createRangePreviewCells(
  combat: ReturnType<typeof useGameStore.getState>["combat"],
  origin: CombatPosition | undefined,
  range: number,
  requiresLineOfSight: boolean,
  requiresMovementPath = false,
): RangePreviewCell[] {
  if (!origin || range <= 0) {
    return [];
  }

  const cellSize = getMapCellSize(combat);
  const cells: RangePreviewCell[] = [];
  const minX = Math.max(0, Math.floor((origin.x - range) / cellSize) * cellSize);
  const maxX = Math.min(combat.map.width - cellSize, Math.ceil((origin.x + range) / cellSize) * cellSize);
  const minY = Math.max(0, Math.floor((origin.y - range) / cellSize) * cellSize);
  const maxY = Math.min(combat.map.height - cellSize, Math.ceil((origin.y + range) / cellSize) * cellSize);

  for (let y = minY; y <= maxY; y += cellSize) {
    for (let x = minX; x <= maxX; x += cellSize) {
      const center = { x: x + cellSize / 2, y: y + cellSize / 2 };

      const effectiveDistance = requiresMovementPath
        ? calculateMovementCost(combat, origin, center)
        : getDistance(origin, center);

      if (effectiveDistance > range + 0.001) {
        continue;
      }

      if (isPointInsideBlockingObstacle(combat, center)) {
        continue;
      }

      if (requiresMovementPath && !hasMovementPath(combat, origin, center)) {
        continue;
      }

      if (requiresMovementPath) {
        const stopPoint = getFirstStopMovementPoint(combat, origin, center);

        if (stopPoint && getDistance(origin, stopPoint) + cellSize * 0.75 < getDistance(origin, center)) {
          continue;
        }
      }

      if (
        requiresLineOfSight &&
        (isPointInLineOfSightObstacle(combat, center) || !hasLineOfSight(combat, origin, center))
      ) {
        continue;
      }

      cells.push({ x, y, size: cellSize });
    }
  }

  return cells;
}

function isShadowActionName(value: string | undefined): boolean {
  const normalized = value?.toLowerCase() ?? "";

  return normalized.includes("ombre") || normalized.includes("shadow");
}

function shouldShowMapElementForContext(
  element: CombatMapElement,
  context: {
    isMoveMode: boolean;
    isAttackDialogOpen: boolean;
    positionAbilityTargeting: { id: string; name: string } | null;
    requestedMapTargetIntent: { targetId: string; command: string; label: string } | null;
  },
): boolean {
  const hasContext =
    context.isMoveMode ||
    context.isAttackDialogOpen ||
    context.positionAbilityTargeting ||
    context.requestedMapTargetIntent;

  if (!hasContext) {
    return true;
  }

  if (
    isShadowActionName(context.positionAbilityTargeting?.name) ||
    isShadowActionName(context.requestedMapTargetIntent?.command) ||
    isShadowActionName(context.requestedMapTargetIntent?.label)
  ) {
    return element.kind === "darkness";
  }

  const effectTypes = new Set((element.effects ?? []).map((effect) => effect.type));

  if (context.isMoveMode) {
    return (
      element.kind === "hazard" ||
      element.kind === "terrain" ||
      element.kind === "water" ||
      element.kind === "lava" ||
      element.kind === "darkness" ||
      effectTypes.has("damage") ||
      effectTypes.has("movementCost") ||
      effectTypes.has("stopMovement") ||
      effectTypes.has("condition") ||
      effectTypes.has("alert")
    );
  }

  if (context.isAttackDialogOpen) {
    return (
      element.kind === "cover" ||
      element.kind === "darkness" ||
      element.kind === "hazard" ||
      element.kind === "lava" ||
      element.kind === "trigger" ||
      effectTypes.has("cover") ||
      effectTypes.has("lineOfSightBlock")
    );
  }

  return (
    element.kind === "hazard" ||
    element.kind === "terrain" ||
    element.kind === "water" ||
    element.kind === "lava" ||
    element.kind === "darkness" ||
    element.kind === "resource" ||
    element.kind === "trigger" ||
    effectTypes.has("damage") ||
    effectTypes.has("heal") ||
    effectTypes.has("stopMovement") ||
    effectTypes.has("condition") ||
    effectTypes.has("alert")
  );
}

function isVisibleToPlayers(combat: ReturnType<typeof useGameStore.getState>["combat"], combatant: Combatant): boolean {
  if (combatant.side === "players" || combatant.side === "allies") {
    return true;
  }

  const viewers = combat.combatants.filter((item) => item.side === "players" || item.side === "allies");
  return viewers.some((viewer) => hasLineOfSight(combat, viewer.position, combatant.position));
}

export function CombatMap({
  mapTargetIntentId,
  onCancelMapTarget,
  onMapTargeted,
  onNavigateToReading,
}: {
  mapTargetIntentId?: string | null;
  onCancelMapTarget?: () => void;
  onMapTargeted?: () => void;
  onNavigateToReading?: () => void;
}) {
  const combat = useGameStore((state) => state.combat);
  const characters = useGameStore((state) => state.characters);
  const selectedCharacterId = useGameStore((state) => state.selectedCharacterId);
  const pendingActionIntents = useGameStore((state) => state.pendingActionIntents);
  const itemInstances = useGameStore((state) => state.itemInstances);
  const itemTemplates = useGameStore((state) => state.itemTemplates);
  const abilityTemplates = useGameStore((state) => state.abilityTemplates);
  const abilityInstances = useGameStore((state) => state.abilityInstances);
  const addActionIntent = useGameStore((state) => state.addActionIntent);
  const addAttackIntent = useGameStore((state) => state.addAttackIntent);
  const updateActionIntentTarget = useGameStore((state) => state.updateActionIntentTarget);
  const startCombat = useGameStore((state) => state.startCombat);
  const endCombat = useGameStore((state) => state.endCombat);
  const nextCombatTurn = useGameStore((state) => state.nextCombatTurn);
  const moveCombatant = useGameStore((state) => state.moveCombatant);
  const disengageCombatant = useGameStore((state) => state.disengageCombatant);
  const [selectedCombatantId, setSelectedCombatantId] = useState<string | null>(null);
  const [inspectedStatusId, setInspectedStatusId] = useState<string | null>(null);
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [isAttackDialogOpen, setIsAttackDialogOpen] = useState(false);
  const [isAttackTargetingOnMap, setIsAttackTargetingOnMap] = useState(false);
  const [positionAbilityTargeting, setPositionAbilityTargeting] = useState<{ id: string; name: string; range: number; lineOfSight: boolean } | null>(null);
  const [selectedWeaponId, setSelectedWeaponId] = useState<string | null>(null);
  const [selectedAttackTargetId, setSelectedAttackTargetId] = useState<string | null>(null);
  const [selectedMapElementId, setSelectedMapElementId] = useState<string | null>(null);
  const [selectedMapDetailId, setSelectedMapDetailId] = useState<string | null>(null);
  const [isGroundShotConfirmOpen, setIsGroundShotConfirmOpen] = useState(false);
  const [groundShotPosition, setGroundShotPosition] = useState<CombatPosition | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    panX: number;
    panY: number;
    viewWidth: number;
    viewHeight: number;
    moved: boolean;
  } | null>(null);
  const activeCombatant = combat.combatants[combat.turnIndex] ?? null;
  const selectedCombatant = useMemo(
    () =>
      combat.combatants.find((combatant) => combatant.id === selectedCombatantId) ??
      activeCombatant,
    [activeCombatant, combat.combatants, selectedCombatantId],
  );
  const playerCombatant =
    combat.combatants.find(
      (combatant) => combatant.sourceType === "character" && combatant.sourceId === selectedCharacterId,
    ) ?? combat.combatants.find((combatant) => combatant.side === "players");
  const playerCharacter = playerCombatant
    ? characters.find((character) => character.id === playerCombatant.sourceId)
    : undefined;
  const gridCellSize = getMapCellSize(combat);
  const shadowStep = playerCharacter
    ? resolveAbilityForCharacter(abilityTemplates, abilityInstances, playerCharacter.id, "abl_shadow_step")
    : null;
  const weapons = useMemo(
    () => getEquippedWeapons(itemInstances, itemTemplates, playerCharacter?.id),
    [itemInstances, itemTemplates, playerCharacter?.id],
  );
  const attackAbilities = useMemo(
    () => getCombatAttackAbilities(abilityTemplates, abilityInstances, itemInstances, playerCharacter?.id),
    [abilityInstances, abilityTemplates, itemInstances, playerCharacter?.id],
  );
  const attackOptions = useMemo<CombatAttackOption[]>(
    () => [...weapons, ...attackAbilities],
    [attackAbilities, weapons],
  );
  const requestedMapTargetIntent = pendingActionIntents.find((intent) => intent.id === mapTargetIntentId) ?? null;
  const selectedAttackOption = attackOptions.find((option) => option.id === selectedWeaponId) ?? attackOptions[0];
  const mapElements = combat.map.elements ?? [];
  const hasActiveMapAction = Boolean(isMoveMode || isAttackTargetingOnMap || positionAbilityTargeting || requestedMapTargetIntent);
  const highlightedMapElementIds = new Set(
    mapElements
      .filter((element) =>
        shouldShowMapElementForContext(element, {
          isMoveMode,
          isAttackDialogOpen: isAttackTargetingOnMap,
          positionAbilityTargeting,
          requestedMapTargetIntent,
        }),
      )
      .map((element) => element.id),
  );
  const visibleMapElements = mapElements;
  const selectedMapElement = visibleMapElements.find((element) => element.id === selectedMapElementId) ?? null;
  const visibleMapDetails = (combat.map.details ?? []).filter((detail) => detail.visible !== false);
  const selectedMapDetail = visibleMapDetails.find((detail) => detail.id === selectedMapDetailId) ?? null;
  const hasContextualElementHighlight = mapElements.some((element) =>
    shouldShowMapElementForContext(element, {
      isMoveMode,
      isAttackDialogOpen: isAttackTargetingOnMap,
      positionAbilityTargeting,
      requestedMapTargetIntent,
    }),
  );
  const requestedMapTargetRange = Number(requestedMapTargetIntent?.targeting?.range);
  const tooltipPosition = selectedMapElement
    ? getMapElementCenter(selectedMapElement)
    : selectedMapDetail
      ? { x: selectedMapDetail.x, y: selectedMapDetail.y }
      : null;
  const tooltipViewBox = getViewBox();
  const tooltipLeft = tooltipPosition
    ? Math.max(10, Math.min(82, ((tooltipPosition.x - tooltipViewBox.x) / tooltipViewBox.width) * 100 + 3))
    : 0;
  const tooltipTop = tooltipPosition
    ? Math.max(10, Math.min(78, ((tooltipPosition.y - tooltipViewBox.y) / tooltipViewBox.height) * 100 - 4))
    : 0;
  const previewRange = requestedMapTargetIntent
    ? Number.isFinite(requestedMapTargetRange) && requestedMapTargetRange > 0
      ? requestedMapTargetRange
      : 1.5
    : isMoveMode
    ? playerCombatant?.resources.movement ?? 0
    : isAttackTargetingOnMap
      ? selectedAttackOption?.range ?? 0
      : positionAbilityTargeting
        ? positionAbilityTargeting.range
      : 0;
  const previewRequiresLineOfSight = requestedMapTargetIntent
    ? requestedMapTargetIntent.targeting?.lineOfSight !== false
    : positionAbilityTargeting
      ? positionAbilityTargeting.lineOfSight
      : isAttackTargetingOnMap;
  const rangePreviewCells = useMemo(
    () => createRangePreviewCells(combat, playerCombatant?.position, previewRange, previewRequiresLineOfSight, isMoveMode),
    [combat, isMoveMode, playerCombatant?.position, previewRange, previewRequiresLineOfSight],
  );
  const canMoveSelected =
    combat.status !== "active" ||
    (selectedCombatant && activeCombatant?.id === selectedCombatant.id && selectedCombatant.resources.movement > 0);
  const canMovePlayer =
    combat.status !== "active" ||
    (playerCombatant && activeCombatant?.id === playerCombatant.id && playerCombatant.resources.movement > 0);

  useEffect(() => {
    if (!selectedMapElementId && !selectedMapDetailId) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setSelectedMapElementId(null);
      setSelectedMapDetailId(null);
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [selectedMapDetailId, selectedMapElementId]);

  useEffect(() => {
    if (!requestedMapTargetIntent) {
      return;
    }

    setIsMoveMode(false);
    setIsAttackDialogOpen(false);
    setIsAttackTargetingOnMap(false);
    setPositionAbilityTargeting(null);
    setSelectedAttackTargetId(null);
    setGroundShotPosition(null);
    setIsGroundShotConfirmOpen(false);
  }, [requestedMapTargetIntent?.id]);

  function replaceMapSelection(nextSelection: "none" | "move" | "attack" | { type: "positionAbility"; ability: { id: string; name: string; range: number; lineOfSight: boolean } }) {
    onCancelMapTarget?.();
    setIsMoveMode(nextSelection === "move");
    setIsAttackDialogOpen(nextSelection === "attack");
    setIsAttackTargetingOnMap(false);
    setPositionAbilityTargeting(nextSelection !== "none" && typeof nextSelection === "object" ? nextSelection.ability : null);
    setSelectedAttackTargetId(null);
    setGroundShotPosition(null);
    setIsGroundShotConfirmOpen(false);
  }

  function getViewBox() {
    const viewWidth = combat.map.width / zoom;
    const viewHeight = combat.map.height / zoom;

    return {
      x: pan.x,
      y: pan.y,
      width: viewWidth,
      height: viewHeight,
    };
  }

  function getSvgMetrics(element: SVGSVGElement) {
    const bounds = element.getBoundingClientRect();
    const viewBox = getViewBox();
    const scale = Math.min(bounds.width / viewBox.width, bounds.height / viewBox.height);
    const renderedWidth = viewBox.width * scale;
    const renderedHeight = viewBox.height * scale;

    return {
      bounds,
      viewBox,
      scale,
      offsetX: (bounds.width - renderedWidth) / 2,
      offsetY: (bounds.height - renderedHeight) / 2,
    };
  }

  function getMapPosition(event: MouseEvent<SVGSVGElement> | ReactPointerEvent<SVGSVGElement>): CombatPosition {
    const metrics = getSvgMetrics(event.currentTarget);
    const x = metrics.viewBox.x + (event.clientX - metrics.bounds.left - metrics.offsetX) / metrics.scale;
    const y = metrics.viewBox.y + (event.clientY - metrics.bounds.top - metrics.offsetY) / metrics.scale;

    return clampMapPosition({ x, y }, combat.map.width, combat.map.height);
  }

  function getClampedPan(x: number, y: number, viewWidth: number, viewHeight: number) {
    return {
      x: Math.max(0, Math.min(Math.max(0, combat.map.width - viewWidth), x)),
      y: Math.max(0, Math.min(Math.max(0, combat.map.height - viewHeight), y)),
    };
  }

  function handleMapClick(event: MouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      return;
    }

    const position = getMapPosition(event);

    if (requestedMapTargetIntent) {
      if (!panStartRef.current?.moved) {
        const validPosition = findNearestValidMapPosition({
          combat,
          origin: playerCombatant?.position,
          position,
          range: previewRange,
        });
        if (!validPosition) {
          return;
        }

        updateActionIntentTarget(requestedMapTargetIntent.id, {
          kind: "position",
          id: `position:${validPosition.x.toFixed(1)},${validPosition.y.toFixed(1)}`,
          label: "Position libre",
          source: "selected",
          position: validPosition,
        });
        onMapTargeted?.();
      }
      return;
    }

    if (positionAbilityTargeting) {
      if (!panStartRef.current?.moved) {
        const validPosition = findNearestValidMapPosition({
          combat,
          origin: playerCombatant?.position,
          position,
          range: positionAbilityTargeting.range,
        });
        if (!validPosition) {
          return;
        }

        const prepared = addActionIntent("useAbility", positionAbilityTargeting.id, `Utiliser ${positionAbilityTargeting.name}`, {
          kind: "position",
          id: `position:${validPosition.x.toFixed(1)},${validPosition.y.toFixed(1)}`,
          label: "Position libre",
          source: "selected",
          position: validPosition,
        });

        if (prepared) {
          setPositionAbilityTargeting(null);
          onNavigateToReading?.();
        }
      }
      return;
    }

    if (isAttackTargetingOnMap) {
      if (!panStartRef.current?.moved) {
        const validPosition = findNearestValidMapPosition({
          combat,
          origin: playerCombatant?.position,
          position,
          range: selectedAttackOption?.range ?? 1.5,
        });
        if (!validPosition) {
          return;
        }

        setGroundShotPosition(validPosition);
        setIsGroundShotConfirmOpen(true);
      }
      return;
    }

    setSelectedMapElementId(null);
    setSelectedMapDetailId(null);

    if (!selectedCombatant || !isMoveMode || !canMoveSelected) {
      return;
    }

    if (panStartRef.current?.moved) {
      panStartRef.current = null;
      return;
    }

    const validPosition = findNearestValidMapPosition({
      combat,
      origin: selectedCombatant.position,
      position,
      range: combat.status === "active" ? selectedCombatant.resources.movement : Math.max(combat.map.width, combat.map.height),
      requiresMovementPath: true,
    });
    if (!validPosition) {
      return;
    }

    moveCombatant(selectedCombatant.id, validPosition);
    setIsMoveMode(false);
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    event.stopPropagation();
    const nextZoom = Math.max(1, Math.min(3.2, zoom + (event.deltaY < 0 ? 0.12 : -0.12)));
    const nextViewWidth = combat.map.width / nextZoom;
    const nextViewHeight = combat.map.height / nextZoom;
    setZoom(nextZoom);
    setPan((current) => getClampedPan(current.x, current.y, nextViewWidth, nextViewHeight));
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || event.target instanceof SVGElement && event.target.closest("[data-map-control]")) {
      return;
    }

    const viewBox = getViewBox();
    event.currentTarget.setPointerCapture(event.pointerId);
    panStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
      viewWidth: viewBox.width,
      viewHeight: viewBox.height,
      moved: false,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const start = panStartRef.current;

    if (!start || start.pointerId !== event.pointerId || event.buttons === 0) {
      panStartRef.current = null;
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (Math.abs(dx) + Math.abs(dy) > 3) {
      start.moved = true;
    }

    const metrics = getSvgMetrics(event.currentTarget);

    setPan(getClampedPan(
      start.panX - dx / metrics.scale,
      start.panY - dy / metrics.scale,
      start.viewWidth,
      start.viewHeight,
    ));
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (panStartRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      panStartRef.current = null;
    }
  }

  function handlePointerCancel(event: ReactPointerEvent<SVGSVGElement>) {
    if (panStartRef.current?.pointerId === event.pointerId) {
      panStartRef.current = null;
    }
  }

  function prepareCombatAttack(option: CombatAttackOption, target?: {
    kind: "character" | "entity" | "position" | "free";
    id: string;
    label: string;
    source: "selected" | "free";
    position?: CombatPosition;
  }) {
    return option.kind === "weapon"
      ? addAttackIntent(option.id, `Attaquer avec ${option.name}`, target)
      : addActionIntent("useAbility", option.id, `Utiliser ${option.name}`, target);
  }

  return (
    <section className="paper-surface flex h-full min-h-0 flex-col overflow-hidden">
      <header className="border-b border-[#9C7A2E]/25 bg-[#221E29] px-4 py-3">
        <p className="rune-label text-xs">Combat</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="ink-heading text-xl font-bold">Scène tactique</h1>
          <div className="flex gap-2">
            {combat.status === "active" ? (
              <>
                <button className="fantasy-button rounded px-3 py-1.5 text-sm font-semibold" onClick={nextCombatTurn} type="button">
                  Tour suivant
                </button>
                <button className="rounded border border-[#9C7A2E]/25 px-3 py-1.5 text-sm font-semibold text-[#E4D8BE]/75" onClick={endCombat} type="button">
                  Fin
                </button>
              </>
            ) : (
              <button className="fantasy-button rounded px-3 py-1.5 text-sm font-semibold" onClick={startCombat} type="button">
                Démarrer
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden">
        <div
          className={`relative min-h-[340px] w-full touch-none overscroll-contain overflow-hidden rounded border border-[#9C7A2E]/30 bg-[#15121A] lg:mx-auto lg:h-full lg:min-h-0 lg:w-full lg:max-w-full ${
            isMoveMode || isAttackTargetingOnMap || positionAbilityTargeting || requestedMapTargetIntent ? "cursor-crosshair" : ""
          }`}
          role="presentation"
        >
          <svg
            className="h-full w-full"
            onClick={handleMapClick}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerLeave={handlePointerCancel}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            viewBox={`${getViewBox().x} ${getViewBox().y} ${getViewBox().width} ${getViewBox().height}`}
          >
            <title>Carte de combat tactique</title>
            <defs>
              <pattern id="combat-grid" width={gridCellSize} height={gridCellSize} patternUnits="userSpaceOnUse">
                <path
                  d={`M ${gridCellSize} 0 L 0 0 0 ${gridCellSize}`}
                  fill="none"
                  stroke="rgba(156,122,46,0.28)"
                  strokeWidth="0.02"
                />
              </pattern>
              <pattern id="map-obstacle-hatch" width="0.45" height="0.45" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <path d="M 0 0 L 0 0.45" stroke="rgba(228,216,190,0.22)" strokeWidth="0.055" />
              </pattern>
              <pattern id="map-element-hazard" width="0.5" height="0.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <path d="M 0 0 L 0 0.5" stroke="rgba(228,216,190,0.34)" strokeWidth="0.04" />
              </pattern>
              <pattern id="map-element-terrain" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
                <circle cx="0.25" cy="0.25" fill="rgba(228,216,190,0.3)" r="0.045" />
              </pattern>
              <pattern id="map-element-water" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
                <path d="M 0.03 0.18 C 0.15 0.08 0.28 0.28 0.47 0.17 M 0.03 0.34 C 0.15 0.24 0.28 0.44 0.47 0.33" fill="none" stroke="rgba(228,216,190,0.28)" strokeWidth="0.035" />
              </pattern>
              <pattern id="map-element-lava" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
                <path d="M 0.08 0.45 L 0.19 0.22 L 0.28 0.34 L 0.41 0.06" fill="none" stroke="rgba(228,216,190,0.34)" strokeWidth="0.04" />
              </pattern>
              <pattern id="map-element-cover" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
                <path d="M 0 0.08 L 0.5 0.08 M 0 0.25 L 0.5 0.25 M 0 0.42 L 0.5 0.42" stroke="rgba(228,216,190,0.26)" strokeWidth="0.035" />
              </pattern>
              <pattern id="map-element-light" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
                <path d="M 0.25 0.05 L 0.25 0.45 M 0.05 0.25 L 0.45 0.25" stroke="rgba(21,18,26,0.26)" strokeWidth="0.035" />
              </pattern>
              <pattern id="map-element-darkness" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
                <path d="M 0.08 0.42 L 0.42 0.08" stroke="rgba(21,18,26,0.42)" strokeWidth="0.055" />
              </pattern>
              <pattern id="map-element-trigger" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
                <path d="M 0.25 0.06 L 0.44 0.25 L 0.25 0.44 L 0.06 0.25 Z" fill="none" stroke="rgba(228,216,190,0.34)" strokeWidth="0.035" />
              </pattern>
              <pattern id="map-element-objective" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
                <path d="M 0.08 0.25 L 0.25 0.08 L 0.42 0.25 L 0.25 0.42 Z" fill="rgba(228,216,190,0.18)" stroke="rgba(228,216,190,0.34)" strokeWidth="0.025" />
              </pattern>
              <pattern id="map-element-resource" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
                <circle cx="0.25" cy="0.25" fill="none" r="0.13" stroke="rgba(228,216,190,0.34)" strokeWidth="0.035" />
              </pattern>
              <filter id="combat-token-shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="0.12" floodColor="#15121A" floodOpacity="0.8" stdDeviation="0.18" />
              </filter>
            </defs>
            <rect fill="#15121A" height={combat.map.height} stroke="rgba(156,122,46,0.28)" strokeWidth="0.08" width={combat.map.width} x="0" y="0" />
            <rect fill="url(#combat-grid)" height={combat.map.height} opacity="0.9" width={combat.map.width} x="0" y="0" />
            {visibleMapElements.map((element) => {
              const isSelected = selectedMapElementId === element.id;
              const elementCells = getMapElementCells(element, gridCellSize);
              const patternId = getMapElementPatternId(element.kind);
              const isContextHighlighted = !hasActiveMapAction || highlightedMapElementIds.has(element.id);
              const contextOpacityBoost = hasActiveMapAction && isContextHighlighted ? 1.18 : 1;
              const contextOpacityFade = hasContextualElementHighlight && hasActiveMapAction && !isContextHighlighted ? 0.38 : 1;

              return (
                <g
                  aria-label={`${element.name} · ${getMapElementKindLabel(element.kind)}`}
                  data-map-control="true"
                  key={element.id}
                  onClick={(event) => {
                    if (hasActiveMapAction) {
                      return;
                    }

                    event.stopPropagation();
                    setSelectedMapDetailId(null);
                    setSelectedMapElementId((current) => (current === element.id ? null : element.id));
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {elementCells.map((cell, index) => (
                    <g key={`${element.id}-${cell.x}-${cell.y}-${index}`}>
                      <rect
                        fill={element.color}
                        fillOpacity={Math.min(0.9, getMapElementOpacity(element.kind) * contextOpacityBoost) * contextOpacityFade}
                        height={cell.height}
                        rx={Math.min(0.12, gridCellSize * 0.18)}
                        stroke={isSelected || (hasActiveMapAction && isContextHighlighted) ? "#E4D8BE" : `${element.color}F2`}
                        strokeDasharray={element.kind === "trigger" || element.kind === "objective" ? "0.16 0.11" : undefined}
                        strokeWidth={isSelected ? 0.095 : hasActiveMapAction && isContextHighlighted ? 0.065 : 0.04}
                        width={cell.width}
                        x={cell.x}
                        y={cell.y}
                      />
                      <rect
                        fill={`url(#${patternId})`}
                        height={cell.height}
                        opacity={0.9 * contextOpacityFade}
                        rx={Math.min(0.12, gridCellSize * 0.18)}
                        width={cell.width}
                        x={cell.x}
                        y={cell.y}
                      />
                    </g>
                  ))}
                  <title>{`${element.name} · ${element.rule}`}</title>
                </g>
              );
            })}
            {rangePreviewCells.length > 0 ? (
              <g pointerEvents="none">
                {rangePreviewCells.map((cell) => (
                  <rect
                    fill={isMoveMode ? "rgba(63,86,65,0.48)" : positionAbilityTargeting || requestedMapTargetIntent ? "rgba(107,74,92,0.22)" : "rgba(156,122,46,0.17)"}
                    height={isMoveMode ? cell.size : Math.max(0.05, cell.size * 0.88)}
                    key={`${cell.x}:${cell.y}`}
                    rx={isMoveMode ? 0 : cell.size * 0.08}
                    stroke={isMoveMode ? "none" : positionAbilityTargeting || requestedMapTargetIntent ? "rgba(107,74,92,0.48)" : "rgba(156,122,46,0.42)"}
                    strokeWidth={isMoveMode ? "0" : "0.018"}
                    width={isMoveMode ? cell.size : Math.max(0.05, cell.size * 0.88)}
                    x={isMoveMode ? cell.x : cell.x + cell.size * 0.06}
                    y={isMoveMode ? cell.y : cell.y + cell.size * 0.06}
                  />
                ))}
              </g>
            ) : null}
            {combat.map.obstacles.map((obstacle) => (
              <g key={obstacle.id}>
                <rect
                  fill="#9C7A2E"
                  fillOpacity={obstacle.blocksLineOfSight ? "0.95" : "0.78"}
                  height={obstacle.height}
                  rx="0.035"
                  stroke="#E4D8BE"
                  strokeOpacity={obstacle.blocksMovement ? "0.42" : "0.24"}
                  strokeWidth={obstacle.blocksMovement ? "0.08" : "0.05"}
                  width={obstacle.width}
                  x={obstacle.x}
                  y={obstacle.y}
                >
                  <title>{obstacle.name}</title>
                </rect>
              </g>
            ))}
            {visibleMapDetails.map((detail) => {
              const color = getMapDetailColor(detail.kind);
              const isSelected = selectedMapDetailId === detail.id;

              return (
                <g
                  aria-label={detail.name}
                  data-map-control="true"
                  filter="url(#combat-token-shadow)"
                  key={detail.id}
                  onClick={(event) => {
                    if (hasActiveMapAction) {
                      return;
                    }

                    event.stopPropagation();
                    setSelectedMapElementId(null);
                    setSelectedMapDetailId((current) => (current === detail.id ? null : detail.id));
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <circle
                    cx={detail.x}
                    cy={detail.y}
                    fill="#221E29"
                    r={isSelected ? 0.48 : 0.4}
                    stroke={isSelected ? "#E4D8BE" : color}
                    strokeWidth={isSelected ? 0.09 : 0.065}
                  />
                  <text
                    dominantBaseline="central"
                    fill={color}
                    fontSize="0.42"
                    fontWeight="900"
                    pointerEvents="none"
                    textAnchor="middle"
                    x={detail.x}
                    y={detail.y + 0.015}
                  >
                    {getMapDetailIcon(detail.kind)}
                  </text>
                </g>
              );
            })}
            {combat.combatants
              .filter((combatant) => !(combatant.sourceType === "hazard" && combatant.hp <= 0))
              .filter((combatant) => isVisibleToPlayers(combat, combatant)).map((combatant) => {
              const color = getSideColor(combatant.side);
              const isActive = activeCombatant?.id === combatant.id;
              const isSelected = selectedCombatant?.id === combatant.id;
              const isHazard = combatant.sourceType === "hazard";

              return (
                <g
                  aria-label={combatant.name}
                  data-map-control="true"
                  filter="url(#combat-token-shadow)"
                  key={combatant.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (requestedMapTargetIntent) {
                      if (requestedMapTargetIntent.targeting?.label === "destination") {
                        return;
                      }

                      const targetKind = combatant.sourceType === "character" ? "character" : "entity";

                      if (!requestedMapTargetIntent.targeting?.allowed.includes(targetKind)) {
                        return;
                      }

                      if (
                        playerCombatant &&
                        requestedMapTargetIntent.targeting.suggestedSides &&
                        !requestedMapTargetIntent.targeting.suggestedSides.includes(getSuggestedSide(playerCombatant, combatant))
                      ) {
                        return;
                      }

                      updateActionIntentTarget(requestedMapTargetIntent.id, {
                        kind: targetKind,
                        id: combatant.sourceId,
                        label: combatant.name,
                        source: "selected",
                      });
                      onMapTargeted?.();
                      return;
                    }

                    if (isAttackTargetingOnMap && (combatant.side === "enemies" || combatant.sourceType === "hazard")) {
                      setSelectedAttackTargetId(combatant.id);
                      if (
                        playerCombatant &&
                        selectedAttackOption &&
                        hasLineOfSight(combat, playerCombatant.position, combatant.position) &&
                        getDistance(playerCombatant.position, combatant.position) <= selectedAttackOption.range
                      ) {
                        const prepared = prepareCombatAttack(selectedAttackOption, {
                          kind: combatant.sourceType === "character" ? "character" : "entity",
                          id: combatant.sourceId,
                          label: combatant.name,
                          source: "selected",
                        });

                        if (prepared) {
                          setIsAttackDialogOpen(false);
                          setIsAttackTargetingOnMap(false);
                          onNavigateToReading?.();
                        }
                      }
                      return;
                    }
                    setSelectedCombatantId(combatant.id);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <title>{getCombatantMapTitle(combatant)}</title>
                  {isHazard ? (
                    <rect
                      fill="#B5612A"
                      height={isSelected ? 1.15 : 0.98}
                      stroke={isSelected ? "#E4D8BE" : "#9C7A2E"}
                      strokeWidth={isSelected ? 0.12 : 0.08}
                      transform={`rotate(45 ${combatant.position.x} ${combatant.position.y})`}
                      width={isSelected ? 1.15 : 0.98}
                      x={combatant.position.x - (isSelected ? 0.575 : 0.49)}
                      y={combatant.position.y - (isSelected ? 0.575 : 0.49)}
                    />
                  ) : (
                    <circle
                      cx={combatant.position.x}
                      cy={combatant.position.y}
                      fill={color}
                      r={isSelected ? 0.72 : 0.62}
                      stroke={isSelected ? "#E4D8BE" : "#15121A"}
                      strokeWidth={isActive ? 0.16 : 0.1}
                    />
                  )}
                  {isActive ? (
                    <circle cx={combatant.position.x} cy={combatant.position.y} fill="none" r="0.92" stroke="#9C7A2E" strokeWidth="0.08" />
                  ) : null}
                  <text
                    dominantBaseline="central"
                    fill="#E4D8BE"
                    fontSize="0.58"
                    fontWeight="900"
                    pointerEvents="none"
                    textAnchor="middle"
                    x={combatant.position.x}
                    y={combatant.position.y + 0.02}
                  >
                    {isHazard ? "!" : combatant.name.slice(0, 1).toUpperCase()}
                  </text>
                </g>
              );
            })}
          </svg>
          {requestedMapTargetIntent ? (
            <div className="pointer-events-none absolute left-3 top-3 z-20 rounded border border-[#9C7A2E]/45 bg-[#15121A]/85 px-3 py-2 text-xs text-[#E4D8BE] shadow-xl">
              Cliquez la carte pour choisir une {requestedMapTargetIntent.targeting?.label === "destination" ? "destination" : "cible"}.
            </div>
          ) : null}
          {(selectedMapElement || selectedMapDetail) && !hasActiveMapAction ? (
            <div
              className="pointer-events-none absolute z-20 max-w-[260px] rounded border bg-[#15121A]/94 px-2.5 py-2 text-xs text-[#E4D8BE] shadow-2xl backdrop-blur-sm"
              style={{
                borderColor: `${selectedMapElement?.color ?? getMapDetailColor(selectedMapDetail!.kind)}CC`,
                boxShadow: `0 0 0 1px rgba(228,216,190,0.08), 0 12px 28px rgba(0,0,0,0.42), 0 0 18px ${selectedMapElement?.color ?? getMapDetailColor(selectedMapDetail!.kind)}40`,
                left: `${tooltipLeft}%`,
                top: `${tooltipTop}%`,
              }}
            >
              <p className="ink-heading text-sm font-semibold leading-tight">{selectedMapElement?.name ?? selectedMapDetail?.name}</p>
              <p className="mt-1 leading-snug text-[#E4D8BE]/82">
                {selectedMapElement?.rule ?? selectedMapDetail?.rule ?? selectedMapDetail?.description}
              </p>
              <span
                className="absolute -left-1.5 top-3 h-3 w-3 rotate-45 border-b border-l bg-[#15121A]/94"
                style={{ borderColor: `${selectedMapElement?.color ?? getMapDetailColor(selectedMapDetail!.kind)}CC` }}
              />
            </div>
          ) : null}
        </div>

        <aside className="space-y-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <CombatTurnPanel
            activeCombatant={activeCombatant}
            canAttack={Boolean(playerCombatant && activeCombatant?.id === playerCombatant.id && playerCombatant.resources.action > 0)}
            canMove={Boolean(playerCombatant && canMovePlayer)}
            character={playerCharacter}
            isMoveMode={isMoveMode}
            onAttack={() => replaceMapSelection("attack")}
            onDisengage={() => {
              if (playerCombatant) {
                disengageCombatant(playerCombatant.id);
              }
            }}
            onTargetPositionAbility={(ability) => {
              replaceMapSelection({ type: "positionAbility", ability });
            }}
            onToggleMove={() => {
              const shouldDisableMoveMode = isMoveMode && !isAttackTargetingOnMap && !positionAbilityTargeting && !requestedMapTargetIntent;

              if (shouldDisableMoveMode) {
                replaceMapSelection("none");
                return;
              }

              if (playerCombatant) {
                setSelectedCombatantId(playerCombatant.id);
              }
              replaceMapSelection("move");
            }}
            playerCombatant={playerCombatant}
            shadowStep={shadowStep}
            weapons={weapons}
          />
          <section className="ornate-module mt-4 px-3 pb-3 pt-7">
            <OrnateModuleFrame compact title="Tour de jeu" />
            <div className="relative z-[2] rounded border border-[#9C7A2E]/30 bg-[#15121A]/55 px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#E4D8BE]/45">Tour</p>
              <p className="ink-heading text-2xl font-black text-[#E4D8BE]">{combat.round}</p>
            </div>
            <div className="relative z-[2] mt-2 space-y-1.5">
              {combat.combatants.filter(shouldAppearInTurnPanel).length === 0 ? (
                <p className="text-sm text-[#E4D8BE]/55">Aucun combattant.</p>
              ) : (
                combat.combatants.filter(shouldAppearInTurnPanel).map((combatant, index) => {
                  const status = getHealthStatus(combatant);
                  const isActive = activeCombatant?.id === combatant.id;
                  const isSelected = selectedCombatant?.id === combatant.id;

                  return (
                    <div className="flex items-start gap-2" key={combatant.id}>
                      <span className="mt-3 w-5 text-right text-xs font-black text-[#9C7A2E]">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <button
                          className={`w-full rounded border px-2 py-2 text-left text-sm transition ${
                            isActive
                              ? "border-[#9C7A2E] bg-[#5A2233]/45 text-[#E4D8BE]"
                              : "border-[#9C7A2E]/15 bg-[#15121A]/45 text-[#E4D8BE]/75"
                          } ${isSelected ? "ring-1 ring-[#E4D8BE]" : ""}`}
                          onClick={() => setSelectedCombatantId(combatant.id)}
                          type="button"
                        >
                          <span className="block truncate text-base font-semibold">{getCombatantDisplayName(combatant)}</span>
                          <span className="mt-0.5 block text-xs text-[#E4D8BE]/50">
                            {getCombatantSubtitle(combatant, characters)}
                          </span>
                          <span className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-[10px] uppercase tracking-[0.12em] text-[#E4D8BE]/40">
                              Mouv. {combatant.resources.movement.toFixed(1)} m
                            </span>
                            <span
                              className="h-3 w-3 rounded-full border border-[#E4D8BE]/30"
                              style={{ backgroundColor: status.color }}
                              title={status.label}
                            />
                          </span>
                        </button>
                        <button
                          className="mt-1 text-left text-[11px] text-[#9C7A2E] underline-offset-2 hover:underline"
                          onClick={() => setInspectedStatusId((current) => (current === combatant.id ? null : combatant.id))}
                          type="button"
                        >
                          Examiner l'état
                        </button>
                        {inspectedStatusId === combatant.id ? (
                          <p className="mt-1 rounded border border-[#9C7A2E]/20 bg-[#15121A]/45 px-2 py-1 text-xs text-[#E4D8BE]/62">
                            {status.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="ornate-module mt-4 px-3 pb-3 pt-7">
            <OrnateModuleFrame title="Journal" />
            <div className="relative z-[2] space-y-2">
              {combat.log.slice(0, 6).map((entry) => (
                <p className="text-xs leading-relaxed text-[#E4D8BE]/65" key={entry.id}>
                  {entry.text.replace(/\bround\b/gi, "tour")}
                </p>
              ))}
              {combat.log.length === 0 ? (
                <p className="text-sm text-[#E4D8BE]/50">Les événements apparaîtront ici.</p>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
      {isAttackDialogOpen && playerCombatant ? (
        <AttackDialog
          attackOptions={attackOptions}
          combat={combat}
          onAttack={(option, target) => {
            const prepared = prepareCombatAttack(
              option,
              target
                ? {
                    kind: target.sourceType === "character" ? "character" : "entity",
                    id: target.sourceId,
                    label: target.name,
                    source: "selected",
                  }
                : undefined,
            );

            if (prepared) {
              onNavigateToReading?.();
            }

            setIsAttackDialogOpen(false);
            setIsAttackTargetingOnMap(false);
          }}
          onClose={() => {
            setIsAttackDialogOpen(false);
            setIsAttackTargetingOnMap(false);
          }}
          onRequestMapTarget={() => setIsAttackTargetingOnMap(true)}
          onSelectAttack={setSelectedWeaponId}
          playerCombatant={playerCombatant}
          selectedMapTargetId={selectedAttackTargetId}
          selectedAttackId={selectedAttackOption?.id ?? null}
          isMapTargeting={isAttackTargetingOnMap}
        />
      ) : null}
      {isGroundShotConfirmOpen && selectedAttackOption ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#15121A]/70 p-3 backdrop-blur-sm sm:items-center">
          <section className="ornate-module w-full max-w-[440px] px-4 pb-4 pt-7">
            <OrnateModuleFrame compact title="Tir sans cible" />
            <div className="relative z-[2] space-y-3">
              <p className="text-sm text-[#E4D8BE]/75">
                Êtes-vous sûr de tirer ? Vous n'avez sélectionné aucune cible vivante.
              </p>
              <div className="flex justify-end gap-2">
                <button className="rounded border border-[#9C7A2E]/25 px-3 py-2 text-sm" onClick={() => {
                  setIsGroundShotConfirmOpen(false);
                  setIsAttackTargetingOnMap(false);
                }} type="button">
                  Annuler
                </button>
                <button
                  className="fantasy-button rounded px-3 py-2 text-sm font-semibold"
                  onClick={() => {
                    const position = groundShotPosition;
                    if (prepareCombatAttack(selectedAttackOption, {
                      kind: position ? "position" : "free",
                      id: position ? `position:${position.x.toFixed(1)},${position.y.toFixed(1)}` : "free:sol",
                      label: position ? "Position libre" : "Le sol",
                      source: position ? "selected" : "free",
                      ...(position ? { position } : {}),
                    })) {
                      setIsGroundShotConfirmOpen(false);
                      setIsAttackDialogOpen(false);
                      setIsAttackTargetingOnMap(false);
                      setGroundShotPosition(null);
                      onNavigateToReading?.();
                    }
                  }}
                  type="button"
                >
                  Tirer quand même
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function CombatTurnPanel({
  activeCombatant,
  canAttack,
  canMove,
  character,
  isMoveMode,
  onAttack,
  onDisengage,
  onTargetPositionAbility,
  onToggleMove,
  playerCombatant,
  shadowStep,
  weapons,
}: {
  activeCombatant: Combatant | null;
  canAttack: boolean;
  canMove: boolean;
  character: Character | undefined;
  isMoveMode: boolean;
  onAttack: () => void;
  onDisengage: () => void;
  onTargetPositionAbility: (ability: { id: string; name: string; range: number; lineOfSight: boolean }) => void;
  onToggleMove: () => void;
  playerCombatant: Combatant | undefined;
  shadowStep: ReturnType<typeof resolveAbilityForCharacter>;
  weapons: CombatWeapon[];
}) {
  const [activeAttack, setActiveAttack] = useState<AttackKind | null>(null);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const derivedScores = useGameStore((state) =>
    character ? state.characterDerivedScores[character.id] : undefined,
  );

  if (!playerCombatant) {
    return (
      <section className="ornate-module mt-4 px-3 pb-3 pt-7">
        <OrnateModuleFrame title="Combat" />
        <p className="relative z-[2] text-sm text-[#E4D8BE]/55">Démarrez un combat pour afficher vos actions.</p>
      </section>
    );
  }

  const isPlayerTurn = activeCombatant?.id === playerCombatant.id;
  const hpRatio = playerCombatant.maxHp > 0 ? Math.max(0, Math.min(1, playerCombatant.hp / playerCombatant.maxHp)) : 0;
  const harmfulConditions = getHarmfulCombatConditions(playerCombatant);
  const attackBreakdowns = createAttackBreakdowns(character, playerCombatant, derivedScores);
  const selectedAttack = attackBreakdowns.find((attack) => attack.kind === activeAttack) ?? null;
  const isProne = playerCombatant.conditions.some((condition) => ["à terre", "a terre", "prone"].includes(condition.toLowerCase()));
  const actionGroups = [
    {
      key: "action",
      label: "Action principale",
      remaining: playerCombatant.resources.action,
      actions: [
        { label: "Attaquer", disabled: !canAttack || weapons.length === 0, onClick: onAttack },
        {
          label: playerCombatant.resources.disengaged ? "Désengagé" : "Se désengager",
          disabled: !isPlayerTurn || playerCombatant.resources.action <= 0 || playerCombatant.resources.disengaged,
          onClick: onDisengage,
        },
      ],
    },
    {
      key: "movement",
      label: "Action de mouvement",
      remaining: playerCombatant.resources.movement > 0 ? 1 : 0,
      actions: [
        { label: isMoveMode ? "Choisir la destination" : "Se déplacer", disabled: !isPlayerTurn || !canMove, onClick: onToggleMove },
        ...(isProne ? [{ label: "Se relever", disabled: !isPlayerTurn || playerCombatant.resources.movement <= 0 }] : []),
      ],
    },
    {
      key: "bonus",
      label: "Action bonus",
      remaining: playerCombatant.resources.bonus,
      actions: shadowStep
        ? [
            {
              label: shadowStep.name,
              disabled: !isPlayerTurn || playerCombatant.resources.bonus <= 0 || shadowStep.charges <= 0,
              onClick: () => {
                const range = Number(shadowStep.targetingV2?.aim.range ?? 3);
                onTargetPositionAbility({
                  id: shadowStep.id,
                  name: shadowStep.name,
                  range: Number.isFinite(range) && range > 0 ? range : 3,
                  lineOfSight: shadowStep.targetingV2?.aim.lineOfSight !== false,
                });
              },
            },
          ]
        : [],
    },
    {
      key: "reaction",
      label: "Réaction",
      remaining: playerCombatant.resources.reaction,
      actions: [],
    },
  ];

  return (
    <section className="ornate-module mt-4 px-3 pb-3 pt-7">
      <OrnateModuleFrame title="Combat" />

      <div className="relative z-[2] mb-9 rounded border border-[#9C7A2E]/55 bg-[#15121A]/28 px-2 pb-4 pt-2">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9C7A2E]">PV</span>
            <span className="font-black text-[#E4D8BE]">{playerCombatant.hp}/{playerCombatant.maxHp}</span>
          </div>
          <div className="h-3 overflow-hidden rounded border border-[#9C7A2E]/30 bg-[#15121A]">
            <div className="h-full bg-[#7A1F2E] transition-[width]" style={{ width: `${hpRatio * 100}%` }} />
          </div>
          {harmfulConditions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {harmfulConditions.map((condition) => (
                <span
                  className="rounded border px-2 py-0.5 text-[11px] font-semibold text-[#E4D8BE]"
                  key={condition.raw}
                  style={{
                    backgroundColor: `${condition.template.color ?? "#7A1F2E"}33`,
                    borderColor: `${condition.template.color ?? "#7A1F2E"}BB`,
                  }}
                  title={condition.template.description}
                >
                  {condition.template.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {isInfoExpanded ? (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-3 gap-1 text-center">
              <CombatInfoPill label="DEF" value={playerCombatant.defense} />
              <CombatInfoPill label="Vitesse" value={`${playerCombatant.speed} m`} />
              <CombatInfoPill label="INIT" value={formatSigned(playerCombatant.initiative)} />
            </div>

            <div className="manuscript-card grid grid-cols-3 gap-1 rounded p-1">
              {attackBreakdowns.map((attack) => (
                <button
                  className={`rounded px-2 py-1 text-center transition ${
                    activeAttack === attack.kind ? "bg-[#9C7A2E]/20 text-[#E4D8BE]" : "hover:bg-[#E4D8BE]/5"
                  }`}
                  key={attack.kind}
                  onClick={() => setActiveAttack((current) => (current === attack.kind ? null : attack.kind))}
                  type="button"
                >
                  <p className="text-[10px] font-semibold uppercase text-[#9C7A2E]">{attack.label}</p>
                  <p className="ink-heading text-base font-black">{formatSigned(attack.value)}</p>
                </button>
              ))}
            </div>
            {selectedAttack ? (
              <div className="rounded border border-[#9C7A2E]/20 bg-[#15121A]/45 px-2 py-1.5 text-xs text-[#E4D8BE]/65">
                <p className="font-semibold text-[#E4D8BE]">{selectedAttack.label}</p>
                <p>
                  {selectedAttack.parts.map((part) => `${formatSigned(part.value)} ${part.label}`).join(" + ")} ={" "}
                  {formatSigned(selectedAttack.value)}
                </p>
              </div>
            ) : null}

            <div className="rounded border border-[#9C7A2E]/15 bg-[#15121A]/35 p-2">
              {weapons.length > 0 ? (
                <div className="grid gap-1">
                  {weapons.map((weapon) => (
                    <div className="flex items-center justify-between gap-2 text-xs text-[#E4D8BE]/75" key={weapon.id}>
                      <span className="truncate">{weapon.name}</span>
                      <span className="shrink-0 text-[#9C7A2E]">{weapon.range} m</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#E4D8BE]/45">Aucune arme équipée.</p>
              )}
            </div>
          </div>
        ) : null}
        <button
          className="absolute bottom-0 left-1/2 flex h-7 w-16 -translate-x-1/2 translate-y-full items-center justify-center rounded-none border border-[#9C7A2E]/70 bg-[#221E29] text-[#9C7A2E] transition hover:border-[#9C7A2E] hover:text-[#E4D8BE]"
          onClick={() => setIsInfoExpanded((current) => !current)}
          type="button"
          aria-label={isInfoExpanded ? "Replier les infos de combat" : "Déplier les infos de combat"}
        >
          <span className="text-2xl font-black leading-none">{isInfoExpanded ? "⌃" : "⌄"}</span>
        </button>
      </div>

      <div className="relative z-[2] rounded border border-[#9C7A2E]/55 bg-[#15121A]/28 p-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {actionGroups.map((group) => (
            <div className="min-w-0" key={group.key}>
              <CombatActionSlot label={group.label} remaining={group.remaining} />
              {group.key !== "reaction" ? <div className="mt-2 grid gap-1.5">
                {group.actions.length === 0 ? (
                  <p className="rounded border border-[#9C7A2E]/10 bg-[#15121A]/25 px-2 py-1.5 text-[11px] text-[#E4D8BE]/38">Aucune</p>
                ) : (
                  group.actions.map((action) => (
                    <button
                      className={`rounded border border-[#9C7A2E]/25 px-2 py-1.5 text-left text-[11px] font-semibold text-[#E4D8BE] transition ${
                        action.label.includes("destination") ? "bg-[#9C7A2E]/20" : "bg-[#15121A]/45"
                      } disabled:cursor-not-allowed disabled:opacity-35`}
                      disabled={action.disabled}
                      key={action.label}
                      onClick={action.onClick}
                      type="button"
                    >
                      {action.label}
                    </button>
                  ))
                )}
              </div> : null}
            </div>
          ))}
        </div>
        {isMoveMode ? (
          <p className="mt-2 text-xs text-[#E4D8BE]/50">
            Cliquez sur la carte pour choisir une destination. La distance sera limitée au mouvement restant.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function CombatInfoPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-[#9C7A2E]/20 bg-[#15121A]/45 px-2 py-1">
      <p className="text-[9px] font-semibold uppercase text-[#9C7A2E]">{label}</p>
      <p className="text-sm font-black text-[#E4D8BE]">{value}</p>
    </div>
  );
}

function getAttackOptionLabel(option: CombatAttackOption): string {
  if (option.kind === "ability") {
    return option.name;
  }

  if (option.name === option.itemName) {
    return "Attaque standard";
  }

  return option.name.replace(`${option.itemName} · `, "");
}

function groupAttackOptions(attackOptions: CombatAttackOption[]): Array<{ id: string; label: string; options: CombatAttackOption[] }> {
  const groups = new Map<string, { id: string; label: string; options: CombatAttackOption[] }>();

  attackOptions.forEach((option) => {
    const groupId = option.kind === "weapon" ? `weapon:${option.itemId}` : "abilities";
    const label = option.kind === "weapon" ? option.itemName : "Capacités offensives";
    const group = groups.get(groupId) ?? { id: groupId, label, options: [] };

    group.options.push(option);
    groups.set(groupId, group);
  });

  return Array.from(groups.values());
}

function AttackDialog({
  attackOptions,
  combat,
  isMapTargeting,
  onAttack,
  onClose,
  onRequestMapTarget,
  onSelectAttack,
  playerCombatant,
  selectedMapTargetId,
  selectedAttackId,
}: {
  attackOptions: CombatAttackOption[];
  combat: ReturnType<typeof useGameStore.getState>["combat"];
  isMapTargeting: boolean;
  onAttack: (option: CombatAttackOption, target: Combatant | null) => void;
  onClose: () => void;
  onRequestMapTarget: () => void;
  onSelectAttack: (attackId: string) => void;
  playerCombatant: Combatant;
  selectedMapTargetId: string | null;
  selectedAttackId: string | null;
}) {
  const selectedAttack = attackOptions.find((option) => option.id === selectedAttackId) ?? attackOptions[0] ?? null;
  const targets = selectedAttack ? getReachableAttackTargets(combat, playerCombatant, selectedAttack.range) : [];
  const [manualTargetId, setManualTargetId] = useState<string | null>(targets[0]?.combatant.id ?? null);
  const groupedAttacks = groupAttackOptions(attackOptions);
  const selectedTarget =
    targets.find((target) => target.combatant.id === selectedMapTargetId)?.combatant ??
    targets.find((target) => target.combatant.id === manualTargetId)?.combatant ??
    targets[0]?.combatant ??
    null;

  useEffect(() => {
    setManualTargetId(targets[0]?.combatant.id ?? null);
  }, [selectedAttack?.id, targets[0]?.combatant.id]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-3 sm:bottom-auto sm:left-auto sm:right-[340px] sm:top-24 sm:block sm:w-[420px] sm:px-0">
      <section className="ornate-module pointer-events-auto w-full max-w-[580px] px-4 pb-3 pt-7 sm:max-w-none">
        <OrnateModuleFrame title="Attaquer" />
        <div className="relative z-[2] space-y-2">
          <div className="max-h-[50vh] overflow-y-auto pr-1 sm:max-h-[68vh]">
            <div className="grid gap-2">
              {groupedAttacks.map((group) => (
                <div key={group.id}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <p className="shrink-0 text-sm font-medium text-[#9C7A2E]">{group.label}</p>
                    <span className="h-1.5 w-1.5 shrink-0 rotate-45 border border-[#9C7A2E]/75 bg-[#15121A]" />
                    <span className="relative h-px min-w-8 flex-1 bg-[#9C7A2E]/35">
                      <span className="absolute inset-x-0 -top-px h-px bg-[#E4D8BE]/12" />
                    </span>
                  </div>
                  <div className="grid gap-1">
                    {group.options.map((option) => {
                      const reachableTargets = getReachableAttackTargets(combat, playerCombatant, option.range);
                      const isSelected = selectedAttack?.id === option.id;

                      return (
                        <button
                          className={`rounded border px-2 py-1.5 text-left transition ${
                            isSelected
                              ? "border-[#9C7A2E] bg-[#5A2233]/45"
                              : "border-[#9C7A2E]/20 bg-[#15121A]/45 hover:border-[#9C7A2E]/55"
                          } ${reachableTargets.length === 0 ? "opacity-45" : ""}`}
                          key={option.id}
                          onClick={() => {
                            onSelectAttack(option.id);
                            setManualTargetId(reachableTargets[0]?.combatant.id ?? null);
                          }}
                          type="button"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-xs font-medium text-[#E4D8BE]">
                              {getAttackOptionLabel(option)}
                              {option.kind === "weapon" && option.modifierName ? (
                                <span className="text-[#9C7A2E]"> (x{option.modifierQuantity})</span>
                              ) : null}
                            </span>
                            <span className="shrink-0 rounded border border-[#9C7A2E]/35 bg-[#221E29] px-1.5 py-0.5 text-[11px] font-medium text-[#E4D8BE]">
                              <HighlightedGameText text={option.damageLabel} />
                            </span>
                            <span className="shrink-0 text-[11px] text-[#9C7A2E]">{option.range} m</span>
                          </span>
                          {option.kind === "ability" && option.maxCharges !== null ? (
                            <span className="mt-1 inline-flex items-center gap-1" aria-label={`${option.charges ?? 0} charges sur ${option.maxCharges}`}>
                              {Array.from({ length: option.maxCharges }, (_, index) => (
                                <span
                                  className={`h-2.5 w-2.5 rounded-sm border ${
                                    index < (option.charges ?? 0)
                                      ? "border-[#9C7A2E] bg-[#9C7A2E]"
                                      : "border-[#9C7A2E]/35 bg-[#15121A]/80"
                                  }`}
                                  key={`${option.id}-charge-${index}`}
                                />
                              ))}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {selectedAttack ? (
              <div className="mt-2">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[#9C7A2E]">Cible</span>
              <div className="flex gap-2">
                {targets.length > 1 ? (
                  <select
                    className="min-w-0 flex-1 rounded border border-[#9C7A2E]/35 bg-[#15121A] px-2 py-1.5 text-sm text-[#E4D8BE]"
                    onChange={(event) => setManualTargetId(event.target.value)}
                    value={selectedTarget?.id ?? ""}
                  >
                    {targets.map((target) => (
                      <option key={target.combatant.id} value={target.combatant.id}>
                        {target.combatant.name} · {target.distance.toFixed(1)} m
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="min-w-0 flex-1 rounded border border-[#9C7A2E]/20 bg-[#15121A]/45 px-2 py-1.5 text-sm text-[#E4D8BE]/70">
                    {targets.length === 1 ? `Cible : ${targets[0]!.combatant.name} · ${targets[0]!.distance.toFixed(1)} m` : "Aucune cible à portée et en ligne de vue"}
                  </p>
                )}
                <button
                  className={`rounded border px-3 py-1.5 text-sm font-semibold transition ${
                    isMapTargeting
                      ? "border-[#9C7A2E] bg-[#9C7A2E]/20 text-[#E4D8BE]"
                      : "border-[#9C7A2E]/35 bg-[#15121A]/45 text-[#E4D8BE]/80"
                  }`}
                  onClick={onRequestMapTarget}
                  type="button"
                >
                  Cibler
                </button>
              </div>
              </div>
            ) : null}

            <p className="mt-2 text-[11px] text-[#E4D8BE]/45">
              Le bouton Cibler permet de choisir une cible sur la carte. Cliquez au sol pour préparer un tir sans cible.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button className="rounded border border-[#9C7A2E]/25 px-3 py-1.5 text-sm text-[#E4D8BE]/75" onClick={onClose} type="button">
              Annuler
            </button>
            <button
              className="fantasy-button rounded px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!selectedAttack || !selectedTarget}
              onClick={() => {
                if (selectedAttack && selectedTarget) {
                  onAttack(selectedAttack, selectedTarget);
                }
              }}
              type="button"
            >
              Attaquer
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function OrnateModuleFrame({ compact = false, title }: { compact?: boolean; title: string }) {
  return (
    <>
      <span className="ornate-module-border ornate-module-border--top" aria-hidden="true" />
      <span className="ornate-module-border ornate-module-border--bottom" aria-hidden="true" />
      <span className="ornate-module-corner ornate-module-corner--top-left" aria-hidden="true" />
      <span className="ornate-module-corner ornate-module-corner--top-right" aria-hidden="true" />
      <span className="ornate-module-corner ornate-module-corner--bottom-right" aria-hidden="true" />
      <span className="ornate-module-corner ornate-module-corner--bottom-left" aria-hidden="true" />
      <h2 className={`ornate-module-title text-center${compact ? " ornate-module-title--compact" : ""}`}>
        {title}
      </h2>
    </>
  );
}

function CombatActionSlot({ label, remaining }: { label: string; remaining: number }) {
  return (
    <div className="manuscript-card rounded p-2">
      <p className="min-h-[2rem] text-[10px] font-semibold uppercase leading-tight text-[#9C7A2E]">{label}</p>
      <div className="grid grid-cols-1 gap-1">
        <span
          className={`h-3 rounded-sm border ${
            remaining > 0 ? "border-[#9C7A2E] bg-[#9C7A2E]" : "border-[#9C7A2E]/30 bg-[#15121A]"
          }`}
        />
      </div>
    </div>
  );
}

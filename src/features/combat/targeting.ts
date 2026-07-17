import type {
  ActionTarget,
  ActionTargetKind,
  ActionTargeting,
  AffectKind,
  AimKind,
  CombatPosition,
  CombatScene,
  Combatant,
  SuggestedTargetSide,
} from "../../app/types";

const RANGE_EPSILON = 0.01;
const aimKinds = new Set<AimKind>(["self", "entity", "position", "direction", "item"]);
const affectKinds = new Set<AffectKind>(["self", "living", "enemy", "ally", "object", "position"]);
const suggestedSides = new Set<SuggestedTargetSide>(["self", "ally", "enemy", "neutral"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function enumArray<T extends string>(value: unknown, allowed: ReadonlySet<T>): T[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is T => typeof entry === "string" && allowed.has(entry as T))
    : [];
}

function optionalNumberOrString(value: unknown): number | string | undefined {
  return typeof value === "number" || typeof value === "string" ? value : undefined;
}

/**
 * Convertit une ancienne sauvegarde vers le schéma canonique. Cette fonction
 * est réservée à la migration : le reste du moteur ne manipule que targeting.
 */
export function normalizeActionTargeting(value: unknown): ActionTargeting | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (isRecord(value.aim) && isRecord(value.affects)) {
    const area = isRecord(value.area) ? value.area : undefined;
    const allowedAim = enumArray(value.aim.allowed, aimKinds);
    const allowedAffects = enumArray(value.affects.allowed, affectKinds);

    if (allowedAim.length === 0 || allowedAffects.length === 0) {
      return undefined;
    }

    return {
      aim: {
        allowed: allowedAim,
        ...(typeof value.aim.required === "boolean" ? { required: value.aim.required } : {}),
        ...(optionalNumberOrString(value.aim.range) !== undefined
          ? { range: optionalNumberOrString(value.aim.range) }
          : {}),
        ...(typeof value.aim.lineOfSight === "boolean"
          ? { lineOfSight: value.aim.lineOfSight }
          : {}),
        ...(value.aim.label === "cible" || value.aim.label === "destination"
          ? { label: value.aim.label }
          : {}),
      },
      ...(area
        ? {
            area: {
              shape:
                area.shape === "circle" ||
                area.shape === "cone" ||
                area.shape === "line" ||
                area.shape === "selfAura"
                  ? area.shape
                  : "none",
              ...(optionalNumberOrString(area.radius) !== undefined
                ? { radius: optionalNumberOrString(area.radius) }
                : {}),
              ...(optionalNumberOrString(area.length) !== undefined
                ? { length: optionalNumberOrString(area.length) }
                : {}),
              ...(optionalNumberOrString(area.width) !== undefined
                ? { width: optionalNumberOrString(area.width) }
                : {}),
            },
          }
        : {}),
      affects: {
        allowed: allowedAffects,
        ...(typeof value.affects.maxTargets === "number"
          ? { maxTargets: Math.max(1, Math.floor(value.affects.maxTargets)) }
          : {}),
        ...(typeof value.affects.requiresLiving === "boolean"
          ? { requiresLiving: value.affects.requiresLiving }
          : {}),
        ...(typeof value.affects.includeSelf === "boolean"
          ? { includeSelf: value.affects.includeSelf }
          : {}),
      },
      ...(Array.isArray(value.defaultPriority)
        ? {
            defaultPriority: value.defaultPriority.filter(
              (entry): entry is "self" | "nearestEnemy" | "farthestPointAhead" | "none" =>
                entry === "self" ||
                entry === "nearestEnemy" ||
                entry === "farthestPointAhead" ||
                entry === "none",
            ),
          }
        : {}),
      ...(Array.isArray(value.suggestedSides)
        ? { suggestedSides: enumArray(value.suggestedSides, suggestedSides) }
        : {}),
    };
  }

  // Ancien ciblage plat, lu uniquement lors de la migration du localStorage.
  const legacyKinds = enumArray(
    value.allowed,
    new Set<ActionTargetKind>(["self", "character", "entity", "item", "position", "free"]),
  );

  if (legacyKinds.length === 0) {
    return undefined;
  }

  const allowedAim = new Set<AimKind>();
  const allowedAffects = new Set<AffectKind>();

  legacyKinds.forEach((kind) => {
    if (kind === "self") {
      allowedAim.add("self");
      allowedAffects.add("self");
    } else if (kind === "character" || kind === "entity") {
      allowedAim.add("entity");
      allowedAffects.add("living");
      allowedAffects.add("object");
    } else if (kind === "item") {
      allowedAim.add("item");
      allowedAffects.add("object");
    } else {
      allowedAim.add("position");
      allowedAffects.add("position");
    }
  });

  if (value.label === "destination") {
    allowedAim.add("position");
    allowedAffects.clear();
    allowedAffects.add("self");
  }

  return {
    aim: {
      allowed: [...allowedAim],
      ...(typeof value.required === "boolean" ? { required: value.required } : {}),
      ...(optionalNumberOrString(value.range) !== undefined
        ? { range: optionalNumberOrString(value.range) }
        : {}),
      ...(typeof value.lineOfSight === "boolean" ? { lineOfSight: value.lineOfSight } : {}),
      ...(value.label === "cible" || value.label === "destination" ? { label: value.label } : {}),
    },
    area: { shape: "none" },
    affects: { allowed: [...allowedAffects] },
    ...(Array.isArray(value.defaultPriority)
      ? {
          defaultPriority: value.defaultPriority.filter(
            (entry): entry is "self" | "nearestEnemy" | "farthestPointAhead" | "none" =>
              entry === "self" ||
              entry === "nearestEnemy" ||
              entry === "farthestPointAhead" ||
              entry === "none",
          ),
        }
      : {}),
    ...(Array.isArray(value.suggestedSides)
      ? { suggestedSides: enumArray(value.suggestedSides, suggestedSides) }
      : {}),
  };
}

export function getSelectableTargetKinds(targeting: ActionTargeting | undefined): ActionTargetKind[] {
  if (!targeting) {
    return [];
  }

  const allowed = new Set<ActionTargetKind>();

  targeting.aim.allowed.forEach((aim) => {
    if (aim === "self") allowed.add("self");
    if (aim === "entity") {
      allowed.add("character");
      allowed.add("entity");
    }
    if (aim === "position" || aim === "direction") allowed.add("position");
    if (aim === "item") allowed.add("item");
  });

  return [...allowed];
}

export function getTargetingLabel(targeting: ActionTargeting | undefined): "cible" | "destination" {
  if (targeting?.aim.label) {
    return targeting.aim.label;
  }

  const affectsOnlySelf =
    targeting?.affects.allowed.length === 1 && targeting.affects.allowed[0] === "self";
  const aimsAtSpace = Boolean(
    targeting?.aim.allowed.includes("position") || targeting?.aim.allowed.includes("direction"),
  );

  return affectsOnlySelf && aimsAtSpace ? "destination" : "cible";
}

export function isActionTargetAllowed(
  targeting: ActionTargeting | undefined,
  target: ActionTarget | undefined,
): boolean {
  if (!targeting) {
    return true;
  }

  if (!target) {
    return targeting.aim.required !== true;
  }

  if (target.kind === "free") {
    return targeting.aim.allowed.some((kind) => kind !== "self");
  }

  return getSelectableTargetKinds(targeting).includes(target.kind);
}

export function getTargetingRange(targeting: ActionTargeting | undefined, fallback = 0): number {
  const parsed = Number(targeting?.aim.range);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDistance(a: CombatPosition, b: CombatPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function getCombatantTargetPosition(
  combat: CombatScene,
  target: ActionTarget | undefined,
  fallbackCharacterId: string,
): CombatPosition | undefined {
  if (target?.position) {
    return target.position;
  }

  const combatant = getCombatantFromTarget(combat, target, fallbackCharacterId);
  return combatant?.position;
}

export function getCombatantFromTarget(
  combat: CombatScene,
  target: ActionTarget | undefined,
  fallbackCharacterId: string,
): Combatant | undefined {
  if (!target) {
    return undefined;
  }

  if (target.kind === "self" || target.kind === "character") {
    const characterId = target.kind === "self" ? target.id || fallbackCharacterId : target.id;
    return combat.combatants.find(
      (combatant) => combatant.sourceType === "character" && combatant.sourceId === characterId,
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

export function isPointInsideObstacle(
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

export function isPointInsideBlockingObstacle(combat: CombatScene, point: CombatPosition): boolean {
  const cellSize = Math.max(0.1, combat.map.cellSize || 0.5);
  return (
    combat.map.obstacles.some(
      (obstacle) =>
        (obstacle.blocksMovement || obstacle.blocksLineOfSight) && isPointInsideObstacle(point, obstacle),
    ) ||
    combat.map.elements.some(
      (element) =>
        element.blocksMovement &&
        getMapElementCells(element, cellSize).some(
          (cell) =>
            point.x >= cell.x &&
            point.x <= cell.x + cell.width &&
            point.y >= cell.y &&
            point.y <= cell.y + cell.height,
        ),
    )
  );
}

function getMapElementCells(
  element: CombatScene["map"]["elements"][number],
  cellSize: number,
): Array<{ x: number; y: number; width: number; height: number }> {
  if (Array.isArray(element.cells) && element.cells.length > 0) {
    return element.cells.map((cell) => ({ x: cell.x, y: cell.y, width: cellSize, height: cellSize }));
  }

  return [{ x: element.x, y: element.y, width: element.width, height: element.height }];
}

function doesSegmentHitMapElement(
  combat: CombatScene,
  from: CombatPosition,
  to: CombatPosition,
): boolean {
  const cellSize = Math.max(0.1, combat.map.cellSize || 0.5);
  const steps = Math.max(8, Math.ceil(getDistance(from, to) * 2));

  return combat.map.elements.some((element) => {
    const blocksLineOfSight =
      element.blocksLineOfSight ||
      element.effects?.some((effect) => effect.type === "lineOfSightBlock");

    if (!blocksLineOfSight) {
      return false;
    }

    const cells = getMapElementCells(element, cellSize);
    for (let index = 1; index <= steps; index += 1) {
      const ratio = index / steps;
      const point = {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      };

      if (
        cells.some(
          (cell) =>
            point.x >= cell.x &&
            point.x <= cell.x + cell.width &&
            point.y >= cell.y &&
            point.y <= cell.y + cell.height,
        )
      ) {
        return true;
      }
    }

    return false;
  });
}

export function hasLineOfSight(combat: CombatScene, from: CombatPosition, to: CombatPosition): boolean {
  const obstacleBlocksSight = combat.map.obstacles.some((obstacle) => {
    if (!obstacle.blocksLineOfSight) {
      return false;
    }

    const steps = Math.max(8, Math.ceil(getDistance(from, to) * 2));

    for (let index = 1; index <= steps; index += 1) {
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

  return !obstacleBlocksSight && !doesSegmentHitMapElement(combat, from, to);
}

export function hasMovementPath(combat: CombatScene, from: CombatPosition, to: CombatPosition): boolean {
  return !combat.map.obstacles.some((obstacle) => {
    if (!obstacle.blocksMovement) {
      return false;
    }

    const steps = Math.max(8, Math.ceil(getDistance(from, to) * 2));

    for (let index = 1; index <= steps; index += 1) {
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
}

export interface ResolvedActionTargets {
  aimPoint?: CombatPosition;
  primaryTarget?: Combatant;
  affectedCombatants: Combatant[];
  invalidReason?: string;
  requiresConfirmation?: boolean;
}

export function areHostileSides(actor: Combatant, target: Combatant): boolean {
  const actorTeam = actor.side === "players" || actor.side === "allies" ? "players" : actor.side;
  const targetTeam = target.side === "players" || target.side === "allies" ? "players" : target.side;

  return actorTeam !== targetTeam && actorTeam !== "neutral" && targetTeam !== "neutral";
}

export function getSuggestedSide(actor: Combatant, target: Combatant): SuggestedTargetSide {
  if (actor.id === target.id) {
    return "self";
  }

  if (target.side === "neutral") {
    return "neutral";
  }

  return areHostileSides(actor, target) ? "enemy" : "ally";
}

export function canAffectCombatant(
  actor: Combatant,
  combatant: Combatant,
  targeting: ActionTargeting,
): boolean {
  const allowed = targeting.affects.allowed;
  const isSelf = combatant.id === actor.id;
  const isObject = combatant.sourceType === "hazard";
  const isLiving = !isObject;
  const hasSideRestriction = allowed.includes("enemy") || allowed.includes("ally");

  if (targeting.affects.requiresLiving && !isLiving) {
    return false;
  }

  if (isSelf) {
    if (allowed.includes("self")) {
      return true;
    }

    if (targeting.affects.includeSelf === false) {
      return false;
    }

    return (allowed.includes("ally") || (!hasSideRestriction && allowed.includes("living"))) && isLiving;
  }

  if (allowed.includes("enemy") && areHostileSides(actor, combatant)) {
    return isLiving;
  }

  if (
    allowed.includes("ally") &&
    !areHostileSides(actor, combatant) &&
    combatant.side !== "neutral"
  ) {
    return isLiving;
  }

  if (hasSideRestriction) {
    return false;
  }

  return (allowed.includes("living") && isLiving) || (allowed.includes("object") && isObject);
}

export function isSuggestedCombatant(
  actor: Combatant,
  combatant: Combatant,
  targeting: ActionTargeting,
): boolean {
  return (
    !targeting.suggestedSides ||
    targeting.suggestedSides.length === 0 ||
    targeting.suggestedSides.includes(getSuggestedSide(actor, combatant))
  );
}

function getAimPointInvalidReason(
  combat: CombatScene,
  actor: Combatant,
  aimPoint: CombatPosition,
  targeting: ActionTargeting,
): string | undefined {
  if (isPointInsideBlockingObstacle(combat, aimPoint)) {
    return "Cette position est occupée par un obstacle.";
  }

  const range = getTargetingRange(targeting, 1.5);
  if (range > 0 && getDistance(actor.position, aimPoint) > range + RANGE_EPSILON) {
    return "Hors de portée.";
  }

  if (targeting.aim.lineOfSight !== false && !hasLineOfSight(combat, actor.position, aimPoint)) {
    return "Ligne de vue bloquée.";
  }

  return undefined;
}

function getDistanceToSegment(point: CombatPosition, from: CombatPosition, to: CombatPosition): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return getDistance(point, from);
  }

  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared),
  );
  return getDistance(point, { x: from.x + ratio * dx, y: from.y + ratio * dy });
}

function isCombatantInsideArea(
  combatant: Combatant,
  actor: Combatant,
  aimPoint: CombatPosition,
  targeting: ActionTargeting,
  primaryTarget: Combatant | undefined,
): boolean {
  const area = targeting.area ?? { shape: "none" as const };

  if (area.shape === "none") {
    return primaryTarget?.id === combatant.id || (!primaryTarget && combatant.id === actor.id);
  }

  if (area.shape === "circle") {
    return getDistance(aimPoint, combatant.position) <= Number(area.radius ?? 0) + RANGE_EPSILON;
  }

  if (area.shape === "selfAura") {
    return getDistance(actor.position, combatant.position) <= Number(area.radius ?? 0) + RANGE_EPSILON;
  }

  if (area.shape === "line") {
    const length = Number(area.length ?? targeting.aim.range ?? getDistance(actor.position, aimPoint));
    const width = Number(area.width ?? 1);
    return (
      getDistance(actor.position, combatant.position) <= length + RANGE_EPSILON &&
      getDistanceToSegment(combatant.position, actor.position, aimPoint) <= width / 2 + RANGE_EPSILON
    );
  }

  const length = Number(area.length ?? targeting.aim.range ?? getDistance(actor.position, aimPoint));
  const angleDegrees = Math.max(1, Math.min(179, Number(area.width ?? 60)));
  const direction = Math.atan2(aimPoint.y - actor.position.y, aimPoint.x - actor.position.x);
  const candidateDirection = Math.atan2(
    combatant.position.y - actor.position.y,
    combatant.position.x - actor.position.x,
  );
  const angleDifference = Math.abs(
    Math.atan2(Math.sin(candidateDirection - direction), Math.cos(candidateDirection - direction)),
  );

  return (
    getDistance(actor.position, combatant.position) <= length + RANGE_EPSILON &&
    angleDifference <= (angleDegrees * Math.PI) / 360
  );
}

export function resolveActionTargets({
  actor,
  combat,
  fallbackCharacterId,
  target,
  targeting,
}: {
  actor: Combatant | undefined;
  combat: CombatScene;
  fallbackCharacterId: string;
  target: ActionTarget | undefined;
  targeting: ActionTargeting | undefined;
}): ResolvedActionTargets {
  const primaryTarget = getCombatantFromTarget(combat, target, fallbackCharacterId);
  const aimPoint = getCombatantTargetPosition(combat, target, fallbackCharacterId);

  if (!targeting) {
    return { aimPoint, primaryTarget, affectedCombatants: primaryTarget ? [primaryTarget] : [] };
  }

  if (!isActionTargetAllowed(targeting, target)) {
    return { aimPoint, primaryTarget, affectedCombatants: [], invalidReason: "Cible incompatible." };
  }

  if (!actor) {
    return { aimPoint, primaryTarget, affectedCombatants: primaryTarget ? [primaryTarget] : [] };
  }

  if (targeting.aim.required && !target) {
    return { aimPoint, primaryTarget, affectedCombatants: [], invalidReason: "Une cible est requise." };
  }

  const needsMapPosition = Boolean(
    target &&
      (target.kind === "position" || target.kind === "free") &&
      (targeting.aim.allowed.includes("position") || targeting.aim.allowed.includes("direction")),
  );
  if (needsMapPosition && !aimPoint) {
    return {
      primaryTarget,
      affectedCombatants: [],
      invalidReason: "La position doit être sélectionnée sur la carte.",
    };
  }

  if (aimPoint) {
    const invalidReason = getAimPointInvalidReason(combat, actor, aimPoint, targeting);
    if (invalidReason) {
      return { aimPoint, primaryTarget, affectedCombatants: [], invalidReason };
    }
  }

  const area = targeting.area ?? { shape: "none" as const };
  if (
    area.shape === "none" &&
    primaryTarget &&
    !canAffectCombatant(actor, primaryTarget, targeting)
  ) {
    return { aimPoint, primaryTarget, affectedCombatants: [], invalidReason: "Type de cible incompatible." };
  }

  const effectiveAimPoint = area.shape === "selfAura" ? actor.position : aimPoint ?? actor.position;
  const maxTargets = targeting.affects.maxTargets ?? Number.POSITIVE_INFINITY;
  const affectedCombatants = combat.combatants
    .filter(
      (combatant) =>
        canAffectCombatant(actor, combatant, targeting) &&
        isCombatantInsideArea(combatant, actor, effectiveAimPoint, targeting, primaryTarget),
    )
    .sort(
      (a, b) =>
        getDistance(effectiveAimPoint, a.position) - getDistance(effectiveAimPoint, b.position),
    )
    .slice(0, maxTargets);
  const acceptsPosition = targeting.affects.allowed.includes("position");

  return {
    aimPoint,
    primaryTarget,
    affectedCombatants,
    requiresConfirmation:
      targeting.affects.allowed.length > 0 && !acceptsPosition && affectedCombatants.length === 0,
  };
}

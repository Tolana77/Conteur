import type {
  ActionTarget,
  ActionTargetingRule,
  ActionTargetingV2,
  CombatPosition,
  CombatScene,
  Combatant,
} from "../../app/types";

const RANGE_EPSILON = 0.01;

export function toLegacyTargetingRule(targeting: ActionTargetingV2 | undefined): ActionTargetingRule | undefined {
  if (!targeting) {
    return undefined;
  }

  const allowed = new Set<ActionTargetingRule["allowed"][number]>();

  targeting.aim.allowed.forEach((aim) => {
    if (aim === "self") {
      allowed.add("self");
    }

    if (aim === "entity") {
      allowed.add("entity");
      allowed.add("character");
    }

    if (aim === "position" || aim === "direction") {
      allowed.add("position");
      allowed.add("free");
    }

    if (aim === "item") {
      allowed.add("item");
    }
  });

  const isDestination =
    targeting.aim.allowed.includes("position") &&
    targeting.affects.allowed.includes("self") &&
    targeting.affects.allowed.length === 1;

  return {
    allowed: Array.from(allowed),
    required: targeting.aim.required ?? true,
    defaultPriority: targeting.defaultPriority,
    range: targeting.aim.range,
    label: isDestination ? "destination" : "cible",
    lineOfSight: targeting.aim.lineOfSight,
    suggestedSides: targeting.suggestedSides,
  };
}

export function getTargetingRange(targeting: ActionTargetingV2 | undefined, fallback = 0): number {
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

export function isPointInsideObstacle(point: CombatPosition, obstacle: CombatScene["map"]["obstacles"][number]): boolean {
  return point.x >= obstacle.x && point.x <= obstacle.x + obstacle.width && point.y >= obstacle.y && point.y <= obstacle.y + obstacle.height;
}

export function hasLineOfSight(combat: CombatScene, from: CombatPosition, to: CombatPosition): boolean {
  return !combat.map.obstacles.some((obstacle) => {
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
}

export function hasMovementPath(combat: CombatScene, from: CombatPosition, to: CombatPosition): boolean {
  return !combat.map.obstacles.some((obstacle) => {
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

export function getSuggestedSide(actor: Combatant, target: Combatant): "self" | "ally" | "enemy" | "neutral" {
  if (actor.id === target.id) {
    return "self";
  }

  if (target.side === "neutral") {
    return "neutral";
  }

  return areHostileSides(actor, target) ? "enemy" : "ally";
}

function canAffectCombatant(
  actor: Combatant,
  combatant: Combatant,
  targeting: ActionTargetingV2,
): boolean {
  const allowed = targeting.affects.allowed;
  const hasSideRestriction = allowed.includes("enemy") || allowed.includes("ally");

  if (combatant.id === actor.id) {
    return allowed.includes("self") || (allowed.includes("ally") && !allowed.includes("enemy"));
  }

  if (allowed.includes("enemy") && areHostileSides(actor, combatant)) {
    return true;
  }

  if (
    allowed.includes("ally") &&
    !areHostileSides(actor, combatant) &&
    combatant.side !== "neutral"
  ) {
    return true;
  }

  if (hasSideRestriction) {
    return false;
  }

  if (allowed.includes("living")) {
    return true;
  }

  return false;
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
  targeting: ActionTargetingV2 | undefined;
}): ResolvedActionTargets {
  const primaryTarget = getCombatantFromTarget(combat, target, fallbackCharacterId);
  const aimPoint = getCombatantTargetPosition(combat, target, fallbackCharacterId);

  if (!targeting || !actor || !aimPoint) {
    return { aimPoint, primaryTarget, affectedCombatants: primaryTarget ? [primaryTarget] : [] };
  }

  const range = getTargetingRange(targeting, 1.5);
  const distance = getDistance(actor.position, aimPoint);

  if (range > 0 && distance > range + RANGE_EPSILON) {
    return { aimPoint, primaryTarget, affectedCombatants: [], invalidReason: "Hors de portée." };
  }

  if (targeting.aim.lineOfSight !== false && !hasLineOfSight(combat, actor.position, aimPoint)) {
    return { aimPoint, primaryTarget, affectedCombatants: [], invalidReason: "Ligne de vue bloquée." };
  }

  const wantsPosition = targeting.affects.allowed.includes("position");
  const radius = Number(targeting.area?.radius ?? 0);
  const maxTargets = targeting.affects.maxTargets ?? Number.POSITIVE_INFINITY;

  let affectedCombatants = combat.combatants.filter((combatant) => {
    if (!canAffectCombatant(actor, combatant, targeting)) {
      return false;
    }

    if (targeting.area?.shape === "circle" && radius > 0) {
      return getDistance(aimPoint, combatant.position) <= radius;
    }

    return primaryTarget?.id === combatant.id;
  });

  if (
    affectedCombatants.length === 0 &&
    targeting.affects.allowed.includes("self") &&
    !primaryTarget
  ) {
    affectedCombatants = [actor];
  }

  affectedCombatants = affectedCombatants
    .sort((a, b) => getDistance(aimPoint, a.position) - getDistance(aimPoint, b.position))
    .slice(0, maxTargets);

  return {
    aimPoint,
    primaryTarget,
    affectedCombatants,
    requiresConfirmation: targeting.affects.allowed.length > 0 && !wantsPosition && affectedCombatants.length === 0,
  };
}

import { FormEvent, useEffect, useState } from "react";
import type { ActionTarget, ActionTargetKind, ChatActionIntent, CombatPosition, CombatScene } from "../../app/types";
import { getSuggestedSide } from "../combat/targeting";
import { runAutomatedDirector } from "../ai-director/automatedDirector";
import { useGameStore } from "../../store/useGameStore";

export function ChatInput({
  onBusyChange,
  onPlayerActivity,
  onRequestMapTarget,
}: {
  onBusyChange?: (busy: boolean) => void;
  onPlayerActivity?: () => void;
  onRequestMapTarget?: (intentId: string) => void;
}) {
  const [content, setContent] = useState("");
  const [isAwaitingNarration, setIsAwaitingNarration] = useState(false);
  const sendPlayerMessage = useGameStore((state) => state.sendPlayerMessage);
  const addGmMessage = useGameStore((state) => state.addGmMessage);
  const pendingActionIntents = useGameStore((state) => state.pendingActionIntents);
  const characters = useGameStore((state) => state.characters);
  const selectedCharacterId = useGameStore((state) => state.selectedCharacterId);
  const campaign = useGameStore((state) => state.campaign);
  const itemInstances = useGameStore((state) => state.itemInstances);
  const itemTemplates = useGameStore((state) => state.itemTemplates);
  const combat = useGameStore((state) => state.combat);
  const updateActionIntentTarget = useGameStore((state) => state.updateActionIntentTarget);
  const removeActionIntent = useGameStore((state) => state.removeActionIntent);

  useEffect(() => {
    onBusyChange?.(isAwaitingNarration || Boolean(content.trim()));
  }, [content, isAwaitingNarration, onBusyChange]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const playerInput = content.trim();

    if (!playerInput && pendingActionIntents.length === 0) {
      return;
    }

    onPlayerActivity?.();
    sendPlayerMessage(content);
    setContent("");
    setIsAwaitingNarration(true);

    try {
      await runAutomatedDirector(playerInput || "Le joueur confirme son intention en attente.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erreur inconnue.";
      addGmMessage(`Le Conteur ne peut pas répondre pour le moment : ${reason}`);
    } finally {
      setIsAwaitingNarration(false);
    }
  }

  return (
    <form
      className="border-t border-[#9C7A2E]/25 bg-[#221E29] p-3"
      onPointerDown={onPlayerActivity}
      onSubmit={handleSubmit}
    >
      <div className="flex flex-wrap items-center gap-2 rounded border border-[#9C7A2E]/25 bg-[#15121A] px-2 py-2 focus-within:border-[#9C7A2E]">
        {pendingActionIntents.map((intent) => (
          <ActionIntentEditor
            isCombatActive={combat.status === "active"}
            intent={intent}
            key={intent.id}
            onRemove={() => removeActionIntent(intent.id)}
            onRequestMapTarget={onRequestMapTarget}
            onTargetChange={(target) => updateActionIntentTarget(intent.id, target)}
            targets={createTargetOptions(
              intent,
              characters,
              selectedCharacterId,
              campaign.world.entities,
              itemInstances,
              itemTemplates,
              combat,
            )}
          />
        ))}
        <input
          className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm text-[#E4D8BE] outline-none placeholder:text-[#E4D8BE]/45"
          onChange={(event) => {
            setContent(event.target.value);
            onPlayerActivity?.();
          }}
          onFocus={onPlayerActivity}
          placeholder="Décrire une action..."
          value={content}
        />
      </div>
      <button
        className="fantasy-button mt-2 w-full rounded px-4 py-2 text-sm font-semibold sm:w-auto"
        disabled={isAwaitingNarration}
        type="submit"
      >
        {isAwaitingNarration ? "Le Conteur écrit..." : "Envoyer"}
      </button>
    </form>
  );
}

interface TargetOption {
  value: string;
  target: ActionTarget;
  meta?: string;
}

function ActionIntentEditor({
  intent,
  isCombatActive,
  onRemove,
  onRequestMapTarget,
  onTargetChange,
  targets,
}: {
  intent: ChatActionIntent;
  isCombatActive: boolean;
  onRemove: () => void;
  onRequestMapTarget?: (intentId: string) => void;
  onTargetChange: (target: ActionTarget) => void;
  targets: TargetOption[];
}) {
  const [freeTarget, setFreeTarget] = useState(intent.target?.kind === "free" ? intent.target.label : "");
  const [isTargetMenuOpen, setIsTargetMenuOpen] = useState(false);
  const selectedValue = getTargetValue(intent.target);
  const isKnownTargetSelected = targets.some((target) => target.value === selectedValue);
  const isFreeSelected =
    intent.target?.kind === "free" &&
    Boolean(intent.target.label.trim()) &&
    !isKnownTargetSelected;
  const currentTargetLabel =
    targets.find((target) => target.value === selectedValue)?.target.label ??
    intent.target?.label ??
    "Choisir";
  const targetLabel = intent.targeting?.label === "destination" ? "Destination" : "Cible";
  const canPickMapPoint = isCombatActive && Boolean(intent.targeting?.allowed.includes("position"));
  const shouldShowTargetPicker =
    targets.length > 1 ||
    intent.targeting?.allowed.includes("position");

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded border border-[#9C7A2E]/35 bg-[#5A2233]/45 px-2 py-1 text-xs font-semibold text-[#E4D8BE]">
      <span className="truncate" title={intent.command}>{intent.label}</span>
      {intent.targeting && shouldShowTargetPicker ? (
        <span className="inline-flex items-center gap-1 rounded border border-[#9C7A2E]/25 bg-[#15121A]/45 px-1.5 py-0.5">
          <span className="text-[#E4D8BE]/55">{targetLabel}</span>
          <span className="relative">
            <button
              className="max-w-[170px] rounded border border-[#9C7A2E]/20 bg-[#221E29]/85 px-2 py-0.5 text-left text-[#E4D8BE] hover:border-[#9C7A2E]"
              onClick={() => setIsTargetMenuOpen((value) => !value)}
              type="button"
            >
              <span className="block truncate">{currentTargetLabel}</span>
            </button>
            {isTargetMenuOpen ? (
              <span className="absolute left-0 top-full z-30 mt-1 grid min-w-[220px] gap-1 rounded border border-[#9C7A2E]/35 bg-[#221E29] p-1 shadow-xl">
                {targets.map((target) => (
                  <button
                    className="rounded px-2 py-1.5 text-left text-xs text-[#E4D8BE] hover:bg-[#5A2233]/45"
                    key={target.value}
                    onClick={() => {
                      onTargetChange({ ...target.target, source: "selected" });
                      setIsTargetMenuOpen(false);
                    }}
                    type="button"
                  >
                    <span className="block font-semibold">{target.target.label}</span>
                    {target.meta ? (
                      <span className="block text-[10px] text-[#E4D8BE]/45">{target.meta}</span>
                    ) : null}
                  </button>
                ))}
              </span>
            ) : null}
          </span>
          {isFreeSelected ? (
            <input
              className="w-28 bg-transparent text-[#E4D8BE] outline-none placeholder:text-[#E4D8BE]/35"
              onBlur={() => {
                const trimmedTarget = freeTarget.trim();

                if (trimmedTarget) {
                  onTargetChange({
                    kind: "free",
                    id: `free:${trimmedTarget}`,
                    label: trimmedTarget,
                    source: "free",
                  });
                }
              }}
              onChange={(event) => {
                const nextValue = event.target.value;
                setFreeTarget(nextValue);

                if (nextValue.trim()) {
                  onTargetChange({
                    kind: "free",
                    id: `free:${nextValue.trim()}`,
                    label: nextValue.trim(),
                    source: "free",
                  });
                }
              }}
              placeholder=""
              value={freeTarget}
            />
          ) : null}
          {canPickMapPoint ? (
            <button
              className="rounded border border-[#9C7A2E]/25 bg-[#5A2233]/45 px-2 py-0.5 text-[#E4D8BE] hover:border-[#9C7A2E]"
              onClick={() => onRequestMapTarget?.(intent.id)}
              type="button"
            >
              Cibler
            </button>
          ) : null}
        </span>
      ) : intent.targeting && currentTargetLabel !== "Choisir" ? (
        <span className="rounded border border-[#9C7A2E]/25 bg-[#15121A]/45 px-1.5 py-0.5 text-[#E4D8BE]/70">
          {targetLabel} : {currentTargetLabel}
          {canPickMapPoint ? (
            <button
              className="ml-1 rounded border border-[#9C7A2E]/25 bg-[#5A2233]/45 px-1.5 py-0.5 text-[#E4D8BE] hover:border-[#9C7A2E]"
              onClick={() => onRequestMapTarget?.(intent.id)}
              type="button"
            >
              Cibler
            </button>
          ) : null}
        </span>
      ) : null}
      <button
        aria-label={`Retirer ${intent.label}`}
        className="rounded px-1 text-[#E4D8BE]/55 hover:bg-[#15121A]/60 hover:text-[#E4D8BE]"
        onClick={onRemove}
        type="button"
      >
        ×
      </button>
    </span>
  );
}

function getTargetValue(target: ActionTarget | undefined): string {
  return target ? `${target.kind}:${target.id}` : "free";
}

function createTargetOptions(
  intent: ChatActionIntent,
  characters: Array<{ id: string; name: string }>,
  selectedCharacterId: string,
  entities: {
    npcs: Array<{ id: string; name: string }>;
    locations: Array<{ id: string; name: string }>;
    items: Array<{ id: string; name: string }>;
  },
  itemInstances: Array<{ id: string; templateId: string; location: { parent: string | null } }>,
  itemTemplates: Array<{ id: string; name: string }>,
  combat: CombatScene,
): TargetOption[] {
  const allowed = intent.targeting?.allowed ?? [];
  const options: TargetOption[] = [];

  function addTarget(kind: ActionTargetKind, id: string, label: string) {
    if (!allowed.includes(kind)) {
      return;
    }

    if (
      combat.status === "active" &&
      kind === "self" &&
      intent.targeting?.suggestedSides &&
      !intent.targeting.suggestedSides.includes("self")
    ) {
      return;
    }

    if (!canTargetInCombat(intent, kind, id, selectedCharacterId, combat)) {
      return;
    }

    options.push({
      value: `${kind}:${id}`,
      target: { kind, id, label, source: "selected" },
    });
  }

  const selectedCharacter = characters.find((character) => character.id === selectedCharacterId);

  if (selectedCharacter) {
    addTarget("self", selectedCharacter.id, selectedCharacter.name);
  }

  if (combat.status === "active") {
    const actor = combat.combatants.find(
      (combatant) => combatant.sourceType === "character" && combatant.sourceId === selectedCharacterId,
    );

    combat.combatants
      .filter((combatant) => combatant.sourceId !== selectedCharacterId)
      .map((combatant) => {
        const kind: ActionTargetKind = combatant.sourceType === "character" ? "character" : "entity";
        const distance = actor ? getDistance(actor.position, combatant.position) : 0;
        const visible = intent.targeting?.lineOfSight === false || !actor
          ? true
          : hasLineOfSight(combat, actor.position, combatant.position);
        const inRange = distance <= getIntentRange(intent);
        const enemyRank = combatant.side === "enemies" ? 0 : 1;
        const side = actor ? getSuggestedSide(actor, combatant) : "neutral";

        return { combatant, kind, distance, visible, inRange, enemyRank, side };
      })
      .filter((candidate) => {
        const suggestedSides = intent.targeting?.suggestedSides;

        return (
          allowed.includes(candidate.kind) &&
          candidate.visible &&
          candidate.inRange &&
          (!suggestedSides || suggestedSides.includes(candidate.side))
        );
      })
      .sort((a, b) => a.enemyRank - b.enemyRank || a.distance - b.distance)
      .forEach((candidate) => {
        options.push({
          value: `${candidate.kind}:${candidate.combatant.sourceId}`,
          target: {
            kind: candidate.kind,
            id: candidate.combatant.sourceId,
            label: candidate.combatant.name,
            source: "selected",
          },
          meta: `${candidate.distance.toFixed(1)} m · ligne de vue`,
        });
      });
  } else {
    characters
      .filter((character) => character.id !== selectedCharacterId)
      .forEach((character) => addTarget("character", character.id, character.name));

    entities.npcs.forEach((entity) => addTarget("entity", entity.id, entity.name));
  }

  itemInstances
    .filter((item) => item.location.parent === selectedCharacterId)
    .forEach((item) => {
      const template = itemTemplates.find((candidate) => candidate.id === item.templateId);
      addTarget("item", item.id, template?.name ?? item.id);
    });

  return options;
}

function getDistance(a: CombatPosition, b: CombatPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isPointInsideObstacle(point: CombatPosition, obstacle: CombatScene["map"]["obstacles"][number]): boolean {
  return point.x >= obstacle.x && point.x <= obstacle.x + obstacle.width && point.y >= obstacle.y && point.y <= obstacle.y + obstacle.height;
}

function hasLineOfSight(combat: CombatScene, from: CombatPosition, to: CombatPosition): boolean {
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

function getIntentRange(intent: ChatActionIntent): number {
  const range = Number(intent.targeting?.range);

  if (Number.isFinite(range) && range > 0) {
    return range;
  }

  return intent.kind === "useAbility" ? 18 : 1.5;
}

function canTargetInCombat(
  intent: ChatActionIntent,
  kind: ActionTargetKind,
  id: string,
  selectedCharacterId: string,
  combat: CombatScene,
): boolean {
  if (combat.status !== "active" || kind === "self" || kind === "position" || kind === "item" || kind === "free") {
    return true;
  }

  const actor = combat.combatants.find(
    (combatant) => combatant.sourceType === "character" && combatant.sourceId === selectedCharacterId,
  );
  const target = combat.combatants.find((combatant) => {
    if (kind === "character") {
      return combatant.sourceType === "character" && combatant.sourceId === id;
    }

    if (kind === "entity") {
      return combatant.sourceType === "entity" && combatant.sourceId === id;
    }

    return false;
  });

  if (!actor || !target) {
    return true;
  }

  const hasRequiredLineOfSight =
    intent.targeting?.lineOfSight === false || hasLineOfSight(combat, actor.position, target.position);

  return hasRequiredLineOfSight && getDistance(actor.position, target.position) <= getIntentRange(intent);
}

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  ActionTarget,
  ActionTargetKind,
  ChatActionIntent,
  CombatScene,
  LanguageChannel,
} from "../../app/types";
import {
  applyPerceptionConditions,
  languageMasteryLabels,
  normalizeCharacterPerception,
} from "../../core/game-engine/perception";
import {
  getDistance,
  getSelectableTargetKinds,
  getSuggestedSide,
  getTargetingLabel,
  isSuggestedCombatant,
  resolveActionTargets,
} from "../combat/targeting";
import { runAutomatedDirector } from "../ai-director/automatedDirector";
import { useGameStore } from "../../store/useGameStore";
import { useMultiplayerStore } from "../multiplayer/useMultiplayerStore";

export function ChatInput({
  isExternalBusy = false,
  onBusyChange,
  onPlayerActivity,
  onRequestMapTarget,
}: {
  isExternalBusy?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onPlayerActivity?: () => void;
  onRequestMapTarget?: (intentId: string) => void;
}) {
  const [content, setContent] = useState("");
  const [communicationChannel, setCommunicationChannel] = useState<LanguageChannel>("oral");
  const [communicationLanguageId, setCommunicationLanguageId] = useState("commun");
  const [isAwaitingNarration, setIsAwaitingNarration] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const sendPlayerMessage = useGameStore((state) => state.sendPlayerMessage);
  const addGmMessage = useGameStore((state) => state.addGmMessage);
  const pendingActionIntents = useGameStore((state) => state.pendingActionIntents);
  const hasPendingPlayerCheck = useGameStore((state) =>
    state.playerCheckRequests.some((request) => request.status === "pending"));
  const characters = useGameStore((state) => state.characters);
  const selectedCharacterId = useGameStore((state) => state.selectedCharacterId);
  const campaign = useGameStore((state) => state.campaign);
  const itemInstances = useGameStore((state) => state.itemInstances);
  const itemTemplates = useGameStore((state) => state.itemTemplates);
  const combat = useGameStore((state) => state.combat);
  const updateActionIntentTarget = useGameStore((state) => state.updateActionIntentTarget);
  const removeActionIntent = useGameStore((state) => state.removeActionIntent);
  const clearActionIntents = useGameStore((state) => state.clearActionIntents);
  const multiplayerRoom = useMultiplayerStore((state) => state.room);
  const multiplayerSelf = useMultiplayerStore((state) => state.self);
  const pendingMultiplayerTurn = useMultiplayerStore((state) => state.pendingTurn);
  const awaitingHostState = useMultiplayerStore((state) => state.awaitingHostState);
  const submitMultiplayerTurn = useMultiplayerStore((state) => state.submitTurn);
  const isRemotePlayer = Boolean(
    multiplayerRoom && (multiplayerSelf?.role === "player" || multiplayerSelf?.role === "admin"),
  );
  const isSpectator = Boolean(multiplayerRoom && multiplayerSelf?.role === "spectator");
  const isMultiplayerBlocked = isSpectator || awaitingHostState || Boolean(pendingMultiplayerTurn);
  const selectedCharacter = characters.find((character) => character.id === selectedCharacterId);
  const selectedCombatant = combat.combatants.find((combatant) =>
    combatant.sourceType === "character" && combatant.sourceId === selectedCharacterId);
  const selectedPerception = useMemo(
    () => applyPerceptionConditions(
      normalizeCharacterPerception(selectedCharacter?.perception),
      selectedCombatant?.conditions ?? [],
    ),
    [selectedCharacter, selectedCombatant],
  );
  const communicationLanguages = useMemo(
    () => selectedPerception.languages.filter((language) => language[communicationChannel] !== "none"),
    [communicationChannel, selectedPerception],
  );

  useEffect(() => {
    if (communicationLanguages.some((language) => language.languageId === communicationLanguageId)) return;
    setCommunicationLanguageId(communicationLanguages[0]?.languageId ?? "commun");
  }, [communicationLanguageId, communicationLanguages]);

  useEffect(() => {
    onBusyChange?.(isAwaitingNarration || Boolean(content.trim()));
  }, [content, isAwaitingNarration, onBusyChange]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isExternalBusy || hasPendingPlayerCheck || isMultiplayerBlocked) return;
    const playerInput = content.trim();

    if (!playerInput && pendingActionIntents.length === 0) {
      return;
    }

    onPlayerActivity?.();
    setSubmissionError(null);

    if (isRemotePlayer) {
      setIsAwaitingNarration(true);
      try {
        await submitMultiplayerTurn(playerInput, pendingActionIntents, {
          channel: communicationChannel,
          languageId: communicationLanguageId,
        });
        clearActionIntents();
        setContent("");
      } catch (error) {
        setSubmissionError(error instanceof Error ? error.message : "Intention impossible à transmettre.");
      } finally {
        setIsAwaitingNarration(false);
      }
      return;
    }

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
          disabled={isExternalBusy || hasPendingPlayerCheck || isAwaitingNarration || isMultiplayerBlocked}
          onChange={(event) => {
            setContent(event.target.value);
            onPlayerActivity?.();
          }}
          onFocus={onPlayerActivity}
          placeholder={isSpectator
            ? "Mode spectateur"
            : awaitingHostState
              ? "En attente de l'état du MJ..."
              : pendingMultiplayerTurn
                ? "Intention transmise au MJ..."
                : hasPendingPlayerCheck
            ? "Lancez le dé pour poursuivre..."
            : isExternalBusy
              ? "Le Conteur interprète le résultat..."
              : "Décrire une action..."}
          value={content}
        />
      </div>
      {isRemotePlayer ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#E4D8BE]/60">
          <label className="sr-only" htmlFor="communication-channel">Canal de communication</label>
          <select
            className="rounded border border-[#9C7A2E]/25 bg-[#15121A] px-2 py-1.5 text-[#E4D8BE] outline-none focus:border-[#9C7A2E]"
            id="communication-channel"
            onChange={(event) => setCommunicationChannel(event.target.value as LanguageChannel)}
            value={communicationChannel}
          >
            <option value="oral">Parler</option>
            <option value="written">Écrire</option>
          </select>
          <label className="sr-only" htmlFor="communication-language">Langue utilisée</label>
          <select
            className="min-w-0 max-w-full rounded border border-[#9C7A2E]/25 bg-[#15121A] px-2 py-1.5 text-[#E4D8BE] outline-none focus:border-[#9C7A2E] disabled:opacity-45"
            disabled={communicationLanguages.length === 0}
            id="communication-language"
            onChange={(event) => setCommunicationLanguageId(event.target.value)}
            value={communicationLanguageId}
          >
            {communicationLanguages.length ? communicationLanguages.map((language) => (
              <option key={language.languageId} value={language.languageId}>
                {language.name} · {languageMasteryLabels[language[communicationChannel]]}
              </option>
            )) : <option value="commun">Aucune langue maîtrisée</option>}
          </select>
          {communicationChannel === "oral" && selectedPerception.speech === "none" ? (
            <span className="text-[#D78A82]">Aucun son ne sera émis.</span>
          ) : null}
          {communicationChannel === "written" && selectedPerception.vision === "none" ? (
            <span className="text-[#D6B36A]">Le personnage ne pourra pas relire son texte.</span>
          ) : null}
        </div>
      ) : null}
      <button
        className="fantasy-button mt-2 w-full rounded px-4 py-2 text-sm font-semibold sm:w-auto"
        disabled={isAwaitingNarration || isExternalBusy || hasPendingPlayerCheck || isMultiplayerBlocked}
        type="submit"
      >
        {isSpectator
          ? "Spectateur"
          : pendingMultiplayerTurn
            ? "En attente du MJ"
            : awaitingHostState
              ? "Synchronisation..."
              : isExternalBusy
          ? "Le Conteur interprète..."
          : hasPendingPlayerCheck
            ? "Jet en attente"
            : isAwaitingNarration
              ? "Le Conteur écrit..."
              : "Envoyer"}
      </button>
      {submissionError ? (
        <p className="mt-2 text-xs text-[#D98A8A]">{submissionError}</p>
      ) : null}
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
  const targetLabel = getTargetingLabel(intent.targeting) === "destination" ? "Destination" : "Cible";
  const canPickMapPoint =
    isCombatActive &&
    Boolean(
      intent.targeting?.aim.allowed.includes("position") ||
      intent.targeting?.aim.allowed.includes("direction"),
    );
  const shouldShowTargetPicker =
    targets.length > 1 ||
    canPickMapPoint;

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
  const allowed = getSelectableTargetKinds(intent.targeting);
  const options: TargetOption[] = [];

  function addTarget(kind: ActionTargetKind, id: string, label: string) {
    if (!allowed.includes(kind)) {
      return;
    }

    options.push({
      value: `${kind}:${id}`,
      target: { kind, id, label, source: "selected" },
    });
  }

  if (combat.status === "active") {
    const actor = combat.combatants.find(
      (combatant) => combatant.sourceType === "character" && combatant.sourceId === selectedCharacterId,
    );

    if (actor && intent.targeting) {
      combat.combatants
      .map((combatant) => {
        const kind: ActionTargetKind = combatant.id === actor.id
          ? "self"
          : combatant.sourceType === "character"
            ? "character"
            : "entity";
        const target: ActionTarget = {
          kind,
          id: combatant.sourceId,
          label: combatant.name,
          source: "selected",
        };
        const distance = actor ? getDistance(actor.position, combatant.position) : 0;
        const side = getSuggestedSide(actor, combatant);
        const sideRank = intent.targeting?.suggestedSides?.indexOf(side) ?? -1;
        const resolution = resolveActionTargets({
          actor,
          combat,
          fallbackCharacterId: selectedCharacterId,
          target,
          targeting: intent.targeting,
        });

        return { combatant, distance, kind, resolution, sideRank, target };
      })
      .filter((candidate) => {
        return (
          allowed.includes(candidate.kind) &&
          !candidate.resolution.invalidReason &&
          isSuggestedCombatant(actor, candidate.combatant, intent.targeting!)
        );
      })
      .sort((a, b) => {
        const aRank = a.sideRank < 0 ? Number.MAX_SAFE_INTEGER : a.sideRank;
        const bRank = b.sideRank < 0 ? Number.MAX_SAFE_INTEGER : b.sideRank;
        return aRank - bRank || a.distance - b.distance;
      })
      .forEach((candidate) => {
        options.push({
          value: `${candidate.kind}:${candidate.combatant.sourceId}`,
          target: candidate.target,
          meta: `${candidate.distance.toFixed(1)} m · ligne de vue`,
        });
      });
    }
  } else {
    const selectedCharacter = characters.find((character) => character.id === selectedCharacterId);
    if (selectedCharacter) {
      addTarget("self", selectedCharacter.id, selectedCharacter.name);
    }

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

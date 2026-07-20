import { useMemo, useState } from "react";
import { useGameStore } from "../../store/useGameStore";
import {
  createMultiplayerCharacterContext,
  describeCharacterPackage,
} from "../multiplayer/characterOnboarding";
import { useMultiplayerStore } from "../multiplayer/useMultiplayerStore";
import { CharacterCreationStep } from "./CharacterCreationStep";
import type { CharacterCreationPackage } from "./characterCreation";

type CreationMode = "preset" | "create";

/** Occupe la place de la fiche tant que le joueur n'a pas de personnage. */
export function CharacterCreationPage() {
  const room = useMultiplayerStore((state) => state.room);
  const self = useMultiplayerStore((state) => state.self);
  const awaitingHostState = useMultiplayerStore((state) => state.awaitingHostState);
  const presets = useMultiplayerStore((state) => state.characterPresets);
  const pendingRequest = useMultiplayerStore((state) => state.pendingCharacterRequest);
  const multiplayerError = useMultiplayerStore((state) => state.error);
  const submitCharacterRequest = useMultiplayerStore((state) => state.submitCharacterRequest);
  const addCharacterFromPackage = useGameStore((state) => state.addCharacterFromPackage);
  const selectCharacter = useGameStore((state) => state.selectCharacter);
  const gameState = useGameStore();
  const [mode, setMode] = useState<CreationMode>(presets.length ? "preset" : "create");
  const [setup, setSetup] = useState<CharacterCreationPackage | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const context = useMemo(() => createMultiplayerCharacterContext(gameState), [gameState]);
  const isRemoteParticipant = Boolean(
    room && self && (self.role === "player" || self.role === "admin"),
  );

  async function submit(operation: () => Promise<void> | void) {
    setBusy(true);
    setLocalError(null);
    try {
      await operation();
    } catch (operationError) {
      setLocalError(operationError instanceof Error ? operationError.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  }

  function createLocalCharacter() {
    if (!setup) return;
    const character = addCharacterFromPackage(setup);
    if (!character) throw new Error("Ce personnage ne respecte pas les règles de la campagne.");
    selectCharacter(character.id);
  }

  const content = pendingRequest ? (
    <div className="grid min-h-[360px] place-items-center p-6 text-center">
      <div>
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#9C7A2E]/25 border-t-[#9C7A2E]" />
        <h3 className="ink-heading text-xl text-[#E4D8BE]">Votre personnage rejoint la campagne</h3>
        <p className="mt-2 text-sm text-[#E4D8BE]/60">
          {pendingRequest.status === "processing"
            ? "La fiche est en cours d’installation."
            : "Votre choix attend sa validation."}
        </p>
      </div>
    </div>
  ) : awaitingHostState && isRemoteParticipant ? (
    <div className="grid min-h-[360px] place-items-center p-6 text-sm text-[#E4D8BE]/65">
      Synchronisation de la campagne en cours…
    </div>
  ) : (
    <div className="p-3 sm:p-5">
      {isRemoteParticipant ? (
        <div className="mb-5 grid grid-cols-2 border border-[#9C7A2E]/30 bg-[#15121A] p-1">
          <button
            className={`px-3 py-2 text-sm ${mode === "preset" ? "bg-[#5A2233] text-[#E4D8BE]" : "text-[#E4D8BE]/60"}`}
            onClick={() => setMode("preset")}
            type="button"
          >
            Préfabriqués
          </button>
          <button
            className={`px-3 py-2 text-sm ${mode === "create" ? "bg-[#5A2233] text-[#E4D8BE]" : "text-[#E4D8BE]/60"}`}
            onClick={() => setMode("create")}
            type="button"
          >
            Création libre
          </button>
        </div>
      ) : null}

      {localError || multiplayerError ? (
        <p className="mb-4 border border-[#7A1F2E] bg-[#7A1F2E]/20 px-3 py-2 text-sm text-[#E4D8BE]">
          {localError ?? multiplayerError}
        </p>
      ) : null}

      {isRemoteParticipant && mode === "preset" ? (
        presets.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {presets.map((preset) => {
              const character = preset.characterPackage.characters[0];
              return (
                <article className="jagged-card border border-[#9C7A2E]/30 bg-[#15121A]/55 p-4" key={preset.id}>
                  <p className="rune-label text-[10px]">Prêt à jouer</p>
                  <h3 className="ink-heading mt-1 text-xl font-semibold text-[#E4D8BE]">{character.name}</h3>
                  <p className="mt-1 text-xs text-[#9C7A2E]">{describeCharacterPackage(preset.characterPackage)}</p>
                  <p className="mt-3 text-sm leading-6 text-[#E4D8BE]/70">
                    {preset.summary || character.description || character.origin || "Aventurier prêt à rejoindre la campagne."}
                  </p>
                  <button
                    className="fantasy-button mt-4 w-full px-3 py-2 text-sm font-semibold"
                    disabled={busy}
                    onClick={() => void submit(() => submitCharacterRequest("preset", undefined, preset.id))}
                    type="button"
                  >
                    Choisir {character.name}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-[#9C7A2E]/30 px-4 py-10 text-center">
            <p className="text-sm text-[#E4D8BE]/65">Aucun personnage préfabriqué n’est disponible.</p>
            <button className="mt-3 text-sm text-[#9C7A2E] underline" onClick={() => setMode("create")} type="button">
              Créer mon personnage
            </button>
          </div>
        )
      ) : (
        <div>
          <CharacterCreationStep
            context={context}
            initialParty={{ characters: [], startingItems: [] }}
            key={gameState.campaign.id}
            onSetupChange={setSetup}
          />
          <button
            className="fantasy-button mt-4 w-full px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!setup || busy}
            onClick={() => setup && void submit(() => (
              isRemoteParticipant
                ? submitCharacterRequest("custom", setup)
                : createLocalCharacter()
            ))}
            type="button"
          >
            {isRemoteParticipant ? "Proposer ce personnage" : "Créer ce personnage"}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <aside className="paper-surface h-full min-h-0 overflow-y-auto">
      <section className="mx-auto min-h-full max-w-4xl border-x border-[#9C7A2E]/30 bg-[#221E29]">
        <header className="border-b border-[#9C7A2E]/30 px-4 py-4 text-center sm:px-6">
          <p className="rune-label text-xs">{context.campaignName}</p>
          <h2 className="ink-heading mt-1 text-2xl font-bold text-[#E4D8BE]">Créez votre personnage</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[#E4D8BE]/65">
            Cette fiche appartient uniquement à cette campagne et s’appuie sur son univers, ses factions et sa situation initiale.
          </p>
        </header>
        {content}
      </section>
    </aside>
  );
}

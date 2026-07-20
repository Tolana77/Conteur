import { useMemo, useState } from "react";
import { useGameStore } from "../../store/useGameStore";
import { CharacterCreationStep } from "../character/CharacterCreationStep";
import type { CharacterCreationPackage } from "../character/characterCreation";
import { createMultiplayerCharacterContext, describeCharacterPackage } from "./characterOnboarding";
import { isMultiplayerAdmin } from "./permissions";
import { useMultiplayerStore } from "./useMultiplayerStore";

export function CharacterPresetManager() {
  const room = useMultiplayerStore((state) => state.room);
  const self = useMultiplayerStore((state) => state.self);
  const presets = useMultiplayerStore((state) => state.characterPresets);
  const createPreset = useMultiplayerStore((state) => state.createCharacterPreset);
  const deletePreset = useMultiplayerStore((state) => state.deleteCharacterPreset);
  const gameState = useGameStore();
  const [isCreating, setIsCreating] = useState(false);
  const [setup, setSetup] = useState<CharacterCreationPackage | null>(null);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const context = useMemo(() => createMultiplayerCharacterContext(gameState), [gameState]);

  if (!room || !isMultiplayerAdmin(self)) return null;

  async function savePreset() {
    const character = setup?.characters[0];
    if (!setup || !character) return;
    setBusy(true);
    setNotice(null);
    try {
      await createPreset(character.name, summary, setup);
      setSetup(null);
      setSummary("");
      setIsCreating(false);
      setNotice(`${character.name} est disponible pour les nouveaux joueurs.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Création du préfabriqué impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rune-label text-xs">Réserves de la campagne</p>
          <h3 className="ink-heading text-xl font-bold text-[#E4D8BE]">Personnages préfabriqués</h3>
          <p className="mt-1 text-sm text-[#E4D8BE]/60">Des fiches équilibrées que les nouveaux joueurs peuvent choisir immédiatement.</p>
        </div>
        <button className="fantasy-button px-3 py-2 text-sm" onClick={() => setIsCreating((value) => !value)} type="button">
          {isCreating ? "Fermer la création" : "Ajouter un préfabriqué"}
        </button>
      </div>

      {notice ? <p className="mt-3 border border-[#9C7A2E]/25 px-3 py-2 text-sm text-[#E4D8BE]/75">{notice}</p> : null}

      {presets.length ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {presets.map((preset) => (
            <article className="flex items-center gap-3 border border-[#9C7A2E]/20 bg-[#221E29] px-3 py-2" key={preset.id}>
              <div className="min-w-0 flex-1">
                <strong className="block truncate font-medium text-[#E4D8BE]">{preset.characterPackage.characters[0].name}</strong>
                <span className="block truncate text-xs text-[#E4D8BE]/50">{describeCharacterPackage(preset.characterPackage)}</span>
              </div>
              <button
                className="px-2 py-1 text-xs text-[#D78A82] hover:bg-[#7A1F2E]/25"
                onClick={() => void deletePreset(preset.id)}
                type="button"
              >
                Supprimer
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 border border-dashed border-[#9C7A2E]/25 px-3 py-5 text-center text-sm text-[#E4D8BE]/50">
          Aucun personnage de rechange.
        </p>
      )}

      {isCreating ? (
        <div className="mt-5 border border-[#9C7A2E]/25 bg-[#15121A]/35 p-3">
          <CharacterCreationStep
            context={context}
            initialParty={{ characters: [], startingItems: [] }}
            onSetupChange={setSetup}
          />
          <label className="mt-4 grid gap-1 text-xs text-[#E4D8BE]/65">
            Présentation courte pour le joueur
            <textarea
              className="h-24 resize-y border border-[#9C7A2E]/25 bg-[#15121A] px-3 py-2 text-sm text-[#E4D8BE] outline-none focus:border-[#9C7A2E]"
              maxLength={500}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Ce qui rend ce personnage intéressant, sans révéler de secret."
              value={summary}
            />
          </label>
          <button
            className="fantasy-button mt-3 w-full px-4 py-3 text-sm font-semibold disabled:opacity-35"
            disabled={!setup || busy}
            onClick={() => void savePreset()}
            type="button"
          >
            Publier ce préfabriqué
          </button>
        </div>
      ) : null}
    </section>
  );
}

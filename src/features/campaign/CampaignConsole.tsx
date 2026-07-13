import { FormEvent, useState } from "react";
import type { Entity } from "../../app/types";
import {
  adminCommandDocs,
  executeAdminCommand,
  type AdminCommandResult,
} from "../admin/adminCommands";
import {
  GAME_STORAGE_KEY,
  GAME_STORAGE_VERSION,
  LEGACY_CAMPAIGNS_STORAGE_KEY,
  useGameStore,
} from "../../store/useGameStore";
import { AiDirectorConsole } from "../ai-director/AiDirectorConsole";
import { AiApiTraceConsole } from "../ai-director/AiApiTraceConsole";
import { HighlightedGameText } from "../../ui/gameTerms";
import { WorldWorkshop } from "../world/WorldWorkshop";

const entitySections = [
  { key: "npcs", label: "NPC" },
  { key: "locations", label: "Lieux" },
  { key: "items", label: "Objets" },
] as const;

interface CampaignConsoleProps {
  onClose: () => void;
  initialView?: "campaign" | "world";
}

export function CampaignConsole({ onClose, initialView = "campaign" }: CampaignConsoleProps) {
  const [newFact, setNewFact] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [commandInput, setCommandInput] = useState("help");
  const [commandHistory, setCommandHistory] = useState<
    Array<AdminCommandResult & { input: string }>
  >([]);
  const storageVersion = useGameStore((state) => state.storageVersion);
  const campaign = useGameStore((state) => state.campaign);
  const characters = useGameStore((state) => state.characters);
  const messages = useGameStore((state) => state.messages);
  const characterPortraits = useGameStore((state) => state.characterPortraits);
  const showItemTags = useGameStore((state) => state.uiSettings.showItemTags);
  const itemTemplates = useGameStore((state) => state.itemTemplates);
  const itemInstances = useGameStore((state) => state.itemInstances);
  const abilityTemplates = useGameStore((state) => state.abilityTemplates);
  const abilityInstances = useGameStore((state) => state.abilityInstances);
  const combat = useGameStore((state) => state.combat);
  const updateWorldFact = useGameStore((state) => state.updateWorldFact);
  const addWorldFact = useGameStore((state) => state.addWorldFact);
  const removeWorldFact = useGameStore((state) => state.removeWorldFact);
  const updateEntity = useGameStore((state) => state.updateEntity);
  const resetGameState = useGameStore((state) => state.resetGameState);
  const clearCharacterPortraits = useGameStore((state) => state.clearCharacterPortraits);
  const setShowItemTags = useGameStore((state) => state.setShowItemTags);
  const selectedCharacterId = useGameStore((state) => state.selectedCharacterId);
  const dealDamage = useGameStore((state) => state.dealDamage);
  const healCharacter = useGameStore((state) => state.healCharacter);
  const setCharacterPv = useGameStore((state) => state.setCharacterPv);
  const changeCharacterStat = useGameStore((state) => state.changeCharacterStat);
  const equipItem = useGameStore((state) => state.equipItem);
  const unequipItem = useGameStore((state) => state.unequipItem);
  const giveItem = useGameStore((state) => state.giveItem);
  const pickupItem = useGameStore((state) => state.pickupItem);
  const removeItem = useGameStore((state) => state.removeItem);
  const useItem = useGameStore((state) => state.useItem);
  const useAbility = useGameStore((state) => state.useAbility);
  const rechargeAbility = useGameStore((state) => state.rechargeAbility);
  const setAbilityCharges = useGameStore((state) => state.setAbilityCharges);
  const rest = useGameStore((state) => state.rest);
  const startEncounter = useGameStore((state) => state.startEncounter);
  const startCombat = useGameStore((state) => state.startCombat);
  const endCombat = useGameStore((state) => state.endCombat);
  const addCharacterToCombat = useGameStore((state) => state.addCharacterToCombat);
  const addEntityToCombat = useGameStore((state) => state.addEntityToCombat);
  const revealMapDetail = useGameStore((state) => state.revealMapDetail);
  const hideMapDetail = useGameStore((state) => state.hideMapDetail);
  const moveCombatant = useGameStore((state) => state.moveCombatant);
  const nextCombatTurn = useGameStore((state) => state.nextCombatTurn);
  const rollFormula = useGameStore((state) => state.rollFormula);
  const hasLegacyCampaignStorage =
    typeof localStorage !== "undefined" && localStorage.getItem(LEGACY_CAMPAIGNS_STORAGE_KEY) !== null;

  function handleAddFact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addWorldFact(newFact);
    setNewFact("");
  }

  function patchEntity(entity: Entity, changes: Partial<Entity>) {
    updateEntity({ ...entity, ...changes });
  }

  function handleResetGameState() {
    const shouldReset = window.confirm(
      "Réinitialiser la sauvegarde locale de l'application ? Les messages, jets et modifications de campagne seront remis à zéro.",
    );

    if (!shouldReset) {
      return;
    }

    resetGameState();
    setNotice("Sauvegarde locale réinitialisée.");
  }

  function handleClearPortraits() {
    const shouldClear = window.confirm("Effacer tous les portraits stockés localement ?");

    if (!shouldClear) {
      return;
    }

    clearCharacterPortraits();
    setNotice("Portraits locaux effacés.");
  }

  function handleClearLegacyStorage() {
    localStorage.removeItem(LEGACY_CAMPAIGNS_STORAGE_KEY);
    setNotice("Ancienne clé de stockage nettoyée.");
  }

  function handleRunCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedCommand = commandInput.trim();

    if (!trimmedCommand) {
      return;
    }

    const result = executeAdminCommand(trimmedCommand, {
      characters,
      selectedCharacterId,
      itemTemplates,
      itemInstances,
      abilityTemplates,
      abilityInstances,
      combat,
      dealDamage,
      healCharacter,
      setCharacterPv,
      changeCharacterStat,
      equipItem,
      unequipItem,
      giveItem,
      pickupItem,
      removeItem,
      useItem,
      useAbility,
      rechargeAbility,
      setAbilityCharges,
      rest,
      startEncounter,
      startCombat,
      endCombat,
      addCharacterToCombat,
      addEntityToCombat,
      revealMapDetail,
      hideMapDetail,
      moveCombatant,
      nextCombatTurn,
      rollFormula,
    });

    setCommandHistory((history) => [{ ...result, input: trimmedCommand }, ...history].slice(0, 8));
  }

  return (
    <div className="fixed inset-0 z-20 bg-[#15121A]/80 p-3 backdrop-blur-sm">
      <section className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded border border-[#9C7A2E]/25 bg-[#221E29]">
        <header className="flex items-center justify-between border-b border-[#9C7A2E]/20 px-4 py-3">
          <div>
            <p className="rune-label text-xs">{initialView === "world" ? "Création locale" : "Console admin"}</p>
            <h2 className="ink-heading text-xl font-bold">{initialView === "world" ? "Nouveau monde" : "Vue campagne"}</h2>
          </div>
          <button
            className="fantasy-button rounded px-3 py-2 text-sm font-semibold"
            onClick={onClose}
            type="button"
          >
            Fermer
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {notice ? (
            <div className="mb-4 rounded border border-[#3F5641] bg-[#3F5641]/25 px-3 py-2 text-sm text-[#E4D8BE]">
              {notice}
            </div>
          ) : null}

          {initialView === "world" ? <WorldWorkshop /> : <>
          <section className="mb-6 grid gap-3 md:grid-cols-2">
            <div className="manuscript-card rounded p-3">
              <h3 className="ink-heading font-bold">{campaign.name}</h3>
              <p className="text-sm text-[#E4D8BE]/65">
                <HighlightedGameText text={campaign.style} />
              </p>
            </div>
            <div className="manuscript-card rounded p-3">
              <h3 className="ink-heading font-bold">Lore</h3>
              <p className="text-sm text-[#E4D8BE]/65">
                <HighlightedGameText text={campaign.world.lore} />
              </p>
            </div>
          </section>

          <section className="mb-6">
            <h3 className="rune-label mb-2 text-sm">Fondations</h3>
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
              <div className="manuscript-card rounded p-3">
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-[#E4D8BE]/50">Version attendue</dt>
                    <dd className="font-bold text-[#E4D8BE]">{GAME_STORAGE_VERSION}</dd>
                  </div>
                  <div>
                    <dt className="text-[#E4D8BE]/50">Version active</dt>
                    <dd className="font-bold text-[#E4D8BE]">{storageVersion}</dd>
                  </div>
                  <div>
                    <dt className="text-[#E4D8BE]/50">Personnages</dt>
                    <dd className="font-bold text-[#E4D8BE]">{characters.length}</dd>
                  </div>
                  <div>
                    <dt className="text-[#E4D8BE]/50">Messages</dt>
                    <dd className="font-bold text-[#E4D8BE]">{messages.length}</dd>
                  </div>
                  <div>
                    <dt className="text-[#E4D8BE]/50">Templates d'objets</dt>
                    <dd className="font-bold text-[#E4D8BE]">{itemTemplates.length}</dd>
                  </div>
                  <div>
                    <dt className="text-[#E4D8BE]/50">Objets instanciés</dt>
                    <dd className="font-bold text-[#E4D8BE]">{itemInstances.length}</dd>
                  </div>
                  <div>
                    <dt className="text-[#E4D8BE]/50">Portraits locaux</dt>
                    <dd className="font-bold text-[#E4D8BE]">
                      {Object.keys(characterPortraits).length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#E4D8BE]/50">Ancien stockage</dt>
                    <dd className="font-bold text-[#E4D8BE]">
                      {hasLegacyCampaignStorage ? "Présent" : "Absent"}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 break-all text-xs text-[#E4D8BE]/45">
                  Clé active : {GAME_STORAGE_KEY}
                </p>
              </div>

              <div className="manuscript-card rounded p-3">
                <label className="mb-3 flex items-start gap-3 rounded border border-[#9C7A2E]/15 bg-[#15121A]/55 p-3 text-sm text-[#E4D8BE]">
                  <input
                    checked={showItemTags}
                    className="mt-1 accent-[#9C7A2E]"
                    onChange={(event) => setShowItemTags(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    <span className="block font-semibold">Afficher les types des objets</span>
                    <span className="mt-1 block text-xs text-[#E4D8BE]/55">
                      Masque ou affiche les catégories principales sur les cartes d'objet.
                    </span>
                  </span>
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    className="fantasy-button rounded px-3 py-2 text-sm font-semibold"
                    onClick={handleResetGameState}
                    type="button"
                  >
                    Réinitialiser
                  </button>
                  <button
                    className="fantasy-button rounded px-3 py-2 text-sm font-semibold"
                    onClick={handleClearPortraits}
                    type="button"
                  >
                    Effacer portraits
                  </button>
                  <button
                    className="fantasy-button rounded px-3 py-2 text-sm font-semibold disabled:opacity-40"
                    disabled={!hasLegacyCampaignStorage}
                    onClick={handleClearLegacyStorage}
                    type="button"
                  >
                    Nettoyer ancien stockage
                  </button>
                </div>
                <p className="mt-3 text-xs text-[#E4D8BE]/55">
                  Ces actions ne touchent qu'aux données locales du navigateur courant.
                </p>
              </div>
            </div>
          </section>

          <AiDirectorConsole />
          <AiApiTraceConsole />

          <section className="mb-6">
            <h3 className="rune-label mb-2 text-sm">Commandes moteur</h3>
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
              <div className="manuscript-card rounded p-3">
                <form className="flex gap-2" onSubmit={handleRunCommand}>
                  <input
                    className="min-w-0 flex-1 rounded border border-[#9C7A2E]/25 bg-[#15121A] px-3 py-2 text-sm text-[#E4D8BE] placeholder:text-[#E4D8BE]/45"
                    onChange={(event) => setCommandInput(event.target.value)}
                    placeholder="dealDamage selected 2"
                    value={commandInput}
                  />
                  <button className="fantasy-button rounded px-3 py-2 text-sm" type="submit">
                    Exécuter
                  </button>
                </form>
                <p className="mt-2 text-xs text-[#E4D8BE]/55">
                  Utilise <span className="font-bold text-[#E4D8BE]">selected</span> pour cibler la
                  fiche actuellement sélectionnée.
                </p>

                <div className="mt-3 space-y-2">
                  {commandHistory.map((entry, index) => (
                    <article
                      className={`rounded border px-3 py-2 text-sm ${
                        entry.status === "error"
                          ? "border-[#5A2233] bg-[#5A2233]/25"
                          : "border-[#9C7A2E]/25 bg-[#15121A]"
                      }`}
                      key={`${entry.input}-${index}`}
                    >
                      <p className="font-mono text-xs text-[#9C7A2E]">&gt; {entry.input}</p>
                      <pre className="mt-1 whitespace-pre-wrap font-sans text-[#E4D8BE]">
                        <HighlightedGameText text={entry.message} />
                      </pre>
                    </article>
                  ))}
                </div>
              </div>

              <div className="manuscript-card rounded p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-[#9C7A2E]">
                  Fonctions disponibles
                </p>
                <div className="space-y-2">
                  {adminCommandDocs.map((command) => (
                    <article className="rounded border border-[#9C7A2E]/15 bg-[#15121A] p-2" key={command.name}>
                      <p className="font-mono text-xs text-[#E4D8BE]">{command.usage}</p>
                      <p className="mt-1 text-xs text-[#E4D8BE]/60">{command.description}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="mb-6">
            <h3 className="rune-label mb-2 text-sm">Facts du monde</h3>
            <div className="space-y-2">
              {campaign.world.facts.map((fact, index) => (
                <div className="flex gap-2" key={`${fact}-${index}`}>
                  <input
                    className="min-w-0 flex-1 rounded border border-[#9C7A2E]/25 bg-[#15121A] px-3 py-2 text-sm text-[#E4D8BE]"
                    onChange={(event) => updateWorldFact(index, event.target.value)}
                    value={fact}
                  />
                  <button
                    className="fantasy-button rounded px-3 py-2 text-sm"
                    onClick={() => removeWorldFact(index)}
                    type="button"
                  >
                    Suppr.
                  </button>
                </div>
              ))}
            </div>
            <form className="mt-3 flex gap-2" onSubmit={handleAddFact}>
              <input
                className="min-w-0 flex-1 rounded border border-[#9C7A2E]/25 bg-[#15121A] px-3 py-2 text-sm text-[#E4D8BE] placeholder:text-[#E4D8BE]/45"
                onChange={(event) => setNewFact(event.target.value)}
                placeholder="Nouveau fait du monde"
                value={newFact}
              />
              <button
                className="fantasy-button rounded px-3 py-2 text-sm font-semibold"
                type="submit"
              >
                Ajouter
              </button>
            </form>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            {entitySections.map((section) => (
              <div className="space-y-2" key={section.key}>
                <h3 className="rune-label text-sm">{section.label}</h3>
                {campaign.world.entities[section.key].map((entity) => (
                  <article className="manuscript-card rounded p-3" key={entity.id}>
                    <input
                      className="mb-2 w-full rounded border border-[#9C7A2E]/25 bg-[#15121A] px-2 py-1 text-sm font-semibold text-[#E4D8BE]"
                      onChange={(event) => patchEntity(entity, { name: event.target.value })}
                      value={entity.name}
                    />
                    <textarea
                      className="h-24 w-full resize-none rounded border border-[#9C7A2E]/25 bg-[#15121A] px-2 py-1 text-sm text-[#E4D8BE]"
                      onChange={(event) =>
                        patchEntity(entity, { description: event.target.value })
                      }
                      value={entity.description}
                    />
                  </article>
                ))}
              </div>
            ))}
          </section>
          </>}
        </div>
      </section>
    </div>
  );
}

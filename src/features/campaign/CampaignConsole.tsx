import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
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
import { ContentWorkshop } from "../content/ContentWorkshop";

const entitySections = [
  { key: "npcs", label: "NPC" },
  { key: "locations", label: "Lieux" },
  { key: "items", label: "Objets" },
] as const;

const adminSections = [
  { id: "overview", label: "Aperçu" },
  { id: "content", label: "Contenu" },
  { id: "ai", label: "MJ IA" },
  { id: "engine", label: "Moteur" },
  { id: "world", label: "Monde" },
] as const;

type AdminSectionId = (typeof adminSections)[number]["id"];

interface CampaignConsoleProps {
  onClose: () => void;
  initialView?: "campaign" | "world";
}

export function CampaignConsole({ onClose, initialView = "campaign" }: CampaignConsoleProps) {
  const [newFact, setNewFact] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSectionId>("overview");
  const storageVersion = useGameStore((state) => state.storageVersion);
  const gameRevision = useGameStore((state) => state.gameRevision);
  const gameEventCount = useGameStore((state) => state.gameEvents.length);
  const campaign = useGameStore((state) => state.campaign);
  const characters = useGameStore((state) => state.characters);
  const messages = useGameStore((state) => state.messages);
  const characterPortraits = useGameStore((state) => state.characterPortraits);
  const showItemTags = useGameStore((state) => state.uiSettings.showItemTags);
  const itemTemplates = useGameStore((state) => state.itemTemplates);
  const itemInstances = useGameStore((state) => state.itemInstances);
  const abilityTemplates = useGameStore((state) => state.abilityTemplates);
  const gameActionTemplates = useGameStore((state) => state.gameActionTemplates);
  const abilityInstances = useGameStore((state) => state.abilityInstances);
  const spellTemplates = useGameStore((state) => state.spellTemplates);
  const spellbooks = useGameStore((state) => state.spellbooks);
  const effectTemplates = useGameStore((state) => state.effectTemplates);
  const enemyTemplates = useGameStore((state) => state.enemyTemplates);
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
  const learnSpell = useGameStore((state) => state.learnSpell);
  const prepareSpells = useGameStore((state) => state.prepareSpells);
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

  function runAdminCommand(input: string): AdminCommandResult {
    return executeAdminCommand(input, {
      characters,
      selectedCharacterId,
      itemTemplates,
      itemInstances,
      abilityTemplates,
      gameActionTemplates,
      abilityInstances,
      spellTemplates,
      spellbooks,
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
      learnSpell,
      prepareSpells,
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
          <nav
            aria-label="Sections de la console administrateur"
            className="admin-tabs-scroll sticky top-0 z-10 -mx-4 -mt-4 mb-5 overflow-x-auto border-b border-[#9C7A2E]/20 bg-[#221E29]/95 px-4 py-3 backdrop-blur"
          >
            <div className="mx-auto grid min-w-[34rem] grid-cols-5 gap-1 rounded border border-[#9C7A2E]/20 bg-[#15121A]/75 p-1">
              {adminSections.map((section) => (
                <button
                  aria-current={activeSection === section.id ? "page" : undefined}
                  className={`min-h-10 px-3 py-2 text-sm transition-colors ${
                    activeSection === section.id
                      ? "bg-[#5A2233] text-[#E4D8BE]"
                      : "text-[#E4D8BE]/60 hover:bg-[#2A2431] hover:text-[#E4D8BE]"
                  }`}
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  type="button"
                >
                  {section.label}
                </button>
              ))}
            </div>
          </nav>

          {activeSection === "overview" ? <>
          <section className="mb-6 grid gap-3 md:grid-cols-2">
            <div className="manuscript-card rounded p-3">
              <h3 className="ink-heading font-bold">{campaign.name}</h3>
              <p className="text-sm text-[#E4D8BE]/65">
                <HighlightedGameText mode="none" text={campaign.style} />
              </p>
            </div>
            <div className="manuscript-card rounded p-3">
              <h3 className="ink-heading font-bold">Lore</h3>
              <p className="text-sm text-[#E4D8BE]/65">
                <HighlightedGameText mode="none" text={campaign.world.lore} />
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
                    <dt className="text-[#E4D8BE]/50">Révision moteur</dt>
                    <dd className="font-bold text-[#E4D8BE]">{gameRevision}</dd>
                  </div>
                  <div>
                    <dt className="text-[#E4D8BE]/50">Événements récents</dt>
                    <dd className="font-bold text-[#E4D8BE]">{gameEventCount}</dd>
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
                    <dt className="text-[#E4D8BE]/50">Effets réutilisables</dt>
                    <dd className="font-bold text-[#E4D8BE]">{effectTemplates.length}</dd>
                  </div>
                  <div>
                    <dt className="text-[#E4D8BE]/50">Capacités</dt>
                    <dd className="font-bold text-[#E4D8BE]">{abilityTemplates.length}</dd>
                  </div>
                  <div>
                    <dt className="text-[#E4D8BE]/50">Profils d'ennemis</dt>
                    <dd className="font-bold text-[#E4D8BE]">{enemyTemplates.length}</dd>
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
          </> : null}

          {activeSection === "content" ? <ContentWorkshop /> : null}

          {activeSection === "ai" ? <>
            <AiDirectorConsole />
            <AiApiTraceConsole />
          </> : null}

          {activeSection === "engine" ? (
            <AdminCommandConsole executeCommand={runAdminCommand} />
          ) : null}

          {activeSection === "world" ? <>
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
          </> : null}
          </>}
        </div>
      </section>
    </div>
  );
}

interface AdminCommandConsoleProps {
  executeCommand: (input: string) => AdminCommandResult;
}

type AdminCommandHistoryEntry = AdminCommandResult & { input: string };

function AdminCommandConsole({ executeCommand }: AdminCommandConsoleProps) {
  const [commandInput, setCommandInput] = useState("");
  const [commandHistory, setCommandHistory] = useState<AdminCommandHistoryEntry[]>([]);
  const [historyCursor, setHistoryCursor] = useState(-1);
  const [referenceQuery, setReferenceQuery] = useState("");
  const commandInputRef = useRef<HTMLInputElement>(null);
  const filteredCommandDocs = useMemo(() => {
    const query = referenceQuery.trim().toLocaleLowerCase("fr");
    if (!query) return adminCommandDocs;

    return adminCommandDocs.filter((command) =>
      `${command.name} ${command.usage} ${command.description}`
        .toLocaleLowerCase("fr")
        .includes(query),
    );
  }, [referenceQuery]);

  function runCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedCommand = commandInput.trim();
    if (!trimmedCommand) return;

    const result = executeCommand(trimmedCommand);
    setCommandHistory((history) => [
      { ...result, input: trimmedCommand },
      ...history,
    ].slice(0, 12));
    setCommandInput("");
    setHistoryCursor(-1);
    commandInputRef.current?.focus();
  }

  function handleCommandKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setCommandInput("");
      setHistoryCursor(-1);
      return;
    }

    if (event.key === "ArrowUp") {
      if (!commandHistory.length) return;
      event.preventDefault();
      const nextCursor = Math.min(historyCursor + 1, commandHistory.length - 1);
      setHistoryCursor(nextCursor);
      setCommandInput(commandHistory[nextCursor]?.input ?? "");
      return;
    }

    if (event.key === "ArrowDown") {
      if (historyCursor < 0) return;
      event.preventDefault();
      const nextCursor = historyCursor - 1;
      setHistoryCursor(nextCursor);
      setCommandInput(nextCursor >= 0 ? commandHistory[nextCursor]?.input ?? "" : "");
    }
  }

  function prepareCommand(command: (typeof adminCommandDocs)[number]) {
    setCommandInput(command.usage === command.name ? command.name : `${command.name} `);
    setHistoryCursor(-1);
    requestAnimationFrame(() => commandInputRef.current?.focus());
  }

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="rune-label text-sm">Commandes moteur</h3>
        {commandHistory.length ? (
          <button
            className="border border-[#9C7A2E]/20 px-2.5 py-1 text-xs text-[#E4D8BE]/55 hover:border-[#9C7A2E]/45 hover:text-[#E4D8BE]"
            onClick={() => {
              setCommandHistory([]);
              setHistoryCursor(-1);
            }}
            type="button"
          >
            Effacer l’historique
          </button>
        ) : null}
      </div>

      <div className="manuscript-card rounded p-3 sm:p-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={runCommand}>
          <div className="flex min-w-0 flex-1">
            <span
              aria-hidden="true"
              className="grid w-9 shrink-0 place-items-center border border-r-0 border-[#9C7A2E]/35 bg-[#15121A] font-mono text-sm text-[#9C7A2E]"
            >
              &gt;
            </span>
            <label className="sr-only" htmlFor="admin-command-input">Commande moteur</label>
            <input
              autoComplete="off"
              autoFocus
              className="min-w-0 flex-1 border border-[#9C7A2E]/35 bg-[#15121A] px-3 py-2.5 font-mono text-sm text-[#E4D8BE] outline-none placeholder:text-[#E4D8BE]/35 focus:border-[#9C7A2E]/75"
              id="admin-command-input"
              onChange={(event) => {
                setCommandInput(event.target.value);
                setHistoryCursor(-1);
              }}
              onKeyDown={handleCommandKeyDown}
              placeholder="Écrire une commande…"
              ref={commandInputRef}
              spellCheck={false}
              value={commandInput}
            />
            <button
              aria-label="Effacer la commande"
              className="grid w-10 shrink-0 place-items-center border border-l-0 border-[#9C7A2E]/35 bg-[#15121A] text-xl leading-none text-[#E4D8BE]/50 hover:text-[#E4D8BE] disabled:opacity-25"
              disabled={!commandInput}
              onClick={() => {
                setCommandInput("");
                setHistoryCursor(-1);
                commandInputRef.current?.focus();
              }}
              title="Effacer"
              type="button"
            >
              ×
            </button>
          </div>
          <button
            className="fantasy-button min-h-11 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-35 sm:min-w-28"
            disabled={!commandInput.trim()}
            type="submit"
          >
            Exécuter
          </button>
        </form>

        <p className="mt-2 text-[11px] text-[#E4D8BE]/45">
          <span className="font-mono text-[#9C7A2E]">↑ ↓</span> historique · <span className="font-mono text-[#9C7A2E]">Échap</span> efface · <span className="font-mono text-[#E4D8BE]/70">selected</span> cible le personnage actif
        </p>

        {commandHistory.length ? (
          <div aria-live="polite" className="mt-4 max-h-[22rem] space-y-2 overflow-y-auto pr-1">
            {commandHistory.map((entry, index) => (
              <article
                className={`border px-3 py-2.5 text-sm ${
                  entry.status === "error"
                    ? "border-[#5A2233] bg-[#5A2233]/20"
                    : entry.status === "success"
                      ? "border-[#3F5641]/70 bg-[#3F5641]/15"
                      : "border-[#9C7A2E]/25 bg-[#15121A]"
                }`}
                key={`${entry.input}-${index}`}
              >
                <p className="break-words font-mono text-xs text-[#9C7A2E]">&gt; {entry.input}</p>
                <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap font-sans leading-relaxed text-[#E4D8BE]">
                  <HighlightedGameText mode="narrative" text={entry.message} />
                </pre>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <details className="group mt-3 border border-[#9C7A2E]/20 bg-[#15121A]/45">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm text-[#E4D8BE]/75 marker:content-none hover:bg-[#2A2431]">
          <span>Référence des commandes</span>
          <span className="flex items-center gap-2">
            <span className="border border-[#9C7A2E]/25 px-2 py-0.5 font-mono text-[11px] text-[#9C7A2E]">
              {adminCommandDocs.length}
            </span>
            <span
              aria-hidden="true"
              className="text-base text-[#9C7A2E] transition-transform group-open:rotate-180"
            >
              ⌄
            </span>
          </span>
        </summary>
        <div className="border-t border-[#9C7A2E]/15 p-3">
          <label className="sr-only" htmlFor="admin-command-search">Rechercher une commande</label>
          <input
            className="mb-3 w-full border border-[#9C7A2E]/25 bg-[#15121A] px-3 py-2 text-sm text-[#E4D8BE] outline-none placeholder:text-[#E4D8BE]/35 focus:border-[#9C7A2E]/65"
            id="admin-command-search"
            onChange={(event) => setReferenceQuery(event.target.value)}
            placeholder="Rechercher une commande…"
            value={referenceQuery}
          />
          <div className="grid max-h-[20rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCommandDocs.map((command) => (
              <button
                aria-label={`Préremplir ${command.usage}`}
                className="min-w-0 border border-[#9C7A2E]/15 bg-[#221E29]/55 px-2.5 py-2 text-left hover:border-[#9C7A2E]/45 hover:bg-[#2A2431]"
                key={command.name}
                onClick={() => prepareCommand(command)}
                type="button"
              >
                <span className="block break-words font-mono text-xs leading-relaxed text-[#E4D8BE]">
                  {command.usage}
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-[#E4D8BE]/50">
                  {command.description}
                </span>
              </button>
            ))}
            {!filteredCommandDocs.length ? (
              <p className="py-3 text-sm text-[#E4D8BE]/45">Aucune commande correspondante.</p>
            ) : null}
          </div>
        </div>
      </details>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useGameStore } from "../../store/useGameStore";
import { initialAbilityTemplates } from "../abilities";
import { initialItemTemplates } from "../items";
import { initialEffectTemplates, initialEnemyTemplates } from "../content";
import { CharacterCreationStep } from "../character/CharacterCreationStep";
import type {
  CharacterCreationContext,
  CharacterCreationPackage,
} from "../character/characterCreation";
import {
  deleteWorldBlueprint,
  listWorldBlueprints,
  loadCampaignBackup,
  loadWorldCreationBrief,
  saveCampaignBackup,
  saveWorldBlueprint,
  saveWorldCreationBrief,
  type SavedWorldBlueprint,
} from "../../storage/worldBlueprintStorage";
import {
  buildWorldCreationPrompt,
  buildWorldRepairPrompt,
  createCampaignStartFromBlueprint,
  defaultWorldCreationBrief,
  parseWorldBlueprint,
  type WorldCreationBrief,
} from "./worldBlueprint";

const fieldClass = "w-full rounded border border-[#9C7A2E]/25 bg-[#15121A] px-3 py-2 text-sm text-[#E4D8BE] outline-none focus:border-[#9C7A2E]";

export function WorldWorkshop() {
  const campaignStartSnapshot = useGameStore((state) => state.campaignStartSnapshot);
  const startCampaign = useGameStore((state) => state.startCampaign);
  const [brief, setBrief] = useState<WorldCreationBrief>(() =>
    loadWorldCreationBrief(defaultWorldCreationBrief),
  );
  const [rawResponse, setRawResponse] = useState("");
  const [characterSetup, setCharacterSetup] = useState<CharacterCreationPackage | null>(null);
  const [library, setLibrary] = useState<SavedWorldBlueprint[]>(() => listWorldBlueprints());
  const [notice, setNotice] = useState<string | null>(null);
  const prompt = useMemo(
    () => buildWorldCreationPrompt(brief),
    [brief],
  );
  const parsed = useMemo(
    () => rawResponse.trim() ? parseWorldBlueprint(rawResponse) : null,
    [rawResponse],
  );
  const backup = loadCampaignBackup();
  const characterContext = useMemo<CharacterCreationContext | null>(() => {
    const blueprint = parsed?.blueprint;
    if (!blueprint) return null;
    return {
      campaignName: blueprint.campaign.name,
      campaignStyle: blueprint.campaign.style,
      campaignLevel: blueprint.campaign.level,
      worldName: blueprint.world.name,
      worldPitch: blueprint.campaign.elevatorPitch,
      playerRole: brief.playerRole,
      partyConcept: brief.startingParty,
      startingEquipment: brief.startingEquipment,
      itemTemplates: initialItemTemplates,
      abilityTemplates: initialAbilityTemplates,
      effectTemplates: initialEffectTemplates,
      enemyTemplates: initialEnemyTemplates,
    };
  }, [brief.playerRole, brief.startingEquipment, brief.startingParty, parsed?.blueprint]);

  useEffect(() => {
    saveWorldCreationBrief(brief);
  }, [brief]);

  function patchBrief<K extends keyof WorldCreationBrief>(key: K, value: WorldCreationBrief[K]) {
    setBrief((current) => ({ ...current, [key]: value }));
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setNotice(`${label} copié.`);
  }

  function saveParsedWorld() {
    if (!parsed?.blueprint) return;
    saveWorldBlueprint(parsed.blueprint);
    setLibrary(listWorldBlueprints());
    setNotice(`${parsed.blueprint.campaign.name} ajouté à la bibliothèque locale.`);
  }

  function activateBlueprint(blueprint = parsed?.blueprint) {
    if (!blueprint || !characterSetup) {
      setNotice("Validez d'abord un personnage pour cette campagne.");
      return;
    }
    const confirmed = window.confirm(
      `Commencer « ${blueprint.campaign.name} » ? La conversation et la scène de combat actuelles seront remplacées.`,
    );
    if (!confirmed) return;
    saveCampaignBackup(campaignStartSnapshot);
    saveWorldBlueprint(blueprint);
    const nextCampaign = createCampaignStartFromBlueprint(
      blueprint,
      initialItemTemplates,
      initialAbilityTemplates,
      initialEffectTemplates,
      initialEnemyTemplates,
      characterSetup,
    );
    startCampaign(nextCampaign);
    setLibrary(listWorldBlueprints());
    setNotice(`${blueprint.campaign.name} est maintenant la campagne active.`);
  }

  function restoreBackup() {
    const currentBackup = loadCampaignBackup();
    if (!currentBackup || !window.confirm(`Restaurer « ${currentBackup.snapshot.campaign.name} » ?`)) return;
    saveCampaignBackup(campaignStartSnapshot);
    startCampaign(currentBackup.snapshot);
    setNotice(`${currentBackup.snapshot.campaign.name} restaurée.`);
  }

  function loadSavedWorld(saved: SavedWorldBlueprint) {
    setCharacterSetup(null);
    setRawResponse(JSON.stringify(saved.blueprint, null, 2));
    setNotice(`${saved.name} chargé. Créez maintenant son personnage.`);
  }

  function removeSavedWorld(id: string) {
    deleteWorldBlueprint(id);
    setLibrary(listWorldBlueprints());
  }

  return (
    <section className="mb-6 rounded border border-[#9C7A2E]/30 bg-[#15121A]/35 p-3 sm:p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="rune-label text-xs">Création hors API</p>
          <h3 className="ink-heading text-xl font-bold">Atelier des mondes</h3>
        </div>
        {backup ? (
          <button className="fantasy-button rounded px-3 py-2 text-xs" onClick={restoreBackup} type="button">
            Restaurer la campagne précédente
          </button>
        ) : null}
      </div>

      {notice ? (
        <div className="mb-4 rounded border border-[#3F5641] bg-[#3F5641]/25 px-3 py-2 text-sm text-[#E4D8BE]">
          {notice}
        </div>
      ) : null}

      <details className="mb-3 rounded border border-[#9C7A2E]/20 bg-[#221E29]" open>
        <summary className="cursor-pointer px-3 py-3 font-semibold text-[#E4D8BE]">1. Cadrage</summary>
        <div className="grid gap-3 border-t border-[#9C7A2E]/15 p-3 md:grid-cols-2">
          <WorkshopField label="Concept" value={brief.concept} onChange={(value) => patchBrief("concept", value)} large />
          <WorkshopField label="Genre" value={brief.genre} onChange={(value) => patchBrief("genre", value)} />
          <WorkshopField label="Ton" value={brief.tone} onChange={(value) => patchBrief("tone", value)} />
          <WorkshopField label="Thèmes" value={brief.themes} onChange={(value) => patchBrief("themes", value)} />
          <WorkshopField label="Échelle" value={brief.scope} onChange={(value) => patchBrief("scope", value)} />
          <WorkshopField label="Rôle des personnages" value={brief.playerRole} onChange={(value) => patchBrief("playerRole", value)} />
          <WorkshopField label="Groupe de départ" value={brief.startingParty} onChange={(value) => patchBrief("startingParty", value)} large />
          <WorkshopField label="Équipement de départ" value={brief.startingEquipment} onChange={(value) => patchBrief("startingEquipment", value)} large />
          <WorkshopField label="Éléments souhaités" value={brief.desiredElements} onChange={(value) => patchBrief("desiredElements", value)} large />
          <WorkshopField label="À éviter" value={brief.forbiddenElements} onChange={(value) => patchBrief("forbiddenElements", value)} large />
          <label className="grid gap-1 text-xs text-[#E4D8BE]/65">
            Densité
            <select
              className={fieldClass}
              onChange={(event) => patchBrief("complexity", event.target.value as WorldCreationBrief["complexity"])}
              value={brief.complexity}
            >
              <option value="compact">Compacte</option>
              <option value="standard">Standard</option>
              <option value="dense">Dense</option>
            </select>
          </label>
        </div>
      </details>

      <details className="mb-3 rounded border border-[#9C7A2E]/20 bg-[#221E29]" open>
        <summary className="cursor-pointer px-3 py-3 font-semibold text-[#E4D8BE]">2. Prompt externe</summary>
        <div className="border-t border-[#9C7A2E]/15 p-3">
          <textarea className={`${fieldClass} h-52 resize-y font-mono text-xs`} readOnly value={prompt} />
          <button className="fantasy-button mt-2 rounded px-3 py-2 text-sm font-semibold" onClick={() => void copyText(prompt, "Prompt")} type="button">
            Copier le prompt
          </button>
        </div>
      </details>

      <details className="mb-3 rounded border border-[#9C7A2E]/20 bg-[#221E29]" open>
        <summary className="cursor-pointer px-3 py-3 font-semibold text-[#E4D8BE]">3. Réponse de l’IA</summary>
        <div className="border-t border-[#9C7A2E]/15 p-3">
          <textarea
            className={`${fieldClass} h-56 resize-y font-mono text-xs`}
            onChange={(event) => {
              setCharacterSetup(null);
              setRawResponse(event.target.value);
            }}
            placeholder="Coller ici le JSON complet..."
            value={rawResponse}
          />

          {parsed ? (
            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
              <div>
                {parsed.errors.length ? (
                  <div className="rounded border border-[#8C0F00] bg-[#8C0F00]/15 p-3 text-sm text-[#E4D8BE]">
                    <p className="font-semibold">{parsed.errors.length} erreur(s)</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                      {parsed.errors.slice(0, 12).map((error) => <li key={error}>{error}</li>)}
                    </ul>
                  </div>
                ) : null}
                {parsed.warnings.length ? (
                  <div className="mt-2 rounded border border-[#9C7A2E]/40 bg-[#9C7A2E]/10 p-3 text-xs text-[#E4D8BE]">
                    {parsed.warnings.join(" ")}
                  </div>
                ) : null}
              </div>
              {parsed.errors.length ? (
                <button
                  className="fantasy-button h-fit rounded px-3 py-2 text-sm"
                  onClick={() => void copyText(buildWorldRepairPrompt(rawResponse, parsed.errors), "Prompt de correction")}
                  type="button"
                >
                  Copier la correction
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>

      {parsed?.blueprint && characterContext ? (
        <details className="mb-3 rounded border border-[#9C7A2E]/20 bg-[#221E29]" open>
          <summary className="cursor-pointer px-3 py-3 font-semibold text-[#E4D8BE]">4. Création du personnage</summary>
          <div className="border-t border-[#9C7A2E]/15 p-3">
            <CharacterCreationStep
              context={characterContext}
              initialParty={parsed.blueprint.party}
              key={`${parsed.blueprint.campaign.name}:${parsed.blueprint.world.name}:${parsed.blueprint.campaign.openingScene}`}
              onSetupChange={setCharacterSetup}
            />
          </div>
        </details>
      ) : null}

      {parsed?.blueprint ? (
        <section className="mb-3 border-y border-[#9C7A2E]/25 py-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="rune-label text-xs">Aperçu validé</p>
              <h4 className="ink-heading text-lg font-bold">{parsed.blueprint.campaign.name}</h4>
              <p className="mt-1 max-w-3xl text-sm text-[#E4D8BE]/70">{parsed.blueprint.campaign.elevatorPitch}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="fantasy-button rounded px-3 py-2 text-sm" onClick={saveParsedWorld} type="button">Sauvegarder</button>
              <button
                className="rounded border border-[#3F5641] bg-[#3F5641]/35 px-3 py-2 text-sm font-semibold text-[#E4D8BE] disabled:cursor-not-allowed disabled:opacity-35"
                disabled={!characterSetup}
                onClick={() => activateBlueprint()}
                type="button"
              >
                Commencer
              </button>
            </div>
          </div>
          <p className="mb-3 text-xs text-[#E4D8BE]/55">
            {characterSetup
              ? `Personnage lié uniquement à cette nouvelle campagne : ${characterSetup.characters[0].name}.`
              : "Validez l'étape 4 avant de commencer la campagne."}
          </p>
          <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4 lg:grid-cols-8">
            <Count label="Personnages" value={characterSetup?.characters.length ?? 0} />
            <Count label="Objets de départ" value={characterSetup?.startingItems.length ?? 0} />
            <Count label="Factions" value={parsed.blueprint.world.factions.length} />
            <Count label="Lieux" value={parsed.blueprint.world.locations.length} />
            <Count label="PNJ" value={parsed.blueprint.world.npcs.length} />
            <Count label="Conflits" value={parsed.blueprint.world.conflicts.length} />
            <Count label="Secrets" value={parsed.blueprint.world.secrets.length} />
            <Count label="Accroches" value={parsed.blueprint.world.hooks.length} />
          </div>
        </section>
      ) : null}

      {library.length ? (
        <section>
          <h4 className="rune-label mb-2 text-xs">Bibliothèque locale</h4>
          <div className="grid gap-2 md:grid-cols-2">
            {library.map((saved) => (
              <article className="flex items-center gap-2 rounded border border-[#9C7A2E]/20 bg-[#221E29] p-2" key={saved.id}>
                <button className="min-w-0 flex-1 text-left" onClick={() => loadSavedWorld(saved)} type="button">
                  <span className="block truncate font-semibold text-[#E4D8BE]">{saved.name}</span>
                  <span className="text-xs text-[#E4D8BE]/45">{new Date(saved.savedAt).toLocaleDateString("fr-FR")}</span>
                </button>
                <button className="fantasy-button rounded px-2 py-1 text-xs" onClick={() => loadSavedWorld(saved)} type="button">Préparer</button>
                <button className="rounded px-2 py-1 text-xs text-[#E4D8BE]/55 hover:bg-[#5A2233]/40" onClick={() => removeSavedWorld(saved.id)} type="button">Suppr.</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function WorkshopField({
  label,
  value,
  onChange,
  large = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  large?: boolean;
}) {
  return (
    <label className={`grid gap-1 text-xs text-[#E4D8BE]/65 ${large ? "md:col-span-2" : ""}`}>
      {label}
      <textarea className={`${fieldClass} ${large ? "h-20" : "h-16"} resize-y`} onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-[#9C7A2E]/20 bg-[#221E29] px-2 py-2">
      <span className="block text-lg font-semibold text-[#9C7A2E]">{value}</span>
      <span className="text-[#E4D8BE]/55">{label}</span>
    </div>
  );
}

import { useMemo, useState } from "react";
import type { CharacterStats } from "../../app/types";
import type {
  GeneratedStartingCharacter,
  WorldBlueprint,
} from "../world/worldBlueprint";
import {
  CHARACTER_POINT_BUY_BUDGET,
  buildCharacterCreationPrompt,
  buildCharacterRepairPrompt,
  calculatePointBuyCost,
  characterSkillDefinitions,
  characterStatDefinitions,
  createClassicCharacterPackage,
  createDefaultCharacterDraft,
  getMaximumAbilityCount,
  getMaximumSkillCount,
  getMaximumStartingHp,
  getRecommendedStartingHp,
  isEquipableCharacterTemplate,
  isStartingEquipmentTemplate,
  parseCharacterCreationPackage,
  type CharacterCreationContext,
  type CharacterCreationPackage,
  type ClassicItemSelection,
} from "./characterCreation";
import { getGameActionTemplate } from "../actions";

const fieldClass = "w-full rounded border border-[#9C7A2E]/25 bg-[#15121A] px-3 py-2 text-sm text-[#E4D8BE] outline-none focus:border-[#9C7A2E]";
type CreationMode = "classic" | "description";

export function CharacterCreationStep({
  context,
  initialParty,
  onSetupChange,
}: {
  context: CharacterCreationContext;
  initialParty: WorldBlueprint["party"];
  onSetupChange: (setup: CharacterCreationPackage | null) => void;
}) {
  const [mode, setMode] = useState<CreationMode>("classic");
  const [character, setCharacter] = useState<GeneratedStartingCharacter>(() =>
    createInitialCharacter(initialParty.characters[0], context.campaignLevel));
  const [itemSelections, setItemSelections] = useState<ClassicItemSelection[]>(() =>
    createInitialItemSelections(initialParty));
  const [description, setDescription] = useState("");
  const [rawResponse, setRawResponse] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isCommitted, setIsCommitted] = useState(false);

  const classicValidation = useMemo(
    () => createClassicCharacterPackage(character, itemSelections, context),
    [character, context, itemSelections],
  );
  const pointCost = calculatePointBuyCost(character.stats);
  const skillLimit = getMaximumSkillCount(context.campaignLevel);
  const abilityLimit = getMaximumAbilityCount(context.campaignLevel);
  const assistedPrompt = useMemo(
    () => description.trim() ? buildCharacterCreationPrompt(description, context) : "",
    [context, description],
  );
  const assistedValidation = useMemo(
    () => rawResponse.trim() ? parseCharacterCreationPackage(rawResponse, context) : null,
    [context, rawResponse],
  );
  const availableItems = context.itemTemplates.filter(isStartingEquipmentTemplate);

  function invalidate() {
    if (isCommitted) onSetupChange(null);
    setIsCommitted(false);
    setNotice(null);
  }

  function selectMode(nextMode: CreationMode) {
    if (nextMode === mode) return;
    invalidate();
    setMode(nextMode);
  }

  function patchCharacter<K extends keyof GeneratedStartingCharacter>(
    key: K,
    value: GeneratedStartingCharacter[K],
  ) {
    invalidate();
    setCharacter((current) => ({ ...current, [key]: value }));
  }

  function changeStat(stat: keyof CharacterStats, delta: number) {
    const nextValue = Math.max(8, Math.min(15, character.stats[stat] + delta));
    if (nextValue === character.stats[stat]) return;
    const nextStats = { ...character.stats, [stat]: nextValue };
    if (delta > 0 && calculatePointBuyCost(nextStats) > CHARACTER_POINT_BUY_BUDGET) return;
    const nextHp = stat === "constitution"
      ? getRecommendedStartingHp(context.campaignLevel, nextValue)
      : character.maxPv;
    invalidate();
    setCharacter((current) => ({
      ...current,
      stats: nextStats,
      pv: nextHp,
      maxPv: nextHp,
    }));
  }

  function toggleSkill(skill: string) {
    const hasSkill = character.competences.includes(skill);
    if (!hasSkill && character.competences.length >= skillLimit) return;
    patchCharacter(
      "competences",
      hasSkill
        ? character.competences.filter((candidate) => candidate !== skill)
        : [...character.competences, skill],
    );
  }

  function toggleAbility(templateId: string) {
    const hasAbility = character.abilityTemplateIds.includes(templateId);
    if (!hasAbility && character.abilityTemplateIds.length >= abilityLimit) return;
    patchCharacter(
      "abilityTemplateIds",
      hasAbility
        ? character.abilityTemplateIds.filter((id) => id !== templateId)
        : [...character.abilityTemplateIds, templateId],
    );
  }

  function changeItem(templateId: string, delta: number) {
    invalidate();
    setItemSelections((current) => {
      const existing = current.find((selection) => selection.templateId === templateId);
      const quantity = Math.max(0, Math.min(20, (existing?.quantity ?? 0) + delta));
      if (quantity === 0) return current.filter((selection) => selection.templateId !== templateId);
      if (existing) {
        return current.map((selection) => selection.templateId === templateId
          ? { ...selection, quantity }
          : selection);
      }
      return [...current, { templateId, quantity, equipped: false }];
    });
  }

  function toggleEquipped(templateId: string) {
    invalidate();
    setItemSelections((current) => current.map((selection) =>
      selection.templateId === templateId
        ? { ...selection, equipped: !selection.equipped }
        : selection));
  }

  function commitClassic() {
    if (!classicValidation.setup) return;
    onSetupChange(classicValidation.setup);
    setIsCommitted(true);
    setNotice(`Personnage validé : ${classicValidation.setup.characters[0].name}.`);
  }

  function commitAssisted() {
    if (!assistedValidation?.setup) return;
    onSetupChange(assistedValidation.setup);
    setIsCommitted(true);
    setNotice(`Personnage validé : ${assistedValidation.setup.characters[0].name}.`);
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setNotice(`${label} copié.`);
  }

  return (
    <section>
      <div className="mb-3 grid grid-cols-2 border border-[#9C7A2E]/30 bg-[#15121A] p-1">
        <button
          className={`px-3 py-2 text-sm ${mode === "classic" ? "bg-[#5A2233] text-[#E4D8BE]" : "text-[#E4D8BE]/65"}`}
          onClick={() => selectMode("classic")}
          type="button"
        >
          Création classique
        </button>
        <button
          className={`px-3 py-2 text-sm ${mode === "description" ? "bg-[#5A2233] text-[#E4D8BE]" : "text-[#E4D8BE]/65"}`}
          onClick={() => selectMode("description")}
          type="button"
        >
          À partir d’une description
        </button>
      </div>

      {notice ? (
        <p className="mb-3 border border-[#3F5641] bg-[#3F5641]/25 px-3 py-2 text-sm text-[#E4D8BE]">
          {notice}
        </p>
      ) : null}

      {mode === "classic" ? (
        <div className="space-y-5">
          <section>
            <SectionTitle>Identité et histoire</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Nom" value={character.name} onChange={(value) => patchCharacter("name", value)} />
              <TextField label="Titre ou ornement verbal" value={character.title ?? ""} onChange={(value) => patchCharacter("title", value)} />
              <TextField label="Espèce" value={character.espece} onChange={(value) => patchCharacter("espece", value)} />
              <TextField label="Classe ou archétype" value={character.classe} onChange={(value) => patchCharacter("classe", value)} />
              <TextArea label="Origine" value={character.origin ?? ""} onChange={(value) => patchCharacter("origin", value)} />
              <TextArea label="Apparence et tempérament" value={character.description ?? ""} onChange={(value) => patchCharacter("description", value)} />
            </div>
            <p className="mt-2 text-xs text-[#E4D8BE]/50">Niveau de campagne imposé : {context.campaignLevel}</p>
          </section>

          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <SectionTitle>Caractéristiques</SectionTitle>
              <span className={`text-xs ${pointCost > CHARACTER_POINT_BUY_BUDGET ? "text-[#D78A82]" : "text-[#9C7A2E]"}`}>
                {pointCost}/{CHARACTER_POINT_BUY_BUDGET} points
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {characterStatDefinitions.map((definition) => (
                <div className="border border-[#9C7A2E]/25 bg-[#15121A]/70 p-2 text-center" key={definition.key}>
                  <strong className="block text-sm text-[#E4D8BE]">{definition.short}</strong>
                  <span className="block text-[10px] text-[#E4D8BE]/50">{definition.label}</span>
                  <div className="mt-2 grid grid-cols-[2rem_1fr_2rem] items-center border border-[#9C7A2E]/20">
                    <button className="h-8 text-lg text-[#9C7A2E] disabled:opacity-25" disabled={character.stats[definition.key] <= 8} onClick={() => changeStat(definition.key, -1)} type="button">−</button>
                    <span className="text-base font-semibold">{character.stats[definition.key]}</span>
                    <button className="h-8 text-lg text-[#9C7A2E] disabled:opacity-25" disabled={character.stats[definition.key] >= 15} onClick={() => changeStat(definition.key, 1)} type="button">+</button>
                  </div>
                </div>
              ))}
            </div>
            <label className="mt-3 grid max-w-[240px] gap-1 text-xs text-[#E4D8BE]/65">
              Points de vie maximum
              <input
                className={fieldClass}
                max={getMaximumStartingHp(context.campaignLevel, character.stats.constitution)}
                min={1}
                onChange={(event) => {
                  const maxPv = Math.max(1, Number(event.target.value) || 1);
                  invalidate();
                  setCharacter((current) => ({ ...current, pv: maxPv, maxPv }));
                }}
                type="number"
                value={character.maxPv}
              />
            </label>
          </section>

          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <SectionTitle>Compétences maîtrisées</SectionTitle>
              <span className="text-xs text-[#9C7A2E]">{character.competences.length}/{skillLimit}</span>
            </div>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {characterSkillDefinitions.map((skill) => {
                const selected = character.competences.includes(skill.name);
                const disabled = !selected && character.competences.length >= skillLimit;
                return (
                  <label className={`flex items-center gap-2 border px-2 py-2 text-xs ${selected ? "border-[#9C7A2E]/55 bg-[#9C7A2E]/10" : "border-[#9C7A2E]/15 bg-[#15121A]/45"} ${disabled ? "opacity-40" : ""}`} key={skill.name}>
                    <input checked={selected} disabled={disabled} onChange={() => toggleSkill(skill.name)} type="checkbox" />
                    <span className="min-w-0 flex-1 text-[#E4D8BE]">{skill.name}</span>
                    <span className="text-[10px] text-[#9C7A2E]">{statLabel(skill.stat)}</span>
                  </label>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <SectionTitle>Capacités de départ</SectionTitle>
              <span className="text-xs text-[#9C7A2E]">{character.abilityTemplateIds.length}/{abilityLimit}</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {context.abilityTemplates.map((ability) => {
                const action = getGameActionTemplate(context.gameActionTemplates, ability.actionId);
                const selected = character.abilityTemplateIds.includes(ability.id);
                const disabled = !selected && character.abilityTemplateIds.length >= abilityLimit;
                return (
                  <label className={`border px-3 py-2 ${selected ? "border-[#3F5641] bg-[#3F5641]/25" : "border-[#9C7A2E]/15 bg-[#15121A]/45"} ${disabled ? "opacity-40" : ""}`} key={ability.id}>
                    <span className="flex items-start gap-2">
                      <input checked={selected} disabled={disabled} onChange={() => toggleAbility(ability.id)} type="checkbox" />
                      <span>
                        <strong className="block text-sm font-semibold text-[#E4D8BE]">{action?.name ?? ability.id}</strong>
                        <span className="block text-[10px] uppercase text-[#9C7A2E]">{activationLabel(action?.activation.timing ?? "action")}</span>
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[#E4D8BE]/60">{action?.description ?? "Action associée introuvable."}</span>
                  </label>
                );
              })}
            </div>
          </section>

          <section>
            <SectionTitle>Équipement de départ</SectionTitle>
            <p className="mb-2 text-xs text-[#E4D8BE]/50">Huit piles et vingt unités maximum.</p>
            <div className="max-h-[360px] space-y-1 overflow-y-auto pr-1">
              {availableItems.map((item) => {
                const selection = itemSelections.find((candidate) => candidate.templateId === item.id);
                const equipable = isEquipableCharacterTemplate(item);
                return (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-[#9C7A2E]/15 bg-[#15121A]/45 px-3 py-2" key={item.id}>
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-medium text-[#E4D8BE]">{item.name}</strong>
                      <span className="block truncate text-xs text-[#E4D8BE]/50">{item.description}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {equipable && selection ? (
                        <label className="mr-2 flex items-center gap-1 text-[10px] text-[#E4D8BE]/60">
                          <input checked={selection.equipped} onChange={() => toggleEquipped(item.id)} type="checkbox" />
                          Équipé
                        </label>
                      ) : null}
                      <button className="h-8 w-8 border border-[#9C7A2E]/25 text-[#9C7A2E] disabled:opacity-25" disabled={!selection} onClick={() => changeItem(item.id, -1)} type="button">−</button>
                      <span className="w-7 text-center text-sm">{selection?.quantity ?? 0}</span>
                      <button className="h-8 w-8 border border-[#9C7A2E]/25 text-[#9C7A2E]" onClick={() => changeItem(item.id, 1)} type="button">+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <ValidationMessages errors={classicValidation.errors} warnings={classicValidation.warnings} />
          <button
            className="fantasy-button w-full px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!classicValidation.setup}
            onClick={commitClassic}
            type="button"
          >
            Valider ce personnage
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="grid gap-1 text-xs text-[#E4D8BE]/65">
            Décrivez librement le personnage
            <textarea
              className={`${fieldClass} h-36 resize-y`}
              onChange={(event) => {
                invalidate();
                setDescription(event.target.value);
              }}
              placeholder="Ex : Une ancienne messagère royale, excellente cavalière, prudente avec la magie et encore hantée par une livraison qu’elle n’a jamais terminée."
              value={description}
            />
          </label>

          {assistedPrompt ? (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <SectionTitle>Prompt de création</SectionTitle>
                <button className="fantasy-button px-3 py-2 text-xs" onClick={() => void copyText(assistedPrompt, "Prompt")} type="button">Copier</button>
              </div>
              <textarea className={`${fieldClass} h-52 resize-y font-mono text-xs`} readOnly value={assistedPrompt} />
            </section>
          ) : null}

          <label className="grid gap-1 text-xs text-[#E4D8BE]/65">
            Réponse JSON de l’IA
            <textarea
              className={`${fieldClass} h-56 resize-y font-mono text-xs`}
              onChange={(event) => {
                invalidate();
                setRawResponse(event.target.value);
              }}
              placeholder="Collez ici le personnage généré..."
              value={rawResponse}
            />
          </label>

          {assistedValidation ? (
            <>
              <ValidationMessages errors={assistedValidation.errors} warnings={assistedValidation.warnings} />
              {assistedValidation.errors.length ? (
                <button className="fantasy-button px-3 py-2 text-xs" onClick={() => void copyText(buildCharacterRepairPrompt(rawResponse, assistedValidation.errors), "Prompt de correction")} type="button">
                  Copier le prompt de correction
                </button>
              ) : null}
            </>
          ) : null}

          <button
            className="fantasy-button w-full px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!assistedValidation?.setup}
            onClick={commitAssisted}
            type="button"
          >
            Utiliser ce personnage
          </button>
        </div>
      )}
    </section>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h4 className="ink-heading text-base font-semibold text-[#E4D8BE]">{children}</h4>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs text-[#E4D8BE]/65">
      {label}
      <input className={fieldClass} onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs text-[#E4D8BE]/65">
      {label}
      <textarea className={`${fieldClass} h-24 resize-y`} onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}

function ValidationMessages({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (!errors.length && !warnings.length) {
    return <p className="border border-[#3F5641] bg-[#3F5641]/20 px-3 py-2 text-xs text-[#E4D8BE]">Fiche équilibrée et prête à être validée.</p>;
  }
  return (
    <div className="space-y-2">
      {errors.length ? (
        <div className="border border-[#8C0F00] bg-[#8C0F00]/15 p-3 text-xs text-[#E4D8BE]">
          <strong>{errors.length} correction(s) requise(s)</strong>
          <ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      ) : null}
      {warnings.length ? (
        <div className="border border-[#9C7A2E]/35 bg-[#9C7A2E]/10 p-3 text-xs text-[#E4D8BE]/75">
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}
    </div>
  );
}

function createInitialCharacter(
  initial: GeneratedStartingCharacter | undefined,
  campaignLevel: number,
): GeneratedStartingCharacter {
  if (!initial) return createDefaultCharacterDraft(campaignLevel);
  const maximumHp = getMaximumStartingHp(campaignLevel, initial.stats.constitution);
  const maxPv = Math.max(1, Math.min(maximumHp, initial.maxPv));
  return {
    ...initial,
    niveau: campaignLevel,
    pv: maxPv,
    maxPv,
    stats: { ...initial.stats },
    competences: [...initial.competences],
    abilityTemplateIds: [...initial.abilityTemplateIds],
    history: [...(initial.history ?? [])],
  };
}

function createInitialItemSelections(party: WorldBlueprint["party"]): ClassicItemSelection[] {
  return party.startingItems.flatMap((item) => item.templateId
    ? [{ templateId: item.templateId, quantity: item.quantity, equipped: item.equipped }]
    : []);
}

function statLabel(stat: keyof CharacterStats): string {
  return characterStatDefinitions.find((definition) => definition.key === stat)?.short ?? stat;
}

function activationLabel(timing: string): string {
  const labels: Record<string, string> = {
    action: "Action",
    bonus: "Action bonus",
    reaction: "Réaction",
    free: "Action libre",
    passive: "Passif",
  };
  return labels[timing] ?? timing;
}

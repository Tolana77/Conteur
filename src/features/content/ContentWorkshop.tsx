import { useEffect, useMemo, useState } from "react";
import type {
  AbilityTemplate,
  EffectTemplate,
  EnemyTemplate,
  ItemTemplate,
} from "../../app/types";
import { useGameStore } from "../../store/useGameStore";
import {
  getContentTemplateDependencies,
  isBuiltInContentTemplate,
  isContentTemplateActive,
  type ContentAuditAction,
  type ContentMutationMeta,
  type ContentTemplate,
  type ContentTemplateKind,
} from "./contentLifecycle";
import {
  parseAbilityTemplate,
  parseEffectTemplate,
  parseEnemyTemplate,
  parseItemTemplate,
} from "./contentValidation";

type EditorMode = "create" | "duplicate" | "replace";

interface DraftValidation {
  template: ContentTemplate | null;
  errors: string[];
}

const catalogTabs: Array<{ kind: ContentTemplateKind; label: string }> = [
  { kind: "effect", label: "Effets" },
  { kind: "ability", label: "Capacités" },
  { kind: "item", label: "Objets" },
  { kind: "enemy", label: "Ennemis" },
];

const actionLabels: Record<ContentAuditAction, string> = {
  create: "Création",
  replace: "Modification",
  duplicate: "Duplication",
  activate: "Activation",
  deactivate: "Désactivation",
  delete: "Suppression",
  restore: "Restauration",
};

export function ContentWorkshop() {
  const [kind, setKind] = useState<ContentTemplateKind>("item");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("replace");
  const [draft, setDraft] = useState("");
  const [validation, setValidation] = useState<DraftValidation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const effectTemplates = useGameStore((state) => state.effectTemplates);
  const abilityTemplates = useGameStore((state) => state.abilityTemplates);
  const itemTemplates = useGameStore((state) => state.itemTemplates);
  const enemyTemplates = useGameStore((state) => state.enemyTemplates);
  const itemInstances = useGameStore((state) => state.itemInstances);
  const abilityInstances = useGameStore((state) => state.abilityInstances);
  const disabledIds = useGameStore((state) => state.disabledContentTemplateIds);
  const auditLog = useGameStore((state) => state.contentAuditLog);
  const combat = useGameStore((state) => state.combat);
  const campaign = useGameStore((state) => state.campaign);
  const registerEffectTemplate = useGameStore((state) => state.registerEffectTemplate);
  const registerAbilityTemplate = useGameStore((state) => state.registerAbilityTemplate);
  const registerItemTemplate = useGameStore((state) => state.registerItemTemplate);
  const registerEnemyTemplate = useGameStore((state) => state.registerEnemyTemplate);
  const setContentTemplateActive = useGameStore((state) => state.setContentTemplateActive);
  const deleteContentTemplate = useGameStore((state) => state.deleteContentTemplate);
  const clearContentAuditLog = useGameStore((state) => state.clearContentAuditLog);

  const catalogs = useMemo(() => ({
    effect: effectTemplates,
    ability: abilityTemplates,
    item: itemTemplates,
    enemy: enemyTemplates,
  }), [abilityTemplates, effectTemplates, enemyTemplates, itemTemplates]);
  const catalog = catalogs[kind] as ContentTemplate[];
  const filteredCatalog = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    return catalog.filter((template) =>
      !normalizedQuery || normalizeText(`${template.id} ${template.name} ${template.description} ${template.tags.join(" ")}`).includes(normalizedQuery));
  }, [catalog, query]);
  const selectedTemplate = catalog.find((template) => template.id === selectedId) ?? null;
  const dependencyContext = useMemo(() => ({
    effectTemplates,
    abilityTemplates,
    itemTemplates,
    enemyTemplates,
    itemInstances,
    abilityInstances,
    combat,
    worldEntities: [
      ...campaign.world.entities.npcs,
      ...campaign.world.entities.locations,
      ...campaign.world.entities.items,
    ],
  }), [
    abilityInstances,
    abilityTemplates,
    campaign.world.entities,
    combat,
    effectTemplates,
    enemyTemplates,
    itemInstances,
    itemTemplates,
  ]);
  const dependencies = selectedTemplate
    ? getContentTemplateDependencies(kind, selectedTemplate.id, dependencyContext)
    : [];
  const selectedIsActive = selectedTemplate
    ? isContentTemplateActive(disabledIds, kind, selectedTemplate.id)
    : true;
  const selectedIsBuiltIn = selectedTemplate
    ? isBuiltInContentTemplate(kind, selectedTemplate.id)
    : false;

  useEffect(() => {
    if (editorMode !== "replace") return;
    const nextTemplate = catalog.find((template) => template.id === selectedId) ?? catalog[0] ?? null;
    if (!nextTemplate) {
      setSelectedId(null);
      setOriginalId(null);
      setDraft("");
      return;
    }
    if (nextTemplate.id !== selectedId) setSelectedId(nextTemplate.id);
    setOriginalId(nextTemplate.id);
    setDraft(JSON.stringify(nextTemplate, null, 2));
    setValidation(null);
  }, [catalog, editorMode, kind, selectedId]);

  function selectTemplate(template: ContentTemplate) {
    setSelectedId(template.id);
    setOriginalId(template.id);
    setEditorMode("replace");
    setDraft(JSON.stringify(template, null, 2));
    setValidation(null);
    setNotice(null);
  }

  function startNewTemplate() {
    const template = createTemplateSkeleton(kind, createUniqueId(kind, catalog));
    setSelectedId(null);
    setOriginalId(null);
    setEditorMode("create");
    setDraft(JSON.stringify(template, null, 2));
    setValidation(null);
    setNotice("Nouveau brouillon local. Rien n'est encore enregistré.");
  }

  function duplicateSelectedTemplate() {
    if (!selectedTemplate) return;
    const copy = JSON.parse(JSON.stringify(selectedTemplate)) as ContentTemplate;
    copy.id = createCopyId(selectedTemplate.id, catalog);
    copy.name = `${selectedTemplate.name} (copie)`;
    setSelectedId(null);
    setOriginalId(null);
    setEditorMode("duplicate");
    setDraft(JSON.stringify(copy, null, 2));
    setValidation(null);
    setNotice("Copie préparée. Modifie-la puis valide-la avant enregistrement.");
  }

  function validateDraft(): DraftValidation {
    const result = parseDraft(kind, draft, {
      effectTemplates,
      abilityTemplates,
      itemTemplates,
      enemyTemplates,
    });
    const errors = [...result.errors];
    if (result.template && editorMode === "replace" && originalId !== result.template.id) {
      errors.push("L'id d'un template existant est immuable. Utilise Dupliquer pour créer un nouvel id.");
    }
    if (result.template && editorMode !== "replace" && catalog.some((template) => template.id === result.template?.id)) {
      errors.push(`L'id ${result.template.id} existe déjà dans ce catalogue.`);
    }
    const nextValidation = { template: errors.length ? null : result.template, errors };
    setValidation(nextValidation);
    setNotice(errors.length ? "Le brouillon doit être corrigé." : "Validation à blanc réussie. Aucune donnée n'a été modifiée.");
    return nextValidation;
  }

  function saveDraft() {
    const result = validateDraft();
    if (!result.template) return;
    const mode = editorMode === "replace" ? "replace" : "create";
    const action = editorMode === "duplicate" ? "duplicate" : mode;
    const meta: ContentMutationMeta = { source: "admin", action, note: "Modification depuis l'Atelier de contenu." };
    let success = false;
    if (kind === "effect") success = registerEffectTemplate(result.template as EffectTemplate, mode, meta);
    if (kind === "ability") success = registerAbilityTemplate(result.template as AbilityTemplate, mode, meta);
    if (kind === "item") success = registerItemTemplate(result.template as ItemTemplate, mode, meta);
    if (kind === "enemy") success = registerEnemyTemplate(result.template as EnemyTemplate, mode, meta);
    if (!success) {
      setNotice("Enregistrement refusé : le catalogue a changé ou l'id est déjà utilisé.");
      return;
    }
    setSelectedId(result.template.id);
    setOriginalId(result.template.id);
    setEditorMode("replace");
    setDraft(JSON.stringify(result.template, null, 2));
    setNotice(`${result.template.name} a été enregistré.`);
  }

  function toggleSelectedTemplate() {
    if (!selectedTemplate) return;
    const success = setContentTemplateActive(kind, selectedTemplate.id, !selectedIsActive);
    setNotice(success
      ? selectedIsActive
        ? "Template désactivé pour les nouvelles créations. Les instances existantes restent fonctionnelles."
        : "Template de nouveau disponible pour les créations."
      : "Aucun changement n'a été appliqué.");
  }

  function removeSelectedTemplate() {
    if (!selectedTemplate) return;
    const confirmation = window.confirm(`Supprimer définitivement « ${selectedTemplate.name} » ?`);
    if (!confirmation) return;
    const result = deleteContentTemplate(kind, selectedTemplate.id);
    if (!result.success) {
      setNotice(`Suppression refusée : ${result.reasons.join(" · ")}`);
      return;
    }
    setSelectedId(null);
    setOriginalId(null);
    setEditorMode("replace");
    setValidation(null);
    setNotice("Template supprimé et opération ajoutée au journal.");
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setNotice("JSON copié.");
    } catch {
      setNotice("Copie impossible dans ce navigateur.");
    }
  }

  return (
    <section className="mb-6" id="content-workshop">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="rune-label text-sm">Atelier de contenu</h3>
          <p className="mt-1 text-xs text-[#E4D8BE]/55">
            Catalogues exécutables, dépendances et historique local.
          </p>
        </div>
        <button className="fantasy-button rounded px-3 py-2 text-sm" onClick={startNewTemplate} type="button">
          Nouveau
        </button>
      </div>

      <div className="mb-3 grid grid-cols-4 overflow-hidden rounded border border-[#9C7A2E]/25 bg-[#15121A]">
        {catalogTabs.map((tab) => (
          <button
            className={`min-w-0 border-r border-[#9C7A2E]/15 px-2 py-2 text-xs last:border-r-0 sm:text-sm ${
              kind === tab.kind ? "bg-[#5A2233] text-[#E4D8BE]" : "text-[#E4D8BE]/60 hover:bg-[#221E29]"
            }`}
            key={tab.kind}
            onClick={() => {
              setKind(tab.kind);
              setSelectedId(null);
              setOriginalId(null);
              setEditorMode("replace");
              setValidation(null);
              setNotice(null);
            }}
            type="button"
          >
            {tab.label} <span className="text-[10px] opacity-60">{catalogs[tab.kind].length}</span>
          </button>
        ))}
      </div>

      {notice ? (
        <p className="mb-3 rounded border border-[#9C7A2E]/25 bg-[#15121A] px-3 py-2 text-sm text-[#E4D8BE]/80">
          {notice}
        </p>
      ) : null}

      <div className="grid min-h-[520px] gap-3 xl:grid-cols-[minmax(180px,0.7fr)_minmax(320px,1.5fr)_minmax(230px,0.9fr)]">
        <div className="min-h-0 rounded border border-[#9C7A2E]/20 bg-[#15121A]/55 p-2">
          <label className="block text-xs text-[#E4D8BE]/55">
            Rechercher
            <input
              className="mt-1 w-full rounded border border-[#9C7A2E]/20 bg-[#15121A] px-2 py-2 text-sm text-[#E4D8BE]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nom, id, tag..."
              value={query}
            />
          </label>
          <div className="mt-2 max-h-[440px] space-y-1 overflow-y-auto pr-1">
            {filteredCatalog.map((template) => {
              const active = isContentTemplateActive(disabledIds, kind, template.id);
              return (
                <button
                  className={`w-full rounded border px-2 py-2 text-left ${
                    selectedId === template.id && editorMode === "replace"
                      ? "border-[#9C7A2E] bg-[#5A2233]/35"
                      : "border-[#9C7A2E]/10 bg-[#221E29]/55 hover:border-[#9C7A2E]/35"
                  }`}
                  key={template.id}
                  onClick={() => selectTemplate(template)}
                  type="button"
                >
                  <span className="block truncate text-sm text-[#E4D8BE]">{template.name}</span>
                  <span className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-[#E4D8BE]/40">
                    <span className="truncate font-mono">{template.id}</span>
                    {!active ? <span className="text-[#9C7A2E]">INACTIF</span> : null}
                  </span>
                </button>
              );
            })}
            {!filteredCatalog.length ? <p className="p-3 text-center text-xs text-[#E4D8BE]/45">Aucun résultat.</p> : null}
          </div>
        </div>

        <div className="min-w-0 rounded border border-[#9C7A2E]/20 bg-[#15121A]/55 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#E4D8BE]">
                {editorMode === "replace" ? selectedTemplate?.name ?? "Catalogue vide" : editorMode === "duplicate" ? "Nouvelle copie" : "Nouveau template"}
              </p>
              <p className="text-[11px] text-[#E4D8BE]/45">
                {editorMode === "replace" ? "Modification contrôlée" : "Brouillon non enregistré"}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              <button className="fantasy-button rounded px-2 py-1.5 text-xs" disabled={!selectedTemplate} onClick={duplicateSelectedTemplate} type="button">
                Dupliquer
              </button>
              <button className="fantasy-button rounded px-2 py-1.5 text-xs" disabled={!draft} onClick={copyDraft} type="button">
                Copier JSON
              </button>
            </div>
          </div>

          <textarea
            aria-label="JSON du template"
            className="h-[350px] w-full resize-y rounded border border-[#9C7A2E]/20 bg-[#15121A] p-3 font-mono text-[11px] leading-relaxed text-[#E4D8BE] outline-none focus:border-[#9C7A2E]/60"
            onChange={(event) => {
              setDraft(event.target.value);
              setValidation(null);
            }}
            placeholder="Sélectionne un template ou crée un nouveau brouillon."
            spellCheck={false}
            value={draft}
          />

          {validation ? (
            <div className={`mt-2 rounded border px-3 py-2 text-xs ${
              validation.errors.length
                ? "border-[#7A1F2E] bg-[#7A1F2E]/20 text-[#E4D8BE]"
                : "border-[#3F5641] bg-[#3F5641]/20 text-[#E4D8BE]"
            }`}>
              {validation.errors.length
                ? validation.errors.map((error) => <p key={error}>{error}</p>)
                : <p>Schéma, références et valeurs validés.</p>}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button className="fantasy-button rounded px-3 py-2 text-sm" disabled={!draft} onClick={validateDraft} type="button">
              Valider à blanc
            </button>
            <button className="fantasy-button rounded px-3 py-2 text-sm font-semibold" disabled={!draft} onClick={saveDraft} type="button">
              Enregistrer
            </button>
            {selectedTemplate && editorMode === "replace" ? (
              <>
                <button className="rounded border border-[#9C7A2E]/30 px-3 py-2 text-sm text-[#E4D8BE]/75" onClick={toggleSelectedTemplate} type="button">
                  {selectedIsActive ? "Désactiver" : "Réactiver"}
                </button>
                <button
                  className="rounded border border-[#7A1F2E]/55 px-3 py-2 text-sm text-[#E4D8BE]/75 disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={selectedIsBuiltIn || dependencies.length > 0}
                  onClick={removeSelectedTemplate}
                  type="button"
                >
                  Supprimer
                </button>
              </>
            ) : null}
          </div>
        </div>

        <aside className="min-w-0 space-y-3">
          <section className="rounded border border-[#9C7A2E]/20 bg-[#15121A]/55 p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase text-[#9C7A2E]">Dépendances</h4>
              <span className="text-xs text-[#E4D8BE]/45">{dependencies.length}</span>
            </div>
            {selectedIsBuiltIn ? (
              <p className="mt-2 text-xs text-[#E4D8BE]/55">Template système : suppression interdite, modification et désactivation autorisées.</p>
            ) : null}
            <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
              {dependencies.map((dependency) => (
                <div className="rounded border border-[#9C7A2E]/10 bg-[#221E29]/55 px-2 py-1.5" key={`${dependency.kind}-${dependency.id}-${dependency.relationship}`}>
                  <p className="truncate text-xs text-[#E4D8BE]">{dependency.label}</p>
                  <p className="text-[10px] text-[#E4D8BE]/45">{dependency.relationship}</p>
                </div>
              ))}
              {selectedTemplate && !dependencies.length ? <p className="text-xs text-[#E4D8BE]/45">Aucune référence active.</p> : null}
              {!selectedTemplate ? <p className="text-xs text-[#E4D8BE]/45">Sélectionne un template.</p> : null}
            </div>
          </section>

          <section className="rounded border border-[#9C7A2E]/20 bg-[#15121A]/55 p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase text-[#9C7A2E]">Journal</h4>
              <button className="text-[11px] text-[#E4D8BE]/45 hover:text-[#E4D8BE]" disabled={!auditLog.length} onClick={clearContentAuditLog} type="button">
                Effacer
              </button>
            </div>
            <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {auditLog.slice(0, 20).map((entry) => (
                <article className="border-b border-[#9C7A2E]/10 py-1.5 last:border-b-0" key={entry.id}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-xs text-[#E4D8BE]">{entry.templateName}</p>
                    <span className="shrink-0 text-[10px] uppercase text-[#9C7A2E]">{entry.source}</span>
                  </div>
                  <p className="text-[10px] text-[#E4D8BE]/45">
                    {actionLabels[entry.action]} · {new Date(entry.timestamp).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </article>
              ))}
              {!auditLog.length ? <p className="text-xs text-[#E4D8BE]/45">Aucune modification enregistrée.</p> : null}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function parseDraft(
  kind: ContentTemplateKind,
  draft: string,
  context: {
    effectTemplates: EffectTemplate[];
    abilityTemplates: AbilityTemplate[];
    itemTemplates: ItemTemplate[];
    enemyTemplates: EnemyTemplate[];
  },
): DraftValidation {
  let candidate: unknown;
  try {
    candidate = JSON.parse(draft);
  } catch (error) {
    return { template: null, errors: [error instanceof Error ? `JSON invalide : ${error.message}` : "JSON invalide."] };
  }
  const parsed = kind === "effect"
    ? parseEffectTemplate(candidate)
    : kind === "ability"
      ? parseAbilityTemplate(candidate, context)
      : kind === "item"
        ? parseItemTemplate(candidate, context)
        : parseEnemyTemplate(candidate, context);
  return { template: parsed.value, errors: parsed.errors };
}

function createTemplateSkeleton(kind: ContentTemplateKind, id: string): ContentTemplate {
  if (kind === "effect") {
    return {
      id,
      name: "Nouvel effet",
      description: "Décris précisément le résultat mécanique.",
      tags: [],
      actions: [{ operation: "heal", variables: { value: "1d4" } }],
    };
  }
  if (kind === "ability") {
    return {
      id,
      name: "Nouvelle capacité",
      description: "Décris les conditions et le résultat exacts.",
      types: ["capacity"],
      tags: [],
      combatRole: "utility",
      activation: { timing: "action" },
      targeting: { allowed: ["self"], required: false, defaultPriority: ["self"] },
      targetingV2: {
        aim: { allowed: ["self"], required: false, range: 0, lineOfSight: false },
        affects: { allowed: ["self"], maxTargets: 1, requiresLiving: true },
        area: { shape: "none" },
        defaultPriority: ["self"],
        suggestedSides: ["self"],
      },
      effects: [{ effectId: "heal", variables: { value: "1d4" } }],
      modules: { ability: {} },
    };
  }
  if (kind === "item") {
    return {
      id,
      type: "misc",
      types: ["misc"],
      tags: [],
      name: "Nouvel objet",
      description: "Décris l'objet sans inventer d'état mutable dans le template.",
      base: { weight: 0 },
      effects: [],
      modules: { item: {} },
    };
  }
  return {
    id,
    name: "Nouvel ennemi",
    description: "Décris son apparence et son comportement observable.",
    level: 1,
    category: "humanoid",
    tags: [],
    hp: "1d8 + 2",
    defense: 10,
    initiative: 0,
    speed: 9,
    reach: 1.5,
    attacks: [{
      id: `${id}-attack`,
      name: "Frappe",
      attackKind: "melee",
      attackBonus: 2,
      damage: "1d4",
      damageType: "contondant",
      range: 1.5,
      cost: "action",
      tags: [],
    }],
    abilityTemplateIds: [],
    behavior: {
      role: "soldier",
      aggression: 2,
      preferredRange: 1.5,
      retreatBelowHpPercent: 20,
      priorities: ["protéger sa position"],
    },
    resistances: [],
    vulnerabilities: [],
    immunities: [],
  };
}

function createUniqueId(kind: ContentTemplateKind, catalog: ContentTemplate[]): string {
  const prefix = kind === "effect" ? "effect" : kind === "ability" ? "ability" : kind === "item" ? "item" : "enemy";
  const base = `${prefix}-nouveau`;
  return createCopyId(base, catalog);
}

function createCopyId(baseId: string, catalog: ContentTemplate[]): string {
  const ids = new Set(catalog.map((template) => template.id));
  if (!ids.has(baseId)) return baseId;
  let index = 2;
  while (ids.has(`${baseId}-${index}`)) index += 1;
  return `${baseId}-${index}`;
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "");
}

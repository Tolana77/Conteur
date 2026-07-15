import {
  ChangeEvent,
  CSSProperties,
  Fragment,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AbilityInstance,
  AbilityRechargeTrigger,
  AbilityTemplate,
  CharacterDerivedScores,
  EffectTemplate,
  ItemEffectRef,
  ItemInstance,
  ItemTemplate,
} from "../../app/types";
import type { Character, CharacterStats, InventoryItem } from "../../core/models";
import { getAbilityCharges, getAbilityMaxCharges } from "../abilities";
import {
  isItemEquipable,
  isItemUsable,
  preventsUnequip,
} from "../items";
import { formatEffectValueExpression } from "../items/valueExpressions";
import { useGameStore } from "../../store/useGameStore";
import {
  HighlightedGameText,
  getGameTermSolidSurfaceStyle,
  getGameTermSurfaceStyle,
  getGameTermTextStyle,
} from "../../ui/gameTerms";
import type { GameStat } from "../../ui/gameTerms";

type CharacterSheetPageId = "overview" | "inventory" | "abilities" | "history";

interface CharacterSheetPage {
  id: CharacterSheetPageId;
  label: string;
  render: (
    character: SafeCharacter,
    inventory: CharacterInventoryView,
    statBreakdowns: CharacterStatBreakdowns,
    setActivePage: (pageId: CharacterSheetPageId) => void,
    onActionPrepared?: () => void,
  ) => ReactNode;
}

interface SafeCharacter {
  id: string;
  name: string;
  title?: string;
  description?: string;
  origin?: string;
  espece: string;
  classe: string;
  niveau: number;
  pv: number;
  maxPv: number;
  stats: CharacterStats;
  inventaire: InventoryItem[];
  competences: string[];
}

type LegacyStats = Partial<CharacterStats> & {
  strength?: number;
  dexterity?: number;
  wisdom?: number;
  charisma?: number;
};

type LegacyCharacterShape = Partial<
  Character & {
    race: string;
    class: string;
    level: number;
    hp: number;
    maxHp: number;
    inventory: InventoryItem[];
    abilities: string[];
    stats: LegacyStats;
  }
>;

interface ResolvedInventoryItem {
  id: string;
  templateId: string;
  type: string;
  actualName: string;
  actualDescription: string;
  types: string[];
  tags: string[];
  name: string;
  description: string;
  quantity: number;
  base: Record<string, number | string | boolean>;
  data: Record<string, number | string | boolean>;
  effects: ItemEffectRef[];
  grantedAbilityTemplateIds: string[];
  modules: ItemTemplate["modules"];
  location: ItemInstance["location"];
}

interface CharacterInventoryView {
  equipped: ResolvedInventoryItem[];
  bag: ResolvedInventoryItem[];
}

interface ResolvedAbility {
  id: string;
  templateId: string;
  name: string;
  description: string;
  types: string[];
  tags: string[];
  activation: AbilityTemplate["activation"];
  targeting: AbilityTemplate["targeting"];
  charges: number | null;
  maxCharges: number | null;
  recharge: AbilityRechargeTrigger[] | null;
  effects: ItemEffectRef[];
}

interface ItemCategoryStyle {
  label: string;
  color: string;
}

interface ItemAnimationState {
  kind: "equip" | "equipDrop" | "unequip" | "consume" | "return";
  originX: string;
  originY: string;
}

interface DragPreviewState {
  itemId: string;
  x: number;
  y: number;
  height: number;
}

interface InventoryDropTarget {
  mode: "equipped" | "inventory";
  beforeItemId: string | null;
  isValid: boolean;
}

interface StatBonus {
  value: number;
  source: string;
}

interface StatBreakdown {
  base: number;
  bonuses: StatBonus[];
  total: number;
  modifier: number;
}

type CharacterStatBreakdowns = Record<keyof CharacterStats, StatBreakdown>;

type StatsModalState =
  | { type: "full" }
  | { type: "stat"; stat: keyof CharacterStats };

const fallbackStats: CharacterStats = {
  force: 10,
  dexterite: 10,
  constitution: 10,
  intelligence: 10,
  sagesse: 10,
  charisme: 10,
};

const statLabels: Record<keyof CharacterStats, string> = {
  force: "FOR",
  dexterite: "DEX",
  constitution: "CON",
  intelligence: "INT",
  sagesse: "SAG",
  charisme: "CHA",
};

const statFullLabels: Record<keyof CharacterStats, string> = {
  force: "Force",
  dexterite: "Dextérité",
  constitution: "Constitution",
  intelligence: "Intelligence",
  sagesse: "Sagesse",
  charisme: "Charisme",
};

const savingThrowStats: Array<keyof CharacterStats> = [
  "force",
  "dexterite",
  "constitution",
  "intelligence",
  "sagesse",
  "charisme",
];

const dndSkills: Array<{ label: string; stat: keyof CharacterStats }> = [
  { label: "Acrobaties", stat: "dexterite" },
  { label: "Arcanes", stat: "intelligence" },
  { label: "Athlétisme", stat: "force" },
  { label: "Discrétion", stat: "dexterite" },
  { label: "Dressage", stat: "sagesse" },
  { label: "Escamotage", stat: "dexterite" },
  { label: "Histoire", stat: "intelligence" },
  { label: "Intimidation", stat: "charisme" },
  { label: "Intuition", stat: "sagesse" },
  { label: "Investigation", stat: "intelligence" },
  { label: "Médecine", stat: "sagesse" },
  { label: "Nature", stat: "intelligence" },
  { label: "Perception", stat: "sagesse" },
  { label: "Persuasion", stat: "charisme" },
  { label: "Religion", stat: "intelligence" },
  { label: "Représentation", stat: "charisme" },
  { label: "Survie", stat: "sagesse" },
  { label: "Tromperie", stat: "charisme" },
];

const sheetPages: CharacterSheetPage[] = [
  {
    id: "overview",
    label: "Résumé",
    render: (character, inventory, statBreakdowns, setActivePage, onActionPrepared) => (
      <OverviewModule
        character={character}
        inventory={inventory}
        onOpenHistory={() => setActivePage("history")}
        onOpenInventory={() => setActivePage("inventory")}
        onActionPrepared={onActionPrepared}
        statBreakdowns={statBreakdowns}
      />
    ),
  },
  {
    id: "inventory",
    label: "Inventaire",
    render: (_character, inventory, _statBreakdowns, _setActivePage, onActionPrepared) => (
      <InventoryModule inventory={inventory} onActionPrepared={onActionPrepared} />
    ),
  },
  {
    id: "abilities",
    label: "Capacités",
    render: (character, _inventory, _statBreakdowns, _setActivePage, onActionPrepared) => (
      <AbilitiesModule character={character} onActionPrepared={onActionPrepared} />
    ),
  },
  {
    id: "history",
    label: "Journal",
    render: (character) => <HistoryJournalModule character={character} />,
  },
];

function normalizeCharacter(character: Character): SafeCharacter {
  const legacyCharacter = character as LegacyCharacterShape;
  const rawStats: LegacyStats = legacyCharacter.stats ?? {};
  const maxPvValue = legacyCharacter.maxPv ?? legacyCharacter.maxHp;
  const pvValue = legacyCharacter.pv ?? legacyCharacter.hp;
  const maxPv = Number.isFinite(maxPvValue) && Number(maxPvValue) > 0 ? Number(maxPvValue) : 1;
  const pv = Number.isFinite(pvValue) ? Math.max(0, Math.min(Number(pvValue), maxPv)) : maxPv;

  return {
    id: legacyCharacter.id ?? "character-missing",
    name: legacyCharacter.name ?? "Personnage sans nom",
    ...(legacyCharacter.title ? { title: legacyCharacter.title } : {}),
    ...(legacyCharacter.description ? { description: legacyCharacter.description } : {}),
    ...(legacyCharacter.origin ? { origin: legacyCharacter.origin } : {}),
    espece: legacyCharacter.espece ?? legacyCharacter.race ?? "Espece inconnue",
    classe: legacyCharacter.classe ?? legacyCharacter.class ?? "Classe inconnue",
    niveau: legacyCharacter.niveau ?? legacyCharacter.level ?? 1,
    pv,
    maxPv,
    stats: {
      force: rawStats.force ?? rawStats.strength ?? fallbackStats.force,
      dexterite: rawStats.dexterite ?? rawStats.dexterity ?? fallbackStats.dexterite,
      constitution: rawStats.constitution ?? fallbackStats.constitution,
      intelligence: rawStats.intelligence ?? fallbackStats.intelligence,
      sagesse: rawStats.sagesse ?? rawStats.wisdom ?? fallbackStats.sagesse,
      charisme: rawStats.charisme ?? rawStats.charisma ?? fallbackStats.charisme,
    },
    inventaire: Array.isArray(legacyCharacter.inventaire)
      ? legacyCharacter.inventaire
      : legacyCharacter.inventory ?? [],
    competences: Array.isArray(legacyCharacter.competences)
      ? legacyCharacter.competences
      : legacyCharacter.abilities ?? [],
  };
}

function OverviewModule({
  character,
  inventory,
  onOpenHistory,
  onOpenInventory,
  onActionPrepared,
  statBreakdowns,
}: {
  character: SafeCharacter;
  inventory: CharacterInventoryView;
  onOpenHistory: () => void;
  onOpenInventory: () => void;
  onActionPrepared?: () => void;
  statBreakdowns: CharacterStatBreakdowns;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const longPressRef = useRef<number | null>(null);
  const portraitPickerOpenedRef = useRef(false);
  const portrait = useGameStore((state) => state.characterPortraits[character.id]);
  const derivedScores = useGameStore((state) => state.characterDerivedScores[character.id]);
  const setCharacterPortrait = useGameStore((state) => state.setCharacterPortrait);
  const combatSummary = useMemo(() => createCombatSummary(character, derivedScores), [character, derivedScores]);

  function openPortraitPicker() {
    portraitPickerOpenedRef.current = true;
    fileInputRef.current?.click();
  }

  function startLongPress() {
    longPressRef.current = window.setTimeout(openPortraitPicker, 520);
  }

  function clearLongPress() {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }

  function handlePortraitChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        setCharacterPortrait(character.id, reader.result);
      }
    });
    reader.readAsDataURL(file);
    event.target.value = "";
  }

function handlePortraitClick() {
    if (portraitPickerOpenedRef.current) {
      portraitPickerOpenedRef.current = false;
      return;
    }

    onOpenHistory();
  }

  return (
    <div className="mx-auto w-full max-w-[920px] space-y-4">
      <CharacterIdentityHeader character={character} />
      <section
        className="portrait-frame illuminated-portrait-backdrop relative min-h-[420px] overflow-hidden rounded border border-[#9C7A2E]/35 sm:min-h-[480px]"
        onContextMenu={(event) => {
          event.preventDefault();
          openPortraitPicker();
        }}
        onClick={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest("[data-vitals-panel]")) {
            return;
          }

          handlePortraitClick();
        }}
        onMouseDown={startLongPress}
        onMouseLeave={clearLongPress}
        onMouseUp={clearLongPress}
        onTouchCancel={clearLongPress}
        onTouchEnd={clearLongPress}
        onTouchStart={startLongPress}
      >
        {portrait ? (
          <img
            alt={`Portrait de ${character.name}`}
            className="absolute inset-0 mx-auto h-full w-full object-contain"
            src={portrait}
          />
        ) : (
          <div className="absolute inset-x-[12%] inset-y-0 bg-[radial-gradient(circle_at_50%_18%,rgba(228,216,190,0.62)_0,rgba(107,74,92,0.46)_32%,transparent_68%)]" />
        )}

        <div className="portrait-change-hint absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#15121A]/95 to-transparent p-3 text-[#E4D8BE]">
          <p className="text-[11px] font-semibold">Clic long ou clic droit pour changer le portrait</p>
        </div>

        <input
          accept="image/*"
          className="hidden"
          onChange={handlePortraitChange}
          ref={fileInputRef}
          type="file"
        />

        <VitalsModule character={character} combatSummary={combatSummary} />
      </section>

      <div className="character-summary-modules">
        <StatsModule character={character} statBreakdowns={statBreakdowns} />
        <EquipmentModule equippedItems={inventory.equipped} onOpenInventory={onOpenInventory} />
        <CurrentAbilitiesModule characterId={character.id} onActionPrepared={onActionPrepared} />
        <CombatModule combatSummary={combatSummary} />
        <LatestItemsModule items={inventory.bag} onOpenInventory={onOpenInventory} />
      </div>
    </div>
  );
}

function CharacterIdentityHeader({ character }: { character: SafeCharacter }) {
  return (
    <div className="mx-auto flex max-w-[680px] flex-col items-center gap-2 text-center">
      <div className="relative w-full max-w-[520px] border border-[#9C7A2E]/35 px-5 py-3 shadow-[inset_0_0_0_1px_rgba(228,216,190,0.035)]">
        <span className="absolute left-1.5 top-1.5 h-3 w-3 border-l border-t border-[#9C7A2E]/80" />
        <span className="absolute right-1.5 top-1.5 h-3 w-3 border-r border-t border-[#9C7A2E]/80" />
        <span className="absolute bottom-1.5 left-1.5 h-3 w-3 border-b border-l border-[#9C7A2E]/80" />
        <span className="absolute bottom-1.5 right-1.5 h-3 w-3 border-b border-r border-[#9C7A2E]/80" />
        <h2 className="ink-heading text-3xl font-black leading-tight">{character.name}</h2>
        {character.title ? (
          <p className="mt-1 text-xs uppercase text-[#9C7A2E]">{character.title}</p>
        ) : null}
        <p className="mt-1 text-sm text-[#E4D8BE]/65">
          {character.espece} · {character.classe} · niveau {character.niveau}
        </p>
      </div>
    </div>
  );
}

function VitalsModule({
  character,
  combatSummary,
}: {
  character: SafeCharacter;
  combatSummary: CombatSummary;
}) {
  const hpRatio = Math.max(0, Math.min(100, (character.pv / character.maxPv) * 100));
  const primaryVitals = [
    { icon: "DEF", label: "Défense", value: combatSummary.defense },
    { icon: "INI", label: "Initiative", value: formatSigned(combatSummary.initiative) },
    { icon: "VIT", label: "Vitesse", value: `${combatSummary.speed}m` },
    { icon: "MAÎ", label: "Maîtrise", value: formatSigned(combatSummary.proficiencyBonus) },
  ];

  return (
    <section
      className="absolute right-2 top-2 flex h-[calc(100%-16px)] w-[clamp(86px,30%,150px)] flex-col items-stretch gap-1.5 text-[#E4D8BE] sm:right-3 sm:top-3 sm:h-[calc(100%-24px)] sm:w-[clamp(120px,25%,170px)] sm:gap-2"
      data-vitals-panel="true"
    >
      <div
        className="relative h-1/3 min-h-[86px] shrink-0 drop-shadow-[0_10px_20px_rgba(21,18,26,0.55)] sm:min-h-[120px]"
        aria-label="Points de vie"
      >
        <div className="absolute inset-0 grid place-items-center overflow-hidden text-[clamp(74px,18vw,126px)] leading-none text-transparent [-webkit-text-stroke:1.5px_#9C7A2E]">
          ♥
        </div>
        <div className="absolute inset-0 grid place-items-center overflow-hidden text-[clamp(74px,18vw,126px)] leading-none text-[#E4D8BE]/14">
          ♥
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 overflow-hidden"
          style={{ height: `${hpRatio}%` }}
        >
          <div className="absolute bottom-0 grid h-full min-h-[86px] w-full place-items-center text-[clamp(74px,18vw,126px)] leading-none text-[#5A2233] [-webkit-text-stroke:1px_#9C7A2E] sm:min-h-[120px]">
            ♥
          </div>
        </div>
        <div className="absolute inset-0 grid place-items-center text-center font-black text-[#E4D8BE] [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
          <div>
            <p className="text-[8px] uppercase tracking-[0.16em] text-[#9C7A2E] sm:text-[10px]">PV</p>
            <p className="text-sm sm:text-xl">{character.pv}/{character.maxPv}</p>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {primaryVitals.map((vital) => (
          <SmallVital key={vital.label} {...vital} />
        ))}
      </div>
    </section>
  );
}

function SmallVital({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number | string;
}) {
  return (
    <div className="relative flex w-fit max-w-full items-center gap-1.5 self-end border border-[#9C7A2E]/35 bg-[#221E29]/88 px-2 py-1.5 shadow-[inset_0_0_0_1px_rgba(228,216,190,0.04)] backdrop-blur-xl">
      <span className="absolute left-1 top-1 h-1.5 w-1.5 border-l border-t border-[#9C7A2E]/70" />
      <span className="absolute right-1 top-1 h-1.5 w-1.5 border-r border-t border-[#9C7A2E]/70" />
      <span className="absolute bottom-1 left-1 h-1.5 w-1.5 border-b border-l border-[#9C7A2E]/70" />
      <span className="absolute bottom-1 right-1 h-1.5 w-1.5 border-b border-r border-[#9C7A2E]/70" />
      <span className="grid h-6 w-7 shrink-0 place-items-center border border-[#9C7A2E]/45 bg-[#15121A] text-[9px] font-black text-[#9C7A2E] sm:h-7 sm:w-8 sm:text-[10px]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[8px] font-semibold uppercase leading-none text-[#E4D8BE]/55 sm:text-[9px]">{label}</p>
        <p className="text-xs font-black leading-tight text-[#E4D8BE] sm:text-sm">{value}</p>
      </div>
    </div>
  );
}

function StatsModule({
  character,
  statBreakdowns,
}: {
  character: SafeCharacter;
  statBreakdowns: CharacterStatBreakdowns;
}) {
  const [modalState, setModalState] = useState<StatsModalState | null>(null);

  return (
    <>
      <section
        className="ornate-module mt-4 cursor-pointer px-3 pb-3 pt-7 transition-colors hover:border-[#9C7A2E]"
        onClick={() => setModalState({ type: "full" })}
      >
        <OrnateModuleFrame title="Caractéristiques" />
        <dl className="relative z-[2] grid grid-cols-3 gap-2">
          {Object.entries(character.stats).map(([key]) => {
            const statKey = key as keyof CharacterStats;
            const breakdown = statBreakdowns[statKey];

            return (
              <button
                className="manuscript-card rounded p-2 text-left hover:border-[#9C7A2E] hover:bg-[#2A2433]"
                key={key}
                onClick={(event) => {
                  event.stopPropagation();
                  setModalState({ type: "stat", stat: statKey });
                }}
                title={`${statFullLabels[statKey]}: détail du calcul`}
                type="button"
                style={getGameTermSurfaceStyle(statKey)}
              >
                <dt className="ink-heading text-base font-black leading-none" style={getGameTermTextStyle(statKey)}>
                  {statLabels[statKey]}
                </dt>
                <p className="mt-1 text-[11px] leading-tight text-[#E4D8BE]/55">
                  {statFullLabels[statKey]}
                </p>
                <dd className="ink-heading mt-1 text-2xl font-black">
                  {formatSigned(breakdown.modifier)}
                </dd>
                <p className="text-[10px] font-semibold uppercase text-[#E4D8BE]/45">
                  Score {breakdown.total}
                </p>
              </button>
            );
          })}
        </dl>
      </section>
      {modalState ? (
        <StatsModal
          character={character}
          modalState={modalState}
          onClose={() => setModalState(null)}
          statBreakdowns={statBreakdowns}
        />
      ) : null}
    </>
  );
}

function OrnateModuleFrame({ compact = false, title }: { compact?: boolean; title: string }) {
  return (
    <>
      <span className="ornate-module-border ornate-module-border--top" aria-hidden="true" />
      <span className="ornate-module-border ornate-module-border--bottom" aria-hidden="true" />
      <span className="ornate-module-corner ornate-module-corner--top-left" aria-hidden="true" />
      <span className="ornate-module-corner ornate-module-corner--top-right" aria-hidden="true" />
      <span className="ornate-module-corner ornate-module-corner--bottom-right" aria-hidden="true" />
      <span className="ornate-module-corner ornate-module-corner--bottom-left" aria-hidden="true" />
      <h3 className={`ornate-module-title text-center${compact ? " ornate-module-title--compact" : ""}`}>
        {title}
      </h3>
    </>
  );
}

function StatsModal({
  character,
  modalState,
  onClose,
  statBreakdowns,
}: {
  character: SafeCharacter;
  modalState: StatsModalState;
  onClose: () => void;
  statBreakdowns: CharacterStatBreakdowns;
}) {
  const proficiencyBonus = getProficiencyBonus(character.niveau);
  const knownCompetences = new Set(character.competences.map(normalizeText));
  const selectedStat = modalState.type === "stat" ? modalState.stat : "force";
  const selectedBreakdown = statBreakdowns[selectedStat];
  const isFullModal = modalState.type === "full";

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-[#15121A]/78 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stats-detail-title"
      onClick={onClose}
    >
      <section
        className="modal-panel manuscript-panel max-h-[88vh] w-full max-w-[760px] overflow-y-auto rounded p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="rune-label text-xs">
              {isFullModal ? "Détails des caractéristiques" : "Détail de caractéristique"}
            </p>
            <h3 className="ink-heading text-2xl font-black" id="stats-detail-title">
              {isFullModal
                ? "Caractéristiques"
                : `${statFullLabels[selectedStat]} ${formatSigned(selectedBreakdown.modifier)}`}
            </h3>
            <p className="text-sm text-[#E4D8BE]/58">
              {isFullModal
                ? `Bonus de maîtrise ${formatSigned(proficiencyBonus)}`
                : `Score ${selectedBreakdown.total} · Bonus de maîtrise ${formatSigned(proficiencyBonus)}`}
            </p>
          </div>
          <button
            className="fantasy-button rounded px-3 py-1 text-sm font-semibold"
            onClick={onClose}
            type="button"
          >
            Fermer
          </button>
        </div>

        {isFullModal ? (
          <>
            <section className="manuscript-card rounded p-3">
              <h4 className="rune-label mb-2 text-xs">Calculs</h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {savingThrowStats.map((stat) => (
                  <StatCalculationCard
                    breakdown={statBreakdowns[stat]}
                    key={stat}
                    stat={stat}
                  />
                ))}
              </div>
            </section>

            <section className="manuscript-card mt-4 rounded p-3">
              <h4 className="rune-label mb-2 text-xs">Jets de sauvegarde</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {savingThrowStats.map((stat) => (
                <StatLine
                  key={stat}
                  label={statLabels[stat]}
                  stat={stat}
                  subtitle={statFullLabels[stat]}
                  value={statBreakdowns[stat].modifier}
                />
                ))}
              </div>
            </section>

            <section className="manuscript-card mt-4 rounded p-3">
              <h4 className="rune-label mb-2 text-xs">Compétences D&D 5e</h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {dndSkills.map((skill) => {
                  const isKnown = knownCompetences.has(normalizeText(skill.label));
                  const value = statBreakdowns[skill.stat].modifier + (isKnown ? proficiencyBonus : 0);

                  return (
                  <StatLine
                    key={skill.label}
                    label={skill.label}
                    stat={skill.stat}
                    subtitle={`${statLabels[skill.stat]}${isKnown ? " · maîtrisée" : ""}`}
                    value={value}
                  />
                  );
                })}
              </div>
            </section>
          </>
        ) : (
          <StatCalculationCard breakdown={selectedBreakdown} stat={selectedStat} />
        )}
      </section>
    </div>
  );
}

function StatCalculationCard({
  breakdown,
  stat,
}: {
  breakdown: StatBreakdown;
  stat: keyof CharacterStats;
}) {
  return (
    <section className="manuscript-card rounded p-3">
      <h4 className="rune-label mb-2 text-xs" style={getGameTermTextStyle(stat)}>
        {statFullLabels[stat]}
      </h4>
      <p className="ink-heading text-lg font-black">
        {breakdown.base}
        {breakdown.bonuses.map((bonus, index) => (
          <span key={`${bonus.source}-${index}`}>
            {" "}
            {bonus.value >= 0 ? "+" : "-"} {Math.abs(bonus.value)}
          </span>
        ))}
        {" = "}
        {breakdown.total}
      </p>
      <p className="text-xs font-semibold uppercase text-[#E4D8BE]/45">
        Modificateur {formatSigned(breakdown.modifier)}
      </p>
      <div className="mt-2 space-y-1 text-sm text-[#E4D8BE]/70">
        {breakdown.bonuses.length > 0 ? (
          breakdown.bonuses.map((bonus, index) => (
            <p key={`${bonus.source}-${bonus.value}-${index}`}>
              <span className="text-[#9C7A2E]">{formatSigned(bonus.value)}</span>
              {" : "}
              {bonus.source}
            </p>
          ))
        ) : (
          <p className="text-[#E4D8BE]/45">Aucun bonus ajouté.</p>
        )}
      </div>
    </section>
  );
}

function StatLine({
  label,
  stat,
  subtitle,
  value,
}: {
  label: string;
  stat: GameStat;
  subtitle: string;
  value: number;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded border px-2 py-1.5"
      style={getGameTermSurfaceStyle(stat)}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#E4D8BE]">
          <HighlightedGameText text={label} />
        </p>
        <p className="truncate text-[10px] uppercase text-[#E4D8BE]/42">{subtitle}</p>
      </div>
      <span className="ink-heading text-lg font-black" style={getGameTermTextStyle(stat)}>
        {formatSigned(value)}
      </span>
    </div>
  );
}

function EquipmentModule({
  equippedItems,
  onOpenInventory,
}: {
  equippedItems: ResolvedInventoryItem[];
  onOpenInventory: () => void;
}) {
  if (equippedItems.length === 0) {
    return null;
  }

  const visibleItems = equippedItems.slice(0, 4);
  const hiddenCount = Math.max(0, equippedItems.length - visibleItems.length);
  const showItemTags = useGameStore((state) => state.uiSettings.showItemTags);

  return (
    <section
      className="ornate-module mt-4 cursor-pointer px-3 pb-3 pt-7 transition-colors hover:border-[#9C7A2E]"
      onClick={onOpenInventory}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenInventory();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <OrnateModuleFrame title="Équipement" />
      <div className="relative z-[2] grid items-stretch gap-1.5 sm:grid-cols-2">
        {visibleItems.map((item) => (
          <div
            className={`item-framed-card relative rounded border px-2 pb-1.5 text-xs shadow-[inset_0_0_0_1px_rgba(228,216,190,0.04)] ${
              showItemTags ? "pt-4" : "pt-2"
            }`}
            key={item.id}
            style={getItemCardStyle(item)}
          >
            <ItemCategoryLegend item={item} show={showItemTags} />
            <p className="item-card-name truncate text-[15px]">{item.name}</p>
            <ItemEffectList item={item} />
            <ItemGrantedAbilityLine item={item} />
          </div>
        ))}
      </div>
      {hiddenCount > 0 ? (
        <p className="mt-2 text-[11px] font-semibold text-[#E4D8BE]/50">
          +{hiddenCount} objet{hiddenCount > 1 ? "s" : ""} équipé{hiddenCount > 1 ? "s" : ""}
        </p>
      ) : null}
    </section>
  );
}

function LatestItemsModule({
  items,
  onOpenInventory,
}: {
  items: ResolvedInventoryItem[];
  onOpenInventory: () => void;
}) {
  const latestItems = [...items].sort(compareInventoryItemsDescending).slice(0, 4);
  const showItemTags = useGameStore((state) => state.uiSettings.showItemTags);

  if (latestItems.length === 0) {
    return null;
  }

  return (
    <section
      className="ornate-module mt-4 cursor-pointer px-3 pb-3 pt-7 transition-colors hover:border-[#9C7A2E]"
      onClick={onOpenInventory}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenInventory();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <OrnateModuleFrame compact title="Derniers objets obtenus" />
      <div className="relative z-[2] grid items-stretch gap-2">
        {latestItems.map((item) => (
          <div
            className={`item-framed-card relative rounded border px-2 pb-1.5 text-xs ${
              showItemTags ? "pt-4" : "pt-2"
            }`}
            key={item.id}
            style={getItemCardStyle(item)}
          >
            <ItemCategoryLegend item={item} show={showItemTags} />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="item-card-name truncate text-sm">{item.name}</p>
                {item.description ? (
                  <p className="item-card-description">{item.description}</p>
                ) : null}
              </div>
              <span className="item-quantity shrink-0">x{item.quantity}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CombatModule({ combatSummary }: { combatSummary: CombatSummary }) {
  return (
    <section className="ornate-module mt-4 px-3 pb-3 pt-7">
      <OrnateModuleFrame title="Combat" />
      <div className="relative z-[2] mb-3 grid grid-cols-3 gap-2">
        {combatSummary.actionSlots.map((slot) => (
          <ActionSlot key={slot.label} {...slot} />
        ))}
      </div>
      <div className="manuscript-card relative z-[2] grid grid-cols-3 gap-1 rounded p-1">
        <CompactAttack label="Contact" value={formatSigned(combatSummary.meleeAttack)} />
        <CompactAttack label="Distance" value={formatSigned(combatSummary.rangedAttack)} />
        <CompactAttack label="Magique" value={formatSigned(combatSummary.magicAttack)} />
      </div>
      {combatSummary.conditions.length > 0 ? (
        <div className="relative z-[2] mt-3 rounded border border-rose-200 bg-rose-50 p-2">
          <p className="text-xs font-semibold uppercase text-rose-700">États préjudiciables</p>
          <p className="font-semibold text-rose-950">{combatSummary.conditions.join(", ")}</p>
        </div>
      ) : null}
      <div className="relative z-[2] mt-3">
        <p className="mb-2 text-xs font-semibold uppercase text-[#9C7A2E]">Actions favorites</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {combatSummary.favoriteActions.map((action) => (
            <button
              className="fantasy-button rounded px-3 py-2 text-left text-sm font-semibold"
              key={action}
              type="button"
            >
              {action}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ActionSlot({
  icon,
  label,
  used,
}: {
  icon: string;
  label: string;
  used: number;
  total: number;
}) {
  return (
    <div className="manuscript-card rounded p-2">
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="text-base" aria-hidden="true">
          {icon}
        </span>
        <span className="text-[10px] font-semibold uppercase text-[#9C7A2E]">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {[0, 1].map((index) => (
          <span
            className={`h-3 rounded-sm border ${
              index < used ? "border-[#9C7A2E] bg-[#9C7A2E]" : "border-[#9C7A2E]/30 bg-[#15121A]"
            }`}
            key={index}
          />
        ))}
      </div>
    </div>
  );
}

function CompactAttack({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="px-2 py-1 text-center">
      <p className="text-[10px] font-semibold uppercase text-[#9C7A2E]">{label}</p>
      <p className="ink-heading text-base font-black">{value}</p>
    </div>
  );
}

function CurrentAbilitiesModule({
  characterId,
  onActionPrepared,
}: {
  characterId: string;
  onActionPrepared?: () => void;
}) {
  const abilityTemplates = useGameStore((state) => state.abilityTemplates);
  const abilityInstances = useGameStore((state) => state.abilityInstances);
  const effectTemplates = useGameStore((state) => state.effectTemplates);
  const itemInstances = useGameStore((state) => state.itemInstances);
  const addActionIntent = useGameStore((state) => state.addActionIntent);
  const abilities = useMemo(
    () => createAbilityView(
      characterId,
      abilityTemplates,
      abilityInstances,
      itemInstances,
      effectTemplates,
    ).slice(0, 4),
    [abilityInstances, abilityTemplates, characterId, effectTemplates, itemInstances],
  );

  if (abilities.length === 0) {
    return <EmptyModule label="Aucune capacité prête." />;
  }

  return (
    <section className="ornate-module mt-4 px-3 pb-3 pt-7">
      <OrnateModuleFrame title="Capacités" />
      <div className="relative z-[2] grid gap-2 sm:grid-cols-2">
        {abilities.map((ability) => {
          const isEmpty = ability.charges !== null && ability.charges <= 0;
          const isPassive = ability.activation.timing === "passive";

          return (
            <button
              className={`rounded border px-3 py-2 text-left ${
                isEmpty || isPassive
                  ? "border-[#9C7A2E]/15 bg-[#15121A]/70 text-[#E4D8BE]/35"
                  : "border-[#9C7A2E]/30 bg-[#3F5641]/35 text-[#E4D8BE] hover:border-[#9C7A2E]"
              }`}
              onClick={() => {
                if (addActionIntent("useAbility", ability.id, `Utiliser ${ability.name}`)) {
                  onActionPrepared?.();
                }
              }}
              disabled={isPassive}
              key={ability.id}
              type="button"
            >
              <span className="ink-heading block text-base font-semibold leading-tight">{ability.name}</span>
              <span className="mt-1 block text-[10px] uppercase tracking-[0.08em] text-[#9C7A2E]/85">
                {formatAbilityTiming(ability.activation.timing)}
              </span>
              <AbilityChargeBoxes ability={ability} className="mt-2" />
              <span className="mt-1 block text-[10px] text-[#E4D8BE]/50">
                Recharge : {formatAbilityRecharge(ability)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function InventoryModule({
  inventory,
  onActionPrepared,
}: {
  inventory: CharacterInventoryView;
  onActionPrepared?: () => void;
}) {
  const equipItem = useGameStore((state) => state.equipItem);
  const unequipItem = useGameStore((state) => state.unequipItem);
  const addActionIntent = useGameStore((state) => state.addActionIntent);
  const moveItemBefore = useGameStore((state) => state.moveItemBefore);
  const showItemTags = useGameStore((state) => state.uiSettings.showItemTags);
  const [itemAnimations, setItemAnimations] = useState<Record<string, ItemAnimationState>>({});
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null);
  const [dragTarget, setDragTarget] = useState<InventoryDropTarget | null>(null);
  const lastDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragTargetRef = useRef<InventoryDropTarget | null>(null);
  const pendingLongPressRef = useRef<{
    itemId: string;
    x: number;
    y: number;
    height: number;
    pointerId: number;
    timeoutId: number;
  } | null>(null);
  const allItems = [...inventory.equipped, ...inventory.bag];
  const draggedItem = dragPreview
    ? allItems.find((item) => item.id === dragPreview.itemId) ?? null
    : null;

  useEffect(() => {
    if (!draggedItemId) {
      return undefined;
    }

    function handleGlobalPointerMove(event: globalThis.PointerEvent) {
      event.preventDefault();
      moveItemDrag(event.clientX, event.clientY);
    }

    function handleGlobalPointerUp() {
      finishItemDrag(draggedItemId);
    }

    document.addEventListener("pointermove", handleGlobalPointerMove, true);
    document.addEventListener("pointerup", handleGlobalPointerUp, true);
    document.addEventListener("pointercancel", handleGlobalPointerUp, true);

    return () => {
      document.removeEventListener("pointermove", handleGlobalPointerMove, true);
      document.removeEventListener("pointerup", handleGlobalPointerUp, true);
      document.removeEventListener("pointercancel", handleGlobalPointerUp, true);
    };
  }, [draggedItemId]);

  useEffect(() => {
    return () => {
      clearPendingLongPress();
    };
  }, []);

  function runItemAnimation(
    itemId: string,
    kind: ItemAnimationState["kind"],
    action: (id: string) => void,
    event?: MouseEvent<HTMLElement>,
  ) {
    const origin = getItemClickOrigin(event);

    setItemAnimations((current) => ({
      ...current,
      [itemId]: {
        kind,
        ...origin,
      },
    }));

    window.setTimeout(() => {
      action(itemId);
      setItemAnimations((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
    }, kind === "consume" ? 420 : 220);
  }

  function startItemDrag(itemId: string, x: number, y: number, height: number) {
    clearPendingLongPress();
    lastDragPointRef.current = { x, y };
    setDraggedItemId(itemId);
    setDragPreview({ itemId, x, y, height });
    updateDragTarget(findInventoryDropTarget(x, y, itemId, null));
  }

  function clearPendingLongPress() {
    if (!pendingLongPressRef.current) {
      return;
    }

    window.clearTimeout(pendingLongPressRef.current.timeoutId);
    pendingLongPressRef.current = null;
  }

  function scheduleItemLongPress(itemId: string, pointerId: number, x: number, y: number, height: number) {
    clearPendingLongPress();
    pendingLongPressRef.current = {
      itemId,
      pointerId,
      x,
      y,
      height,
      timeoutId: window.setTimeout(() => {
        startItemDrag(itemId, x, y, height);
      }, 420),
    };
  }

  function cancelLongPressIfMoved(pointerId: number, x: number, y: number) {
    const pending = pendingLongPressRef.current;

    if (!pending || pending.pointerId !== pointerId) {
      return;
    }

    if (Math.hypot(pending.x - x, pending.y - y) > 10) {
      clearPendingLongPress();
    }
  }

  function moveItemDrag(x: number, y: number) {
    if (x <= 0 && y <= 0) {
      return;
    }

    const lastPoint = lastDragPointRef.current;

    if (lastPoint && Math.abs(lastPoint.x - x) < 1 && Math.abs(lastPoint.y - y) < 1) {
      return;
    }

    lastDragPointRef.current = { x, y };
    setDragPreview((current) => (current ? { ...current, x, y } : current));
    setDragTarget((current) => {
      if (!draggedItemId) {
        return current;
      }

      const next = findInventoryDropTarget(x, y, draggedItemId, current);

      if (
        current?.mode === next?.mode &&
        current?.beforeItemId === next?.beforeItemId &&
        current?.isValid === next?.isValid
      ) {
        return current;
      }

      dragTargetRef.current = next;
      return next;
    });
  }

  function updateDragTarget(target: InventoryDropTarget | null) {
    dragTargetRef.current = target;
    setDragTarget(target);
  }

  function finishItemDrag(itemId: string | null) {
    const target = dragTargetRef.current;
    lastDragPointRef.current = null;
    setDraggedItemId(null);
    setDragPreview(null);
    updateDragTarget(null);

    if (!itemId) {
      return;
    }

    if (target?.isValid) {
      applyItemDrop(itemId, target);
      return;
    }

    setItemAnimations((current) => ({
      ...current,
      [itemId]: {
        kind: "return",
        originX: "50%",
        originY: "50%",
      },
    }));

    window.setTimeout(() => {
      setItemAnimations((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
    }, 240);
  }

  function findInventoryDropTarget(
    x: number,
    y: number,
    itemId: string,
    currentTarget: InventoryDropTarget | null,
  ): InventoryDropTarget | null {
    const item = allItems.find((candidate) => candidate.id === itemId);
    const pointedElement = document.elementFromPoint(x, y);
    const sectionElement = pointedElement?.closest<HTMLElement>("[data-inventory-section]");

    if (!item || !sectionElement) {
      return null;
    }

    const mode = sectionElement.dataset.inventorySection;

    if (mode !== "equipped" && mode !== "inventory") {
      return null;
    }

    const targetItems = mode === "equipped" ? inventory.equipped : inventory.bag;
    const alreadyInSection = targetItems.some((candidate) => candidate.id === itemId);
    const isValid = alreadyInSection || canSectionAcceptItem(mode, item);
    const beforeItemId = isValid
      ? findStableBeforeItemId(sectionElement, y, itemId, mode, currentTarget)
      : null;

    return {
      mode,
      beforeItemId,
      isValid,
    };
  }

  function findStableBeforeItemId(
    sectionElement: HTMLElement,
    y: number,
    itemId: string,
    mode: "equipped" | "inventory",
    currentTarget: InventoryDropTarget | null,
  ): string | null {
    if (currentTarget?.mode === mode && currentTarget.isValid) {
      const slotElement = sectionElement.querySelector<HTMLElement>(".inventory-drop-slot");

      if (slotElement) {
        const slotRect = slotElement.getBoundingClientRect();

        if (y >= slotRect.top - 12 && y <= slotRect.bottom + 12) {
          return currentTarget.beforeItemId;
        }
      }

      if (currentTarget.beforeItemId) {
        const currentCard = sectionElement.querySelector<HTMLElement>(
          `[data-item-card-id="${CSS.escape(currentTarget.beforeItemId)}"]`,
        );

        if (currentCard) {
          const currentRect = currentCard.getBoundingClientRect();

          if (y >= currentRect.top - 14 && y <= currentRect.bottom + 14) {
            return currentTarget.beforeItemId;
          }
        }
      }
    }

    const cardElements = Array.from(
      sectionElement.querySelectorAll<HTMLElement>("[data-item-card-id]"),
    ).filter((cardElement) => cardElement.dataset.itemCardId !== itemId);

    for (const cardElement of cardElements) {
      const rect = cardElement.getBoundingClientRect();

      if (y < rect.top + rect.height / 2) {
        return cardElement.dataset.itemCardId ?? null;
      }
    }

    return null;
  }

  function applyItemDrop(itemId: string, target: InventoryDropTarget) {
    const targetItems = target.mode === "equipped" ? inventory.equipped : inventory.bag;
    const alreadyInSection = targetItems.some((item) => item.id === itemId);

    if (alreadyInSection) {
      if (target.beforeItemId && target.beforeItemId !== itemId) {
        moveItemBefore(itemId, target.beforeItemId);
      }

      return;
    }

    if (target.mode === "equipped") {
      runItemAnimation(itemId, "equipDrop", equipItem);
      return;
    }

    runItemAnimation(itemId, "unequip", unequipItem);
  }

  function canSectionAcceptItem(mode: "equipped" | "inventory", item: ResolvedInventoryItem): boolean {
    if (mode === "equipped") {
      return canEquipItem(item);
    }

    return item.location.type === "inventory" || canUnequipItem(item);
  }

  if (inventory.equipped.length === 0 && inventory.bag.length === 0) {
    return <EmptyModule label="Aucun objet dans l'inventaire." />;
  }

  return (
    <>
      <section className="mx-auto grid w-full max-w-[920px] gap-4 lg:grid-cols-2">
        <InventorySection
          emptyLabel="Aucun objet équipé."
          itemAnimations={itemAnimations}
          draggedItemId={draggedItemId}
          dragTarget={dragTarget}
          dropSlotHeight={dragPreview?.height ?? null}
          onCancelLongPress={clearPendingLongPress}
          onDragStateChange={startItemDrag}
          onItemAction={(itemId, event) => runItemAnimation(itemId, "unequip", unequipItem, event)}
          onLongPressMove={cancelLongPressIfMoved}
          onLongPressStart={scheduleItemLongPress}
          actionLabel="Ranger"
          items={inventory.equipped}
          mode="equipped"
          title="Équipement"
        />
        <InventorySection
          actionLabel="Équiper"
          emptyLabel="Sac vide."
          items={inventory.bag}
          mode="inventory"
          itemAnimations={itemAnimations}
          draggedItemId={draggedItemId}
          dragTarget={dragTarget}
          dropSlotHeight={dragPreview?.height ?? null}
          onCancelLongPress={clearPendingLongPress}
          onDragStateChange={startItemDrag}
          onItemAction={(itemId, event) => runItemAnimation(itemId, "equip", equipItem, event)}
          onLongPressMove={cancelLongPressIfMoved}
          onLongPressStart={scheduleItemLongPress}
          title="Inventaire"
          onUseItem={(itemId) => {
            const item = inventory.bag.find((candidate) => candidate.id === itemId);

            if (item) {
              if (addActionIntent("useItem", item.id, `Utiliser ${item.name}`)) {
                onActionPrepared?.();
              }
            }
          }}
        />
      </section>
      {draggedItem && dragPreview ? (
        <FloatingInventoryItem item={draggedItem} showItemTags={showItemTags} x={dragPreview.x} y={dragPreview.y} />
      ) : null}
    </>
  );
}

function InventorySection({
  emptyLabel,
  actionLabel,
  items,
  mode,
  itemAnimations,
  draggedItemId,
  dragTarget,
  dropSlotHeight,
  onCancelLongPress,
  onDragStateChange,
  onItemAction,
  onLongPressMove,
  onLongPressStart,
  onUseItem,
  title,
}: {
  actionLabel: string;
  emptyLabel: string;
  items: ResolvedInventoryItem[];
  mode: "equipped" | "inventory";
  itemAnimations: Record<string, ItemAnimationState>;
  draggedItemId: string | null;
  dragTarget: InventoryDropTarget | null;
  dropSlotHeight: number | null;
  onCancelLongPress: () => void;
  onDragStateChange: (itemId: string, x: number, y: number, height: number) => void;
  onItemAction: (itemId: string, event?: MouseEvent<HTMLElement>) => void;
  onLongPressMove: (pointerId: number, x: number, y: number) => void;
  onLongPressStart: (itemId: string, pointerId: number, x: number, y: number, height: number) => void;
  onUseItem?: (itemId: string, event?: MouseEvent<HTMLElement>) => void;
  title: string;
}) {
  const showItemTags = useGameStore((state) => state.uiSettings.showItemTags);
  const isActiveDropTarget = dragTarget?.mode === mode;
  const isInvalidDropTarget = Boolean(
    isActiveDropTarget && !dragTarget?.isValid,
  );
  const dropBeforeItemId =
    isActiveDropTarget && dragTarget?.isValid ? dragTarget.beforeItemId : null;
  const visibleItems = draggedItemId
    ? items.filter((item) => item.id !== draggedItemId)
    : items;

  function handlePointerDown(event: ReactPointerEvent<HTMLLIElement>, item: ResolvedInventoryItem) {
    if (event.button !== 0 || event.target instanceof HTMLElement && event.target.closest("button")) {
      return;
    }

    const height = event.currentTarget.getBoundingClientRect().height;

    if (event.pointerType === "mouse") {
      event.preventDefault();
      onDragStateChange(item.id, event.clientX, event.clientY, height);
      return;
    }

    onLongPressStart(item.id, event.pointerId, event.clientX, event.clientY, height);
  }

  return (
    <section
      className={`ornate-module mt-4 min-h-[180px] px-3 pb-3 pt-7 transition-colors ${
        isInvalidDropTarget ? "inventory-drop-invalid" : ""
      }`}
      data-inventory-section={mode}
    >
      <OrnateModuleFrame title={title} />
      <div className="relative z-[2] mb-3 flex items-center justify-end gap-3">
        <p className="text-[10px] font-semibold uppercase text-[#E4D8BE]/40">
          Déposer ici
        </p>
      </div>
      {items.length === 0 ? (
        <p className="relative z-[2] text-sm text-[#E4D8BE]/55">{emptyLabel}</p>
      ) : (
        <ul className="relative z-[2] grid items-stretch gap-1.5">
          {visibleItems.map((item) => {
            const animation = itemAnimations[item.id];

            return (
              <Fragment key={item.id}>
                {dropBeforeItemId === item.id ? (
                  <li
                    className="inventory-drop-slot"
                    aria-hidden="true"
                    style={dropSlotHeight ? { height: `${dropSlotHeight}px` } : undefined}
                  />
                ) : null}
                <li
                  className={`inventory-item-card item-framed-card relative touch-pan-y select-none rounded border px-2 pb-1.5 text-xs shadow-[inset_0_0_0_1px_rgba(228,216,190,0.04)] ${
                    showItemTags ? "pt-4" : "pt-2"
                  } ${getItemAnimationClass(animation)} ${
                    canDragItem(item, mode)
                      ? "cursor-grab active:cursor-grabbing"
                      : ""
                  }`}
                  data-item-card="true"
                  data-item-card-id={item.id}
                  draggable={false}
                  onPointerDown={(event) => handlePointerDown(event, item)}
                  onPointerMove={(event) => onLongPressMove(event.pointerId, event.clientX, event.clientY)}
                  onPointerCancel={onCancelLongPress}
                  onPointerUp={onCancelLongPress}
                  style={{ ...getItemCardStyle(item), ...getItemAnimationStyle(animation) }}
                >
                  <ItemCategoryLegend item={item} show={showItemTags} />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="item-card-name truncate text-[15px]">{item.name}</p>
                      {item.description ? (
                        <p className="item-card-description">{item.description}</p>
                      ) : null}
                      <ItemEffectList item={item} />
                      <ItemGrantedAbilityLine item={item} />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`item-quantity ${animation?.kind === "consume" ? "item-quantity-pop" : ""}`}
                        data-pop="-1"
                      >
                        x{item.quantity}
                      </span>
                {mode === "equipped" && !canUnequipItem(item) ? null : mode === "equipped" || (mode === "inventory" && canEquipItem(item)) ? (
                  <button
                    className="rounded border border-[#9C7A2E]/25 px-1.5 py-0.5 text-[11px] font-semibold text-[#E4D8BE]/75 hover:border-[#9C7A2E] hover:text-[#E4D8BE]"
                    onClick={(event) => onItemAction(item.id, event)}
                    type="button"
                  >
                    {actionLabel}
                  </button>
                ) : mode === "inventory" && canUseItem(item) && onUseItem ? (
                  <button
                    className="rounded border border-[#3F5641]/50 px-1.5 py-0.5 text-[11px] font-semibold text-[#E4D8BE]/75 hover:border-[#9C7A2E] hover:text-[#E4D8BE]"
                    onClick={(event) => onUseItem(item.id, event)}
                    type="button"
                  >
                    Utiliser
                  </button>
                ) : null}
                    </div>
                  </div>
                </li>
              </Fragment>
            );
          })}
          {isActiveDropTarget && dragTarget?.isValid && dropBeforeItemId === null ? (
            <li
              className="inventory-drop-slot"
              aria-hidden="true"
              style={dropSlotHeight ? { height: `${dropSlotHeight}px` } : undefined}
            />
          ) : null}
        </ul>
      )}
    </section>
  );
}

function ItemCategoryLegend({ item, show }: { item: ResolvedInventoryItem; show: boolean }) {
  const categories = getItemCategoryStyles(item);
  const [primaryCategory, ...secondaryCategories] = categories;

  if (!show || !primaryCategory) {
    return null;
  }

  return (
    <div className="item-frame-legend" aria-label={categories.map((category) => category.label).join(", ")}>
      <span className="item-frame-legend-text">
        <span className="item-frame-legend-primary">{primaryCategory.label}</span>
        {secondaryCategories.map((category) => (
          <span className="item-frame-legend-secondary" key={category.label}>
            {category.label}
          </span>
        ))}
      </span>
    </div>
  );
}

function FloatingInventoryItem({
  item,
  showItemTags,
  x,
  y,
}: {
  item: ResolvedInventoryItem;
  showItemTags: boolean;
  x: number;
  y: number;
}) {
  const actionLabel = getFloatingItemActionLabel(item);

  return (
    <div
      className={`inventory-drag-preview item-framed-card rounded border px-2 pb-1.5 text-xs shadow-[inset_0_0_0_1px_rgba(228,216,190,0.04)] ${
        showItemTags ? "pt-4" : "pt-2"
      }`}
      style={{
        ...getItemCardStyle(item),
        left: `${x}px`,
        top: `${y}px`,
      }}
    >
      <ItemCategoryLegend item={item} show={showItemTags} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="item-card-name truncate text-[15px]">{item.name}</p>
          {item.description ? (
            <p className="item-card-description">{item.description}</p>
          ) : null}
          <ItemEffectList item={item} />
          <ItemGrantedAbilityLine item={item} />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="item-quantity">x{item.quantity}</span>
          {actionLabel ? (
            <span className="rounded border border-[#9C7A2E]/25 px-1.5 py-0.5 text-[11px] font-semibold text-[#E4D8BE]/75">
              {actionLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ItemEffectList({ item }: { item: ResolvedInventoryItem }) {
  const effectsState = getItemVisibilityState(item, "effects");

  if (effectsState === "hidden") {
    return null;
  }

  if (effectsState === "unknown") {
    return (
      <p className="mt-1 inline-flex rounded border border-[#9C7A2E]/15 bg-[#15121A]/45 px-1.5 py-0 text-[10px] text-[#E4D8BE]/50">
        ???
      </p>
    );
  }

  const labels = item.effects
    .filter((effect) => effect.effectId !== "grantAbility")
    .map(formatItemEffect)
    .filter(Boolean);

  if (labels.length === 0) {
    return null;
  }

  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {labels.map((label, index) => {
        const stat = getStatFromEffectLabel(label);

        return (
          <li
            className={`rounded border px-1.5 py-0 text-[10px] ${
              stat
                ? "text-[#E4D8BE]/85"
                : "border-[#9C7A2E] bg-[#221E29] text-[#9C7A2E]"
            }`}
            key={`${label}-${index}`}
            style={stat ? getGameTermSolidSurfaceStyle(stat) : undefined}
          >
            {stat ? label : <HighlightedGameText text={label} />}
          </li>
        );
      })}
    </ul>
  );
}

function ItemGrantedAbilityLine({ item }: { item: ResolvedInventoryItem }) {
  const [selectedAbility, setSelectedAbility] = useState<ResolvedAbility | null>(null);
  const abilityTemplates = useGameStore((state) => state.abilityTemplates);
  const abilityInstances = useGameStore((state) => state.abilityInstances);
  const effectTemplates = useGameStore((state) => state.effectTemplates);

  if (item.grantedAbilityTemplateIds.length === 0 || getItemVisibilityState(item, "effects") !== "known") {
    return null;
  }

  const abilities = item.grantedAbilityTemplateIds
    .map((templateId) => {
      const template = abilityTemplates.find((candidate) => candidate.id === templateId);

      if (!template) {
        return null;
      }

      const instance = abilityInstances.find(
        (ability) => ability.grantedByItemId === item.id && ability.templateId === template.id,
      );

      return {
        id: instance?.id ?? `preview:${item.id}:${template.id}`,
        templateId: template.id,
        name: template.name,
        description: template.description,
        types: template.types,
        tags: template.tags,
        activation: template.activation,
        targeting: template.targeting,
        charges: instance ? getAbilityCharges(instance, template) : template.charges?.initial ?? template.charges?.max ?? null,
        maxCharges: getAbilityMaxCharges(template),
        recharge: template.charges?.recharge ?? null,
        effects: resolveNamedEffectRefs(template.effects, effectTemplates),
      } satisfies ResolvedAbility;
    })
    .filter((ability): ability is ResolvedAbility => Boolean(ability));

  if (abilities.length === 0) {
    return null;
  }

  return (
    <>
      <div className="mt-1.5 space-y-1 border-t border-[#9C7A2E]/15 pt-1.5">
        {abilities.map((ability) => (
          <button
            className="w-full rounded border border-[#9C7A2E]/30 bg-[#3F5641] px-3 py-2 text-left text-[#E4D8BE] transition hover:border-[#9C7A2E]"
            key={ability.templateId}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedAbility(ability);
            }}
            type="button"
          >
            <span className="flex min-w-0 items-center justify-between gap-2">
              <span className="ink-heading truncate text-base font-semibold leading-tight">{ability.name}</span>
              <AbilityChargeBoxes ability={ability} className="shrink-0" />
            </span>
            <span className="mt-1 block text-[10px] uppercase tracking-[0.08em] text-[#9C7A2E]/85">
              {formatAbilityTiming(ability.activation.timing)}
            </span>
          </button>
        ))}
      </div>
      {selectedAbility ? (
        <AbilityGrantedModal
          ability={selectedAbility}
          onClose={() => setSelectedAbility(null)}
        />
      ) : null}
    </>
  );
}

function AbilityGrantedModal({
  ability,
  onClose,
}: {
  ability: ResolvedAbility;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop fixed inset-0 z-[70] flex items-end justify-center bg-[#15121A]/78 p-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <section
        className="modal-panel manuscript-panel max-h-[86vh] w-full max-w-[460px] overflow-y-auto rounded p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="rune-label text-xs">Objet équipé</p>
            <h3 className="ink-heading mt-1 text-3xl font-semibold text-[#E4D8BE]">{ability.name}</h3>
            <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[#9C7A2E]/85">
              {formatAbilityTiming(ability.activation.timing)}
            </p>
          </div>
          <button
            className="rounded border border-[#9C7A2E]/25 px-2 py-1 text-xs text-[#E4D8BE]/75 hover:border-[#9C7A2E]"
            onClick={onClose}
            type="button"
          >
            Fermer
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#E4D8BE]/78">{ability.description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <AbilityChargeBoxes ability={ability} />
          <span className="text-xs text-[#E4D8BE]/55">
            Recharge : {formatAbilityRecharge(ability)}
          </span>
        </div>
        <AbilityEffectList ability={ability} />
      </section>
    </div>
  );
}

function AbilitiesModule({
  character,
  onActionPrepared,
}: {
  character: SafeCharacter;
  onActionPrepared?: () => void;
}) {
  const abilityTemplates = useGameStore((state) => state.abilityTemplates);
  const abilityInstances = useGameStore((state) => state.abilityInstances);
  const effectTemplates = useGameStore((state) => state.effectTemplates);
  const itemInstances = useGameStore((state) => state.itemInstances);
  const addActionIntent = useGameStore((state) => state.addActionIntent);
  const abilities = useMemo(
    () => createAbilityView(
      character.id,
      abilityTemplates,
      abilityInstances,
      itemInstances,
      effectTemplates,
    ),
    [abilityInstances, abilityTemplates, character.id, effectTemplates, itemInstances],
  );

  if (abilities.length === 0 && character.competences.length === 0) {
    return <EmptyModule label="Aucune capacité connue." />;
  }

  return (
    <section className="ornate-module mx-auto mt-4 w-full max-w-[760px] px-3 pb-3 pt-7">
      <OrnateModuleFrame title="Capacités" />
      <div className="relative z-[2] grid gap-3 sm:grid-cols-2">
        {abilities.map((ability) => {
          const isEmpty = ability.charges !== null && ability.charges <= 0;

          return (
            <article
              className={`rounded border p-3 ${
                isEmpty
                  ? "border-[#9C7A2E]/15 bg-[#15121A]/70 text-[#E4D8BE]/45"
                  : "border-[#9C7A2E]/25 bg-[#221E29]/90 text-[#E4D8BE]"
              }`}
              key={ability.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="ink-heading text-xl font-semibold leading-tight">{ability.name}</h4>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[#9C7A2E]/85">
                    {formatAbilityTiming(ability.activation.timing)}
                  </p>
                </div>
                <button
                  className="fantasy-button rounded px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={ability.activation.timing === "passive"}
                  onClick={() => {
                    if (addActionIntent("useAbility", ability.id, `Utiliser ${ability.name}`)) {
                      onActionPrepared?.();
                    }
                  }}
                  type="button"
                >
                  Utiliser
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <AbilityChargeBoxes ability={ability} />
                <span className="text-xs text-[#E4D8BE]/55">
                  Recharge : {formatAbilityRecharge(ability)}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[#E4D8BE]/75">{ability.description}</p>
              <AbilityEffectList ability={ability} />
            </article>
          );
        })}
      </div>

      {character.competences.length > 0 ? (
        <div className="mt-4 border-t border-[#9C7A2E]/15 pt-3">
          <p className="mb-2 text-xs uppercase tracking-[0.08em] text-[#E4D8BE]/45">Anciennes notes</p>
          <div className="flex flex-wrap gap-2">
            {character.competences.map((ability) => (
              <span className="rounded border border-[#9C7A2E]/20 bg-[#3F5641]/25 px-2 py-1 text-sm text-[#E4D8BE]/75" key={ability}>
                {ability}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function createAbilityView(
  characterId: string,
  templates: AbilityTemplate[],
  instances: AbilityInstance[],
  itemInstances: ItemInstance[] = [],
  effectTemplates: EffectTemplate[] = [],
): ResolvedAbility[] {
  return instances
    .filter((ability) => {
      if (ability.ownerId !== characterId) {
        return false;
      }

      if (!ability.grantedByItemId) {
        return true;
      }

      return itemInstances.some(
        (item) =>
          item.id === ability.grantedByItemId &&
          item.location.type === "equipped" &&
          item.location.parent === characterId,
      );
    })
    .flatMap((ability) => {
      const template = templates.find((candidate) => candidate.id === ability.templateId);

      if (!template) {
        return [];
      }

      return [
        {
          id: ability.id,
          templateId: ability.templateId,
          name: String(ability.overrides.name ?? template.name),
          description: String(ability.overrides.description ?? template.description),
          types: template.types,
          tags: template.tags,
          activation: template.activation,
          targeting: template.targeting,
          charges: getAbilityCharges(ability, template),
          maxCharges: getAbilityMaxCharges(template),
          recharge: template.charges?.recharge ?? null,
          effects: resolveNamedEffectRefs(
            [...template.effects, ...ability.effects],
            effectTemplates,
          ),
        },
      ];
    });
}

function AbilityChargeBoxes({ ability, className = "" }: { ability: ResolvedAbility; className?: string }) {
  if (ability.charges === null || ability.maxCharges === null) {
    return (
      <span className={`text-[10px] uppercase tracking-[0.08em] text-[#E4D8BE]/55 ${className}`}>
        Passif
      </span>
    );
  }

  const currentCharges = ability.charges;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-label={`${ability.charges} charges sur ${ability.maxCharges}`}>
      {Array.from({ length: ability.maxCharges }, (_, index) => (
        <span
          className={`h-3 w-3 rounded-sm border ${
            index < currentCharges
              ? "border-[#9C7A2E] bg-[#9C7A2E]"
              : "border-[#9C7A2E]/35 bg-[#15121A]/80"
          }`}
          key={`${ability.id}-charge-${index}`}
        />
      ))}
    </span>
  );
}

function AbilityEffectList({ ability }: { ability: ResolvedAbility }) {
  const labels = ability.effects.map(formatAbilityEffect).filter(Boolean);

  return (
    <div className="mt-3 rounded border border-[#9C7A2E]/15 bg-[#15121A]/45 p-2">
      <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#9C7A2E]/85">Effets</p>
      {labels.length > 0 ? (
        <ul className="space-y-1">
          {labels.map((label, index) => (
            <li className="text-sm leading-snug text-[#E4D8BE]/85" key={`${ability.id}-effect-${index}`}>
              <HighlightedGameText text={label} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#E4D8BE]/55">Aucun effet mécanique direct.</p>
      )}
    </div>
  );
}

function formatAbilityEffect(effect: ItemEffectRef): string {
  if (effect.effectId === "modifyStat") {
    const stat = effect.variables?.stat;
    const value = Number(effect.variables?.value);

    if (!isCharacterStat(stat) || !Number.isFinite(value)) {
      return "";
    }

    return `${statLabels[stat]} ${formatSigned(value)}`;
  }

  const name = effect.nom ?? getFallbackEffectName(effect.effectId);
  const level = Number(effect.variables?.level);
  const value = formatEffectValueExpression(effect.variables?.value);
  const levelLabel = Number.isFinite(level) && level > 1 ? ` Niv.${level}` : "";

  if (value) {
    return `${name}${levelLabel} : ${formatEffectValue(effect, value)}`;
  }

  return `${name}${levelLabel}`;
}

function formatAbilityTiming(timing: AbilityTemplate["activation"]["timing"]): string {
  const labels: Record<AbilityTemplate["activation"]["timing"], string> = {
    action: "Action",
    bonus: "Bonus",
    reaction: "Réaction",
    free: "Libre",
    passive: "Passif",
  };

  return labels[timing];
}

function formatAbilityRecharge(ability: ResolvedAbility): string {
  if (ability.charges === null || ability.maxCharges === null) {
    return "aucune charge";
  }

  if (!ability.recharge || ability.recharge.length === 0) {
    return "non précisée";
  }

  const labels: Record<NonNullable<ResolvedAbility["recharge"]>[number], string> = {
    shortRest: "repos court",
    longRest: "repos long",
    encounter: "début de rencontre",
    manual: "MJ",
    never: "jamais",
  };

  return ability.recharge.map((trigger) => labels[trigger]).join(" ou ");
}

function HistoryJournalModule({ character }: { character: SafeCharacter }) {
  const campaign = useGameStore((state) => state.campaign);
  const messages = useGameStore((state) => state.messages);
  const journalEntries = messages
    .filter((message) => message.sender === "player")
    .slice(-6)
    .reverse();

  return (
    <div className="mx-auto grid w-full max-w-[920px] gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="ornate-module mt-4 px-4 pb-4 pt-7">
        <OrnateModuleFrame title="Historique" />
        <h3 className="ink-heading relative z-[2] mt-1 text-2xl font-black">{character.name}</h3>
        <div className="relative z-[2] mt-3 space-y-2 text-sm text-[#E4D8BE]/70">
          <p>
            {character.espece} · {character.classe} · niveau {character.niveau}
          </p>
          {character.title ? <p className="text-[#9C7A2E]">{character.title}</p> : null}
          {character.origin ? <p>{character.origin}</p> : null}
          {character.description ? <p>{character.description}</p> : null}
          {!character.origin && !character.description ? (
            <p>Le journal personnel recueillera ici les origines, serments, cicatrices narratives et choix importants du personnage.</p>
          ) : null}
        </div>
      </section>

      <section className="ornate-module mt-4 px-4 pb-4 pt-7">
        <OrnateModuleFrame compact title="Journal de campagne" />
        <h3 className="ink-heading relative z-[2] mt-1 text-xl font-black">{campaign.name}</h3>
        <div className="relative z-[2] mt-4 space-y-3">
          {campaign.history.length > 0 ? (
            campaign.history.map((entry, index) => (
              <article className="manuscript-card rounded p-3" key={`${entry}-${index}`}>
                <p className="text-[10px] font-semibold uppercase text-[#9C7A2E]">
                  Entrée {index + 1}
                </p>
                <p className="mt-1 text-sm text-[#E4D8BE]/75">
                  <HighlightedGameText text={entry} />
                </p>
              </article>
            ))
          ) : (
            <p className="text-sm text-[#E4D8BE]/50">Aucune entrée de campagne.</p>
          )}
        </div>
      </section>

      <section className="ornate-module mt-4 px-4 pb-4 pt-7 lg:col-span-2">
        <OrnateModuleFrame compact title="Dernières décisions" />
        <div className="relative z-[2] mt-3 grid gap-2 md:grid-cols-2">
          {journalEntries.length > 0 ? (
            journalEntries.map((entry) => (
              <article className="manuscript-card rounded p-3" key={entry.id}>
                <time className="text-[10px] font-semibold uppercase text-[#E4D8BE]/38">
                  {new Date(entry.timestamp).toLocaleString("fr-FR")}
                </time>
                <p className="mt-1 text-sm text-[#E4D8BE]/76">
                  <HighlightedGameText text={entry.content} />
                </p>
              </article>
            ))
          ) : (
            <p className="text-sm text-[#E4D8BE]/50">
              Les choix du personnage apparaîtront ici après ses prochaines actions.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function EmptyModule({ label }: { label: string }) {
  return (
    <section className="manuscript-panel rounded border-dashed p-4 text-sm text-stone-700">
      {label}
    </section>
  );
}

interface CombatSummary {
  defense: number;
  initiative: number;
  speed: number;
  proficiencyBonus: number;
  inspiration: number;
  mana: number;
  meleeAttack: number;
  rangedAttack: number;
  magicAttack: number;
  remainingActions: number;
  actionSlots: Array<{
    icon: string;
    label: string;
    used: number;
    total: number;
  }>;
  conditions: string[];
  favoriteActions: string[];
}

function createCombatSummary(character: SafeCharacter, derivedScores?: CharacterDerivedScores): CombatSummary {
  const strengthModifier = getModifier(character.stats.force);
  const dexterityModifier = getModifier(character.stats.dexterite);
  const intelligenceModifier = getModifier(character.stats.intelligence);
  const wisdomModifier = getModifier(character.stats.sagesse);
  const proficiencyBonus = derivedScores?.proficiencyBonus ?? getProficiencyBonus(character.niveau);

  return {
    defense: derivedScores?.defense ?? 10 + dexterityModifier,
    initiative: derivedScores?.initiative ?? dexterityModifier,
    speed: derivedScores?.speed ?? (character.espece.toLowerCase().includes("nain") ? 7.5 : 9),
    proficiencyBonus,
    inspiration: 0,
    mana: derivedScores?.mana ?? Math.max(0, getModifier(character.stats.charisme) + character.niveau),
    meleeAttack: derivedScores?.attacks.melee ?? strengthModifier + proficiencyBonus,
    rangedAttack: derivedScores?.attacks.ranged ?? dexterityModifier + proficiencyBonus,
    magicAttack: derivedScores?.attacks.magic ?? Math.max(intelligenceModifier, wisdomModifier) + proficiencyBonus,
    remainingActions: 1,
    actionSlots: [
      { icon: "⚔", label: "Attaque", used: 1, total: 2 },
      { icon: "↗", label: "Mouvement", used: 1, total: 2 },
      { icon: "✦", label: "Bonus", used: 0, total: 2 },
    ],
    conditions: [],
    favoriteActions: createFavoriteActions(character),
  };
}

function createFavoriteActions(character: SafeCharacter): string[] {
  const inventoryNames = character.inventaire.map((item) => item.name.toLowerCase());
  const hasBow = inventoryNames.some((name) => name.includes("arc"));

  return [
    hasBow ? "Tirer a l'arc" : "Attaque principale",
    "Se désengager",
    character.competences[0] ?? "Action speciale",
  ];
}

function resolveInventoryItem(
  item: ItemInstance,
  templates: ItemTemplate[],
  effectTemplates: EffectTemplate[] = [],
): ResolvedInventoryItem | null {
  const template = templates.find((candidate) => candidate.id === item.templateId);

  if (!template) {
    return null;
  }
  const effects = resolveNamedEffectRefs(
    [...template.effects, ...item.effects],
    effectTemplates,
  );

  return {
    id: item.id,
    templateId: item.templateId,
    type: template.type,
    actualName: String(item.overrides.name ?? template.name),
    actualDescription: String(item.overrides.description ?? template.description),
    types: getTemplateTypes(template),
    tags: getTemplateTags(template),
    name: resolveVisibleItemName(item, template),
    description: resolveVisibleItemDescription(item, template),
    quantity: item.quantity,
    base: {
      ...template.base,
      ...Object.fromEntries(
        Object.entries(item.overrides)
          .filter(([key]) => key.startsWith("base."))
          .map(([key, value]) => [key.slice("base.".length), value]),
      ),
    },
    data: item.data,
    effects,
    grantedAbilityTemplateIds: effects
      .filter((effect) => effect.effectId === "grantAbility")
      .map((effect) => String(effect.variables?.abilityTemplateId ?? ""))
      .filter(Boolean),
    modules: template.modules,
    location: item.location,
  };
}

function getTemplateTypes(template: ItemTemplate): string[] {
  const maybeTypes = (template as Partial<ItemTemplate> & { types?: unknown }).types;

  if (Array.isArray(maybeTypes) && maybeTypes.length > 0) {
    return maybeTypes.filter((type): type is string => typeof type === "string");
  }

  const legacyTags = (template as Partial<ItemTemplate> & { tags?: unknown }).tags;

  if (Array.isArray(legacyTags) && legacyTags.length > 0) {
    return legacyTags.filter((tag): tag is string => typeof tag === "string");
  }

  const legacyRoles = template.modules.item?.roles;

  return Array.isArray(legacyRoles)
    ? legacyRoles.filter((role): role is string => typeof role === "string")
    : [];
}

function getTemplateTags(template: ItemTemplate): string[] {
  if (Array.isArray(template.tags) && template.tags.length > 0) {
    return template.tags;
  }

  return getTemplateTypes(template);
}

function resolveVisibleItemName(item: ItemInstance, template: ItemTemplate): string {
  const state = getVisibilityState(item, template, "name");

  if (state === "hidden") {
    return "Objet masqué";
  }

  if (state === "unknown") {
    return String(item.data.unknownName ?? template.modules.item?.unknownName ?? "Objet inconnu");
  }

  return String(item.overrides.name ?? template.name);
}

function resolveVisibleItemDescription(item: ItemInstance, template: ItemTemplate): string {
  const state = getVisibilityState(item, template, "description");

  if (state === "hidden") {
    return "";
  }

  if (state === "unknown") {
    return String(
      item.data.unknownDescription ??
        template.modules.item?.unknownDescription ??
        "Description inconnue.",
    );
  }

  return String(item.overrides.description ?? template.description);
}

function createInventoryView(
  characterId: string,
  itemTemplates: ItemTemplate[],
  itemInstances: ItemInstance[],
  effectTemplates: EffectTemplate[] = [],
): CharacterInventoryView {
  const characterItems = itemInstances
    .filter((item) => item.location.parent === characterId)
    .map((item) => resolveInventoryItem(item, itemTemplates, effectTemplates))
    .filter((item): item is ResolvedInventoryItem => Boolean(item));

  return {
    equipped: characterItems.filter((item) => item.location.type === "equipped").sort(compareInventoryItems),
    bag: characterItems.filter((item) => item.location.type === "inventory").sort(compareInventoryItems),
  };
}

function compareInventoryItems(first: ResolvedInventoryItem, second: ResolvedInventoryItem): number {
  const firstOrder = Number(first.data.inventoryOrder);
  const secondOrder = Number(second.data.inventoryOrder);

  if (Number.isFinite(firstOrder) && Number.isFinite(secondOrder)) {
    return firstOrder - secondOrder;
  }

  if (Number.isFinite(firstOrder)) {
    return -1;
  }

  if (Number.isFinite(secondOrder)) {
    return 1;
  }

  return first.id.localeCompare(second.id);
}

function compareInventoryItemsDescending(first: ResolvedInventoryItem, second: ResolvedInventoryItem): number {
  return compareInventoryItems(second, first);
}

function createStatBreakdowns(
  stats: CharacterStats,
  equippedItems: ResolvedInventoryItem[],
): CharacterStatBreakdowns {
  const breakpoints: CharacterStatBreakdowns = {
    force: createEmptyStatBreakdown(stats.force),
    dexterite: createEmptyStatBreakdown(stats.dexterite),
    constitution: createEmptyStatBreakdown(stats.constitution),
    intelligence: createEmptyStatBreakdown(stats.intelligence),
    sagesse: createEmptyStatBreakdown(stats.sagesse),
    charisme: createEmptyStatBreakdown(stats.charisme),
  };

  equippedItems.forEach((item) => {
    item.effects.forEach((effect) => {
      if (effect.effectId !== "modifyStat") {
        return;
      }

      const stat = effect.variables?.stat;
      const value = Number(effect.variables?.value);

      if (!isCharacterStat(stat) || !Number.isFinite(value)) {
        return;
      }

      breakpoints[stat].bonuses.push({
        value,
        source:
          getItemVisibilityState(item, "effects") === "known"
            ? item.name
            : "Effet inconnu",
      });
      breakpoints[stat].total += value;
    });
  });

  Object.values(breakpoints).forEach((breakdown) => {
    breakdown.modifier = getModifier(breakdown.total);
  });

  return breakpoints;
}

function createEmptyStatBreakdown(value: number): StatBreakdown {
  return {
    base: value,
    bonuses: [],
    total: value,
    modifier: getModifier(value),
  };
}

function applyStatBreakdowns(stats: CharacterStats, breakdowns: CharacterStatBreakdowns): CharacterStats {
  return {
    ...stats,
    force: breakdowns.force.total,
    dexterite: breakdowns.dexterite.total,
    constitution: breakdowns.constitution.total,
    intelligence: breakdowns.intelligence.total,
    sagesse: breakdowns.sagesse.total,
    charisme: breakdowns.charisme.total,
  };
}

function isCharacterStat(value: unknown): value is keyof CharacterStats {
  return (
    value === "force" ||
    value === "dexterite" ||
    value === "constitution" ||
    value === "intelligence" ||
    value === "sagesse" ||
    value === "charisme"
  );
}

function canEquipItem(item: ResolvedInventoryItem): boolean {
  return isItemEquipable(item.types);
}

function canUnequipItem(item: ResolvedInventoryItem): boolean {
  return !preventsUnequip(item.effects);
}

function canDragItem(item: ResolvedInventoryItem, _mode: "equipped" | "inventory"): boolean {
  return item.id.length > 0;
}

function canUseItem(item: ResolvedInventoryItem): boolean {
  return isItemUsable(item.types);
}

function getFloatingItemActionLabel(item: ResolvedInventoryItem): string {
  if (item.location.type === "equipped") {
    return canUnequipItem(item) ? "Ranger" : "";
  }

  if (canEquipItem(item)) {
    return "Équiper";
  }

  if (canUseItem(item)) {
    return "Utiliser";
  }

  return "";
}

function getItemCategoryStyles(item: ResolvedInventoryItem): ItemCategoryStyle[] {
  return getItemTypes(item).map(getItemCategoryStyle);
}

function getItemCategoryStyle(role: string): ItemCategoryStyle {
  if (role === "weapon") {
    return { label: "Arme", color: "#7A1F2E" };
  }

  if (role === "armor") {
    return { label: "Armure", color: "#2F5C7A" };
  }

  if (role === "accessory") {
    return { label: "Accessoire", color: "#3F6C8A" };
  }

  if (role === "consumable") {
    return { label: "Consommable", color: "#8C3F73" };
  }

  if (role === "food") {
    return { label: "Nourriture", color: "#B5612A" };
  }

  if (role === "material" || role === "resource") {
    return { label: "Ressource", color: "#6E5A3C" };
  }

  if (role === "quest") {
    return { label: "Objet de quête", color: "#9C7A2E" };
  }

  return { label: "Divers", color: "#5C5566" };
}

function getItemCardStyle(item: ResolvedInventoryItem): CSSProperties {
  const { color } = getItemCategoryStyles(item)[0] ?? { color: "#5C5566" };

  return {
    "--item-color": `${color}CC`,
    "--item-glow": `${color}38`,
    background: `linear-gradient(135deg, ${color}34 0%, ${color}1F 38%, rgba(34, 30, 41, 0.98) 76%, #221E29 100%)`,
    borderColor: `${color}CC`,
  } as CSSProperties;
}

function getItemAnimationStyle(animation: ItemAnimationState | undefined): CSSProperties {
  if (!animation) {
    return {};
  }

  return {
    "--consume-x": animation.originX,
    "--consume-y": animation.originY,
  } as CSSProperties;
}

function getItemAnimationClass(animation: ItemAnimationState | undefined): string {
  const kind = animation?.kind;

  if (kind === "equip") {
    return "item-card-equip";
  }

  if (kind === "equipDrop") {
    return "item-card-equip-drop";
  }

  if (kind === "unequip") {
    return "item-card-unequip";
  }

  if (kind === "consume") {
    return "item-card-consume";
  }

  if (kind === "return") {
    return "item-card-return";
  }

  return "";
}

function getItemClickOrigin(event: MouseEvent<HTMLElement> | undefined): Pick<ItemAnimationState, "originX" | "originY"> {
  const fallback = {
    originX: "50%",
    originY: "50%",
  };

  if (!event) {
    return fallback;
  }

  const card = event.currentTarget.closest("[data-item-card]");

  if (!card) {
    return fallback;
  }

  const bounds = card.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * 100;
  const y = ((event.clientY - bounds.top) / bounds.height) * 100;

  return {
    originX: `${Math.max(0, Math.min(100, x))}%`,
    originY: `${Math.max(0, Math.min(100, y))}%`,
  };
}

function getItemTypes(item: ResolvedInventoryItem): string[] {
  if (item.types.length > 0) {
    return item.types;
  }

  const roles = item.modules.item?.roles;
  const role = item.modules.item?.role;

  if (Array.isArray(roles)) {
    const normalizedRoles = roles.filter((itemRole): itemRole is string => typeof itemRole === "string");

    if (normalizedRoles.length > 0) {
      return normalizedRoles;
    }
  }

  return typeof role === "string" ? [role] : ["misc"];
}

function getItemVisibilityState(
  item: ResolvedInventoryItem,
  field: "name" | "description" | "effects",
): "known" | "unknown" | "hidden" {
  const instanceState = item.data[`${field}State`];
  const templateState = item.modules.item?.[`${field}State`];
  const state = typeof instanceState === "string" ? instanceState : templateState;

  return state === "unknown" || state === "hidden" ? state : "known";
}

function getVisibilityState(
  item: ItemInstance,
  template: ItemTemplate,
  field: "name" | "description" | "effects",
): "known" | "unknown" | "hidden" {
  const instanceState = item.data[`${field}State`];
  const templateState = template.modules.item?.[`${field}State`];
  const state = typeof instanceState === "string" ? instanceState : templateState;

  return state === "unknown" || state === "hidden" ? state : "known";
}

function formatItemEffect(effect: ItemEffectRef): string {
  if (effect.effectId === "modifyStat") {
    const stat = effect.variables?.stat;
    const value = Number(effect.variables?.value);

    if (!isCharacterStat(stat) || !Number.isFinite(value)) {
      return "";
    }

    return `${statLabels[stat]} ${formatSigned(value)}`;
  }

  const name = effect.nom ?? getFallbackEffectName(effect.effectId);
  const level = Number(effect.variables?.level);
  const value = formatEffectValueExpression(effect.variables?.value);
  const levelLabel = Number.isFinite(level) && level > 1 ? ` Niv.${level}` : "";

  if (value) {
    return `${name}${levelLabel} : ${formatEffectValue(effect, value)}`;
  }

  return `${name}${levelLabel}`;
}

function resolveNamedEffectRefs(
  effects: ItemEffectRef[],
  templates: EffectTemplate[],
): ItemEffectRef[] {
  const names = new Map(templates.map((template) => [template.id, template.name]));
  return effects.map((effect) => ({
    ...effect,
    nom: effect.nom ?? names.get(effect.effectId),
    variables: { ...(effect.variables ?? {}) },
  }));
}

function getStatFromEffectLabel(label: string): keyof CharacterStats | null {
  const statEntry = Object.entries(statLabels).find(([, abbreviation]) =>
    label.toUpperCase().startsWith(abbreviation),
  );

  return statEntry ? (statEntry[0] as keyof CharacterStats) : null;
}

function getFallbackEffectName(effectId: string): string {
  const names: Record<string, string> = {
    heal: "Soin",
    damage: "DM",
    randomDamage: "Dégâts chaotiques",
    reduceDamage: "Résistance",
    inventoryInteraction: "Interaction d'inventaire",
  };

  return names[effectId] ?? "???";
}

function formatEffectValue(effect: ItemEffectRef, value: string): string {
  if (effect.effectId === "heal") {
    return `${value} PV`;
  }

  return value;
}

function getModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function getProficiencyBonus(level: number): number {
  return 2 + Math.floor(Math.max(0, level - 1) / 4);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function CharacterSheet({ onNavigateToReading }: { onNavigateToReading?: () => void }) {
  const [activePageId, setActivePageId] = useState<CharacterSheetPageId>("overview");
  const selectedCharacterId = useGameStore((state) => state.selectedCharacterId);
  const rawCharacter = useGameStore((state) =>
    state.characters.find((item) => item.id === selectedCharacterId),
  );
  const itemTemplates = useGameStore((state) => state.itemTemplates);
  const itemInstances = useGameStore((state) => state.itemInstances);
  const effectTemplates = useGameStore((state) => state.effectTemplates);

  const normalizedCharacter = useMemo(
    () => (rawCharacter ? normalizeCharacter(rawCharacter) : null),
    [rawCharacter],
  );
  const inventory = useMemo(
    () =>
      normalizedCharacter
        ? createInventoryView(
            normalizedCharacter.id,
            itemTemplates,
            itemInstances,
            effectTemplates,
          )
        : { equipped: [], bag: [] },
    [effectTemplates, itemInstances, itemTemplates, normalizedCharacter],
  );
  const statBreakdowns = useMemo(
    () =>
      normalizedCharacter
        ? createStatBreakdowns(normalizedCharacter.stats, inventory.equipped)
        : createStatBreakdowns(fallbackStats, []),
    [inventory.equipped, normalizedCharacter],
  );
  const character = useMemo(
    () =>
      normalizedCharacter
        ? {
            ...normalizedCharacter,
            stats: applyStatBreakdowns(normalizedCharacter.stats, statBreakdowns),
            inventaire: inventory.equipped.map((item) => ({
              id: item.id,
              name: item.name,
              description: item.description,
              quantity: item.quantity,
            })),
          }
        : null,
    [inventory.equipped, normalizedCharacter, statBreakdowns],
  );
  const activePage = sheetPages.find((page) => page.id === activePageId) ?? sheetPages[0]!;

  if (!character) {
    return (
      <aside className="paper-surface flex h-full items-center justify-center p-4 text-sm text-stone-700">
        Aucun personnage selectionne.
      </aside>
    );
  }

  return (
    <aside className="paper-surface h-full min-h-0">
      <div className="h-full min-h-0 overflow-y-auto">
        <header className="sticky top-0 z-30 border-b border-[#9C7A2E]/25 bg-[#221E29]/96 px-3 py-1.5 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-[920px]">
            <h2 className="ink-heading text-center text-sm font-semibold leading-tight text-[#E4D8BE]/90 sm:text-base">
              {character.name}
            </h2>

            <nav className="mt-1 grid touch-pan-y grid-cols-4 gap-1 rounded border border-[#9C7A2E]/20 bg-[#15121A] p-1">
              {sheetPages.map((page) => (
                <button
                  className={`rounded px-1.5 py-1.5 text-xs font-semibold sm:text-sm ${
                    activePage.id === page.id
                      ? "fantasy-button-active"
                      : "text-[#E4D8BE]/70 hover:bg-[#6B4A5C]/25"
                  }`}
                  key={page.id}
                  onClick={() => setActivePageId(page.id)}
                  type="button"
                >
                  {page.label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <div className="p-4">
          {activePage.render(character, inventory, statBreakdowns, setActivePageId, onNavigateToReading)}
        </div>
      </div>
    </aside>
  );
}

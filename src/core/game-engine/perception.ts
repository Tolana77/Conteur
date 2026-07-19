import type {
  CharacterLanguageMastery,
  CharacterPerception,
  CommunicationPayload,
  CommunicationPerception,
  LanguageChannel,
  LanguageMasteryLevel,
  SenseCapability,
} from "../models";

export interface LanguageDefinition {
  id: string;
  name: string;
}

export interface ResolvedCommunication {
  content: string | null;
  perception: CommunicationPerception;
}

export const languageMasteryLevels: LanguageMasteryLevel[] = [
  "none",
  "fragments",
  "limited",
  "fluent",
];

export const languageMasteryLabels: Record<LanguageMasteryLevel, string> = {
  none: "Aucune maîtrise",
  fragments: "Quelques mots",
  limited: "Presque tout, sauf certains mots",
  fluent: "Maîtrise complète",
};

export const defaultLanguageCatalog: LanguageDefinition[] = [
  { id: "commun", name: "Commun" },
  { id: "nain", name: "Nain" },
  { id: "elfique", name: "Elfique" },
  { id: "halfelin", name: "Halfelin" },
  { id: "gnome", name: "Gnome" },
  { id: "gobelin", name: "Gobelin" },
  { id: "orc", name: "Orc" },
  { id: "draconique", name: "Draconique" },
  { id: "infernal", name: "Infernal" },
  { id: "celeste", name: "Céleste" },
  { id: "sylvestre", name: "Sylvestre" },
  { id: "primordial", name: "Primordial" },
];

export const defaultCharacterPerception: CharacterPerception = {
  vision: "normal",
  hearing: "normal",
  speech: "normal",
  languages: [{
    languageId: "commun",
    name: "Commun",
    oral: "fluent",
    written: "fluent",
  }],
};

export function normalizeCharacterPerception(value: unknown): CharacterPerception {
  if (!isRecord(value)) return cloneDefaultPerception();
  const languageSources = Array.isArray(value.languages) ? value.languages : null;
  const languages = languageSources
    ? languageSources.flatMap(normalizeLanguageMastery)
    : [];
  const uniqueLanguages = new Map<string, CharacterLanguageMastery>();
  languages.forEach((language) => uniqueLanguages.set(language.languageId, language));

  return {
    vision: normalizeSense(value.vision),
    hearing: normalizeSense(value.hearing),
    speech: normalizeSense(value.speech),
    languages: languageSources
      ? [...uniqueLanguages.values()]
      : cloneDefaultPerception().languages,
  };
}

export function cloneDefaultPerception(): CharacterPerception {
  return {
    ...defaultCharacterPerception,
    languages: defaultCharacterPerception.languages.map((language) => ({ ...language })),
  };
}

export function getLanguageMastery(
  perception: CharacterPerception,
  languageId: string,
): CharacterLanguageMastery | undefined {
  const normalizedId = normalizeLanguageId(languageId);
  return perception.languages.find((language) => language.languageId === normalizedId);
}

export function getLanguageMasteryPoints(perception: CharacterPerception): number {
  return perception.languages.reduce(
    (total, language) => total + masteryRank(language.oral) + masteryRank(language.written),
    0,
  );
}

export function applyPerceptionConditions(
  perception: CharacterPerception,
  conditions: string[],
): CharacterPerception {
  const normalizedConditions = new Set(conditions.map(normalizeCondition));
  return {
    ...perception,
    vision: hasAnyCondition(normalizedConditions, ["blinded", "aveugle"])
      ? "none"
      : perception.vision,
    hearing: hasAnyCondition(normalizedConditions, ["deafened", "assourdi", "sourd"])
      ? "none"
      : perception.hearing,
    speech: hasAnyCondition(normalizedConditions, ["silenced", "silence", "muet", "baillonne"])
      ? "none"
      : perception.speech,
    languages: perception.languages.map((language) => ({ ...language })),
  };
}

export function getMaximumLanguageMasteryPoints(level: number): number {
  return Math.min(18, 12 + Math.floor((Math.max(1, level) - 1) / 3));
}

export function createCommunicationPayload(
  content: string,
  channel: LanguageChannel,
  languageId: string,
  producer: CharacterPerception,
): CommunicationPayload | null {
  const normalizedContent = content.trim().slice(0, 1200);
  if (!normalizedContent) return null;
  const language = getLanguageMastery(producer, languageId);
  const producerMastery = language?.[channel] ?? "none";
  const canEmit = channel === "oral"
    ? producer.speech !== "none"
    : true;

  return {
    channel,
    languageId: language?.languageId ?? normalizeLanguageId(languageId),
    languageName: language?.name ?? "Langue inconnue",
    content: normalizedContent,
    emitted: canEmit,
    producerMastery: applySensePenalty(producerMastery, channel === "oral" ? producer.speech : "normal"),
  };
}

export function resolveCommunicationForObserver(
  communication: CommunicationPayload,
  observer: CharacterPerception,
  seed: string,
): ResolvedCommunication {
  const observerSense = communication.channel === "oral" ? observer.hearing : observer.vision;
  const observerLanguage = getLanguageMastery(observer, communication.languageId);
  const observerMastery = applySensePenalty(
    observerLanguage?.[communication.channel] ?? "none",
    observerSense,
  );
  const mastery = minimumMastery(communication.producerMastery, observerMastery);

  if (!communication.emitted || observerSense === "none") {
    return {
      content: null,
      perception: createPerception(communication, mastery, "imperceptible", false),
    };
  }
  if (mastery === "none") {
    return {
      content: communication.channel === "oral"
        ? "Des paroles dans une langue inconnue vous échappent."
        : "Ces signes vous sont incompréhensibles.",
      perception: createPerception(communication, mastery, "unknown", false),
    };
  }
  if (mastery === "fragments" || mastery === "limited") {
    return {
      content: maskCommunicationContent(communication.content, mastery, seed),
      perception: createPerception(communication, mastery, "partial", true),
    };
  }
  return {
    content: communication.content,
    perception: createPerception(communication, mastery, "clear", true),
  };
}

export function describeCommunicationForNarrator(
  communication: CommunicationPayload | null,
): string | null {
  if (!communication) return null;
  const action = communication.channel === "oral" ? "parler" : "écrire";
  if (!communication.emitted) {
    return `Contrainte de perception: le personnage tente de ${action}, mais aucun message n'est émis. Ne reproduis pas ses mots.`;
  }
  return `Contrainte de perception: le passage entre guillemets est en ${communication.languageName} (${languageMasteryLabels[communication.producerMastery]}). Ne le répète pas et ne le traduis pas dans la narration publique.`;
}

export function normalizeLanguageId(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  return normalized || "langue-inconnue";
}

function normalizeLanguageMastery(value: unknown): CharacterLanguageMastery[] {
  if (!isRecord(value)) return [];
  const name = typeof value.name === "string" ? value.name.trim().slice(0, 80) : "";
  const sourceId = typeof value.languageId === "string"
    ? value.languageId
    : typeof value.id === "string"
      ? value.id
      : name;
  const languageId = normalizeLanguageId(sourceId);
  if (!name || languageId === "langue-inconnue") return [];
  return [{
    languageId,
    name,
    oral: normalizeMastery(value.oral),
    written: normalizeMastery(value.written),
  }];
}

function normalizeMastery(value: unknown): LanguageMasteryLevel {
  return languageMasteryLevels.includes(value as LanguageMasteryLevel)
    ? value as LanguageMasteryLevel
    : "none";
}

function normalizeSense(value: unknown): SenseCapability {
  return value === "impaired" || value === "none" ? value : "normal";
}

function masteryRank(level: LanguageMasteryLevel): number {
  return languageMasteryLevels.indexOf(level);
}

function minimumMastery(
  first: LanguageMasteryLevel,
  second: LanguageMasteryLevel,
): LanguageMasteryLevel {
  return languageMasteryLevels[Math.min(masteryRank(first), masteryRank(second))] ?? "none";
}

function applySensePenalty(
  mastery: LanguageMasteryLevel,
  sense: SenseCapability,
): LanguageMasteryLevel {
  if (sense === "none") return "none";
  if (sense === "normal") return mastery;
  return languageMasteryLevels[Math.max(0, masteryRank(mastery) - 1)] ?? "none";
}

function createPerception(
  communication: CommunicationPayload,
  mastery: LanguageMasteryLevel,
  status: CommunicationPerception["status"],
  languageRecognized: boolean,
): CommunicationPerception {
  return {
    channel: communication.channel,
    languageId: languageRecognized ? communication.languageId : "unknown",
    ...(languageRecognized ? { languageName: communication.languageName } : {}),
    mastery,
    status,
  };
}

function maskCommunicationContent(
  content: string,
  mastery: "fragments" | "limited",
  seed: string,
): string {
  const parts = content.split(/([\p{L}\p{N}][\p{L}\p{M}\p{N}'’_-]*)/gu);
  const wordIndexes = parts.flatMap((part, index) => /[\p{L}\p{N}]/u.test(part) && index % 2 === 1 ? [index] : []);
  const revealThreshold = mastery === "fragments" ? 28 : 76;
  const revealIndexes = new Set(wordIndexes.filter((index) => stablePercent(`${seed}:${index}`) < revealThreshold));
  if (mastery === "limited" && wordIndexes.length && revealIndexes.size === 0) {
    revealIndexes.add(wordIndexes[stablePercent(seed) % wordIndexes.length]!);
  }
  if (wordIndexes.length > 1 && revealIndexes.size === wordIndexes.length) {
    revealIndexes.delete(wordIndexes[stablePercent(`${seed}:mask`) % wordIndexes.length]!);
  }
  return parts.map((part, index) => wordIndexes.includes(index) && !revealIndexes.has(index) ? "[…]" : part)
    .join("")
    .replace(/(?:\[…\]\s*){2,}/gu, "[…] ")
    .trim();
}

function stablePercent(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100;
}

function normalizeCondition(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .trim();
}

function hasAnyCondition(conditions: Set<string>, aliases: string[]): boolean {
  return aliases.some((alias) => conditions.has(alias));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

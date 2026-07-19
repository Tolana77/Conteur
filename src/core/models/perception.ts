export type LanguageMasteryLevel = "none" | "fragments" | "limited" | "fluent";
export type LanguageChannel = "oral" | "written";
export type SenseCapability = "normal" | "impaired" | "none";

export interface CharacterLanguageMastery {
  languageId: string;
  name: string;
  /** Comprendre à l'oral et parler sont représentés par une même maîtrise. */
  oral: LanguageMasteryLevel;
  /** Lire et écrire sont indépendants de la maîtrise orale. */
  written: LanguageMasteryLevel;
}

export interface CharacterPerception {
  vision: SenseCapability;
  hearing: SenseCapability;
  speech: SenseCapability;
  languages: CharacterLanguageMastery[];
}

export interface CommunicationPayload {
  channel: LanguageChannel;
  languageId: string;
  languageName: string;
  content: string;
  emitted: boolean;
  producerMastery: LanguageMasteryLevel;
}

export type CommunicationPerceptionStatus =
  | "clear"
  | "partial"
  | "unknown"
  | "imperceptible";

export interface CommunicationPerception {
  channel: LanguageChannel;
  languageId: string;
  languageName?: string;
  mastery: LanguageMasteryLevel;
  status: CommunicationPerceptionStatus;
}

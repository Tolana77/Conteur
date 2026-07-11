import type { CSSProperties, ReactNode } from "react";

export type GameStat = "force" | "dexterite" | "constitution" | "intelligence" | "sagesse" | "charisme";

interface GameTerm {
  label: string;
  stat: GameStat;
  terms: string[];
}

export const gameStatTheme: Record<GameStat, { color: string; label: string }> = {
  force: { color: "#661309", label: "Force" },
  dexterite: { color: "#5FA85A", label: "Dextérité" },
  constitution: { color: "#E0792A", label: "Constitution" },
  intelligence: { color: "#C7007E", label: "Intelligence" },
  sagesse: { color: "#5B4FCB", label: "Sagesse" },
  charisme: { color: "#F5D24A", label: "Charisme" },
};

export const gameSkillStats: Array<{ label: string; stat: GameStat; terms: string[] }> = [
  { label: "Acrobaties", stat: "dexterite", terms: ["acrobaties", "acrobatie"] },
  { label: "Arcanes", stat: "intelligence", terms: ["arcanes", "arcane"] },
  { label: "Athlétisme", stat: "force", terms: ["athlétisme", "athletisme"] },
  { label: "Discrétion", stat: "dexterite", terms: ["discrétion", "discretion", "furtivité", "furtivite"] },
  { label: "Dressage", stat: "sagesse", terms: ["dressage"] },
  { label: "Escamotage", stat: "dexterite", terms: ["escamotage"] },
  { label: "Histoire", stat: "intelligence", terms: ["histoire"] },
  { label: "Intimidation", stat: "charisme", terms: ["intimidation"] },
  { label: "Intuition", stat: "sagesse", terms: ["intuition"] },
  { label: "Investigation", stat: "intelligence", terms: ["investigation", "enquête", "enquete"] },
  { label: "Médecine", stat: "sagesse", terms: ["médecine", "medecine"] },
  { label: "Nature", stat: "intelligence", terms: ["nature"] },
  { label: "Perception", stat: "sagesse", terms: ["perception", "perception passive"] },
  { label: "Persuasion", stat: "charisme", terms: ["persuasion"] },
  { label: "Religion", stat: "intelligence", terms: ["religion"] },
  { label: "Représentation", stat: "charisme", terms: ["représentation", "representation", "performance"] },
  { label: "Survie", stat: "sagesse", terms: ["survie"] },
  { label: "Tromperie", stat: "charisme", terms: ["tromperie", "mensonge"] },
];

const gameTerms: GameTerm[] = [
  { label: "Force", stat: "force", terms: ["force", "for"] },
  { label: "Dextérité", stat: "dexterite", terms: ["dextérité", "dexterite", "dex"] },
  { label: "Constitution", stat: "constitution", terms: ["constitution", "con"] },
  { label: "Intelligence", stat: "intelligence", terms: ["intelligence", "int"] },
  { label: "Sagesse", stat: "sagesse", terms: ["sagesse", "sag"] },
  { label: "Charisme", stat: "charisme", terms: ["charisme", "cha"] },
  ...gameSkillStats,
];

const termLookup = new Map<string, GameTerm>();

gameTerms.forEach((term) => {
  term.terms.forEach((alias) => {
    termLookup.set(alias.toLowerCase(), term);
  });
});

const termPattern = Array.from(termLookup.keys())
  .sort((first, second) => second.length - first.length)
  .map(escapeRegExp)
  .join("|");
const gameTermRegex = new RegExp(`(?<![A-Za-zÀ-ÖØ-öø-ÿ])(${termPattern})(?![A-Za-zÀ-ÖØ-öø-ÿ])`, "giu");

export function HighlightedGameText({ text }: { text: string }) {
  return <>{renderHighlightedGameText(text)}</>;
}

export function renderHighlightedGameText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  Array.from(text.matchAll(gameTermRegex)).forEach((match, index) => {
    const matchedText = match[0];
    const matchIndex = match.index ?? 0;
    const term = termLookup.get(matchedText.toLowerCase());

    if (!term) {
      return;
    }

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }

    nodes.push(
      <span
        key={`${matchedText}-${matchIndex}-${index}`}
        style={getGameTermTextStyle(term.stat)}
      >
        {matchedText}
      </span>,
    );
    lastIndex = matchIndex + matchedText.length;
  });

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

export function getGameTermTextStyle(stat: GameStat): CSSProperties {
  const color = gameStatTheme[stat].color;

  return {
    color,
    fontWeight: 800,
    textShadow: `0 0 10px ${color}55`,
  };
}

export function getGameTermSurfaceStyle(stat: GameStat): CSSProperties {
  const color = gameStatTheme[stat].color;

  return {
    background: `linear-gradient(135deg, ${color}33 0%, ${color}14 48%, rgba(21,18,26,0.72) 100%)`,
    borderColor: `${color}AA`,
    boxShadow: `inset 0 0 0 1px ${color}22`,
  };
}

export function getGameTermSolidSurfaceStyle(stat: GameStat): CSSProperties {
  const color = gameStatTheme[stat].color;

  return {
    background: color,
    borderColor: color,
    color: stat === "charisme" ? "#15121A" : "#E4D8BE",
    boxShadow: `0 0 0 1px ${color}66`,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

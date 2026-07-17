import { useState } from "react";
import { CampaignConsole } from "../features/campaign/CampaignConsole";
import { CharacterList } from "../features/character/CharacterList";
import { CharacterSheet } from "../features/character/CharacterSheet";
import { ChatWindow } from "../features/chat/ChatWindow";
import { CombatMap } from "../features/combat/CombatMap";
import { DicePanel } from "../features/dice/DicePanel";
import { GenreSelection } from "../features/world/GenreSelection";
import { WorldStatus } from "../features/world/WorldStatus";

type PanelId = "left" | "center" | "right" | "combat" | "genre";

const panels: Array<{ id: PanelId; label: string; mobileLabel: string }> = [
  { id: "left", label: "Personnages", mobileLabel: "Persos" },
  { id: "combat", label: "Combat", mobileLabel: "Combat" },
  { id: "center", label: "Lecture", mobileLabel: "Lecture" },
  { id: "right", label: "Fiche", mobileLabel: "Fiche" },
  { id: "genre", label: "Univers", mobileLabel: "Univers" },
];

function getNextPanel(currentPanel: PanelId, direction: 1 | -1): PanelId {
  const currentIndex = panels.findIndex((panel) => panel.id === currentPanel);
  const nextIndex = Math.max(0, Math.min(panels.length - 1, currentIndex + direction));

  return panels[nextIndex]?.id ?? "center";
}

export function GamePage() {
  const [consoleView, setConsoleView] = useState<"campaign" | "world" | null>(null);
  const [activePanel, setActivePanel] = useState<PanelId>("center");
  const [mapTargetIntentId, setMapTargetIntentId] = useState<string | null>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  function handleTouchEnd(clientX: number) {
    if (touchStart === null) {
      return;
    }

    const delta = clientX - touchStart;

    if (Math.abs(delta) < 48) {
      setTouchStart(null);
      return;
    }

    setActivePanel((currentPanel) => getNextPanel(currentPanel, delta < 0 ? 1 : -1));

    setTouchStart(null);
  }

  function renderActivePanel() {
    if (activePanel === "left") {
      return (
        <aside className="paper-surface h-full min-h-0 overflow-y-auto p-4">
          <div className="space-y-5">
            <WorldStatus />
            <CharacterList />
            <DicePanel />
          </div>
        </aside>
      );
    }

    if (activePanel === "right") {
      return (
        <div className="h-full min-h-0">
          <CharacterSheet onNavigateToReading={() => setActivePanel("center")} />
        </div>
      );
    }

    if (activePanel === "genre") {
      return <GenreSelection onOpenWorldWorkshop={() => setConsoleView("world")} />;
    }

    if (activePanel === "combat") {
      return (
        <CombatMap
          mapTargetIntentId={mapTargetIntentId}
          onCancelMapTarget={() => setMapTargetIntentId(null)}
          onMapTargeted={() => {
            setMapTargetIntentId(null);
            setActivePanel("center");
          }}
          onNavigateToReading={() => setActivePanel("center")}
        />
      );
    }

    return (
      <div className="flex h-full min-h-0">
        <ChatWindow
          onRequestMapTarget={(intentId) => {
            setMapTargetIntentId(intentId);
            setActivePanel("combat");
          }}
        />
      </div>
    );
  }

  return (
    <main className="app-shell h-screen overflow-hidden">
      <div className="flex h-full flex-col">
        <header className="shrink-0 border-b border-[#9C7A2E]/25 bg-[#15121A] px-2 py-2 text-[#E4D8BE] sm:px-4">
          <div className="flex items-center gap-2">
          <nav
            className="grid flex-1 touch-pan-x grid-cols-5 gap-1 rounded border border-[#9C7A2E]/20 bg-[#221E29] p-1"
            onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
            onTouchStart={(event) => setTouchStart(event.changedTouches[0]?.clientX ?? null)}
          >
            {panels.map((panel) => (
              <button
                className={`min-w-0 rounded px-0.5 py-2 text-[10px] font-semibold sm:px-2 sm:text-sm ${
                  activePanel === panel.id
                    ? "bg-[#5A2233] text-[#E4D8BE]"
                    : "text-[#E4D8BE]/75 hover:bg-[#6B4A5C]/25"
                }`}
                key={panel.id}
                onClick={() => setActivePanel(panel.id)}
                type="button"
              >
                <span className="sm:hidden">{panel.mobileLabel}</span>
                <span className="hidden sm:inline">{panel.label}</span>
              </button>
            ))}
          </nav>
            <button
              className="h-full rounded border border-[#9C7A2E]/30 bg-[#221E29] px-2 py-2 text-sm font-bold text-[#E4D8BE] hover:bg-[#5A2233]/50 sm:px-3"
              onClick={() => setConsoleView("campaign")}
              type="button"
            >
              ...
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {renderActivePanel()}
        </div>
      </div>

      {consoleView ? (
        <CampaignConsole initialView={consoleView} onClose={() => setConsoleView(null)} />
      ) : null}
    </main>
  );
}

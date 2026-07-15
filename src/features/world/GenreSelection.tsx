import { useGameStore } from "../../store/useGameStore";

export function GenreSelection({ onOpenWorldWorkshop }: { onOpenWorldWorkshop: () => void }) {
  const campaign = useGameStore((state) => state.campaign);
  const restartCampaign = useGameStore((state) => state.restartCampaign);
  const world = campaign.world;

  function confirmRestart() {
    const confirmed = window.confirm(
      `Recommencer « ${campaign.name} » depuis son état initial ? Toute la progression de cette partie sera perdue.`,
    );
    if (confirmed) restartCampaign();
  }

  return (
    <section className="paper-surface h-full min-h-0 overflow-y-auto p-4">
      <div className="mx-auto max-w-[820px] space-y-5">
        <header className="border-b border-[#9C7A2E]/30 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="rune-label text-xs">Univers actif</p>
              <h2 className="ink-heading text-2xl font-bold">{world.name ?? campaign.name}</h2>
              <p className="mt-2 max-w-2xl text-sm text-[#E4D8BE]/75">
                {world.pitch ?? world.lore}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded border border-[#9C7A2E]/45 px-4 py-2 text-sm text-[#E4D8BE]/80 hover:bg-[#9C7A2E]/10"
                onClick={confirmRestart}
                type="button"
              >
                Recommencer la campagne
              </button>
              <button
                className="fantasy-button rounded px-4 py-2 text-sm font-semibold"
                onClick={onOpenWorldWorkshop}
                type="button"
              >
                Créer un monde
              </button>
            </div>
          </div>
          {world.themes?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {world.themes.map((theme) => (
                <span className="rounded border border-[#9C7A2E]/25 px-2 py-1 text-xs uppercase text-[#9C7A2E]" key={theme}>
                  {theme}
                </span>
              ))}
            </div>
          ) : null}
        </header>

        {world.facts.length ? (
          <section>
            <h3 className="rune-label mb-2 text-sm">Vérités publiques</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {world.facts.map((fact) => (
                <p className="border-l-2 border-[#9C7A2E]/50 bg-[#221E29] px-3 py-2 text-sm text-[#E4D8BE]/75" key={fact}>
                  {fact}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {world.factions?.length ? (
          <section>
            <h3 className="rune-label mb-2 text-sm">Factions</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {world.factions.map((faction) => (
                <article className="manuscript-panel rounded p-3" key={faction.id}>
                  <h4 className="ink-heading font-bold">{faction.name}</h4>
                  <p className="mt-1 text-sm text-[#E4D8BE]/70">{faction.goal}</p>
                  <p className="mt-2 text-xs text-[#9C7A2E]">{faction.relationship}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {world.conflicts?.length ? (
          <section>
            <h3 className="rune-label mb-2 text-sm">Tensions actives</h3>
            <div className="space-y-2">
              {world.conflicts.map((conflict) => (
                <article className="border-y border-[#9C7A2E]/20 bg-[#221E29]/70 px-3 py-3" key={conflict.id}>
                  <h4 className="font-semibold text-[#E4D8BE]">{conflict.title}</h4>
                  <p className="mt-1 text-sm text-[#E4D8BE]/70">{conflict.description}</p>
                  <p className="mt-2 text-xs text-[#9C7A2E]">Enjeu : {conflict.stakes}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {world.hooks?.length ? (
          <section>
            <h3 className="rune-label mb-2 text-sm">Pistes ouvertes</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {world.hooks.map((hook) => (
                <article className="manuscript-panel rounded p-3" key={hook.id}>
                  <h4 className="ink-heading font-bold">{hook.title}</h4>
                  <p className="mt-1 text-sm text-[#E4D8BE]/70">{hook.premise}</p>
                  <p className="mt-2 text-xs text-[#9C7A2E]">{hook.urgency}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}

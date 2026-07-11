import type { NarrativeGenre } from "../../ui/theme";

const genres: Array<{
  id: NarrativeGenre;
  title: string;
  description: string;
  geometry: string;
}> = [
  {
    id: "fantasy",
    title: "Fantasy gothique",
    description: "Vitraux, ferronnerie, serments anciens et cités sous la brume.",
    geometry: "Vitrail angulaire",
  },
  {
    id: "futuristic",
    title: "Futuriste",
    description: "Filigranes circuits, archives stellaires et pactes de données.",
    geometry: "Circuit doré",
  },
  {
    id: "steampunk",
    title: "Steampunk",
    description: "Rouages, cuivre assombri, fumée basse et machines à secrets.",
    geometry: "Rouages",
  },
  {
    id: "realistic",
    title: "Réaliste",
    description: "Trait d'encre sobre, tension humaine et conséquences directes.",
    geometry: "Filet d'encre",
  },
];

export function GenreSelection() {
  return (
    <section className="paper-surface h-full min-h-0 overflow-y-auto p-4">
      <div className="mx-auto max-w-[760px] space-y-4">
        <header className="manuscript-panel rounded p-4">
          <p className="rune-label text-xs">Univers narratif</p>
          <h2 className="ink-heading text-2xl font-bold">Choisir le genre actif</h2>
          <p className="mt-2 text-sm text-[#E4D8BE]/75">
            Le genre pilotera plus tard la bordure de lettrine, le vocabulaire visuel et les
            modules du Conteur.
          </p>
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          {genres.map((genre) => (
            <button
              className="manuscript-panel jagged-card p-4 text-left hover:border-[#9C7A2E]"
              key={genre.id}
              type="button"
            >
              <p className="rune-label text-xs">{genre.geometry}</p>
              <h3 className="ink-heading mt-2 text-xl font-bold">{genre.title}</h3>
              <p className="mt-2 text-sm text-[#E4D8BE]/75">{genre.description}</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

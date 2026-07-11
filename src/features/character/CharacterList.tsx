import { useGameStore } from "../../store/useGameStore";

export function CharacterList() {
  const characters = useGameStore((state) => state.characters);
  const selectedCharacterId = useGameStore((state) => state.selectedCharacterId);
  const selectCharacter = useGameStore((state) => state.selectCharacter);

  return (
    <section className="space-y-3">
      <h2 className="rune-label text-sm">Personnages</h2>
      <div className="space-y-2">
        {characters.map((character) => {
          const isSelected = character.id === selectedCharacterId;

          return (
            <button
              className={`jagged-card w-full border px-3 py-2 text-left text-sm ${
                isSelected
                  ? "border-[#9C7A2E] bg-[#5A2233]"
                  : "manuscript-card hover:bg-[#2A2433]"
              }`}
              key={character.id}
              onClick={() => selectCharacter(character.id)}
              type="button"
            >
              <span className="ink-heading block font-semibold">{character.name}</span>
              <span className="text-[#E4D8BE]/60">
                {character.espece} · {character.classe} · niv. {character.niveau}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

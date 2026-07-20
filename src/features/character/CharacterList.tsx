import { useGameStore } from "../../store/useGameStore";
import { useMultiplayerStore } from "../multiplayer/useMultiplayerStore";
import {
  isMultiplayerAdmin,
  isMultiplayerGm,
  multiplayerRoleLabels,
} from "../multiplayer/permissions";

export function CharacterList() {
  const characters = useGameStore((state) => state.characters);
  const selectedCharacterId = useGameStore((state) => state.selectedCharacterId);
  const selectCharacter = useGameStore((state) => state.selectCharacter);
  const room = useMultiplayerStore((state) => state.room);
  const self = useMultiplayerStore((state) => state.self);
  const members = useMultiplayerStore((state) => state.members);
  const canInspectAll = !room || isMultiplayerGm(self) || isMultiplayerAdmin(self);
  const claimedCharacterIds = new Set(members.flatMap((member) =>
    member.characterId ? [member.characterId] : []));

  return (
    <section className="space-y-3">
      <h2 className="rune-label text-sm">Personnages</h2>

      {room ? (
        <div className="space-y-2">
          {members.map((member) => {
            const character = characters.find((candidate) => candidate.id === member.characterId);
            const isSelected = character?.id === selectedCharacterId;
            return (
              <button
                className={`w-full border bg-[#15121A]/55 px-3 py-2 text-left ${isSelected ? "bg-[#5A2233]/55" : ""}`}
                disabled={!character || (!canInspectAll && member.userId !== self?.userId)}
                key={member.userId}
                onClick={() => character && selectCharacter(character.id)}
                style={{ borderColor: `${member.playerColor}AA` }}
                type="button"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: member.playerColor }} />
                    <strong className="truncate text-sm font-medium" style={{ color: member.playerColor }}>
                      {member.displayName}
                    </strong>
                  </span>
                  <span className="text-[10px] uppercase text-[#E4D8BE]/40">
                    {multiplayerRoleLabels[member.role]}{member.isAdmin ? " · Admin" : ""}
                  </span>
                </span>
                {character ? (
                  <span className="mt-1 block pl-[18px]">
                    <span className="ink-heading block text-base font-semibold text-[#E4D8BE]">{character.name}</span>
                    <span className="text-xs text-[#E4D8BE]/55">
                      {character.espece} · {character.classe} · niv. {character.niveau}
                    </span>
                  </span>
                ) : (
                  <span className="mt-1 block pl-[18px] text-xs italic text-[#E4D8BE]/45">
                    {member.role === "spectator" ? "Observe la partie" : "Création du personnage en cours"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {characters.map((character) => (
            <CharacterButton
              character={character}
              isSelected={character.id === selectedCharacterId}
              key={character.id}
              onSelect={() => selectCharacter(character.id)}
            />
          ))}
        </div>
      )}

      {room && canInspectAll ? (
        <div className="space-y-2 border-t border-[#9C7A2E]/20 pt-3">
          <p className="text-[10px] uppercase text-[#9C7A2E]/70">Sans joueur</p>
          {characters.filter((character) => !claimedCharacterIds.has(character.id)).map((character) => (
            <CharacterButton
              character={character}
              isSelected={character.id === selectedCharacterId}
              key={character.id}
              onSelect={() => selectCharacter(character.id)}
            />
          ))}
          {characters.every((character) => claimedCharacterIds.has(character.id)) ? (
            <p className="text-xs text-[#E4D8BE]/40">Aucun personnage libre dans la campagne.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CharacterButton({
  character,
  isSelected,
  onSelect,
}: {
  character: { id: string; name: string; espece: string; classe: string; niveau: number };
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`jagged-card w-full border px-3 py-2 text-left text-sm ${
        isSelected ? "border-[#9C7A2E] bg-[#5A2233]" : "manuscript-card hover:bg-[#2A2433]"
      }`}
      onClick={onSelect}
      type="button"
    >
      <span className="ink-heading block font-semibold">{character.name}</span>
      <span className="text-[#E4D8BE]/60">
        {character.espece} · {character.classe} · niv. {character.niveau}
      </span>
    </button>
  );
}

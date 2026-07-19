import { useMemo, useState, type FormEvent } from "react";
import { useGameStore } from "../../store/useGameStore";
import { useMultiplayerStore } from "./useMultiplayerStore";

export function MultiplayerPanel({ onClose }: { onClose: () => void }) {
  const configured = useMultiplayerStore((state) => state.configured);
  const missingConfiguration = useMultiplayerStore((state) => state.missingConfiguration);
  const phase = useMultiplayerStore((state) => state.phase);
  const room = useMultiplayerStore((state) => state.room);
  const self = useMultiplayerStore((state) => state.self);
  const members = useMultiplayerStore((state) => state.members);
  const incomingTurnCount = useMultiplayerStore((state) => state.incomingTurns.length);
  const incomingCharacterRequestCount = useMultiplayerStore(
    (state) => state.incomingCharacterRequests.length,
  );
  const pendingTurn = useMultiplayerStore((state) => state.pendingTurn);
  const awaitingHostState = useMultiplayerStore((state) => state.awaitingHostState);
  const error = useMultiplayerStore((state) => state.error);
  const createRoom = useMultiplayerStore((state) => state.createRoom);
  const joinRoom = useMultiplayerStore((state) => state.joinRoom);
  const leaveRoom = useMultiplayerStore((state) => state.leaveRoom);
  const assignCharacter = useMultiplayerStore((state) => state.assignCharacter);
  const setMemberRole = useMultiplayerStore((state) => state.setMemberRole);
  const clearError = useMultiplayerStore((state) => state.clearError);
  const characters = useGameStore((state) => state.characters);
  const [displayName, setDisplayName] = useState(self?.displayName ?? "");
  const [joinCode, setJoinCode] = useState("");
  const [joinRole, setJoinRole] = useState<"player" | "spectator">("player");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState(false);
  const claimedCharacters = useMemo(
    () => new Map(members.flatMap((member) => member.characterId ? [[member.characterId, member.userId]] : [])),
    [members],
  );

  async function run(action: string, operation: () => Promise<void>) {
    setBusyAction(action);
    clearError();
    try {
      await operation();
    } catch {
      // Le store expose déjà une erreur lisible dans le panneau.
    } finally {
      setBusyAction(null);
    }
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("create", () => createRoom(displayName));
  }

  function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("join", () => joinRoom(joinCode, displayName, joinRole));
  }

  async function copyJoinCode() {
    if (!room) return;
    await navigator.clipboard.writeText(room.joinCode);
    setCopyNotice(true);
    window.setTimeout(() => setCopyNotice(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-30 bg-[#15121A]/85 p-3 backdrop-blur-sm">
      <section className="mx-auto flex h-full max-w-2xl flex-col overflow-hidden rounded border border-[#9C7A2E]/45 bg-[#221E29]">
        <header className="flex items-center justify-between border-b border-[#9C7A2E]/25 px-4 py-3">
          <div>
            <p className="rune-label text-xs">Partie en ligne</p>
            <h2 className="ink-heading text-xl font-bold">Groupe</h2>
          </div>
          <button className="fantasy-button rounded px-3 py-2 text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? (
            <div className="mb-4 flex items-start justify-between gap-3 border border-[#7A1F2E] bg-[#7A1F2E]/20 px-3 py-2 text-sm text-[#E4D8BE]">
              <span>{error}</span>
              <button className="text-[#E4D8BE]/65" onClick={clearError} type="button">×</button>
            </div>
          ) : null}

          {!configured ? (
            <section className="manuscript-card p-4">
              <h3 className="ink-heading text-lg font-semibold">Configuration requise</h3>
              <p className="mt-2 text-sm text-[#E4D8BE]/70">
                Variables absentes : {missingConfiguration.join(", ")}.
              </p>
              <p className="mt-2 text-xs text-[#E4D8BE]/50">
                Le mode local reste actif tant que Supabase n'est pas configuré.
              </p>
            </section>
          ) : room && self ? (
            <ConnectedRoom
              assignCharacter={(userId, characterId) => run(`assign:${userId}`, () => assignCharacter(userId, characterId))}
              awaitingHostState={awaitingHostState}
              busyAction={busyAction}
              characters={characters}
              claimedCharacters={claimedCharacters}
              copyJoinCode={copyJoinCode}
              copyNotice={copyNotice}
              incomingTurnCount={incomingTurnCount}
              incomingCharacterRequestCount={incomingCharacterRequestCount}
              leaveRoom={() => run("leave", leaveRoom)}
              members={members}
              pendingTurn={pendingTurn}
              phase={phase}
              room={room}
              self={self}
              setMemberRole={(userId, role) => run(`role:${userId}`, () => setMemberRole(userId, role))}
            />
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              <form className="manuscript-card p-4" onSubmit={handleCreate}>
                <h3 className="ink-heading text-lg font-semibold">Créer une partie</h3>
                <NameField onChange={setDisplayName} value={displayName} />
                <button
                  className="fantasy-button mt-4 w-full rounded px-3 py-2 text-sm font-semibold"
                  disabled={busyAction !== null}
                  type="submit"
                >
                  {busyAction === "create" ? "Création..." : "Ouvrir le salon"}
                </button>
              </form>

              <form className="manuscript-card p-4" onSubmit={handleJoin}>
                <h3 className="ink-heading text-lg font-semibold">Rejoindre</h3>
                <NameField onChange={setDisplayName} value={displayName} />
                <label className="mt-3 block text-xs uppercase text-[#9C7A2E]">
                  Code
                  <input
                    className="mt-1 w-full rounded border border-[#9C7A2E]/30 bg-[#15121A] px-3 py-2 text-center font-mono text-lg uppercase text-[#E4D8BE] outline-none focus:border-[#9C7A2E]"
                    maxLength={6}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    placeholder="A1B2C3"
                    value={joinCode}
                  />
                </label>
                <div className="mt-3 grid grid-cols-2 border border-[#9C7A2E]/25 p-1">
                  {(["player", "spectator"] as const).map((role) => (
                    <button
                      className={`px-2 py-1.5 text-sm ${joinRole === role ? "bg-[#5A2233] text-[#E4D8BE]" : "text-[#E4D8BE]/60"}`}
                      key={role}
                      onClick={() => setJoinRole(role)}
                      type="button"
                    >
                      {role === "player" ? "Joueur" : "Spectateur"}
                    </button>
                  ))}
                </div>
                <button
                  className="fantasy-button mt-4 w-full rounded px-3 py-2 text-sm font-semibold"
                  disabled={busyAction !== null}
                  type="submit"
                >
                  {busyAction === "join" ? "Connexion..." : "Entrer"}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function NameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="mt-3 block text-xs uppercase text-[#9C7A2E]">
      Votre nom
      <input
        autoComplete="nickname"
        className="mt-1 w-full rounded border border-[#9C7A2E]/30 bg-[#15121A] px-3 py-2 text-sm normal-case text-[#E4D8BE] outline-none focus:border-[#9C7A2E]"
        maxLength={40}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Nom autour de la table"
        value={value}
      />
    </label>
  );
}

type ConnectedRoomProps = {
  assignCharacter: (userId: string, characterId: string | null) => void;
  awaitingHostState: boolean;
  busyAction: string | null;
  characters: Array<{ id: string; name: string; classe: string; niveau: number }>;
  claimedCharacters: Map<string, string>;
  copyJoinCode: () => void;
  copyNotice: boolean;
  incomingTurnCount: number;
  incomingCharacterRequestCount: number;
  leaveRoom: () => void;
  members: ReturnType<typeof useMultiplayerStore.getState>["members"];
  pendingTurn: ReturnType<typeof useMultiplayerStore.getState>["pendingTurn"];
  phase: ReturnType<typeof useMultiplayerStore.getState>["phase"];
  room: NonNullable<ReturnType<typeof useMultiplayerStore.getState>["room"]>;
  self: NonNullable<ReturnType<typeof useMultiplayerStore.getState>["self"]>;
  setMemberRole: (userId: string, role: "admin" | "player" | "spectator") => void;
};

function ConnectedRoom(props: ConnectedRoomProps) {
  const canAssignOthers = props.self.role === "host";
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="manuscript-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase text-[#9C7A2E]">{props.room.status === "lobby" ? "Salon" : "Partie"}</p>
              <h3 className="ink-heading text-xl font-semibold">{props.room.name}</h3>
            </div>
            <span className={`mt-1 h-2.5 w-2.5 rounded-full ${props.phase === "connected" ? "bg-[#5FA85A]" : "bg-[#B5612A]"}`} />
          </div>
          {props.awaitingHostState ? (
            <p className="mt-2 text-xs text-[#E4D8BE]/55">En attente de la synchronisation du MJ.</p>
          ) : props.pendingTurn ? (
            <p className="mt-2 text-xs text-[#E4D8BE]/55">Votre intention attend la résolution du MJ.</p>
          ) : props.self.role === "host" && props.incomingTurnCount > 0 ? (
            <p className="mt-2 text-xs text-[#E4D8BE]/55">
              {props.incomingTurnCount} intention{props.incomingTurnCount > 1 ? "s" : ""} en attente.
            </p>
          ) : props.self.role === "host" && props.incomingCharacterRequestCount > 0 ? (
            <p className="mt-2 text-xs text-[#E4D8BE]/55">
              {props.incomingCharacterRequestCount} personnage{props.incomingCharacterRequestCount > 1 ? "s" : ""} en préparation.
            </p>
          ) : null}
        </div>
        <button
          className="border border-[#9C7A2E]/45 bg-[#15121A] px-5 py-3 text-center hover:bg-[#5A2233]/35"
          onClick={props.copyJoinCode}
          type="button"
        >
          <span className="block text-[10px] uppercase text-[#9C7A2E]">{props.copyNotice ? "Copié" : "Code"}</span>
          <span className="block font-mono text-xl text-[#E4D8BE]">{props.room.joinCode}</span>
        </button>
      </section>

      <section>
        <h3 className="rune-label mb-2 text-sm">Participants</h3>
        <div className="space-y-2">
          {props.members.map((member) => {
            const canAssign = member.role !== "spectator" && canAssignOthers;
            return (
              <article className="grid gap-2 border border-[#9C7A2E]/20 bg-[#15121A]/55 px-3 py-2 sm:grid-cols-[1fr_minmax(170px,auto)] sm:items-center" key={member.userId}>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[#E4D8BE]">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${member.online ? "" : "opacity-35"}`}
                      style={{ backgroundColor: member.playerColor }}
                    />
                    <span className="truncate" style={{ color: member.playerColor }}>{member.displayName}</span>
                    {member.userId === props.self.userId ? <span className="text-[10px] text-[#9C7A2E]">VOUS</span> : null}
                  </p>
                  <p className="ml-4 text-[11px] text-[#E4D8BE]/45">
                    {member.role === "host" ? "MJ" : member.role === "admin" ? "Admin" : member.role === "player" ? "Joueur" : "Spectateur"}
                  </p>
                  {props.self.role === "host" && member.role !== "host" ? (
                    <select
                      className="ml-4 mt-1 border border-[#9C7A2E]/20 bg-[#221E29] px-1.5 py-1 text-[11px] text-[#E4D8BE]/70"
                      disabled={props.busyAction === `role:${member.userId}`}
                      onChange={(event) => props.setMemberRole(
                        member.userId,
                        event.target.value as "admin" | "player" | "spectator",
                      )}
                      value={member.role}
                    >
                      <option value="player">Joueur</option>
                      <option value="admin">Admin</option>
                      <option value="spectator">Spectateur</option>
                    </select>
                  ) : null}
                </div>
                {canAssign ? (
                  <select
                    className="w-full border border-[#9C7A2E]/25 bg-[#221E29] px-2 py-1.5 text-sm text-[#E4D8BE] outline-none focus:border-[#9C7A2E]"
                    disabled={props.busyAction === `assign:${member.userId}`}
                    onChange={(event) => props.assignCharacter(member.userId, event.target.value || null)}
                    value={member.characterId ?? ""}
                  >
                    <option value="">Aucun personnage</option>
                    {props.characters.map((character) => {
                      const ownerId = props.claimedCharacters.get(character.id);
                      const unavailable = Boolean(ownerId && ownerId !== member.userId);
                      return (
                        <option disabled={unavailable} key={character.id} value={character.id}>
                          {character.name} · {character.classe} {character.niveau}{unavailable ? " · pris" : ""}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <p className="text-xs text-[#E4D8BE]/50">
                    {member.characterId
                      ? props.characters.find((character) => character.id === member.characterId)?.name ?? "Personnage"
                      : "Observation"}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <div className="flex justify-end border-t border-[#9C7A2E]/15 pt-4">
        <button
          className="border border-[#7A1F2E]/70 bg-[#7A1F2E]/20 px-3 py-2 text-sm text-[#E4D8BE] hover:bg-[#7A1F2E]/40"
          disabled={props.busyAction === "leave"}
          onClick={props.leaveRoom}
          type="button"
        >
          {props.self.role === "host" ? "Fermer la partie" : "Quitter la partie"}
        </button>
      </div>
    </div>
  );
}

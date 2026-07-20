import type { MultiplayerMember, MultiplayerRole } from "./types";

export const multiplayerRoleLabels: Record<MultiplayerRole, string> = {
  player: "Joueur",
  gm: "MJ",
  spectator: "Spectateur",
};

export function isMultiplayerAdmin(
  member: Pick<MultiplayerMember, "isAdmin"> | null | undefined,
): boolean {
  return member?.isAdmin === true;
}

export function isMultiplayerGm(
  member: Pick<MultiplayerMember, "role"> | null | undefined,
): boolean {
  return member?.role === "gm";
}

export function canPlayMultiplayerCharacter(
  member: Pick<MultiplayerMember, "role"> | null | undefined,
): boolean {
  return member?.role === "player";
}

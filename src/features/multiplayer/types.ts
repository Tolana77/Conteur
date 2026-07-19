import type { ChatActionIntent } from "../../app/types";

export type MultiplayerRole = "host" | "player" | "spectator";
export type MultiplayerRoomStatus = "lobby" | "active" | "closed";
export type MultiplayerConnectionPhase =
  | "local"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface MultiplayerRoom {
  id: string;
  joinCode: string;
  campaignId: string;
  name: string;
  hostUserId: string;
  status: MultiplayerRoomStatus;
  createdAt: string;
}

export interface MultiplayerMember {
  roomId: string;
  userId: string;
  displayName: string;
  role: MultiplayerRole;
  characterId: string | null;
  joinedAt: string;
  online: boolean;
}

export interface MultiplayerTurn {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  characterId: string;
  kind: "narrative" | "playerCheck";
  checkRequestId: string | null;
  content: string;
  actions: ChatActionIntent[];
  status: "pending" | "processing" | "completed" | "rejected";
  error: string | null;
  createdAt: string;
}

export interface MultiplayerSessionRecord {
  roomId: string;
  displayName: string;
}

export interface MultiplayerProjectionEnvelope {
  protocolVersion: 1;
  roomId: string;
  campaignId: string;
  recipientUserId: string;
  recipientCharacterId: string | null;
  sequence: number;
  publishedAt: number;
  state: unknown;
}

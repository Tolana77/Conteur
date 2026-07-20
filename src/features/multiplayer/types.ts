import type { ChatActionIntent, LanguageChannel } from "../../app/types";

import type { CharacterCreationPackage } from "../character/characterCreation";

export type MultiplayerRole = "player" | "gm" | "spectator";
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
  isAdmin: boolean;
  playerColor: string;
  characterId: string | null;
  joinedAt: string;
  online: boolean;
}

export interface MultiplayerCharacterPreset {
  id: string;
  roomId: string;
  name: string;
  summary: string;
  characterPackage: CharacterCreationPackage;
  createdBy: string;
  createdAt: string;
}

export interface MultiplayerCharacterRequest {
  id: string;
  roomId: string;
  userId: string;
  kind: "preset" | "custom";
  presetId: string | null;
  characterPackage: CharacterCreationPackage;
  status: "pending" | "processing" | "completed" | "rejected";
  error: string | null;
  createdAt: string;
}

export interface MultiplayerTurn {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  playerColor: string;
  characterId: string;
  kind: "narrative" | "playerCheck";
  checkRequestId: string | null;
  content: string;
  communicationChannel: LanguageChannel;
  communicationLanguageId: string;
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

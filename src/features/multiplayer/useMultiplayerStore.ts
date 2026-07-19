import { create } from "zustand";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { ActionTarget, ChatActionIntent, ChatActionIntentKind, SpellLevel } from "../../app/types";
import { useGameStore } from "../../store/useGameStore";
import { normalizeActionTargeting } from "../combat/targeting";
import { getMultiplayerConfiguration } from "./config";
import {
  applyMultiplayerProjection,
  createMultiplayerProjection,
  parseMultiplayerProjection,
} from "./gameProjection";
import { ensureMultiplayerIdentity, getMultiplayerClient } from "./supabaseClient";
import type {
  MultiplayerConnectionPhase,
  MultiplayerMember,
  MultiplayerRole,
  MultiplayerRoom,
  MultiplayerSessionRecord,
  MultiplayerTurn,
} from "./types";

const MULTIPLAYER_SESSION_KEY = "le-conteur:multiplayer-session";

interface MultiplayerState {
  configured: boolean;
  missingConfiguration: string[];
  phase: MultiplayerConnectionPhase;
  room: MultiplayerRoom | null;
  self: MultiplayerMember | null;
  members: MultiplayerMember[];
  incomingTurns: MultiplayerTurn[];
  pendingTurn: MultiplayerTurn | null;
  awaitingHostState: boolean;
  latestSequence: number;
  error: string | null;
  initialize: () => Promise<void>;
  createRoom: (displayName: string) => Promise<void>;
  joinRoom: (joinCode: string, displayName: string, role: "player" | "spectator") => Promise<void>;
  leaveRoom: () => Promise<void>;
  assignCharacter: (userId: string, characterId: string | null) => Promise<void>;
  submitTurn: (content: string, actions: ChatActionIntent[]) => Promise<void>;
  submitPlayerCheck: (requestId: string) => Promise<void>;
  beginTurn: (turnId: string) => Promise<boolean>;
  finishTurn: (turnId: string, error?: string) => Promise<void>;
  publishStateNow: () => Promise<void>;
  clearError: () => void;
}

const multiplayerConfiguration = getMultiplayerConfiguration();
let dataChannel: RealtimeChannel | null = null;
let presenceChannel: RealtimeChannel | null = null;
let initializationPromise: Promise<void> | null = null;
let connectionGeneration = 0;
let lastPublishedStateByUser = new Map<string, string>();
let publicationQueue: Promise<void> = Promise.resolve();

export const useMultiplayerStore = create<MultiplayerState>((set, get) => ({
  configured: multiplayerConfiguration.configured,
  missingConfiguration: multiplayerConfiguration.missing,
  phase: "local",
  room: null,
  self: null,
  members: [],
  incomingTurns: [],
  pendingTurn: null,
  awaitingHostState: false,
  latestSequence: 0,
  error: null,

  initialize: async () => {
    if (initializationPromise) return initializationPromise;
    initializationPromise = restoreMultiplayerSession(set, get).finally(() => {
      initializationPromise = null;
    });
    return initializationPromise;
  },

  createRoom: async (displayName) => {
    const client = requireClient();
    const normalizedName = normalizeDisplayName(displayName);
    set({ phase: "connecting", error: null });

    try {
      const userId = await ensureMultiplayerIdentity();
      const gameState = useGameStore.getState();
      const { data, error } = await client.rpc("create_multiplayer_room", {
        p_campaign_id: gameState.campaign.id,
        p_display_name: normalizedName,
        p_name: gameState.campaign.name,
      });
      if (error) throw error;
      const room = mapRoomRow(firstRow(data));
      const self = createMemberFromRoom(room, userId, normalizedName, "host");
      saveSession({ roomId: room.id, displayName: normalizedName });
      await connectToRoom(client, room, self, set, get);
      await get().publishStateNow();
    } catch (error) {
      set({ phase: "error", error: readableError(error) });
      throw error;
    }
  },

  joinRoom: async (joinCode, displayName, role) => {
    const client = requireClient();
    const normalizedName = normalizeDisplayName(displayName);
    const normalizedCode = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (normalizedCode.length !== 6) throw new Error("Le code de partie doit contenir 6 caractères.");
    set({ phase: "connecting", error: null });

    try {
      const userId = await ensureMultiplayerIdentity();
      const { data, error } = await client.rpc("join_multiplayer_room", {
        p_display_name: normalizedName,
        p_join_code: normalizedCode,
        p_role: role,
      });
      if (error) throw error;
      const room = mapRoomRow(firstRow(data));
      const self = await fetchSelfMember(client, room.id, userId);
      saveSession({ roomId: room.id, displayName: normalizedName });
      await connectToRoom(client, room, self, set, get);
    } catch (error) {
      set({ phase: "error", error: readableError(error) });
      throw error;
    }
  },

  leaveRoom: async () => {
    const client = getMultiplayerClient();
    const { room } = get();
    if (client && room) {
      const { error } = await client.rpc("leave_multiplayer_room", { p_room_id: room.id });
      if (error) set({ error: readableError(error) });
    }
    await cleanupConnection(client);
    clearSession();
    set(createDisconnectedState());
  },

  assignCharacter: async (userId, characterId) => {
    const client = requireClient();
    const { room } = get();
    if (!room) throw new Error("Aucune partie connectée.");
    const { error } = await client.rpc("assign_multiplayer_character", {
      p_character_id: characterId,
      p_room_id: room.id,
      p_user_id: userId,
    });
    if (error) {
      const message = readableError(error);
      set({ error: message });
      throw new Error(message);
    }
    await refreshMembers(client, room.id, set, get);
    if (get().self?.role === "host") await get().publishStateNow();
  },

  submitTurn: async (content, actions) => {
    const client = requireClient();
    const { room, self, pendingTurn } = get();
    if (!room || !self) throw new Error("Aucune partie connectée.");
    if (self.role !== "player") throw new Error("Seul un joueur peut envoyer une intention.");
    if (!self.characterId) throw new Error("Choisissez d'abord un personnage.");
    if (pendingTurn) throw new Error("Votre intention précédente attend encore le MJ.");
    if (!content.trim() && actions.length === 0) throw new Error("L'intention est vide.");

    const { data, error } = await client.rpc("submit_multiplayer_turn", {
      p_actions: cloneSerializable(actions),
      p_check_request_id: null,
      p_content: content.trim(),
      p_kind: "narrative",
      p_room_id: room.id,
    });
    if (error) {
      const message = readableError(error);
      set({ error: message });
      throw new Error(message);
    }
    set({ pendingTurn: mapTurnRow(firstRow(data), get().members), error: null });
  },

  submitPlayerCheck: async (requestId) => {
    const client = requireClient();
    const { room, self, pendingTurn } = get();
    if (!room || !self || self.role !== "player" || !self.characterId) {
      throw new Error("Un personnage joueur est requis pour lancer ce dé.");
    }
    if (pendingTurn) throw new Error("Votre intention précédente attend encore le MJ.");
    const request = useGameStore.getState().playerCheckRequests.find(
      (candidate) => candidate.id === requestId && candidate.status === "pending",
    );
    if (!request || request.characterId !== self.characterId) {
      throw new Error("Ce jet n'est plus disponible pour votre personnage.");
    }

    const { data, error } = await client.rpc("submit_multiplayer_turn", {
      p_actions: [],
      p_check_request_id: requestId,
      p_content: "",
      p_kind: "playerCheck",
      p_room_id: room.id,
    });
    if (error) {
      const message = readableError(error);
      set({ error: message });
      throw new Error(message);
    }
    set({ pendingTurn: mapTurnRow(firstRow(data), get().members), error: null });
  },

  beginTurn: async (turnId) => {
    const client = requireClient();
    const { room, self } = get();
    if (!room || self?.role !== "host") return false;
    const { data, error } = await client.rpc("set_multiplayer_turn_status", {
      p_error: null,
      p_status: "processing",
      p_turn_id: turnId,
    });
    if (error) {
      set({ error: readableError(error) });
      return false;
    }
    return data === true;
  },

  finishTurn: async (turnId, errorMessage) => {
    const client = requireClient();
    const { error } = await client.rpc("set_multiplayer_turn_status", {
      p_error: errorMessage ?? null,
      p_status: errorMessage ? "rejected" : "completed",
      p_turn_id: turnId,
    });
    if (error) set({ error: readableError(error) });
    set((state) => ({ incomingTurns: state.incomingTurns.filter((turn) => turn.id !== turnId) }));
  },

  publishStateNow: () => {
    publicationQueue = publicationQueue.then(
      () => publishHostState(set, get),
      () => publishHostState(set, get),
    );
    return publicationQueue;
  },

  clearError: () => set({ error: null, phase: get().room ? "connected" : "local" }),
}));

async function publishHostState(set: StoreSet, get: StoreGet): Promise<void> {
  const client = requireClient();
  const { room, self, members, latestSequence } = get();
  if (!room || self?.role !== "host") return;
  const recipients = members.filter((member) => member.role !== "host");
  if (recipients.length === 0) return;

  const sequence = Math.max(Date.now(), latestSequence + 1);
  const gameState = useGameStore.getState();
  const pendingFingerprints = new Map<string, string>();
  const rows = recipients.flatMap((member) => {
    const projection = createMultiplayerProjection(gameState, room.id, member, sequence);
    const fingerprint = JSON.stringify(projection.state);
    if (lastPublishedStateByUser.get(member.userId) === fingerprint) return [];
    pendingFingerprints.set(member.userId, fingerprint);
    return [{
      room_id: room.id,
      user_id: member.userId,
      sequence,
      state: projection,
      updated_at: new Date().toISOString(),
    }];
  });
  if (rows.length === 0) return;

  const { error } = await client
    .from("multiplayer_projections")
    .upsert(rows, { onConflict: "room_id,user_id" });
  if (error) {
    set({ error: readableError(error) });
    return;
  }
  pendingFingerprints.forEach((fingerprint, userId) => {
    lastPublishedStateByUser.set(userId, fingerprint);
  });
  set({ latestSequence: sequence });
}

async function restoreMultiplayerSession(
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
  const configuration = getMultiplayerConfiguration();
  if (!configuration.configured) {
    set({ configured: false, missingConfiguration: configuration.missing, phase: "local" });
    return;
  }
  const saved = loadSession();
  if (!saved) return;
  const client = requireClient();
  set({ phase: "reconnecting", error: null });

  try {
    const userId = await ensureMultiplayerIdentity();
    const { data: roomData, error: roomError } = await client
      .from("multiplayer_rooms")
      .select("*")
      .eq("id", saved.roomId)
      .maybeSingle();
    if (roomError) throw roomError;
    if (!roomData) {
      clearSession();
      set(createDisconnectedState());
      return;
    }
    const room = mapRoomRow(roomData);
    const self = await fetchSelfMember(client, room.id, userId);
    await connectToRoom(client, room, self, set, get);
  } catch (error) {
    clearSession();
    set({ ...createDisconnectedState(), phase: "error", error: readableError(error) });
  }
}

async function connectToRoom(
  client: SupabaseClient,
  room: MultiplayerRoom,
  self: MultiplayerMember,
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
  await cleanupConnection(client);
  const generation = ++connectionGeneration;
  lastPublishedStateByUser = new Map();
  set({
    phase: "connecting",
    room,
    self,
    members: [self],
    incomingTurns: [],
    pendingTurn: null,
    awaitingHostState: self.role !== "host",
    latestSequence: 0,
    error: null,
  });
  await refreshMembers(client, room.id, set, get);

  dataChannel = client
    .channel(`multiplayer-data:${room.id}:${self.userId}`)
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "multiplayer_rooms",
      filter: `id=eq.${room.id}`,
    }, (payload) => {
      if (generation !== connectionGeneration || !isRecord(payload.new)) return;
      try {
        const updatedRoom = mapRoomRow(payload.new);
        set({
          room: updatedRoom,
          ...(updatedRoom.status === "closed"
            ? { phase: "error" as const, error: "Le MJ a fermé cette partie." }
            : {}),
        });
      } catch (error) {
        set({ error: readableError(error) });
      }
    })
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "multiplayer_members",
      filter: `room_id=eq.${room.id}`,
    }, () => {
      if (generation === connectionGeneration) void refreshMembers(client, room.id, set, get);
    })
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "multiplayer_turns",
      filter: `room_id=eq.${room.id}`,
    }, (payload) => {
      if (generation !== connectionGeneration) return;
      if (get().self?.role === "host") void refreshIncomingTurns(client, room.id, set, get);
      else {
        if (
          isRecord(payload.new) &&
          payload.new.user_id === self.userId &&
          payload.new.status === "rejected"
        ) {
          set({
            error: typeof payload.new.error === "string"
              ? `Intention refusée : ${payload.new.error}`
              : "Le MJ n'a pas pu résoudre cette intention.",
          });
        }
        void refreshPendingTurn(client, room.id, self.userId, set, get);
      }
    })
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "multiplayer_projections",
      filter: `user_id=eq.${self.userId}`,
    }, (payload) => {
      if (generation !== connectionGeneration || get().self?.role === "host") return;
      applyProjectionRow(payload.new, room.id, self.userId, set, get);
    })
    .subscribe();

  presenceChannel = client
    .channel(`room:${room.id}`, {
      config: { private: true, presence: { key: self.userId } },
    })
    .on("presence", { event: "sync" }, () => {
      if (generation !== connectionGeneration || !presenceChannel) return;
      const onlineIds = new Set(Object.keys(presenceChannel.presenceState()));
      set((state) => ({
        members: state.members.map((member) => ({ ...member, online: onlineIds.has(member.userId) })),
      }));
    })
    .subscribe(async (status) => {
      if (generation !== connectionGeneration) return;
      if (status === "SUBSCRIBED") {
        await presenceChannel?.track({
          characterId: self.characterId,
          displayName: self.displayName,
          role: self.role,
          userId: self.userId,
        });
        set({ phase: "connected" });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        set({ phase: "reconnecting", error: "Connexion temps réel interrompue." });
      }
    });

  if (self.role === "host") {
    await refreshIncomingTurns(client, room.id, set, get);
  } else {
    await Promise.all([
      fetchLatestProjection(client, room.id, self.userId, set, get),
      refreshPendingTurn(client, room.id, self.userId, set, get),
    ]);
  }
}

async function refreshMembers(
  client: SupabaseClient,
  roomId: string,
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
  const { data, error } = await client
    .from("multiplayer_members")
    .select("*")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  if (error) {
    set({ error: readableError(error) });
    return;
  }
  const onlineIds = new Set(presenceChannel ? Object.keys(presenceChannel.presenceState()) : []);
  const members = (data ?? []).map((row) => mapMemberRow(row, onlineIds));
  const currentSelf = get().self;
  const self = members.find((member) => member.userId === currentSelf?.userId) ?? currentSelf;
  set({ members, self });
  if (self?.characterId) {
    useGameStore.setState({ selectedCharacterId: self.characterId });
  }
  if (self?.role === "host") void get().publishStateNow();
}

async function refreshIncomingTurns(
  client: SupabaseClient,
  roomId: string,
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
  const { data, error } = await client
    .from("multiplayer_turns")
    .select("*")
    .eq("room_id", roomId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: true });
  if (error) {
    set({ error: readableError(error) });
    return;
  }
  set({ incomingTurns: (data ?? []).map((row) => mapTurnRow(row, get().members)) });
}

async function refreshPendingTurn(
  client: SupabaseClient,
  roomId: string,
  userId: string,
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
  const { data, error } = await client
    .from("multiplayer_turns")
    .select("*")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    set({ error: readableError(error) });
    return;
  }
  set({ pendingTurn: data ? mapTurnRow(data, get().members) : null });
}

async function fetchLatestProjection(
  client: SupabaseClient,
  roomId: string,
  userId: string,
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
  const { data, error } = await client
    .from("multiplayer_projections")
    .select("state,sequence")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    set({ error: readableError(error) });
    return;
  }
  if (data) applyProjectionRow(data, roomId, userId, set, get);
}

function applyProjectionRow(
  row: unknown,
  roomId: string,
  userId: string,
  set: StoreSet,
  get: StoreGet,
): void {
  if (!isRecord(row)) return;
  try {
    const projection = parseMultiplayerProjection(row.state, roomId, userId);
    if (projection.sequence <= get().latestSequence) return;
    useGameStore.setState((current) => applyMultiplayerProjection(current, projection));
    set({ latestSequence: projection.sequence, awaitingHostState: false, error: null });
  } catch (error) {
    set({ error: readableError(error) });
  }
}

async function fetchSelfMember(
  client: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<MultiplayerMember> {
  const { data, error } = await client
    .from("multiplayer_members")
    .select("*")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Membre introuvable.");
  return mapMemberRow(data, new Set());
}

async function cleanupConnection(client: SupabaseClient | null): Promise<void> {
  connectionGeneration += 1;
  if (client && presenceChannel) await client.removeChannel(presenceChannel);
  if (client && dataChannel) await client.removeChannel(dataChannel);
  presenceChannel = null;
  dataChannel = null;
  lastPublishedStateByUser = new Map();
}

function requireClient(): SupabaseClient {
  const client = getMultiplayerClient();
  if (!client) throw new Error("Ajoutez les variables Supabase pour activer le multijoueur.");
  return client;
}

function mapRoomRow(value: unknown): MultiplayerRoom {
  if (!isRecord(value)) throw new Error("Réponse de salon invalide.");
  const status = value.status;
  if (status !== "lobby" && status !== "active" && status !== "closed") {
    throw new Error("Statut de salon invalide.");
  }
  return {
    id: requireString(value.id, "id"),
    joinCode: requireString(value.join_code, "join_code"),
    campaignId: requireString(value.campaign_id, "campaign_id"),
    name: requireString(value.name, "name"),
    hostUserId: requireString(value.host_user_id, "host_user_id"),
    status,
    createdAt: requireString(value.created_at, "created_at"),
  };
}

function mapMemberRow(value: unknown, onlineIds: Set<string>): MultiplayerMember {
  if (!isRecord(value)) throw new Error("Membre multijoueur invalide.");
  const role = value.role;
  if (role !== "host" && role !== "player" && role !== "spectator") {
    throw new Error("Rôle multijoueur invalide.");
  }
  const userId = requireString(value.user_id, "user_id");
  return {
    roomId: requireString(value.room_id, "room_id"),
    userId,
    displayName: requireString(value.display_name, "display_name"),
    role,
    characterId: typeof value.character_id === "string" ? value.character_id : null,
    joinedAt: requireString(value.joined_at, "joined_at"),
    online: onlineIds.has(userId),
  };
}

function mapTurnRow(value: unknown, members: MultiplayerMember[]): MultiplayerTurn {
  if (!isRecord(value)) throw new Error("Intention multijoueur invalide.");
  const status = value.status;
  if (status !== "pending" && status !== "processing" && status !== "completed" && status !== "rejected") {
    throw new Error("Statut d'intention invalide.");
  }
  const userId = requireString(value.user_id, "user_id");
  const actions = parseMultiplayerTurnActions(value.actions);
  const kind = value.kind === "playerCheck" ? "playerCheck" : "narrative";
  return {
    id: requireString(value.id, "id"),
    roomId: requireString(value.room_id, "room_id"),
    userId,
    displayName: members.find((member) => member.userId === userId)?.displayName ?? "Joueur",
    characterId: requireString(value.character_id, "character_id"),
    kind,
    checkRequestId: typeof value.check_request_id === "string" ? value.check_request_id : null,
    content: typeof value.content === "string" ? value.content : "",
    actions,
    status,
    error: typeof value.error === "string" ? value.error : null,
    createdAt: requireString(value.created_at, "created_at"),
  };
}

export function parseMultiplayerTurnActions(value: unknown): ChatActionIntent[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 2).flatMap((candidate) => {
    if (!isRecord(candidate) || !isChatActionKind(candidate.kind)) return [];
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.targetId !== "string" ||
      typeof candidate.label !== "string" ||
      !candidate.id.trim() ||
      !candidate.targetId.trim() ||
      !candidate.label.trim()
    ) {
      return [];
    }
    const target = parseActionTarget(candidate.target);
    const targeting = normalizeActionTargeting(candidate.targeting);
    const spellLevel = parseSpellLevel(candidate.spellLevel);
    return [{
      id: candidate.id.slice(0, 120),
      kind: candidate.kind,
      targetId: candidate.targetId.slice(0, 160),
      label: candidate.label.trim().slice(0, 160),
      command: `${candidate.kind} ${candidate.targetId}`.slice(0, 240),
      createdAt: typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
        ? candidate.createdAt
        : Date.now(),
      ...(targeting ? { targeting } : {}),
      ...(target ? { target } : {}),
      ...(spellLevel !== null ? { spellLevel } : {}),
    }];
  });
}

function parseActionTarget(value: unknown): ActionTarget | undefined {
  if (!isRecord(value)) return undefined;
  const allowedKinds = new Set(["self", "character", "entity", "item", "position", "free"]);
  if (
    typeof value.kind !== "string" ||
    !allowedKinds.has(value.kind) ||
    typeof value.id !== "string" ||
    typeof value.label !== "string"
  ) {
    return undefined;
  }
  const position = isRecord(value.position) &&
    typeof value.position.x === "number" && Number.isFinite(value.position.x) &&
    typeof value.position.y === "number" && Number.isFinite(value.position.y)
    ? { x: value.position.x, y: value.position.y }
    : undefined;
  return {
    kind: value.kind as ActionTarget["kind"],
    id: value.id.slice(0, 160),
    label: value.label.trim().slice(0, 160),
    source: value.source === "default" || value.source === "selected" || value.source === "free"
      ? value.source
      : "selected",
    ...(position ? { position } : {}),
  };
}

function parseSpellLevel(value: unknown): SpellLevel | null {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 9
    ? value as SpellLevel
    : null;
}

function isChatActionKind(value: unknown): value is ChatActionIntentKind {
  return value === "useItem" || value === "useAbility" || value === "castSpell" || value === "attack";
}

function createMemberFromRoom(
  room: MultiplayerRoom,
  userId: string,
  displayName: string,
  role: MultiplayerRole,
): MultiplayerMember {
  return {
    roomId: room.id,
    userId,
    displayName,
    role,
    characterId: null,
    joinedAt: room.createdAt,
    online: true,
  };
}

function firstRow(value: unknown): unknown {
  if (Array.isArray(value)) return value[0];
  return value;
}

function createDisconnectedState(): Pick<
  MultiplayerState,
  | "phase"
  | "room"
  | "self"
  | "members"
  | "incomingTurns"
  | "pendingTurn"
  | "awaitingHostState"
  | "latestSequence"
  | "error"
> {
  return {
    phase: "local",
    room: null,
    self: null,
    members: [],
    incomingTurns: [],
    pendingTurn: null,
    awaitingHostState: false,
    latestSequence: 0,
    error: null,
  };
}

function normalizeDisplayName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 40);
  if (normalized.length < 2) throw new Error("Le nom doit contenir au moins 2 caractères.");
  return normalized;
}

function saveSession(session: MultiplayerSessionRecord): void {
  localStorage.setItem(MULTIPLAYER_SESSION_KEY, JSON.stringify(session));
}

function loadSession(): MultiplayerSessionRecord | null {
  try {
    const value = JSON.parse(localStorage.getItem(MULTIPLAYER_SESSION_KEY) ?? "null") as unknown;
    if (!isRecord(value) || typeof value.roomId !== "string" || typeof value.displayName !== "string") return null;
    return { roomId: value.roomId, displayName: value.displayName };
  } catch {
    return null;
  }
}

function clearSession(): void {
  localStorage.removeItem(MULTIPLAYER_SESSION_KEY);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} est absent.`);
  return value;
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return "Erreur multijoueur inconnue.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type StoreSet = (
  partial:
    | Partial<MultiplayerState>
    | ((state: MultiplayerState) => Partial<MultiplayerState>),
) => void;
type StoreGet = () => MultiplayerState;

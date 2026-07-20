import { create } from "zustand";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type {
  ActionTarget,
  ChatActionIntent,
  ChatActionIntentKind,
  LanguageChannel,
  SpellLevel,
} from "../../app/types";
import { useGameStore } from "../../store/useGameStore";
import { normalizeActionTargeting } from "../combat/targeting";
import type { CharacterCreationPackage } from "../character/characterCreation";
import { getMultiplayerConfiguration } from "./config";
import {
  applyMultiplayerProjection,
  createMultiplayerProjection,
  parseMultiplayerProjection,
} from "./gameProjection";
import { ensureMultiplayerIdentity, getMultiplayerClient } from "./supabaseClient";
import {
  canPlayMultiplayerCharacter,
  isMultiplayerAdmin,
  isMultiplayerGm,
} from "./permissions";
import type {
  MultiplayerConnectionPhase,
  MultiplayerCharacterPreset,
  MultiplayerCharacterRequest,
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
  characterPresets: MultiplayerCharacterPreset[];
  incomingCharacterRequests: MultiplayerCharacterRequest[];
  pendingCharacterRequest: MultiplayerCharacterRequest | null;
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
  setMemberRole: (userId: string, role: MultiplayerRole) => Promise<void>;
  setMemberAdmin: (userId: string, isAdmin: boolean) => Promise<void>;
  createCharacterPreset: (name: string, summary: string, setup: CharacterCreationPackage) => Promise<void>;
  deleteCharacterPreset: (presetId: string) => Promise<void>;
  submitCharacterRequest: (
    kind: "preset" | "custom",
    setup?: CharacterCreationPackage,
    presetId?: string,
  ) => Promise<void>;
  beginCharacterRequest: (requestId: string) => Promise<boolean>;
  finishCharacterRequest: (requestId: string, error?: string) => Promise<void>;
  submitTurn: (
    content: string,
    actions: ChatActionIntent[],
    communication?: { channel: LanguageChannel; languageId: string },
  ) => Promise<void>;
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
  characterPresets: [],
  incomingCharacterRequests: [],
  pendingCharacterRequest: null,
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
      const self = createMemberFromRoom(room, userId, normalizedName, "gm", true);
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
    const { room, self } = get();
    if (!room) throw new Error("Aucune partie connectée.");
    if (!isMultiplayerGm(self) && !isMultiplayerAdmin(self)) {
      throw new Error("Un rôle administrateur est requis pour attribuer un personnage.");
    }
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
    if (isMultiplayerGm(get().self)) await get().publishStateNow();
  },

  setMemberRole: async (userId, role) => {
    const client = requireClient();
    const { room, self } = get();
    if (!room || !isMultiplayerAdmin(self)) throw new Error("Seul un administrateur peut modifier les rôles.");
    const { error } = await client.rpc("set_multiplayer_member_role", {
      p_role: role,
      p_room_id: room.id,
      p_user_id: userId,
    });
    if (error) {
      const message = readableError(error);
      set({ error: message });
      throw new Error(message);
    }
    await refreshMembers(client, room.id, set, get);
  },

  setMemberAdmin: async (userId, isAdmin) => {
    const client = requireClient();
    const { room, self } = get();
    if (!room || !isMultiplayerAdmin(self)) {
      throw new Error("Seul un administrateur peut modifier les droits d’administration.");
    }
    const { error } = await client.rpc("set_multiplayer_member_admin", {
      p_is_admin: isAdmin,
      p_room_id: room.id,
      p_user_id: userId,
    });
    if (error) {
      const message = readableError(error);
      set({ error: message });
      throw new Error(message);
    }
    await refreshMembers(client, room.id, set, get);
  },

  createCharacterPreset: async (name, summary, setup) => {
    const client = requireClient();
    const { room, self } = get();
    if (!room || !isMultiplayerAdmin(self)) {
      throw new Error("Un rôle administrateur est requis.");
    }
    const { error } = await client.rpc("create_multiplayer_character_preset", {
      p_character_package: cloneSerializable(setup),
      p_name: name.trim(),
      p_room_id: room.id,
      p_summary: summary.trim(),
    });
    if (error) throw new Error(readableError(error));
    await refreshCharacterPresets(client, room.id, set);
  },

  deleteCharacterPreset: async (presetId) => {
    const client = requireClient();
    if (!isMultiplayerAdmin(get().self)) {
      throw new Error("Un rôle administrateur est requis.");
    }
    const { error } = await client.rpc("delete_multiplayer_character_preset", {
      p_preset_id: presetId,
    });
    if (error) throw new Error(readableError(error));
    const roomId = get().room?.id;
    if (roomId) await refreshCharacterPresets(client, roomId, set);
  },

  submitCharacterRequest: async (kind, setup, presetId) => {
    const client = requireClient();
    const { room, self, pendingCharacterRequest } = get();
    if (!room || !self || !canPlayMultiplayerCharacter(self)) {
      throw new Error("Cette participation ne peut pas créer de personnage.");
    }
    if (self.characterId) throw new Error("Un personnage vous est déjà attribué.");
    if (pendingCharacterRequest) throw new Error("Votre personnage attend déjà sa validation.");
    if (kind === "custom" && !setup) throw new Error("Le personnage créé est absent.");
    if (kind === "preset" && !presetId) throw new Error("Choisissez un personnage préfabriqué.");
    const { data, error } = await client.rpc("submit_multiplayer_character_request", {
      p_character_package: kind === "custom" ? cloneSerializable(setup) : null,
      p_kind: kind,
      p_preset_id: kind === "preset" ? presetId : null,
      p_room_id: room.id,
    });
    if (error) throw new Error(readableError(error));
    set({ pendingCharacterRequest: mapCharacterRequestRow(firstRow(data)), error: null });
  },

  beginCharacterRequest: async (requestId) => {
    const client = requireClient();
    if (!isMultiplayerGm(get().self)) return false;
    const { data, error } = await client.rpc("set_multiplayer_character_request_status", {
      p_error: null,
      p_request_id: requestId,
      p_status: "processing",
    });
    if (error) {
      set({ error: readableError(error) });
      return false;
    }
    return data === true;
  },

  finishCharacterRequest: async (requestId, errorMessage) => {
    const client = requireClient();
    const { error } = await client.rpc("set_multiplayer_character_request_status", {
      p_error: errorMessage ?? null,
      p_request_id: requestId,
      p_status: errorMessage ? "rejected" : "completed",
    });
    if (error) set({ error: readableError(error) });
    set((state) => ({
      incomingCharacterRequests: state.incomingCharacterRequests.filter((request) => request.id !== requestId),
    }));
  },

  submitTurn: async (content, actions, communication) => {
    const client = requireClient();
    const { room, self, pendingTurn } = get();
    if (!room || !self) throw new Error("Aucune partie connectée.");
    if (!canPlayMultiplayerCharacter(self)) {
      throw new Error("Seul un joueur peut envoyer une intention.");
    }
    if (!self.characterId) throw new Error("Choisissez d'abord un personnage.");
    if (pendingTurn) throw new Error("Votre intention précédente attend encore le Conteur.");
    if (!content.trim() && actions.length === 0) throw new Error("L'intention est vide.");

    const { data, error } = await client.rpc("submit_multiplayer_turn", {
      p_actions: cloneSerializable(actions),
      p_check_request_id: null,
      p_communication_channel: communication?.channel ?? "oral",
      p_communication_language_id: communication?.languageId ?? "commun",
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
    if (!room || !self || !canPlayMultiplayerCharacter(self) || !self.characterId) {
      throw new Error("Un personnage joueur est requis pour lancer ce dé.");
    }
    if (pendingTurn) throw new Error("Votre intention précédente attend encore le Conteur.");
    const request = useGameStore.getState().playerCheckRequests.find(
      (candidate) => candidate.id === requestId && candidate.status === "pending",
    );
    if (!request || request.characterId !== self.characterId) {
      throw new Error("Ce jet n'est plus disponible pour votre personnage.");
    }

    const { data, error } = await client.rpc("submit_multiplayer_turn", {
      p_actions: [],
      p_check_request_id: requestId,
      p_communication_channel: "oral",
      p_communication_language_id: "commun",
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
    if (!room || !isMultiplayerGm(self)) return false;
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
      () => publishGmState(set, get),
      () => publishGmState(set, get),
    );
    return publicationQueue;
  },

  clearError: () => set({ error: null, phase: get().room ? "connected" : "local" }),
}));

async function publishGmState(set: StoreSet, get: StoreGet): Promise<void> {
  const client = requireClient();
  const { room, self, members, latestSequence } = get();
  if (!room || !self || !isMultiplayerGm(self)) return;
  const recipients = members.filter((member) => member.userId !== self.userId);
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
    characterPresets: [],
    incomingCharacterRequests: [],
    pendingCharacterRequest: null,
    incomingTurns: [],
    pendingTurn: null,
    awaitingHostState: !isMultiplayerGm(self),
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
            ? { phase: "error" as const, error: "Le Conteur a fermé cette partie." }
            : {}),
        });
      } catch (error) {
        set({ error: readableError(error) });
      }
    })
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "multiplayer_character_presets",
      filter: `room_id=eq.${room.id}`,
    }, () => {
      if (generation === connectionGeneration) void refreshCharacterPresets(client, room.id, set);
    })
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "multiplayer_character_requests",
      filter: `room_id=eq.${room.id}`,
    }, (payload) => {
      if (generation !== connectionGeneration) return;
      if (isMultiplayerGm(get().self)) {
        void refreshIncomingCharacterRequests(client, room.id, set);
      } else {
        if (
          isRecord(payload.new) &&
          payload.new.user_id === self.userId &&
          payload.new.status === "rejected"
        ) {
          set({
            error: typeof payload.new.error === "string"
              ? `Personnage refusé : ${payload.new.error}`
              : "Le Conteur n'a pas pu installer ce personnage.",
          });
        }
        void refreshPendingCharacterRequest(client, room.id, self.userId, set);
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
      if (isMultiplayerGm(get().self)) void refreshIncomingTurns(client, room.id, set, get);
      else {
        if (
          isRecord(payload.new) &&
          payload.new.user_id === self.userId &&
          payload.new.status === "rejected"
        ) {
          set({
            error: typeof payload.new.error === "string"
              ? `Intention refusée : ${payload.new.error}`
              : "Le Conteur n'a pas pu résoudre cette intention.",
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
      if (generation !== connectionGeneration || isMultiplayerGm(get().self)) return;
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
          isAdmin: self.isAdmin,
          role: self.role,
          userId: self.userId,
        });
        set({ phase: "connected" });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        set({ phase: "reconnecting", error: "Connexion temps réel interrompue." });
      }
    });

  if (isMultiplayerGm(self)) {
    await Promise.all([
      refreshIncomingTurns(client, room.id, set, get),
      refreshIncomingCharacterRequests(client, room.id, set),
      refreshCharacterPresets(client, room.id, set),
    ]);
  } else {
    await Promise.all([
      fetchLatestProjection(client, room.id, self.userId, set, get),
      refreshPendingTurn(client, room.id, self.userId, set, get),
      refreshPendingCharacterRequest(client, room.id, self.userId, set),
      refreshCharacterPresets(client, room.id, set),
    ]);
  }
}

async function refreshCharacterPresets(
  client: SupabaseClient,
  roomId: string,
  set: StoreSet,
): Promise<void> {
  const { data, error } = await client
    .from("multiplayer_character_presets")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });
  if (error) {
    set({ error: readableError(error) });
    return;
  }
  set({ characterPresets: (data ?? []).map(mapCharacterPresetRow) });
}

async function refreshIncomingCharacterRequests(
  client: SupabaseClient,
  roomId: string,
  set: StoreSet,
): Promise<void> {
  const { data, error } = await client
    .from("multiplayer_character_requests")
    .select("*")
    .eq("room_id", roomId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: true });
  if (error) {
    set({ error: readableError(error) });
    return;
  }
  set({ incomingCharacterRequests: (data ?? []).map(mapCharacterRequestRow) });
}

async function refreshPendingCharacterRequest(
  client: SupabaseClient,
  roomId: string,
  userId: string,
  set: StoreSet,
): Promise<void> {
  const { data, error } = await client
    .from("multiplayer_character_requests")
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
  set({ pendingCharacterRequest: data ? mapCharacterRequestRow(data) : null });
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
  if (self?.characterId) {
    useGameStore.setState({ selectedCharacterId: self.characterId });
  }
  set({
    members,
    self,
    awaitingHostState: !isMultiplayerGm(self),
  });
  if (isMultiplayerGm(self)) {
    void refreshIncomingTurns(client, roomId, set, get);
    void refreshIncomingCharacterRequests(client, roomId, set);
    void get().publishStateNow();
  }
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
  const rawRole = value.role;
  const role = rawRole === "host"
    ? "gm"
    : rawRole === "admin"
      ? "player"
      : rawRole;
  if (role !== "gm" && role !== "player" && role !== "spectator") {
    throw new Error("Rôle multijoueur invalide.");
  }
  const userId = requireString(value.user_id, "user_id");
  return {
    roomId: requireString(value.room_id, "room_id"),
    userId,
    displayName: requireString(value.display_name, "display_name"),
    role,
    isAdmin: typeof value.is_admin === "boolean"
      ? value.is_admin
      : rawRole === "host" || rawRole === "admin",
    playerColor: isHexColor(value.player_color) ? value.player_color : "#6B4A5C",
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
  const member = members.find((candidate) => candidate.userId === userId);
  const actions = parseMultiplayerTurnActions(value.actions);
  const kind = value.kind === "playerCheck" ? "playerCheck" : "narrative";
  return {
    id: requireString(value.id, "id"),
    roomId: requireString(value.room_id, "room_id"),
    userId,
    displayName: member?.displayName ?? "Joueur",
    playerColor: member?.playerColor ?? "#6B4A5C",
    characterId: requireString(value.character_id, "character_id"),
    kind,
    checkRequestId: typeof value.check_request_id === "string" ? value.check_request_id : null,
    content: typeof value.content === "string" ? value.content : "",
    communicationChannel: value.communication_channel === "written" ? "written" : "oral",
    communicationLanguageId: typeof value.communication_language_id === "string"
      ? value.communication_language_id
      : "commun",
    actions,
    status,
    error: typeof value.error === "string" ? value.error : null,
    createdAt: requireString(value.created_at, "created_at"),
  };
}

function mapCharacterPresetRow(value: unknown): MultiplayerCharacterPreset {
  if (!isRecord(value)) throw new Error("Personnage préfabriqué invalide.");
  return {
    id: requireString(value.id, "id"),
    roomId: requireString(value.room_id, "room_id"),
    name: requireString(value.name, "name"),
    summary: typeof value.summary === "string" ? value.summary : "",
    characterPackage: requireCharacterPackage(value.character_package),
    createdBy: requireString(value.created_by, "created_by"),
    createdAt: requireString(value.created_at, "created_at"),
  };
}

function mapCharacterRequestRow(value: unknown): MultiplayerCharacterRequest {
  if (!isRecord(value)) throw new Error("Demande de personnage invalide.");
  const kind = value.kind === "preset" ? "preset" : "custom";
  const status = value.status;
  if (status !== "pending" && status !== "processing" && status !== "completed" && status !== "rejected") {
    throw new Error("Statut de création de personnage invalide.");
  }
  return {
    id: requireString(value.id, "id"),
    roomId: requireString(value.room_id, "room_id"),
    userId: requireString(value.user_id, "user_id"),
    kind,
    presetId: typeof value.preset_id === "string" ? value.preset_id : null,
    characterPackage: requireCharacterPackage(value.character_package),
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
  isAdmin = false,
): MultiplayerMember {
  return {
    roomId: room.id,
    userId,
    displayName,
    role,
    isAdmin,
    playerColor: "#9C7A2E",
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
  | "characterPresets"
  | "incomingCharacterRequests"
  | "pendingCharacterRequest"
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
    characterPresets: [],
    incomingCharacterRequests: [],
    pendingCharacterRequest: null,
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

function requireCharacterPackage(value: unknown): CharacterCreationPackage {
  if (!isRecord(value) || !Array.isArray(value.characters) || value.characters.length !== 1) {
    throw new Error("Paquet de personnage invalide.");
  }
  return cloneSerializable(value) as unknown as CharacterCreationPackage;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/u.test(value);
}

function readableError(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : isRecord(error) && typeof error.message === "string"
      ? error.message
      : null;
  if (message && /could not find the function|schema cache|PGRST202/iu.test(message)) {
    return "Les fonctions multijoueur de Supabase ne sont pas à jour. Appliquez toutes les migrations jusqu’à 202607200001, puis rechargez le schéma PostgREST.";
  }
  if (message?.includes("LAST_ADMIN_REQUIRED")) return "Le salon doit conserver au moins un administrateur.";
  if (message?.includes("GM_TRANSFER_REQUIRED")) return "Désignez d’abord un autre MJ pour transférer la partie.";
  if (message?.includes("GM_MUST_BE_PREPARED_AS_ADMIN")) {
    return "Accordez temporairement le statut Admin à ce participant avant de lui transférer le rôle de MJ.";
  }
  if (message) return message;
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

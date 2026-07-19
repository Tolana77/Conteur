import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMultiplayerConfiguration } from "./config";

let multiplayerClient: SupabaseClient | null | undefined;

export function getMultiplayerClient(): SupabaseClient | null {
  if (multiplayerClient !== undefined) return multiplayerClient;

  const configuration = getMultiplayerConfiguration();
  if (!configuration.configured || !configuration.url || !configuration.publishableKey) {
    multiplayerClient = null;
    return multiplayerClient;
  }

  multiplayerClient = createClient(configuration.url, configuration.publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
    },
  });
  return multiplayerClient;
}

export async function ensureMultiplayerIdentity(): Promise<string> {
  const client = getMultiplayerClient();
  if (!client) throw new Error("Le multijoueur n'est pas configuré.");

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (sessionData.session?.user.id) {
    await client.realtime.setAuth(sessionData.session.access_token);
    return sessionData.session.user.id;
  }

  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session?.user.id) {
    throw new Error(error?.message ?? "Impossible de créer l'identité multijoueur.");
  }

  await client.realtime.setAuth(data.session.access_token);
  return data.session.user.id;
}

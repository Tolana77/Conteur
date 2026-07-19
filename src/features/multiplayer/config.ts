export interface MultiplayerConfiguration {
  configured: boolean;
  url: string | null;
  publishableKey: string | null;
  missing: string[];
}

/** La clé publishable Supabase est conçue pour être exposée au navigateur.
 * La sécurité réelle repose sur Auth et les politiques RLS du projet. */
export function getMultiplayerConfiguration(): MultiplayerConfiguration {
  const url = readEnvironmentValue("VITE_SUPABASE_URL");
  const publishableKey = readEnvironmentValue("VITE_SUPABASE_PUBLISHABLE_KEY")
    ?? readEnvironmentValue("VITE_SUPABASE_ANON_KEY");
  const missing = [
    ...(url ? [] : ["VITE_SUPABASE_URL"]),
    ...(publishableKey ? [] : ["VITE_SUPABASE_PUBLISHABLE_KEY"]),
  ];

  return {
    configured: missing.length === 0,
    url,
    publishableKey,
    missing,
  };
}

function readEnvironmentValue(key: string): string | null {
  const value = import.meta.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

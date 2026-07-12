import { useState } from "react";
import { checkAiGatewayHealth, type AiGatewayHealth } from "./httpAiGateway";
import { useGameStore } from "../../store/useGameStore";

export function AiApiTraceConsole() {
  const traces = useGameStore((state) => state.aiApiTraces);
  const clearTraces = useGameStore((state) => state.clearAiApiTraces);
  const [health, setHealth] = useState<AiGatewayHealth | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  async function handleHealthCheck() {
    setIsCheckingHealth(true);
    try {
      setHealth(await checkAiGatewayHealth());
    } catch (error) {
      setHealth({
        ok: false,
        error: error instanceof Error ? error.message : "Diagnostic impossible.",
      });
    } finally {
      setIsCheckingHealth(false);
    }
  }

  return (
    <section className="mb-6 rounded border border-[#9C7A2E]/25 bg-[#15121A]/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="rune-label text-xs">Journal API</p>
          <p className="mt-1 text-sm text-[#E4D8BE]/65">
            Prompts et réponses brutes conservés localement, sans clé secrète.
          </p>
        </div>
        <button
          className="rounded border border-[#5A2233]/45 px-3 py-1.5 text-xs text-[#E4D8BE]/75 disabled:opacity-40"
          disabled={traces.length === 0}
          onClick={clearTraces}
          type="button"
        >
          Vider le journal
        </button>
        <button
          className="rounded border border-[#9C7A2E]/35 px-3 py-1.5 text-xs text-[#E4D8BE] disabled:opacity-40"
          disabled={isCheckingHealth}
          onClick={handleHealthCheck}
          type="button"
        >
          {isCheckingHealth ? "Diagnostic..." : "Diagnostiquer Groq"}
        </button>
      </div>

      {health ? (
        <article className={`mt-3 rounded border px-3 py-2 text-sm ${health.ok ? "border-[#3F5641]/70 bg-[#3F5641]/15" : "border-[#5A2233]/70 bg-[#5A2233]/15"}`}>
          <p className="font-semibold text-[#E4D8BE]">
            {health.ok ? "Groq est joignable." : "Le diagnostic a détecté un problème."}
          </p>
          <p className="mt-1 text-xs text-[#E4D8BE]/70">
            Hôte : {health.configuration?.providerUrlHost ?? "invalide"} · clé : {health.configuration?.hasApiKey ? "présente" : "absente"} · modèle : {health.configuration?.model ?? "absent"}
          </p>
          {health.providerStatus ? <p className="mt-1 text-xs text-[#E4D8BE]/70">Statut fournisseur : HTTP {health.providerStatus}</p> : null}
          {health.providerMessage ? <p className="mt-1 text-xs text-[#E4D8BE]/70">{health.providerMessage}</p> : null}
          {health.error ? <p className="mt-1 text-xs text-[#E4D8BE]/70">{health.error}</p> : null}
        </article>
      ) : null}

      {traces.length === 0 ? (
        <p className="mt-3 text-sm text-[#E4D8BE]/50">Aucun appel API enregistré pour le moment.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {traces.map((trace) => {
            const isError = Boolean(trace.error) || trace.status >= 400 || trace.status === 0;
            return (
              <details
                className={`rounded border p-2 ${
                  isError ? "border-[#5A2233]/70 bg-[#5A2233]/15" : "border-[#9C7A2E]/20 bg-[#221E29]/55"
                }`}
                key={trace.id}
                open={isError}
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold text-[#E4D8BE]">{getAgentLabel(trace.agentId)}</span>
                    <span className="font-mono text-xs text-[#9C7A2E]">HTTP {trace.status || "réseau"}</span>
                    <span className="text-xs text-[#E4D8BE]/55">{trace.durationMs} ms</span>
                    <span className="text-xs text-[#E4D8BE]/55">
                      ≈ {estimateTokens(trace.prompt)} entrée / {estimateTokens(trace.response)} sortie
                    </span>
                    <span className="text-xs text-[#E4D8BE]/55">
                      {new Date(trace.timestamp).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  {trace.error ? <p className="mt-1 text-xs text-[#E4D8BE]/70">{trace.error}</p> : null}
                </summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <TraceText label="Prompt envoyé" value={trace.prompt} />
                  <TraceText label="Réponse reçue" value={trace.response || "Aucune réponse."} />
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TraceText({ label, value }: { label: string; value: string }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-[#9C7A2E]">
      {label}
      <textarea
        className="mt-1 h-56 w-full resize-y rounded border border-[#9C7A2E]/20 bg-[#15121A] p-2 font-mono text-xs font-normal normal-case tracking-normal text-[#E4D8BE]/80"
        readOnly
        value={value}
      />
    </label>
  );
}

function getAgentLabel(agentId: string): string {
  const labels: Record<string, string> = {
    requestAnalyzer: "Analyser la demande",
    characterManager: "Gérer perso",
    actionManager: "Gérer actions",
    combatManager: "Gérer combat",
    combatSetupManager: "Mettre en place combat",
    tacticalTemplateManager: "Créer templates tactiques",
    assetTemplateManager: "Créer templates assets",
    worldManager: "Gérer monde",
    rulesValidator: "Vérifier règles",
    narrationManager: "Gérer narration",
  };
  return labels[agentId] ?? agentId;
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

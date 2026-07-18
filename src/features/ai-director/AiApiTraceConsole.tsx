import { useMemo, useState } from "react";
import { checkAiGatewayHealth, type AiGatewayHealth } from "./httpAiGateway";
import { useGameStore } from "../../store/useGameStore";
import {
  createTokenCostReport,
  summarizeTokenCosts,
  type TokenCostReport,
  type TokenCostSection,
} from "./tokenCost";

export function AiApiTraceConsole() {
  const traces = useGameStore((state) => state.aiApiTraces);
  const clearTraces = useGameStore((state) => state.clearAiApiTraces);
  const [health, setHealth] = useState<AiGatewayHealth | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const tokenSummary = useMemo(() => summarizeTokenCosts(traces), [traces]);

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
        <div className="mt-3 space-y-3">
          <TokenSummary summary={tokenSummary} />
          {traces.map((trace, index) => {
            const isError = Boolean(trace.error) || trace.status >= 400 || trace.status === 0;
            const cost = createTokenCostReport(trace);
            return (
              <details
                className={`rounded border p-2 ${
                  isError ? "border-[#5A2233]/70 bg-[#5A2233]/15" : "border-[#9C7A2E]/20 bg-[#221E29]/55"
                }`}
                key={trace.id}
                open={isError && index === 0}
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold text-[#E4D8BE]">{getAgentLabel(trace.agentId)}</span>
                    <span className="font-mono text-xs text-[#9C7A2E]">HTTP {trace.status || "réseau"}</span>
                    <span className="text-xs text-[#E4D8BE]/55">{trace.durationMs} ms</span>
                    <span className="text-xs text-[#E4D8BE]/55">
                      {formatTokens(cost.totalTokens)} tokens · {formatTokens(cost.inputTokens)} entrée / {formatTokens(cost.outputTokens)} sortie
                    </span>
                    <UsageSource source={cost.source} />
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
                <TokenExchangeDetails cost={cost} model={trace.model} />
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TokenSummary({ summary }: { summary: ReturnType<typeof summarizeTokenCosts> }) {
  return (
    <section className="rounded border border-[#9C7A2E]/30 bg-[#221E29]/70 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TokenMetric label="Total journal" value={formatTokens(summary.totalTokens)} suffix="tokens" strong />
        <TokenMetric label="Entrée" value={formatTokens(summary.inputTokens)} suffix="tokens" />
        <TokenMetric label="Sortie" value={formatTokens(summary.outputTokens)} suffix="tokens" />
        <TokenMetric label="Échanges" value={String(summary.exchanges)} suffix={`${summary.providerMeasured} mesuré(s)`} />
      </div>
      {summary.cachedInputTokens > 0 ? (
        <p className="mt-2 text-xs text-[#E4D8BE]/60">
          Dont {formatTokens(summary.cachedInputTokens)} tokens d’entrée signalés comme mis en cache.
        </p>
      ) : null}
      <details className="mt-3 border-t border-[#9C7A2E]/15 pt-2">
        <summary className="cursor-pointer text-xs font-semibold text-[#9C7A2E]">Répartition par agent</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-xs">
            <thead className="text-[#E4D8BE]/45">
              <tr><th className="py-1 font-normal">Agent</th><th className="font-normal">Appels</th><th className="font-normal">Entrée</th><th className="font-normal">Sortie</th><th className="font-normal">Total</th></tr>
            </thead>
            <tbody>
              {summary.byAgent.map((agent) => (
                <tr className="border-t border-[#9C7A2E]/10 text-[#E4D8BE]/75" key={agent.agentId}>
                  <td className="py-1.5">{getAgentLabel(agent.agentId)}</td>
                  <td>{agent.exchanges}</td>
                  <td>{formatTokens(agent.inputTokens)}</td>
                  <td>{formatTokens(agent.outputTokens)}</td>
                  <td className="font-semibold text-[#E4D8BE]">{formatTokens(agent.totalTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {summary.estimated > 0 ? (
        <p className="mt-2 text-[0.7rem] text-[#E4D8BE]/45">
          {summary.estimated} échange(s) ancien(s) ou en erreur utilisent une estimation locale. Les nouveaux appels utilisent le compteur du fournisseur lorsqu’il est disponible.
        </p>
      ) : null}
    </section>
  );
}

function TokenExchangeDetails({ cost, model }: { cost: TokenCostReport; model?: string }) {
  return (
    <section className="mt-3 rounded border border-[#9C7A2E]/20 bg-[#15121A]/55 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase text-[#9C7A2E]">Coût détaillé</p>
        <p className="text-xs text-[#E4D8BE]/50">
          {model ? `${model} · ` : ""}{cost.source === "provider" ? "mesure fournisseur" : "estimation locale"}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <TokenMetric label="Total" value={formatTokens(cost.totalTokens)} suffix="tokens" strong />
        <TokenMetric label="Entrée" value={formatTokens(cost.inputTokens)} suffix={`${formatTokens(cost.inputCharacters)} caractères`} />
        <TokenMetric label="Sortie" value={formatTokens(cost.outputTokens)} suffix={`${formatTokens(cost.outputCharacters)} caractères`} />
        <TokenMetric label="Cache" value={formatTokens(cost.cachedInputTokens)} suffix="entrée" />
        <TokenMetric label="Raisonnement" value={formatTokens(cost.reasoningTokens)} suffix="tokens" />
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <TokenBreakdown label="Détail de l’entrée" sections={cost.inputSections} total={cost.inputTokens} />
        <TokenBreakdown label="Détail de la sortie" sections={cost.outputSections} total={cost.outputTokens} />
      </div>
    </section>
  );
}

function TokenBreakdown({ label, sections, total }: { label: string; sections: TokenCostSection[]; total: number }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-[#E4D8BE]/70">{label}</p>
      <div className="space-y-1.5">
        {sections.length ? sections.map((section) => {
          const percentage = total > 0 ? Math.round(section.tokens / total * 100) : 0;
          return (
            <div key={section.label}>
              <div className="flex items-center justify-between gap-2 text-[0.7rem] text-[#E4D8BE]/60">
                <span>{section.label}</span>
                <span className="font-mono">{formatTokens(section.tokens)} · {percentage}%</span>
              </div>
              <div className="mt-0.5 h-1 overflow-hidden bg-[#221E29]">
                <div className="h-full bg-[#9C7A2E]" style={{ width: `${Math.max(percentage, section.tokens > 0 ? 2 : 0)}%` }} />
              </div>
            </div>
          );
        }) : <p className="text-xs text-[#E4D8BE]/40">Aucun contenu.</p>}
      </div>
    </div>
  );
}

function TokenMetric({ label, value, suffix, strong = false }: { label: string; value: string; suffix: string; strong?: boolean }) {
  return (
    <div className="border-l border-[#9C7A2E]/25 pl-2">
      <p className="text-[0.65rem] uppercase text-[#E4D8BE]/45">{label}</p>
      <p className={`${strong ? "text-lg text-[#9C7A2E]" : "text-sm text-[#E4D8BE]"} font-semibold`}>{value}</p>
      <p className="text-[0.65rem] text-[#E4D8BE]/40">{suffix}</p>
    </div>
  );
}

function UsageSource({ source }: { source: TokenCostReport["source"] }) {
  return (
    <span className={`border px-1.5 py-0.5 text-[0.65rem] uppercase ${
      source === "provider"
        ? "border-[#3F5641]/60 text-[#9CB49E]"
        : "border-[#9C7A2E]/30 text-[#E4D8BE]/45"
    }`}>
      {source === "provider" ? "mesuré" : "estimé"}
    </span>
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

function formatTokens(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

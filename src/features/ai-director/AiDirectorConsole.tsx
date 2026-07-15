import { useMemo, useState } from "react";
import type { AdminCommandResult } from "../admin/adminCommands";
import { useGameStore } from "../../store/useGameStore";
import { aiAgentDefinitions } from "./agents";
import {
  buildAiDirectorPrompt,
  createEmptyResolutionDraft,
  type AiPromptSnapshot,
} from "./promptBuilder";
import { isCommandAllowedForAgent } from "./commandPermissions";
import { AiGatewayError, runAgentOverHttp } from "./httpAiGateway";
import { parseAiDirectorResponse } from "./responseParser";
import {
  collectKnownCatalogIdsForCommands,
  orderAiCommandsForExecution,
  validateAiCommands,
  type AiCommandValidation,
} from "./validation";
import { executeAiCommand } from "./aiExecution";
import type {
  AiAgentId,
  AiAgentRequest,
  AiDirectorCommand,
  AiResolutionDraft,
  AiResolutionDraftPatch,
} from "./types";

interface QueuedAgentRequest extends AiAgentRequest {
  id: string;
  createdAt: number;
}

export function AiDirectorConsole() {
  const [selectedAgentId, setSelectedAgentId] = useState<AiAgentId>("requestAnalyzer");
  const [playerInput, setPlayerInput] = useState("");
  const [manualAgentRequest, setManualAgentRequest] = useState("");
  const [agentRequestQueue, setAgentRequestQueue] = useState<QueuedAgentRequest[]>([]);
  const [activeAgentRequestId, setActiveAgentRequestId] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState("");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<string | null>(null);
  const [isCallingApi, setIsCallingApi] = useState(false);
  const [executionHistory, setExecutionHistory] = useState<Array<AdminCommandResult & { command: string }>>([]);
  const [lastParsedAt, setLastParsedAt] = useState<number | null>(null);
  const [resolutionDraft, setResolutionDraft] = useState<AiResolutionDraft>(() => createEmptyResolutionDraft());

  const campaign = useGameStore((state) => state.campaign);
  const characters = useGameStore((state) => state.characters);
  const selectedCharacterId = useGameStore((state) => state.selectedCharacterId);
  const messages = useGameStore((state) => state.messages);
  const narrativeMomentum = useGameStore((state) => state.narrativeMomentum);
  const narrativeScene = useGameStore((state) => state.narrativeScene);
  const combat = useGameStore((state) => state.combat);
  const itemTemplates = useGameStore((state) => state.itemTemplates);
  const itemInstances = useGameStore((state) => state.itemInstances);
  const abilityTemplates = useGameStore((state) => state.abilityTemplates);
  const abilityInstances = useGameStore((state) => state.abilityInstances);
  const effectTemplates = useGameStore((state) => state.effectTemplates);
  const enemyTemplates = useGameStore((state) => state.enemyTemplates);
  const disabledContentTemplateIds = useGameStore((state) => state.disabledContentTemplateIds);
  const characterDerivedScores = useGameStore((state) => state.characterDerivedScores);

  const storageSnapshot = useMemo(() => ({
    campaign,
    characters,
    selectedCharacterId,
    messages,
    narrativeMomentum,
    narrativeScene,
    combat,
    itemTemplates,
    itemInstances,
    abilityTemplates,
    abilityInstances,
    effectTemplates,
    enemyTemplates,
    disabledContentTemplateIds,
    characterDerivedScores,
  }), [
    abilityInstances,
    abilityTemplates,
    effectTemplates,
    enemyTemplates,
    disabledContentTemplateIds,
    campaign,
    characterDerivedScores,
    characters,
    combat,
    itemInstances,
    itemTemplates,
    messages,
    narrativeMomentum,
    narrativeScene,
    selectedCharacterId,
  ]);
  const request = useMemo(() => parseManualAgentRequest(selectedAgentId, manualAgentRequest), [manualAgentRequest, selectedAgentId]);
  const prompt = useMemo(
    () => buildAiDirectorPrompt(storageSnapshot, selectedAgentId, { playerInput, request, resolutionDraft }),
    [playerInput, request, resolutionDraft, selectedAgentId, storageSnapshot],
  );
  const parsed = useMemo(() => parseAiDirectorResponse(rawResponse), [rawResponse]);
  const validations = useMemo(
    () =>
      parsed.response
        ? validateAiCommands(createCommandsWithNarration(selectedAgentId, parsed.response.narration, parsed.response.commands), {
            agentId: selectedAgentId,
            characters: storageSnapshot.characters,
            selectedCharacterId: storageSnapshot.selectedCharacterId,
            combat: storageSnapshot.combat,
            itemTemplates: storageSnapshot.itemTemplates,
            itemInstances: storageSnapshot.itemInstances,
            abilityTemplates: storageSnapshot.abilityTemplates,
            effectTemplates: storageSnapshot.effectTemplates,
            enemyTemplates: storageSnapshot.enemyTemplates,
          })
        : [],
    [
      parsed.response,
      selectedAgentId,
      storageSnapshot.characters,
      storageSnapshot.combat,
      storageSnapshot.itemInstances,
      storageSnapshot.itemTemplates,
      storageSnapshot.abilityTemplates,
      storageSnapshot.effectTemplates,
      storageSnapshot.enemyTemplates,
      storageSnapshot.selectedCharacterId,
    ],
  );
  const executable = validations.length > 0 && validations.every((validation) => validation.status !== "error");

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("Prompt copié.");
    } catch {
      setCopyStatus("Copie impossible, sélectionne le texte manuellement.");
    }
  }

  async function handleRunAgentWithApi() {
    setApiStatus(null);
    setIsCallingApi(true);

    try {
      const response = await runAgentOverHttp(selectedAgentId, prompt);
      setRawResponse(response);
      setApiStatus("Réponse reçue. Vérifie-la puis ajoute-la au dossier.");
    } catch (error) {
      setApiStatus(
        error instanceof AiGatewayError
          ? error.message
          : "La passerelle IA est indisponible. Le mode copier-coller reste utilisable.",
      );
    } finally {
      setIsCallingApi(false);
    }
  }

  function handleUseAgentRequest(request: AiAgentRequest) {
    setSelectedAgentId(request.agent);
    setManualAgentRequest(JSON.stringify(request, null, 2));
    setCopyStatus(null);
  }

  function handleAnalyze() {
    setLastParsedAt(Date.now());

    if (!parsed.response) {
      return;
    }

    let nextDraft = parsed.response.draftPatch
      ? mergeResolutionDraft(resolutionDraft, parsed.response.draftPatch)
      : resolutionDraft;
    const officialRequests = selectedAgentId === "requestAnalyzer" ? parsed.response.agentRequests : [];

    if (selectedAgentId !== "requestAnalyzer" && parsed.response.agentRequests.length > 0) {
      nextDraft = mergeResolutionDraft(nextDraft, {
        suggestedAgents: parsed.response!.agentRequests,
        warnings: [
          `${getAgentName(selectedAgentId)} a tenté de créer des demandes agents officielles. Elles ont été converties en suggestions, car seul Analyser la demande peut remplir la file.`,
        ],
      });
    }

    setResolutionDraft(nextDraft);
    enqueueAgentRequests([
      ...officialRequests,
      ...createAutomaticPipelineRequests(nextDraft, parsed.response.commands, selectedAgentId),
    ]);
  }

  function enqueueAgentRequests(requests: AiAgentRequest[]) {
    if (!requests.length) {
      return;
    }

    setAgentRequestQueue((currentQueue) => {
      const knownSignatures = new Set(currentQueue.map(createAgentRequestSignature));
      const newRequests = requests.flatMap((agentRequest) => {
        const queuedRequest: QueuedAgentRequest = {
          ...agentRequest,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        };
        const signature = createAgentRequestSignature(queuedRequest);

        if (knownSignatures.has(signature)) {
          return [];
        }

        knownSignatures.add(signature);
        return [queuedRequest];
      });

      return [...currentQueue, ...newRequests].sort(compareQueuedAgentRequests);
    });
  }

  function handleExecute() {
    if (!parsed.response || !executable) {
      return;
    }

    const commands = orderAiCommandsForExecution(
      createCommandsWithNarration(selectedAgentId, parsed.response.narration, parsed.response.commands),
    );
    const knownCatalogIds = collectKnownCatalogIdsForCommands(commands, storageSnapshot);
    const results = commands.map((command) => {
      const current = useGameStore.getState();
      return executeAiCommand(command, createLiveSnapshot(current), current, { knownCatalogIds });
    });
    setExecutionHistory((history) => [...results, ...history].slice(0, 10));
    const executionDraft = createExecutionDraft(results);
    const nextDraft = mergeResolutionDraft(resolutionDraft, executionDraft);

    setResolutionDraft(nextDraft);
    if (selectedAgentId !== "narrationManager") {
      enqueueAgentRequests([{
        agent: "narrationManager",
        reason: "Après exécution locale: raconter uniquement les résultats effectivement appliqués ou refusés par le moteur.",
        input: {
          execution: executionDraft.facts,
          narrationInputs: executionDraft.narrationInputs,
        },
      }]);
    }
  }

  return (
    <section className="mb-6">
      <h3 className="rune-label mb-2 text-sm">MJ IA manuel</h3>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="manuscript-card rounded p-3">
          <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="text-sm text-[#E4D8BE]/70">
              Agent
              <select
                className="mt-1 w-full rounded border border-[#9C7A2E]/25 bg-[#15121A] px-3 py-2 text-sm text-[#E4D8BE]"
                onChange={(event) => setSelectedAgentId(event.target.value as AiAgentId)}
                value={selectedAgentId}
              >
                {aiAgentDefinitions.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="fantasy-button self-end rounded px-3 py-2 text-sm font-semibold" onClick={handleCopyPrompt} type="button">
              Copier
            </button>
          </div>
          {copyStatus ? <p className="mb-2 text-xs text-[#9C7A2E]">{copyStatus}</p> : null}
          {apiStatus ? <p className="mb-2 text-xs text-[#9C7A2E]">{apiStatus}</p> : null}
          <label className="mb-3 block text-sm text-[#E4D8BE]/70">
            Réponse du joueur simulée
            <textarea
              className="mt-1 h-20 w-full resize-none rounded border border-[#9C7A2E]/25 bg-[#15121A] px-3 py-2 text-sm text-[#E4D8BE] placeholder:text-[#E4D8BE]/40"
              onChange={(event) => setPlayerInput(event.target.value)}
              placeholder="Ex: Je fouille les décombres derrière le pilier."
              value={playerInput}
            />
          </label>
          <label className="mb-3 block text-sm text-[#E4D8BE]/70">
            Demande agent optionnelle
            <textarea
              className="mt-1 h-20 w-full resize-none rounded border border-[#9C7A2E]/25 bg-[#15121A] px-3 py-2 font-mono text-xs text-[#E4D8BE]"
              onChange={(event) => setManualAgentRequest(event.target.value)}
              placeholder='Ex: {"agent":"combatManager","reason":"Résoudre la cible la plus pertinente"}'
              value={manualAgentRequest}
            />
          </label>
          <textarea
            className="h-[420px] w-full resize-none rounded border border-[#9C7A2E]/25 bg-[#15121A] px-3 py-2 font-mono text-xs text-[#E4D8BE]"
            readOnly
            value={prompt}
          />
        </div>

        <div className="manuscript-card rounded p-3">
          <label className="block text-sm text-[#E4D8BE]/70">
            Réponse IA à coller
            <textarea
              className="mt-1 h-48 w-full resize-y rounded border border-[#9C7A2E]/25 bg-[#15121A] px-3 py-2 font-mono text-xs text-[#E4D8BE]"
              onChange={(event) => setRawResponse(event.target.value)}
              placeholder='Colle ici le JSON renvoyé par l’IA.'
              value={rawResponse}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="fantasy-button rounded px-3 py-2 text-sm font-semibold disabled:opacity-40"
              disabled={isCallingApi}
              onClick={handleRunAgentWithApi}
              type="button"
            >
              {isCallingApi ? "Interrogation..." : "Interroger l'API"}
            </button>
            <button className="fantasy-button rounded px-3 py-2 text-sm font-semibold" onClick={handleAnalyze} type="button">
              Analyser et ajouter au dossier
            </button>
            <button
              className="fantasy-button rounded px-3 py-2 text-sm font-semibold disabled:opacity-40"
              disabled={!executable}
              onClick={handleExecute}
              type="button"
            >
              Exécuter les modifications
            </button>
          </div>
          <ResolutionDraftPanel
            draft={resolutionDraft}
            onCopy={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify(resolutionDraft, null, 2));
                setCopyStatus("Dossier copié.");
              } catch {
                setCopyStatus("Copie impossible, sélectionne le dossier manuellement.");
              }
            }}
            onReset={() => setResolutionDraft(createEmptyResolutionDraft())}
          />

          <div className="mt-3 space-y-2">
            {parsed.errors.map((error) => (
              <p className="rounded border border-[#5A2233] bg-[#5A2233]/25 px-3 py-2 text-sm text-[#E4D8BE]" key={error}>
                {error}
              </p>
            ))}
            {lastParsedAt && parsed.response ? (
              <article className="rounded border border-[#9C7A2E]/20 bg-[#15121A]/65 p-3 text-sm text-[#E4D8BE]">
                <p className="font-semibold text-[#9C7A2E]">Narration détectée</p>
                <p className="mt-1 whitespace-pre-wrap text-[#E4D8BE]/75">
                  {parsed.response.narration || "Aucune narration."}
                </p>
              </article>
            ) : null}
            {validations.map((validation, index) => (
              <ValidationCard key={`${validation.command.type}-${index}`} validation={validation} />
            ))}
            {agentRequestQueue.length > 0 ? (
              <section className="rounded border border-[#9C7A2E]/20 bg-[#15121A]/45 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9C7A2E]">
                    Demandes agents
                  </p>
                  <button
                    className="rounded border border-[#9C7A2E]/25 px-2 py-1 text-[11px] text-[#E4D8BE]/70"
                    onClick={() => {
                      setAgentRequestQueue([]);
                      setActiveAgentRequestId(null);
                    }}
                    type="button"
                  >
                    Vider
                  </button>
                </div>
                <ol className="space-y-2">
                  {agentRequestQueue.map((agentRequest, index) => (
                    <li
                      className={`rounded border p-2 text-sm ${
                        activeAgentRequestId === agentRequest.id
                          ? "border-[#9C7A2E] bg-[#5A2233]/25"
                          : "border-[#9C7A2E]/20 bg-[#15121A]/65"
                      }`}
                      key={agentRequest.id}
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 min-w-5 text-right text-xs font-black text-[#9C7A2E]">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[#E4D8BE]">
                            {getAgentName(agentRequest.agent)}
                          </p>
                          <p className="mt-1 text-[#E4D8BE]/70">{agentRequest.reason}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              className="rounded border border-[#9C7A2E]/30 px-3 py-1.5 text-xs text-[#E4D8BE]"
                              onClick={() => {
                                setActiveAgentRequestId(agentRequest.id);
                                handleUseAgentRequest(agentRequest);
                              }}
                              type="button"
                            >
                              Préparer ce prompt
                            </button>
                            <button
                              className="rounded border border-[#5A2233]/45 px-3 py-1.5 text-xs text-[#E4D8BE]/70"
                              onClick={() => {
                                setAgentRequestQueue((queue) => queue.filter((request) => request.id !== agentRequest.id));
                                setActiveAgentRequestId((current) => (current === agentRequest.id ? null : current));
                              }}
                              type="button"
                            >
                              Retirer
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
            {executionHistory.length > 0 ? (
              <div className="pt-2">
                <p className="mb-2 text-xs font-semibold uppercase text-[#9C7A2E]">Dernières exécutions</p>
                {executionHistory.map((entry, index) => (
                  <article
                    className={`mb-2 rounded border px-3 py-2 text-sm ${
                      entry.status === "error"
                        ? "border-[#5A2233] bg-[#5A2233]/25"
                        : "border-[#9C7A2E]/20 bg-[#15121A]/65"
                    }`}
                    key={`${entry.command}-${index}`}
                  >
                    <p className="font-mono text-xs text-[#9C7A2E]">{entry.command}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[#E4D8BE]/75">{entry.message}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function ValidationCard({ validation }: { validation: AiCommandValidation }) {
  const colorClass =
    validation.status === "error"
      ? "border-[#5A2233] bg-[#5A2233]/25"
      : validation.status === "warning"
        ? "border-[#B5612A]/60 bg-[#B5612A]/15"
        : "border-[#3F5641]/60 bg-[#3F5641]/15";

  return (
    <article className={`rounded border px-3 py-2 text-sm ${colorClass}`}>
      <p className="font-mono text-xs text-[#9C7A2E]">{JSON.stringify(validation.command)}</p>
      <p className="mt-1 text-[#E4D8BE]/75">{validation.message}</p>
    </article>
  );
}

function ResolutionDraftPanel({
  draft,
  onCopy,
  onReset,
}: {
  draft: AiResolutionDraft;
  onCopy: () => void;
  onReset: () => void;
}) {
  const hasContent =
    draft.intentions.length > 0 ||
    draft.facts.length > 0 ||
    draft.suggestedAgents.length > 0 ||
    draft.proposedCommands.length > 0 ||
    draft.narrationInputs.length > 0 ||
    draft.safety.length > 0 ||
    draft.warnings.length > 0 ||
    draft.questions.length > 0;

  return (
    <section className="mt-3 rounded border border-[#9C7A2E]/20 bg-[#15121A]/45 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9C7A2E]">
          Dossier de résolution
        </p>
        <div className="flex gap-2">
          <button className="rounded border border-[#9C7A2E]/25 px-2 py-1 text-[11px] text-[#E4D8BE]/70" onClick={onCopy} type="button">
            Copier
          </button>
          <button className="rounded border border-[#5A2233]/45 px-2 py-1 text-[11px] text-[#E4D8BE]/70" onClick={onReset} type="button">
            Réinitialiser
          </button>
        </div>
      </div>

      {!hasContent ? (
        <p className="text-sm text-[#E4D8BE]/55">
          Vide pour le moment. Les agents y ajouteront intentions, faits, alertes et éléments de narration.
        </p>
      ) : (
        <div className="grid gap-2 text-sm text-[#E4D8BE]/75">
          <DraftSection
            items={draft.intentions.map((intention) => `${intention.type}: ${intention.text}`)}
            title={`Intentions (${draft.intentions.length})`}
          />
          <DraftSection
            items={draft.facts.map((fact) => `${fact.kind} · ${fact.source}: ${fact.content}`)}
            title={`Faits (${draft.facts.length})`}
          />
          <DraftSection
            items={draft.suggestedAgents.map((request) => `${getAgentName(request.agent)}: ${request.reason}`)}
            title={`Agents suggérés (${draft.suggestedAgents.length})`}
          />
          <DraftSection
            items={draft.narrationInputs.map((input) => `${input.priority ?? "normal"} · ${input.source}: ${input.content}`)}
            title={`Pour narration (${draft.narrationInputs.length})`}
          />
          <DraftSection
            items={draft.safety.map((safety) => `${safety.category} · ${safety.level}: ${safety.guidance}`)}
            title={`Sécurité narrative (${draft.safety.length})`}
          />
          <DraftSection
            items={draft.proposedCommands.map((command) => JSON.stringify(command))}
            title={`Commandes proposées (${draft.proposedCommands.length})`}
            mono
          />
          <DraftSection items={draft.warnings} title={`Alertes (${draft.warnings.length})`} />
          <DraftSection items={draft.questions} title={`Questions (${draft.questions.length})`} />
        </div>
      )}
    </section>
  );
}

function DraftSection({ items, title, mono = false }: { items: string[]; title: string; mono?: boolean }) {
  if (!items.length) {
    return null;
  }

  return (
    <details className="rounded border border-[#9C7A2E]/15 bg-[#221E29]/55 p-2" open={items.length <= 3}>
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[#9C7A2E]">
        {title}
      </summary>
      <ul className="mt-2 space-y-1">
        {items.map((item, index) => (
          <li className={`${mono ? "font-mono text-xs" : "text-sm"} whitespace-pre-wrap text-[#E4D8BE]/75`} key={`${title}-${index}-${item}`}>
            {item}
          </li>
        ))}
      </ul>
    </details>
  );
}

function getAgentName(agentId: AiAgentId): string {
  return aiAgentDefinitions.find((agent) => agent.id === agentId)?.name ?? agentId;
}

function mergeResolutionDraft(draft: AiResolutionDraft, patch: AiResolutionDraftPatch): AiResolutionDraft {
  return {
    intentions: mergeUniqueItems(draft.intentions, patch.intentions),
    facts: mergeUniqueItems(draft.facts, patch.facts),
    suggestedAgents: mergeUniqueItems(draft.suggestedAgents, patch.suggestedAgents),
    proposedCommands: mergeUniqueItems(draft.proposedCommands, patch.proposedCommands),
    narrationInputs: mergeUniqueItems(draft.narrationInputs, patch.narrationInputs),
    scenePatches: mergeUniqueItems(draft.scenePatches, patch.scenePatches),
    safety: mergeUniqueItems(draft.safety, patch.safety),
    warnings: mergeUniqueStrings(draft.warnings, patch.warnings),
    questions: mergeUniqueStrings(draft.questions, patch.questions),
  };
}

function createAutomaticPipelineRequests(
  draft: AiResolutionDraft,
  commands: AiDirectorCommand[],
  currentAgentId: AiAgentId,
): AiAgentRequest[] {
  const requests: AiAgentRequest[] = [];
  const hasResolutionIntent = draft.intentions.some((intention) => intention.requiresResolution);
  const hasProposedCommands = draft.proposedCommands.length > 0;
  const hasFinalCommands = commands.length > 0;
  const hasNarrationMatter = draft.narrationInputs.length > 0 || draft.questions.length > 0;
  const hasSafetyCaution = draft.safety.some((safety) => safety.level !== "normal");
  const hasWarnings = draft.warnings.length > 0;
  const needsRules = hasProposedCommands || hasFinalCommands || hasSafetyCaution || hasWarnings;
  const needsExecution = hasProposedCommands || hasFinalCommands || hasResolutionIntent;
  const needsNarration = hasNarrationMatter || hasSafetyCaution || draft.facts.some((fact) => fact.visibility === "playerVisible");

  if (needsRules && currentAgentId !== "rulesValidator") {
    requests.push({
      agent: "rulesValidator",
      reason: "Auto-pipeline: vérifier règles, sécurité, ids et cohérence avant suite.",
      input: createPipelineInput(draft),
    });
  }

  if (!needsExecution && needsNarration && currentAgentId !== "narrationManager") {
    requests.push({
      agent: "narrationManager",
      reason: "Auto-pipeline: produire la réponse joueur après les agents métier, sans exécution moteur nécessaire.",
      input: {
        narrationInputs: draft.narrationInputs,
        questions: draft.questions,
        safety: draft.safety,
        playerVisibleFacts: draft.facts.filter((fact) => fact.visibility === "playerVisible"),
      },
    });
  }

  return requests;
}

function createExecutionDraft(results: Array<AdminCommandResult & { command: string }>): AiResolutionDraftPatch {
  const successes = results.filter((result) => result.status === "success");
  const failures = results.filter((result) => result.status === "error");

  return {
    facts: results.map((result) => ({
      source: "moteur local",
      kind: result.status === "error" ? "échec d'exécution" : "résultat d'exécution",
      content: result.message,
      visibility: result.status === "error" ? "requiresCheck" : "playerVisible",
    })),
    narrationInputs: [
      ...successes.map((result) => ({
        source: "moteur local",
        priority: "high" as const,
        visibility: "playerVisible" as const,
        content: `Succès confirmé: ${result.message}`,
      })),
      ...failures.map((result) => ({
        source: "moteur local",
        priority: "high" as const,
        visibility: "requiresCheck" as const,
        content: `Action refusée ou échouée: ${result.message}`,
      })),
    ],
    warnings: failures.map((result) => `Moteur local: ${result.message}`),
  };
}

function compareQueuedAgentRequests(left: QueuedAgentRequest, right: QueuedAgentRequest): number {
  const priority = getAgentQueuePriority(left.agent) - getAgentQueuePriority(right.agent);
  return priority || left.createdAt - right.createdAt;
}

function getAgentQueuePriority(agentId: AiAgentId): number {
  return aiAgentDefinitions.findIndex((agent) => agent.id === agentId);
}

function createPipelineInput(draft: AiResolutionDraft) {
  return {
    intentions: draft.intentions,
    proposedCommands: draft.proposedCommands,
    warnings: draft.warnings,
    safety: draft.safety,
    questions: draft.questions,
    scenePatches: draft.scenePatches,
  };
}

function mergeUniqueItems<T>(current: T[], next?: T[]): T[] {
  if (!next?.length) {
    return current;
  }

  const known = new Set(current.map((item) => JSON.stringify(item)));
  const additions = next.filter((item) => {
    const signature = JSON.stringify(item);

    if (known.has(signature)) {
      return false;
    }

    known.add(signature);
    return true;
  });

  return [...current, ...additions];
}

function mergeUniqueStrings(current: string[], next?: string[]): string[] {
  if (!next?.length) {
    return current;
  }

  const known = new Set(current);
  const additions = next.filter((item) => {
    const trimmed = item.trim();

    if (!trimmed || known.has(trimmed)) {
      return false;
    }

    known.add(trimmed);
    return true;
  });

  return [...current, ...additions];
}

function createAgentRequestSignature(request: AiAgentRequest): string {
  return JSON.stringify({
    agent: request.agent,
    reason: request.reason,
    input: request.input ?? null,
  });
}

function parseManualAgentRequest(agent: AiAgentId, input: string): AiAgentRequest | undefined {
  if (!input.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(input) as Partial<AiAgentRequest>;
    return {
      agent: parsed.agent ?? agent,
      reason: typeof parsed.reason === "string" ? parsed.reason : "Demande manuelle.",
      input: parsed.input ?? parsed,
    };
  } catch {
    return {
      agent,
      reason: input,
      input,
    };
  }
}

function createCommandsWithNarration(agentId: AiAgentId, narration: string, commands: AiDirectorCommand[]): AiDirectorCommand[] {
  const trimmedNarration = narration.trim();
  const hasNarrationCommand = commands.some((command) => command.type === "sendNarration");

  return trimmedNarration && !hasNarrationCommand && isCommandAllowedForAgent(agentId, "sendNarration")
    ? [{ type: "sendNarration", content: trimmedNarration }, ...commands]
    : commands;
}

function createLiveSnapshot(state: ReturnType<typeof useGameStore.getState>): AiPromptSnapshot {
  return {
    campaign: state.campaign,
    characters: state.characters,
    selectedCharacterId: state.selectedCharacterId,
    messages: state.messages,
    narrativeMomentum: state.narrativeMomentum,
    combat: state.combat,
    itemTemplates: state.itemTemplates,
    itemInstances: state.itemInstances,
    abilityTemplates: state.abilityTemplates,
    abilityInstances: state.abilityInstances,
    effectTemplates: state.effectTemplates,
    enemyTemplates: state.enemyTemplates,
    disabledContentTemplateIds: state.disabledContentTemplateIds,
    characterDerivedScores: state.characterDerivedScores,
    narrativeScene: state.narrativeScene,
  };
}

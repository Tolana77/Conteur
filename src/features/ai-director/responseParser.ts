import type {
  AiAgentId,
  AiDirectorCommand,
  AiDirectorResponse,
  AiParsedResponse,
  AiResolutionDraftPatch,
  AiResolutionVisibility,
  AiSafetyCategory,
  AiSafetyLevel,
} from "./types";
import { getAllCommandTypes, type AiCommandType } from "./commandPermissions";

const agentIds: AiAgentId[] = [
  "requestAnalyzer",
  "characterManager",
  "actionManager",
  "combatManager",
  "combatSetupManager",
  "tacticalTemplateManager",
  "assetTemplateManager",
  "worldManager",
  "rulesValidator",
  "narrationManager",
];
const commandTypes = new Set(getAllCommandTypes());

export function parseAiDirectorResponse(input: string): AiParsedResponse {
  const rawJson = extractJson(input);

  if (!rawJson) {
    return { response: null, errors: ["Aucun objet JSON trouvé dans la réponse collée."] };
  }

  try {
    const parsed = JSON.parse(rawJson) as unknown;
    const normalized = normalizeResponse(parsed);

    return {
      response: normalized.response,
      errors: normalized.errors,
      rawJson,
    };
  } catch (error) {
    return {
      response: null,
      errors: [error instanceof Error ? error.message : "JSON invalide."],
      rawJson,
    };
  }
}

function extractJson(input: string): string | null {
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }

  const firstBrace = input.indexOf("{");
  const lastBrace = input.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return input.slice(firstBrace, lastBrace + 1).trim();
}

function normalizeResponse(value: unknown): { response: AiDirectorResponse | null; errors: string[] } {
  const errors: string[] = [];

  if (!value || typeof value !== "object") {
    return { response: null, errors: ["La réponse doit être un objet JSON."] };
  }

  const candidate = value as Record<string, unknown>;
  const narration = typeof candidate.narration === "string" ? candidate.narration.trim() : "";
  const commands = Array.isArray(candidate.commands)
    ? candidate.commands.flatMap((command, index) => normalizeCommand(command, index, errors))
    : [];
  const agentRequests = Array.isArray(candidate.agentRequests)
    ? candidate.agentRequests.flatMap((request, index) => normalizeAgentRequest(request, index, errors))
    : [];
  const draftPatch = normalizeDraftPatch(candidate.draftPatch, errors);
  const notes = Array.isArray(candidate.notes)
    ? candidate.notes.filter((note): note is string => typeof note === "string")
    : undefined;

  return {
    response: { narration, commands, agentRequests, draftPatch, notes },
    errors,
  };
}

function normalizeDraftPatch(value: unknown, errors: string[]): AiResolutionDraftPatch | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "object") {
    errors.push("draftPatch: objet attendu.");
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const patch: AiResolutionDraftPatch = {};

  if (Array.isArray(candidate.intentions)) {
    patch.intentions = candidate.intentions.flatMap((intention, index) => {
      if (!intention || typeof intention !== "object") {
        errors.push(`draftPatch.intentions ${index + 1}: objet attendu.`);
        return [];
      }

      const item = intention as Record<string, unknown>;
      const type = getRequiredString(item.type);
      const text = getRequiredString(item.text);

      if (!type || !text) {
        errors.push(`draftPatch.intentions ${index + 1}: type ou text manquant.`);
        return [];
      }

      return [{
        id: getOptionalString(item.id),
        type,
        text,
        requiresResolution: typeof item.requiresResolution === "boolean" ? item.requiresResolution : undefined,
        confidence: getNumber(item.confidence) ?? undefined,
      }];
    });
  }

  if (Array.isArray(candidate.facts)) {
    patch.facts = candidate.facts.flatMap((fact, index) => {
      if (!fact || typeof fact !== "object") {
        errors.push(`draftPatch.facts ${index + 1}: objet attendu.`);
        return [];
      }

      const item = fact as Record<string, unknown>;
      const kind = getRequiredString(item.kind);
      const content = getRequiredString(item.content);

      if (!kind || !content) {
        errors.push(`draftPatch.facts ${index + 1}: kind ou content manquant.`);
        return [];
      }

      return [{
        id: getOptionalString(item.id),
        source: getRequiredString(item.source) || "unknown",
        kind,
        content,
        visibility: isResolutionVisibility(item.visibility) ? item.visibility : undefined,
        suggestedCheck: getOptionalString(item.suggestedCheck),
        relatedIds: normalizeStringArray(item.relatedIds),
      }];
    });
  }

  if (Array.isArray(candidate.suggestedAgents)) {
    patch.suggestedAgents = candidate.suggestedAgents.flatMap((request, index) =>
      normalizeAgentRequest(request, index, errors),
    );
  }

  if (Array.isArray(candidate.proposedCommands)) {
    patch.proposedCommands = candidate.proposedCommands.flatMap((command, index) =>
      normalizeCommand(command, index, errors),
    );
  }

  if (Array.isArray(candidate.narrationInputs)) {
    patch.narrationInputs = candidate.narrationInputs.flatMap((input, index) => {
      if (!input || typeof input !== "object") {
        errors.push(`draftPatch.narrationInputs ${index + 1}: objet attendu.`);
        return [];
      }

      const item = input as Record<string, unknown>;
      const content = getRequiredString(item.content);

      if (!content) {
        errors.push(`draftPatch.narrationInputs ${index + 1}: content manquant.`);
        return [];
      }

      return [{
        id: getOptionalString(item.id),
        source: getRequiredString(item.source) || "unknown",
        content,
        priority: isPriority(item.priority) ? item.priority : undefined,
        visibility: isResolutionVisibility(item.visibility) ? item.visibility : undefined,
      }];
    });
  }

  if (Array.isArray(candidate.safety)) {
    patch.safety = candidate.safety.flatMap((assessment, index) => {
      if (!assessment || typeof assessment !== "object") {
        errors.push(`draftPatch.safety ${index + 1}: objet attendu.`);
        return [];
      }

      const item = assessment as Record<string, unknown>;
      const category = isSafetyCategory(item.category) ? item.category : null;
      const level = isSafetyLevel(item.level) ? item.level : null;
      const guidance = getRequiredString(item.guidance);

      if (!category || !level || !guidance) {
        errors.push(`draftPatch.safety ${index + 1}: category, level ou guidance invalide.`);
        return [];
      }

      return [{
        category,
        level,
        guidance,
        confidence: getNumber(item.confidence) ?? undefined,
      }];
    });
  }

  if (Array.isArray(candidate.warnings)) {
    patch.warnings = normalizeStringArray(candidate.warnings);
  }

  if (Array.isArray(candidate.questions)) {
    patch.questions = normalizeStringArray(candidate.questions);
  }

  return Object.keys(patch).length > 0 ? patch : undefined;
}

function normalizeCommand(command: unknown, index: number, errors: string[]): AiDirectorCommand[] {
  if (!command || typeof command !== "object") {
    errors.push(`Commande ${index + 1}: objet attendu.`);
    return [];
  }

  const candidate = command as Record<string, unknown>;
  const type = typeof candidate.type === "string" ? candidate.type : "";

  if (!commandTypes.has(type as AiCommandType)) {
    errors.push(`Commande ${index + 1}: type inconnu "${type}".`);
    return [];
  }

  if (type === "sendNarration") {
    return typeof candidate.content === "string"
      ? [{ type, content: candidate.content }]
      : addCommandError(errors, index, "content manquant.");
  }

  if (type === "adminCommand") {
    return typeof candidate.command === "string"
      ? [{ type, command: candidate.command, reason: getOptionalString(candidate.reason) }]
      : addCommandError(errors, index, "command manquant.");
  }

  if (type === "dealDamage") {
    const amount = getNumber(candidate.amount);
    return typeof candidate.characterId === "string" && amount !== null
      ? [{ type, characterId: candidate.characterId, amount, damageType: getOptionalString(candidate.damageType) }]
      : addCommandError(errors, index, "characterId ou amount invalide.");
  }

  if (type === "heal") {
    const amount = getNumber(candidate.amount);
    return typeof candidate.characterId === "string" && amount !== null
      ? [{ type, characterId: candidate.characterId, amount }]
      : addCommandError(errors, index, "characterId ou amount invalide.");
  }

  if (type === "useItem") {
    return typeof candidate.characterId === "string" && typeof candidate.itemId === "string"
      ? [{ type, characterId: candidate.characterId, itemId: candidate.itemId, targetId: getOptionalString(candidate.targetId) }]
      : addCommandError(errors, index, "characterId ou itemId invalide.");
  }

  if (type === "giveItem") {
    const quantity = getNumber(candidate.quantity);
    return typeof candidate.characterId === "string" && typeof candidate.templateId === "string"
      ? [{ type, characterId: candidate.characterId, templateId: candidate.templateId, quantity: quantity ?? undefined }]
      : addCommandError(errors, index, "characterId ou templateId invalide.");
  }

  if (type === "createItem") {
    const template = getPlainObject(candidate.template);
    const instance = getPlainObject(candidate.instance);

    return typeof candidate.templateId === "string" || template || instance
      ? [{ type, templateId: getOptionalString(candidate.templateId), template, instance, reason: getOptionalString(candidate.reason) }]
      : addCommandError(errors, index, "templateId, template ou instance attendu.");
  }

  if (type === "destroyItem") {
    return typeof candidate.itemId === "string"
      ? [{ type, itemId: candidate.itemId, reason: getOptionalString(candidate.reason) }]
      : addCommandError(errors, index, "itemId manquant.");
  }

  if (type === "modifyItem") {
    const value = getPrimitiveValue(candidate.value);

    return typeof candidate.itemId === "string" && typeof candidate.path === "string" && value !== null
      ? [{ type, itemId: candidate.itemId, path: candidate.path, value, reason: getOptionalString(candidate.reason) }]
      : addCommandError(errors, index, "itemId, path ou value invalide.");
  }

  if (type === "changeCharacterStat") {
    const value = getNumber(candidate.value);
    const mode = candidate.mode === "add" || candidate.mode === "set" ? candidate.mode : null;

    return typeof candidate.characterId === "string" && typeof candidate.stat === "string" && value !== null && mode
      ? [{ type, characterId: candidate.characterId, stat: candidate.stat, value, mode, reason: getOptionalString(candidate.reason) }]
      : addCommandError(errors, index, "characterId, stat, value ou mode invalide.");
  }

  if (type === "updateCharacterHistory") {
    return typeof candidate.characterId === "string" && typeof candidate.entry === "string"
      ? [{
          type,
          characterId: candidate.characterId,
          entry: candidate.entry,
          visibility: isResolutionVisibility(candidate.visibility) ? candidate.visibility : undefined,
        }]
      : addCommandError(errors, index, "characterId ou entry invalide.");
  }

  if (type === "abilityCheck") {
    const dc = getNumber(candidate.dc);

    return typeof candidate.characterId === "string" && typeof candidate.stat === "string"
      ? [{
          type,
          characterId: candidate.characterId,
          stat: candidate.stat,
          dc: dc ?? undefined,
          skill: getOptionalString(candidate.skill),
          visibility: isDiceVisibility(candidate.visibility) ? candidate.visibility : undefined,
          reason: getOptionalString(candidate.reason),
        }]
      : addCommandError(errors, index, "characterId ou stat invalide.");
  }

  if (type === "skillCheck") {
    const dc = getNumber(candidate.dc);

    return typeof candidate.characterId === "string" && typeof candidate.skill === "string"
      ? [{
          type,
          characterId: candidate.characterId,
          skill: candidate.skill,
          stat: getOptionalString(candidate.stat),
          dc: dc ?? undefined,
          visibility: isDiceVisibility(candidate.visibility) ? candidate.visibility : undefined,
          reason: getOptionalString(candidate.reason),
        }]
      : addCommandError(errors, index, "characterId ou skill invalide.");
  }

  if (type === "contestCheck") {
    return typeof candidate.actorId === "string" &&
      typeof candidate.targetId === "string" &&
      typeof candidate.actorFormula === "string" &&
      typeof candidate.targetFormula === "string"
      ? [{
          type,
          actorId: candidate.actorId,
          targetId: candidate.targetId,
          actorFormula: candidate.actorFormula,
          targetFormula: candidate.targetFormula,
          reason: getOptionalString(candidate.reason),
        }]
      : addCommandError(errors, index, "actorId, targetId, actorFormula ou targetFormula invalide.");
  }

  if (type === "resolveGameAction") {
    return typeof candidate.action === "string"
      ? [{
          type,
          actorId: getOptionalString(candidate.actorId),
          action: candidate.action,
          difficulty: getOptionalString(candidate.difficulty),
          proposedCheck: getOptionalString(candidate.proposedCheck),
          stakes: getOptionalString(candidate.stakes),
        }]
      : addCommandError(errors, index, "action manquante.");
  }

  if (type === "calculateHazardDamage") {
    const save = getSave(candidate.save);

    return typeof candidate.hazard === "string" && typeof candidate.formula === "string"
      ? [{ type, hazard: candidate.hazard, formula: candidate.formula, damageType: getOptionalString(candidate.damageType), save }]
      : addCommandError(errors, index, "hazard ou formula invalide.");
  }

  if (type === "createCombatScene") {
    const scene = getPlainObject(candidate.scene);

    return scene
      ? [{ type, scene, reason: getOptionalString(candidate.reason) }]
      : addCommandError(errors, index, "scene invalide.");
  }

  if (type === "createCombatTerrain") {
    const terrain = getPlainObject(candidate.terrain);

    return terrain
      ? [{ type, terrain, reason: getOptionalString(candidate.reason) }]
      : addCommandError(errors, index, "terrain invalide.");
  }

  if (type === "addEnemyToScene") {
    const enemy = getPlainObject(candidate.enemy);
    const position = getPosition(candidate.position);

    return typeof candidate.enemyTemplateId === "string" || enemy
      ? [{ type, enemyTemplateId: getOptionalString(candidate.enemyTemplateId), enemy, position, reason: getOptionalString(candidate.reason) }]
      : addCommandError(errors, index, "enemyTemplateId ou enemy attendu.");
  }

  if (
    type === "createEnemyTemplate" ||
    type === "createTacticalElementTemplate" ||
    type === "createTerrainTemplate" ||
    type === "createItemTemplate" ||
    type === "createEffectTemplate" ||
    type === "createAbilityTemplate"
  ) {
    const template = getPlainObject(candidate.template);

    return template
      ? [{ type, template, reason: getOptionalString(candidate.reason) } as AiDirectorCommand]
      : addCommandError(errors, index, "template invalide.");
  }

  if (type === "moveCombatant") {
    const to = candidate.to;
    const position = to && typeof to === "object" ? to as Record<string, unknown> : null;
    const x = getNumber(position?.x);
    const y = getNumber(position?.y);

    return typeof candidate.combatantId === "string" && x !== null && y !== null
      ? [{ type, combatantId: candidate.combatantId, to: { x, y } }]
      : addCommandError(errors, index, "combatantId ou position invalide.");
  }

  if (type === "revealMapDetail" || type === "hideMapDetail") {
    return typeof candidate.detailId === "string"
      ? [{ type, detailId: candidate.detailId }]
      : addCommandError(errors, index, "detailId manquant.");
  }

  if (type === "roll") {
    return typeof candidate.formula === "string"
      ? [{
          type,
          formula: candidate.formula,
          visibility: isDiceVisibility(candidate.visibility) ? candidate.visibility : undefined,
          reason: getOptionalString(candidate.reason),
        }]
      : addCommandError(errors, index, "formula manquante.");
  }

  return [{ type } as AiDirectorCommand];
}

function normalizeAgentRequest(request: unknown, index: number, errors: string[]) {
  if (!request || typeof request !== "object") {
    errors.push(`Demande agent ${index + 1}: objet attendu.`);
    return [];
  }

  const candidate = request as Record<string, unknown>;
  const agent = typeof candidate.agent === "string" && agentIds.includes(candidate.agent as AiAgentId)
    ? candidate.agent as AiAgentId
    : null;
  const reason = typeof candidate.reason === "string" ? candidate.reason : "";

  if (!agent || !reason) {
    errors.push(`Demande agent ${index + 1}: agent ou reason invalide.`);
    return [];
  }

  return [{ agent, reason, input: candidate.input }];
}

function addCommandError(errors: string[], index: number, message: string): [] {
  errors.push(`Commande ${index + 1}: ${message}`);
  return [];
}

function getNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getPrimitiveValue(value: unknown): string | number | boolean | null {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
}

function getPlainObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function getSave(value: unknown): { stat: string; dc: number; halfOnSuccess?: boolean } | undefined {
  const candidate = getPlainObject(value);
  const dc = getNumber(candidate?.dc);

  if (!candidate || typeof candidate.stat !== "string" || dc === null) {
    return undefined;
  }

  return {
    stat: candidate.stat,
    dc,
    halfOnSuccess: typeof candidate.halfOnSuccess === "boolean" ? candidate.halfOnSuccess : undefined,
  };
}

function getPosition(value: unknown): { x: number; y: number } | undefined {
  const candidate = getPlainObject(value);
  const x = getNumber(candidate?.x);
  const y = getNumber(candidate?.y);

  return x !== null && y !== null ? { x, y } : undefined;
}

function getRequiredString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length ? items : undefined;
}

function isDiceVisibility(value: unknown): value is "public" | "gmOnly" | "hidden" | "summary" {
  return value === "public" || value === "gmOnly" || value === "hidden" || value === "summary";
}

function isResolutionVisibility(value: unknown): value is AiResolutionVisibility {
  return value === "playerVisible" || value === "gmOnly" || value === "requiresCheck" || value === "hidden";
}

function isPriority(value: unknown): value is "low" | "normal" | "high" {
  return value === "low" || value === "normal" || value === "high";
}

function isSafetyCategory(value: unknown): value is AiSafetyCategory {
  return value === "none" ||
    value === "ordinaryFantasyViolence" ||
    value === "ritualSelfInjury" ||
    value === "selfHarmIntent" ||
    value === "harmToOthers" ||
    value === "coercionOrAbuse" ||
    value === "ambiguousDarkIntent";
}

function isSafetyLevel(value: unknown): value is AiSafetyLevel {
  return value === "normal" ||
    value === "graveButPlayable" ||
    value === "redirectRequired" ||
    value === "hardStop";
}

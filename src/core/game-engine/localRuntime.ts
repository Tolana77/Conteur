import type {
  GameCommand,
  GameCommandActor,
  GameCommandInput,
} from "./commands";
import {
  executeGameCommand,
  type GameCommandResult,
  type GameEngineDependencies,
  type GameRuntimeSnapshot,
} from "./engine";

export interface LocalRuntimeDependencies extends GameEngineDependencies {
  now: () => number;
}

/**
 * Frontière remplaçable entre l'interface et l'autorité du jeu.
 * Zustand conserve pour l'instant la persistance localStorage ; un futur
 * adaptateur distant enverra la même commande au serveur sans changer l'UI.
 */
export interface GameRuntimeAdapter {
  createCommand: (
    state: GameRuntimeSnapshot,
    input: GameCommandInput,
    actor: GameCommandActor,
  ) => GameCommand;
  execute: (state: GameRuntimeSnapshot, command: GameCommand) => GameCommandResult;
}

export function createLocalGameRuntimeAdapter(
  overrides: Partial<LocalRuntimeDependencies> = {},
): GameRuntimeAdapter {
  const dependencies: LocalRuntimeDependencies = {
    createId: overrides.createId ?? createLocalId,
    now: overrides.now ?? (() => Date.now()),
  };

  return {
    createCommand: (state, input, actor) => ({
      protocolVersion: 1,
      id: dependencies.createId("command"),
      campaignId: state.campaign.id,
      actorId: actor.id,
      actorRole: actor.role,
      expectedRevision: state.revision,
      issuedAt: dependencies.now(),
      ...input,
    } as GameCommand),
    execute: (state, command) => executeGameCommand(state, command, dependencies),
  };
}

function createLocalId(prefix: "command" | "event" | "message"): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

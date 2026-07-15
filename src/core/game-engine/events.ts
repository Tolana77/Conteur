import type {
  CharacterStats,
  Entity,
  Message,
  NarrativeSceneState,
} from "../../app/types";
import type { GameActorRole } from "./commands";

export interface GameEventEnvelope {
  protocolVersion: 1;
  id: string;
  commandId: string;
  campaignId: string;
  actorId: string;
  actorRole: GameActorRole;
  revision: number;
  occurredAt: number;
}

export type GameEvent = GameEventEnvelope & GameEventBody;

export type GameEventBody =
  | {
      type: "character.hpChanged";
      payload: {
        characterId: string;
        before: number;
        after: number;
        reason: string;
      };
    }
  | {
      type: "character.statChanged";
      payload: {
        characterId: string;
        stat: keyof CharacterStats;
        before: number;
        after: number;
      };
    }
  | {
      type: "character.historyAppended";
      payload: { characterId: string; entry: string };
    }
  | {
      type: "campaign.historyAppended";
      payload: { entry: string };
    }
  | {
      type: "world.factAdded";
      payload: { index: number; value: string };
    }
  | {
      type: "world.factUpdated";
      payload: { index: number; before: string; after: string };
    }
  | {
      type: "world.factRemoved";
      payload: { index: number; value: string };
    }
  | {
      type: "world.entityUpserted";
      payload: { before: Entity | null; after: Entity };
    }
  | {
      type: "narrative.sceneChanged";
      payload: { before: NarrativeSceneState; after: NarrativeSceneState };
    }
  | {
      type: "chat.gmMessageAdded";
      payload: { message: Message };
    };

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../../store/useGameStore";
import { IlluminatedInitial } from "../../ui/components/IlluminatedInitial";
import { HighlightedGameText } from "../../ui/gameTerms";
import { AnimatedDiceRollCard } from "../dice/DiceRollOverlay";
import { PlayerCheckCard } from "../dice/PlayerCheckCard";
import { isLegacyTechnicalCombatMessage } from "../combat/combatNarration";
import { ChatInput } from "./ChatInput";
import { MessageBubble } from "./MessageBubble";
import { useCombatNarration } from "./useCombatNarration";
import { useScenePacing } from "./useScenePacing";

const seenChatRollIds = new Set<string>();

export function ChatWindow({ onRequestMapTarget }: { onRequestMapTarget?: (intentId: string) => void }) {
  const storedMessages = useGameStore((state) => state.messages);
  const diceRolls = useGameStore((state) => state.diceRolls);
  const playerCheckRequests = useGameStore((state) => state.playerCheckRequests);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isComposerBusy, setIsComposerBusy] = useState(false);
  const [isCheckNarrationBusy, setIsCheckNarrationBusy] = useState(false);
  const hasPendingPlayerCheck = playerCheckRequests.some((request) => request.status === "pending");
  const narrationIsSuspended = isComposerBusy || isCheckNarrationBusy || hasPendingPlayerCheck;
  useCombatNarration(!narrationIsSuspended);
  const { markPlayerActivity } = useScenePacing(!narrationIsSuspended);
  const initializedRollsRef = useRef(false);
  const animatedRollIdsRef = useRef(new Set<string>());
  const messages = storedMessages.filter((message) => !isLegacyTechnicalCombatMessage(message));
  const publicRolls = diceRolls.filter((roll) => roll.visibility === "public");

  if (!initializedRollsRef.current) {
    publicRolls.forEach((roll) => seenChatRollIds.add(roll.id));
    initializedRollsRef.current = true;
  }

  publicRolls.forEach((roll) => {
    if (!seenChatRollIds.has(roll.id)) {
      seenChatRollIds.add(roll.id);
      animatedRollIdsRef.current.add(roll.id);
    }
  });

  const feedItems = [
    ...messages.map((message) => ({ id: message.id, timestamp: message.timestamp, type: "message" as const, message })),
    ...publicRolls.map((roll) => ({ id: roll.id, timestamp: roll.timestamp, type: "roll" as const, roll })),
    ...playerCheckRequests
      .filter((request) => request.status !== "cancelled")
      .map((request) => {
        const setupMessage = messages.find((message) =>
          message.kind === "checkSetup" && message.relatedCheckId === request.id);
        return {
          id: request.id,
          timestamp: setupMessage ? setupMessage.timestamp + 0.1 : request.createdAt,
          type: "check" as const,
          request,
        };
      }),
  ].sort((a, b) => a.timestamp - b.timestamp);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [feedItems.length]);

  return (
    <section className="paper-surface flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-[#9C7A2E]/25 bg-[#221E29] px-4 py-3">
        <p className="rune-label text-xs">Lecture</p>
        <h1 className="ink-heading text-xl font-bold">Interaction avec le Conteur</h1>
      </header>
      <div
        className="min-h-0 flex-1 overflow-y-auto p-4"
        onPointerDown={markPlayerActivity}
        onWheel={markPlayerActivity}
        ref={scrollRef}
      >
        <section className="parchment-reading reading-border mx-auto mb-4 max-w-[760px] rounded-sm p-5">
          <p className="text-sm leading-7">
            <IlluminatedInitial genre="fantasy">L</IlluminatedInitial>
            <HighlightedGameText
              mode="none"
              text="La scène s'ouvre comme un chapitre enluminé. Le Conteur attend votre décision, les marges du récit déjà prêtes à se couvrir d'encre."
            />
          </p>
        </section>

        <div className="mx-auto max-w-[760px] space-y-3">
          {feedItems.map((item) => (
            item.type === "message" ? (
              <MessageBubble key={item.id} message={item.message} />
            ) : item.type === "roll" ? (
              <article className="flex justify-start" key={item.id}>
                <AnimatedDiceRollCard
                  className="dice-roll-card--chat"
                  roll={item.roll}
                  shouldAnimate={animatedRollIdsRef.current.has(item.id)}
                />
              </article>
            ) : (
              <PlayerCheckCard
                key={item.id}
                onBusyChange={setIsCheckNarrationBusy}
                request={item.request}
              />
            )
          ))}
        </div>
      </div>
      <ChatInput
        isExternalBusy={isCheckNarrationBusy}
        onBusyChange={setIsComposerBusy}
        onPlayerActivity={markPlayerActivity}
        onRequestMapTarget={onRequestMapTarget}
      />
    </section>
  );
}

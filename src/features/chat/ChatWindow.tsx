import { useEffect, useRef } from "react";
import { useGameStore } from "../../store/useGameStore";
import { IlluminatedInitial } from "../../ui/components/IlluminatedInitial";
import { HighlightedGameText } from "../../ui/gameTerms";
import { AnimatedDiceRollCard } from "../dice/DiceRollOverlay";
import { PlayerCheckCard } from "../dice/PlayerCheckCard";
import { ChatInput } from "./ChatInput";
import { MessageBubble } from "./MessageBubble";

const seenChatRollIds = new Set<string>();

export function ChatWindow({ onRequestMapTarget }: { onRequestMapTarget?: (intentId: string) => void }) {
  const messages = useGameStore((state) => state.messages);
  const diceRolls = useGameStore((state) => state.diceRolls);
  const playerCheckRequests = useGameStore((state) => state.playerCheckRequests);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const initializedRollsRef = useRef(false);
  const animatedRollIdsRef = useRef(new Set<string>());
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
      .map((request) => ({ id: request.id, timestamp: request.createdAt, type: "check" as const, request })),
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
      <div className="min-h-0 flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <section className="parchment-reading reading-border mx-auto mb-4 max-w-[760px] rounded-sm p-5">
          <p className="text-sm leading-7">
            <IlluminatedInitial genre="fantasy">L</IlluminatedInitial>
            <HighlightedGameText text="La scène s'ouvre comme un chapitre enluminé. Le Conteur attend votre décision, les marges du récit déjà prêtes à se couvrir d'encre." />
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
              <PlayerCheckCard key={item.id} request={item.request} />
            )
          ))}
        </div>
      </div>
      <ChatInput onRequestMapTarget={onRequestMapTarget} />
    </section>
  );
}

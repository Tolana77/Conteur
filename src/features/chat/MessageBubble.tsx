import type { Message } from "../../app/types";
import { HighlightedGameText } from "../../ui/gameTerms";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isPlayer = message.sender === "player";
  const isCheckSetup = message.kind === "checkSetup";

  return (
    <article className={`flex ${isPlayer ? "justify-end" : "justify-start"}`}>
      <div
        className={`${isCheckSetup ? "max-w-[74%]" : "max-w-[82%]"} rounded px-3 py-2 ${
          isPlayer
            ? "border border-[#3F5641]/60 bg-[#3F5641]/50 text-[#E4D8BE]"
            : isCheckSetup
              ? "border-l-2 border-[#9C7A2E]/75 bg-[#221E29] text-[#E4D8BE]"
              : "manuscript-panel text-stone-900 shadow-sm"
        }`}
      >
        <div className={`${isCheckSetup ? "mb-0.5 text-[0.62rem]" : "mb-1 text-xs"} flex items-center justify-between gap-3 font-semibold uppercase text-[#9C7A2E]`}>
          <span>{isPlayer ? "Joueur" : isCheckSetup ? "Le Conteur" : "MJ"}</span>
          <time>{new Date(message.timestamp).toLocaleTimeString("fr-FR")}</time>
        </div>
        {message.content ? (
          <p className={`${isCheckSetup ? "text-[0.82rem] italic leading-relaxed" : "text-sm leading-relaxed"} text-[#E4D8BE]`}>
            {isPlayer ? message.content : <HighlightedGameText mode="narrative" text={message.content} />}
          </p>
        ) : null}
        {isPlayer && message.actions && message.actions.length > 0 ? (
          <div className={message.content ? "mt-2 flex flex-wrap gap-1.5" : "flex flex-wrap gap-1.5"}>
            {message.actions.map((action) => (
              <span className="inline-flex flex-wrap items-center gap-1.5" key={action.id}>
                <span
                  className="rounded border border-[#9C7A2E]/35 bg-[#5A2233]/55 px-2 py-1 text-xs font-semibold text-[#E4D8BE]"
                  title={action.command}
                >
                  {action.label}
                </span>
                {action.target ? (
                  <span className="rounded border border-[#9C7A2E]/25 bg-[#15121A]/35 px-2 py-1 text-xs text-[#E4D8BE]/75">
                    {action.targeting?.aim.label === "destination" ? "Destination" : "Cible"} : {action.target.label}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

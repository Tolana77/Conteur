import { FormEvent, useState } from "react";
import { useGameStore } from "../../store/useGameStore";

export function DicePanel() {
  const [customSides, setCustomSides] = useState(12);
  const roll = useGameStore((state) => state.roll);
  const diceRolls = useGameStore((state) => state.diceRolls);
  const latestRoll = diceRolls[0];

  function handleCustomRoll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const safeSides = Math.max(2, Math.floor(customSides));
    roll(safeSides);
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="rune-label text-sm">Dés</h2>
        <p className="text-sm text-[#E4D8BE]/65">
          Résultat : <span className="font-bold text-[#E4D8BE]">{latestRoll?.result ?? "-"}</span>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="fantasy-button rounded px-3 py-2 text-sm font-semibold"
          onClick={() => roll(20)}
          type="button"
        >
          D20
        </button>
        <button
          className="fantasy-button rounded px-3 py-2 text-sm font-semibold"
          onClick={() => roll(6)}
          type="button"
        >
          D6
        </button>
      </div>
      <form className="flex gap-2" onSubmit={handleCustomRoll}>
        <input
          className="min-w-0 flex-1 rounded border border-[#9C7A2E]/25 bg-[#15121A] px-3 py-2 text-sm text-[#E4D8BE]"
          min={2}
          onChange={(event) => setCustomSides(Number(event.target.value))}
          type="number"
          value={customSides}
        />
        <button
          className="fantasy-button rounded px-3 py-2 text-sm font-semibold"
          type="submit"
        >
          Custom
        </button>
      </form>
      <ol className="space-y-1 text-sm text-stone-700">
        {diceRolls.map((diceRoll) => (
          <li className="manuscript-card flex justify-between rounded px-2 py-1" key={diceRoll.id}>
            <span>{diceRoll.formula ?? `1d${diceRoll.sides}`}</span>
            <span className="font-bold">{diceRoll.result}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

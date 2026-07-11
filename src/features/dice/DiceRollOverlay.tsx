import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { DiceRoll, DiceRollTerm } from "../../app/types";

const TICK_MS = 90;

function getDiceShapeClass(sides: number | undefined): string {
  if (sides === 4) {
    return "dice-shape--d4";
  }

  if (sides === 6) {
    return "dice-shape--d6";
  }

  if (sides === 8) {
    return "dice-shape--d8";
  }

  if (sides === 10) {
    return "dice-shape--d10";
  }

  if (sides === 12) {
    return "dice-shape--d12";
  }

  if (sides === 20) {
    return "dice-shape--d20";
  }

  return "dice-shape--custom";
}

function getDiceTerms(roll: DiceRoll): DiceRollTerm[] {
  if (Array.isArray(roll.terms) && roll.terms.length > 0) {
    return roll.terms;
  }

  const rolls = Array.isArray(roll.rolls) && roll.rolls.length > 0 ? roll.rolls : [roll.result];

  return [
    ...rolls.map((value) => ({
      kind: "die" as const,
      label: `1d${roll.sides}`,
      sides: roll.sides,
      value,
    })),
    ...(roll.modifier
      ? [{
          kind: "modifier" as const,
          label: String(Math.abs(roll.modifier)),
          value: roll.modifier,
        }]
      : []),
  ];
}

function formatFormula(roll: DiceRoll): string {
  return roll.formula ?? `1d${roll.sides}`;
}

export function DiceRollCard({
  className = "",
  isSettled,
  roll,
  rollingValues = [],
}: {
  className?: string;
  isSettled: boolean;
  roll: DiceRoll;
  rollingValues?: Array<number | string>;
}) {
  const terms = getDiceTerms(roll);
  let diceIndex = 0;

  return (
    <section className={`dice-roll-card ${isSettled ? "dice-roll-card-settled" : ""} ${className}`}>
      <h3 className="dice-roll-title">{roll.reason ?? "Jet visible"}</h3>
      <p className="dice-roll-subtitle">{formatFormula(roll)}</p>
      <div className="dice-roll-equation" aria-label={`Résultat ${roll.result}`}>
        {terms.map((term, index) => {
          const showOperator = index > 0;
          const isNegative = term.value < 0;
          const operator = isNegative ? "-" : "+";
          const shownValue =
            term.kind === "die"
              ? rollingValues[diceIndex++] ?? Math.abs(term.value)
              : Math.abs(term.value);

          return (
            <span className="dice-roll-term-wrap" key={`${term.kind}-${term.label}-${index}`}>
              {showOperator ? <span className="dice-roll-operator">{operator}</span> : null}
              <span
                className={`dice-roll-term ${
                  term.kind === "die"
                    ? `dice-roll-term--die ${getDiceShapeClass(term.sides)}`
                    : "dice-roll-term--modifier"
                }`}
                style={term.color ? { "--dice-term-color": term.color } as CSSProperties : undefined}
              >
                <span className="dice-roll-term-label">{term.label}</span>
                <span
                  className={`dice-roll-term-value ${
                    term.kind === "die"
                      ? isSettled
                        ? "dice-roll-term-value-settled"
                        : "dice-roll-term-value-rolling"
                      : "dice-roll-term-value-fixed"
                  }`}
                >
                  {shownValue}
                </span>
              </span>
            </span>
          );
        })}
        <span className="dice-roll-equals">=</span>
        <span className={`dice-roll-result ${isSettled ? "dice-roll-result-settled" : ""}`}>
          {isSettled ? roll.result : "?"}
        </span>
      </div>
    </section>
  );
}

export function AnimatedDiceRollCard({
  className = "",
  roll,
  shouldAnimate,
}: {
  className?: string;
  roll: DiceRoll;
  shouldAnimate: boolean;
}) {
  const [rollingValues, setRollingValues] = useState<number[]>([]);
  const [isSettled, setIsSettled] = useState(!shouldAnimate);

  useEffect(() => {
    if (!shouldAnimate) {
      setIsSettled(true);
      setRollingValues([]);
      return undefined;
    }

    setIsSettled(false);
    setRollingValues([]);

    const terms = getDiceTerms(roll);
    const diceTerms = terms.filter((term) => term.kind === "die");
    const interval = window.setInterval(() => {
      setRollingValues(
        diceTerms.map((term) => Math.floor(Math.random() * Math.max(2, term.sides ?? roll.sides)) + 1),
      );
    }, TICK_MS);
    const settleTimeout = window.setTimeout(() => {
      window.clearInterval(interval);
      setRollingValues(diceTerms.map((term) => Math.abs(term.value)));
      setIsSettled(true);
    }, 1100);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(settleTimeout);
    };
  }, [roll, shouldAnimate]);

  return <DiceRollCard className={className} isSettled={isSettled} roll={roll} rollingValues={rollingValues} />;
}

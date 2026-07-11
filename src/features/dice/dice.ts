export function rollDice(sides: number): number {
  if (!Number.isInteger(sides) || sides < 1) {
    throw new Error("Dice sides must be a positive integer");
  }

  return Math.floor(Math.random() * sides) + 1;
}

export function rollD20(): number {
  return rollDice(20);
}

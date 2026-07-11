function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function rollDice(expression) {
  if (typeof expression === "number") {
    return expression;
  }

  if (typeof expression !== "string") {
    return 0;
  }

  const match = expression.trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i);

  if (!match) {
    const numeric = Number(expression);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  const count = Number(match[1]);
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[3]) : 0;
  let total = modifier;

  for (let index = 0; index < count; index += 1) {
    total += rollDie(sides);
  }

  return total;
}

module.exports = {
  rollDice,
  rollDie,
};

const { getByPath } = require("./resolve");

function getAttribute(resolvedObject, attribute) {
  const sources = [
    resolvedObject.current,
    resolvedObject.base,
    resolvedObject.data,
    resolvedObject,
  ];

  for (const source of sources) {
    const value = getByPath(source, attribute);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function compare(left, operator, right) {
  switch (operator) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    default:
      return false;
  }
}

function evaluateCondition(condition, resolvedObject) {
  if (!condition || (Array.isArray(condition.all) && condition.all.length === 0)) {
    return true;
  }

  if (Array.isArray(condition.all)) {
    return condition.all.every((entry) => evaluateCondition(entry, resolvedObject));
  }

  if (Array.isArray(condition.any)) {
    return condition.any.some((entry) => evaluateCondition(entry, resolvedObject));
  }

  const value = getAttribute(resolvedObject, condition.attribute);
  let comparableValue = value;

  if (condition.unit === "percent") {
    const maxValue = getAttribute(resolvedObject, `${condition.attribute}Max`);
    comparableValue = maxValue ? (Number(value) / Number(maxValue)) * 100 : 0;
  }

  return compare(comparableValue, condition.operator, condition.value);
}

module.exports = {
  evaluateCondition,
  getAttribute,
};

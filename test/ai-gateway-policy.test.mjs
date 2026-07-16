import assert from "node:assert/strict";
import {
  fitAgentPromptToBudget,
  getAgentPromptLimit,
} from "../shared/aiGatewayPolicy.js";
import { getPayloadError } from "../netlify/functions/mj.mjs";

const longContext = `Contexte:${"x".repeat(12_000)}`;
const prompt = [
  "Instruction essentielle: réponds en JSON.",
  longContext,
  "Format JSON strict.",
].join("\n");
const fitted = fitAgentPromptToBudget("worldManager", prompt);

assert.equal(fitted.length <= getAgentPromptLimit("worldManager"), true);
assert.equal(fitted.includes("Instruction essentielle: réponds en JSON."), true);
assert.equal(fitted.includes("Format JSON strict."), true);
const compactedContext = fitted.split("\n").find((line) => line.startsWith("Contexte:"));
assert.equal(JSON.parse(compactedContext.slice("Contexte:".length).trim()).truncated, true);
assert.equal(getPayloadError({ agentId: "worldManager", prompt: fitted }), null);
assert.match(getPayloadError({ agentId: "agent-inconnu", prompt: "test" }), /Agent inconnu/u);
assert.match(
  getPayloadError({ agentId: "narrationManager", prompt: "x".repeat(20_000) }),
  /dépasse son budget/u,
);

console.log("Tests politique passerelle IA OK");

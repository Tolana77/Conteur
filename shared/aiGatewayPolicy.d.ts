export const AI_AGENT_IDS: readonly string[];
export const AI_AGENT_PROMPT_LIMITS: Readonly<Record<string, number>>;

export function isKnownAiAgentId(agentId: string): boolean;
export function getAgentPromptLimit(agentId: string): number;
export function fitAgentPromptToBudget(agentId: string, prompt: string): string;
